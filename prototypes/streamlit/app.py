"""Streamlit interface for the same verified direct-trip planner as the web app."""

import time
import os
import math
from html import escape

import streamlit as st
from streamlit_geolocation import streamlit_geolocation

from client import ApiError, api_request, clock_time, coordinate, search_stops

from presentation import theme, markup, map_view, ticket, timeline, empty_card

st.set_page_config(
    page_title="LeaveNow · Your next move",
    page_icon="↗",
    layout="wide",
    initial_sidebar_state="collapsed",
)
theme()
api_enabled = os.environ.get("LEAVENOW_API_CONFIGURED", "1") == "1"
markup(
    '<div class="ln-nav"><div class="ln-brand"><i>↗</i>Leave<span>Now</span></div><div class="ln-city">ROCHESTER, NY / RTS TRANSIT</div><div class="ln-live"><span class="ln-dot"></span>LIVE ARRIVAL PLANNER</div></div>'
)
markup(
    '<div class="ln-hero"><div class="ln-eyebrow">THE CITY IS MOVING. SO CAN YOU.</div><h1>Less waiting.<br><span>More going.</span></h1><p>Your nearest stop. The right bus. A little more time for everything else.</p></div>'
)

if not api_enabled:
    st.warning(
        "Live arrivals are temporarily unavailable. You can explore the map and sample locations while the service is being configured."
    )


def apply_preset(reverse=False):
    a, b = (43.155028, -77.594012), (43.148116, -77.578088)
    if reverse:
        a, b = b, a
    for key, values in [("origin", a), ("destination", b)]:
        st.session_state[key + "_method"] = "Coordinates"
        st.session_state[key + "_lat"], st.session_state[key + "_lon"] = values
    st.session_state.pop("planned_trip", None)


def swap_locations():
    a = st.session_state.get("resolved_origin")
    b = st.session_state.get("resolved_destination")
    if not a or not b:
        return
    for key, point in [("origin", b), ("destination", a)]:
        st.session_state[key + "_method"] = "Coordinates"
        st.session_state[key + "_lat"] = point["lat"]
        st.session_state[key + "_lon"] = point["lon"]
    st.session_state.pop("planned_trip", None)


markup('<div class="ln-kicker">TAKE IT FOR A SPIN · REAL LOCATIONS, LIVE RESULTS</div>')
preset_a, preset_b, spacer = st.columns([1, 1, 2])
preset_a.button("↗ East → Park", on_click=apply_preset, use_container_width=True)
preset_b.button(
    "↙ Park → East", on_click=apply_preset, args=(True,), use_container_width=True
)


@st.cache_data(ttl=60, show_spinner=False)
def cached_search(query):
    return search_stops(query)


def choose_stop(key, label):
    with st.form(key + "_search_form"):
        query = st.text_input(
            label,
            placeholder="e.g. East Alexander or Park Berkeley",
            key=key + "_query",
        )
        submitted = st.form_submit_button("Search stops")
    if submitted and not api_enabled:
        st.info(
            "Stop search is temporarily unavailable. Choose Coordinates or try a sample location."
        )
        return None
    if submitted:
        try:
            st.session_state[key + "_matches"] = cached_search(query)
        except ApiError as error:
            st.session_state[key + "_matches"] = []
            st.error(str(error))
    matches = st.session_state.get(key + "_matches", [])
    if not matches:
        if submitted:
            st.info("No matching stops. Try another intersection or enter coordinates.")
        return None
    selected = st.selectbox(
        "Choose " + label.lower(),
        range(len(matches)),
        format_func=lambda i: f"{matches[i]['name']} · stop {matches[i]['id']}",
        key=key + "_selected",
    )
    return coordinate(matches[selected]["lat"], matches[selected]["lon"])


def choose_coordinates(key):
    col1, col2 = st.columns(2)
    lat = col1.number_input(
        "Latitude",
        min_value=-90.0,
        max_value=90.0,
        value=43.155028 if key == "origin" else 43.148116,
        format="%.6f",
        key=key + "_lat",
    )
    lon = col2.number_input(
        "Longitude",
        min_value=-180.0,
        max_value=180.0,
        value=-77.594012 if key == "origin" else -77.578088,
        format="%.6f",
        key=key + "_lon",
    )
    if key == "destination":
        st.caption(
            "Enter your actual destination coordinates; defaults are only a Rochester example."
        )
    return coordinate(lat, lon)


left, right = st.columns(2)
with left:
    markup(
        '<div class="ln-kicker"><span class="ln-pin">●</span>01 / STARTING FROM</div>'
    )
    origin_mode = st.radio(
        "Starting location method",
        ["Search a stop", "Use my location", "Coordinates"],
        horizontal=True,
        key="origin_method",
    )
    if origin_mode == "Use my location":
        st.caption(
            "Click the location button below and allow browser permission. GPS needs localhost or HTTPS."
        )
        location = streamlit_geolocation()
        if (
            location
            and location.get("latitude") is not None
            and location.get("longitude") is not None
        ):
            try:
                origin = coordinate(location["latitude"], location["longitude"])
                st.success("Current location received.")
            except (ValueError, TypeError):
                origin = None
                st.warning(
                    "The browser returned an invalid position. Use stop search or coordinates instead."
                )
        else:
            origin = None
            st.info(
                "If location is unavailable or declined, use stop search or coordinates."
            )
    elif origin_mode == "Coordinates":
        origin = choose_coordinates("origin")
    else:
        origin = choose_stop("origin", "Starting stop")
with right:
    markup(
        '<div class="ln-kicker"><span class="ln-pin destination">◆</span>02 / WHERE TO?</div>'
    )
    destination_mode = st.radio(
        "Destination method",
        ["Search a stop", "Coordinates"],
        horizontal=True,
        key="destination_method",
    )
    destination = (
        choose_coordinates("destination")
        if destination_mode == "Coordinates"
        else choose_stop("destination", "Destination stop")
    )

st.session_state["resolved_origin"] = origin
st.session_state["resolved_destination"] = destination
swap, map_option, space = st.columns([1, 1, 2])
swap.button(
    "⇄ Swap locations",
    on_click=swap_locations,
    disabled=origin is None or destination is None,
    use_container_width=True,
)
light_map = map_option.toggle("Day map", value=False)
st.divider()
options, refresh_options = st.columns(2)
max_walk = options.select_slider(
    "Maximum estimated walk at each end",
    options=[5, 10, 15, 20],
    value=15,
    format_func=lambda n: f"{n} min",
)
auto_refresh = refresh_options.checkbox(
    "Refresh live results every 60 seconds", value=True
)
payload = {"origin": origin, "destination": destination, "maxWalk": max_walk}
if st.session_state.get("planned_trip") and st.session_state["planned_trip"] != payload:
    st.session_state.pop("planned_trip", None)
if st.button(
    "Find my next bus",
    type="primary",
    disabled=not api_enabled or origin is None or destination is None,
    use_container_width=True,
):
    st.session_state["planned_trip"] = payload


@st.fragment(run_every="60s" if auto_refresh else None)
def show_results():
    trip = st.session_state.get("planned_trip")
    if not trip or not api_enabled:
        markup(
            '<div class="ln-map-heading"><b>Your city. Your next move.</b><span>DRAG TO EXPLORE · SCROLL TO ZOOM</span></div>'
        )
        map_view(origin, destination, light=light_map)
        markup(
            '<div class="ln-nudge"><div class="ln-nudge-icon">↗</div><div><b>Good things are a bus ride away.</b><p>Choose your locations above, or try a preset. We’ll check real arrivals and tell you when to leave.</p></div></div>'
        )
        return
    st.button("Refresh arrivals now", key="refresh_arrivals")
    try:
        with st.spinner("Matching live trips at nearby stops…"):
            plan = api_request("/api/plan", trip)
    except ApiError as error:
        st.error(str(error))
        return
    st.caption("Checked " + clock_time(plan["checkedAt"]) + " · Rochester local time")
    if plan["partial"]:
        st.warning("Some stops could not be checked. Results may be incomplete.")
    nearest = plan.get("nearestStop")
    if nearest:
        distance_label = (
            "You’re at the stop"
            if nearest["meters"] == 0
            else f"{nearest['meters']} m away · about {nearest['walkMinutes']} min walk"
        )
        markup(
            f'<div class="ln-summary"><b>⌖ {escape(nearest["name"])}</b><span>{escape(distance_label)}</span></div>'
        )
    journeys = plan["journeys"]
    if not journeys:
        reason = (
            plan.get("reason") or "No verified catchable direct bus in the live window."
        )
        empty_card(reason)
        st.warning(reason, icon="🕒")
        map_view(trip["origin"], trip["destination"], light=light_map)
        st.caption(
            "Try the reverse preset, increase your walking allowance, or check the official timetable for later service."
        )
        if plan.get("departures"):
            st.subheader("Nearby departures · destination not verified")
            st.dataframe(
                [
                    {
                        "Route": d["route"],
                        "Destination sign": d["headsign"],
                        "Stop": d["stop"]["name"],
                        "Departure": clock_time(d["departsAt"]),
                        "Enough walking time": d["catchable"],
                    }
                    for d in plan["departures"]
                ],
                hide_index=True,
            )
        st.link_button("Check official RTS trip planning", "https://www.myrts.com/")
        return
    if st.session_state.get("journey_choice", 0) >= len(journeys):
        st.session_state["journey_choice"] = 0
    selected = st.selectbox(
        "Direct journey",
        range(len(journeys)),
        format_func=lambda i: f"Route {journeys[i]['route']} · {clock_time(journeys[i]['departsAt'])} · {journeys[i]['boarding']['name']}",
        key="journey_choice",
    )
    journey = journeys[selected]
    st.subheader(journey["headsign"])
    ticket(journey)
    bus, leave, walk, arrive = st.columns(4)
    bus.metric(
        "Next bus",
        f"{max(0, math.ceil((journey['departsAt'] / 1000 - time.time()) / 60))} min",
    )
    leave.metric("Leave by", clock_time(journey["leaveAt"]))
    walk.metric("Estimated walk to stop", f"{journey['walkMinutes']} min")
    arrive.metric("Reach destination", clock_time(journey["destinationAt"]))
    timeline(journey)
    map_view(trip["origin"], trip["destination"], journey, light=light_map)
    st.caption(
        "Connection lines are a guide, not a street-following bus or walking route."
    )
    st.link_button(
        "Walking directions to your boarding stop ↗",
        f"https://www.google.com/maps/dir/?api=1&origin={trip['origin']['lat']},{trip['origin']['lon']}&destination={journey['boarding']['lat']},{journey['boarding']['lon']}&travelmode=walking",
    )


show_results()
with st.expander("How this prototype works"):
    st.write(
        "The Streamlit service calls the same Node API as the web app. It never receives the RTS API key. A recommendation requires the same live trip at both stops, the destination after boarding, and enough walking time plus a two-minute buffer."
    )
    st.write(
        "Direct buses only, within the current live prediction window. Walking uses straight-line distance with a 25% allowance at 80 m/min. Transfers and street routing are not included. Locations stay in your Streamlit session and are not written to disk; shared hosting still needs HTTPS, access/rate controls, and privacy review."
    )

markup(
    '<div class="ln-footer"><span>BUILT FOR THE JOURNEY, NOT THE WAIT.</span><span>LEAVENOW / ROCHESTER</span></div>'
)
