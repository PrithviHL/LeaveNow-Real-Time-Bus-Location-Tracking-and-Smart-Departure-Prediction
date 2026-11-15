"""Streamlit interface for the same verified direct-trip planner as the web app."""

import time

import streamlit as st
from streamlit_geolocation import streamlit_geolocation

from client import ApiError, api_request, clock_time, coordinate, search_stops

st.set_page_config(page_title="LeaveNow · Streamlit", page_icon="🚌", layout="wide")
st.title("🚌 LeaveNow")
st.caption("ROCHESTER RTS · LIVE DIRECT-BUS PLANNER · STREAMLIT PROTOTYPE")
st.write("Your location. Your destination. The next bus you can actually catch.")


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
    st.subheader("1 · Starting location")
    origin_mode = st.radio(
        "Starting location method",
        ["Search a stop", "Use my location", "Coordinates"],
        horizontal=True,
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
    st.subheader("2 · Destination")
    destination_mode = st.radio(
        "Destination method", ["Search a stop", "Coordinates"], horizontal=True
    )
    destination = (
        choose_coordinates("destination")
        if destination_mode == "Coordinates"
        else choose_stop("destination", "Destination stop")
    )

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
    "Find my next bus", type="primary", disabled=origin is None or destination is None
):
    st.session_state["planned_trip"] = payload


@st.fragment(run_every="60s" if auto_refresh else None)
def show_results():
    trip = st.session_state.get("planned_trip")
    if not trip:
        st.info("Choose your start and destination, then find your next bus.")
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
        st.info(
            f"Closest stop: {nearest['name']} · {nearest['meters']} m away · about {nearest['walkMinutes']} min walk"
        )
    journeys = plan["journeys"]
    if not journeys:
        st.warning(
            plan.get("reason") or "No verified catchable direct bus in the live window."
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
    bus, leave, walk, arrive = st.columns(4)
    bus.metric(
        "Next bus",
        f"{max(0, int((journey['departsAt'] / 1000 - time.time()) / 60))} min",
    )
    leave.metric("Leave by", clock_time(journey["leaveAt"]))
    walk.metric("Estimated walk to stop", f"{journey['walkMinutes']} min")
    arrive.metric("Reach destination", clock_time(journey["destinationAt"]))
    st.write(
        f"**Walk to:** {journey['boarding']['name']} (stop {journey['boarding']['id']})"
    )
    st.write(
        f"**Board:** Route {journey['route']} at {clock_time(journey['departsAt'])} · {journey['direction']}"
    )
    st.write(
        f"**Get off:** {journey['alighting']['name']} at {clock_time(journey['arrivesAt'])}"
    )
    st.write(
        f"**Final walk:** about {journey['finalWalkMinutes']} min to your destination"
    )
    st.map(
        [
            trip["origin"],
            trip["destination"],
            {"lat": journey["boarding"]["lat"], "lon": journey["boarding"]["lon"]},
            {"lat": journey["alighting"]["lat"], "lon": journey["alighting"]["lon"]},
        ],
        latitude="lat",
        longitude="lon",
    )
    st.caption(
        "Map points show your start, destination and boarding/alighting stops. They do not represent a street route."
    )


show_results()
with st.expander("How this prototype works"):
    st.write(
        "The Streamlit service calls the same Node API as the web app. It never receives the RTS API key. A recommendation requires the same live trip at both stops, the destination after boarding, and enough walking time plus a two-minute buffer."
    )
    st.write(
        "Direct buses only, within the current live prediction window. Walking uses straight-line distance with a 25% allowance at 80 m/min. Transfers and street routing are not included. Locations stay in your Streamlit session and are not written to disk; shared hosting still needs HTTPS, access/rate controls, and privacy review."
    )
