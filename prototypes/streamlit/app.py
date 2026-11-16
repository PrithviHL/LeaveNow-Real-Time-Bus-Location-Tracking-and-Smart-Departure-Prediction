"""Streamlit interface for the same verified direct-trip planner as the web app."""

import time
import os
import math
from html import escape
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import urlencode

import streamlit as st


from client import (
    ApiError,
    api_request,
    clock_time,
    coordinate,
    stop_catalog,
    travel_timestamp,
)

from presentation import theme, markup, map_view, ticket, timeline, empty_card
from authentication import account_controls, account_menu

st.set_page_config(
    page_title="LeaveNow · Your next move",
    page_icon="↗",
    layout="wide",
    initial_sidebar_state="collapsed",
)
theme()
api_enabled = os.environ.get("LEAVENOW_API_CONFIGURED", "1") == "1"
if st.user.get("is_logged_in", False):
    navigation, account = st.columns([5, 1.3], vertical_alignment="center")
    with navigation:
        markup(
            '<div class="ln-nav"><div class="ln-brand"><i>↗</i>Leave<span>Now</span></div><div class="ln-city">GAINESVILLE, FL / RTS TRANSIT</div><div class="ln-live"><span class="ln-dot"></span>LIVE + SCHEDULED JOURNEYS</div></div>'
        )
    with account:
        account_menu()
else:
    markup(
        '<div class="ln-nav"><div class="ln-brand"><i>↗</i>Leave<span>Now</span></div><div class="ln-city">GAINESVILLE, FL / RTS TRANSIT</div><div class="ln-live"><span class="ln-dot"></span>LIVE + SCHEDULED JOURNEYS</div></div>'
    )
markup(
    '<div class="ln-hero"><div class="ln-eyebrow">THE CITY IS MOVING. SO CAN YOU.</div><h1>Less waiting.<br><span>More going.</span></h1><p>Your nearest stop. The right bus. A little more time for everything else.</p></div>'
)

account_controls()

if not api_enabled:
    st.warning(
        "Live arrivals are temporarily unavailable. You can explore the map and sample locations while the service is being configured."
    )


def apply_preset(reverse=False):
    a, b = (29.64514, -82.346983), (29.645567, -82.322697)
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
preset_a.button("↗ Reitz → Downtown", on_click=apply_preset, use_container_width=True)
preset_b.button(
    "↙ Downtown → Reitz", on_click=apply_preset, args=(True,), use_container_width=True
)


@st.cache_data(ttl=3600, show_spinner=False)
def cached_stops():
    return stop_catalog()


# Components v2 renders in the app page, avoiding iframe geolocation policy issues.
gps_component = st.components.v2.component(
    "leavenow_gps",
    html='<button type="button">⌖ Use my current location</button><p role="status" aria-live="polite">Click to request your location.</p>',
    css="button {background:#c5f267;color:#152217;border:0;border-radius:8px;padding:12px 18px;font:600 14px sans-serif;cursor:pointer} p {font:13px sans-serif;color:var(--st-text-color)}",
    js="""export default function({parentElement,setStateValue}) {
      const button=parentElement.querySelector('button'), status=parentElement.querySelector('p');
      let active=true;
      button.onclick=()=>{
        if(!window.isSecureContext || !navigator.geolocation){
          status.textContent='GPS requires a supported browser on HTTPS.';
          setStateValue('location',{error:'unsupported'});return;
        }
        button.disabled=true;status.textContent='Finding your location…';
        navigator.geolocation.getCurrentPosition(position=>{
          if(!active)return;
          status.textContent='Location received.';button.disabled=false;
          setStateValue('location',{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy});
        },error=>{
          if(!active)return;
          button.disabled=false;
          const reason=error.code===1?'denied':error.code===3?'timeout':'unavailable';
          status.textContent=reason==='denied'?'Location permission was denied. Check this site’s browser permissions.':reason==='timeout'?'Location request timed out. Click to retry.':'Your device could not determine its location. Click to retry.';
          setStateValue('location',{error:reason});
        },{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
      };
      return ()=>{active=false;button.onclick=null;};
    }""",
)


def choose_address(key):
    st.caption(
        "Search a Gainesville address, building, or business. Search text is sent to Photon; do not enter confidential information."
    )
    with st.form(key + "_address_search"):
        query = st.text_input(
            "Address or place",
            placeholder="e.g. Marston Science Library, Gainesville",
            key=key + "_address_query",
        )
        search = st.form_submit_button("Search places")
    if search:
        st.session_state.pop(key + "_address_results", None)
        if not 3 <= len(query.strip()) <= 150:
            st.warning("Enter 3–150 characters to search.")
        else:
            try:
                data = api_request("/api/addresses?" + urlencode({"q": query.strip()}))
                st.session_state[key + "_address_results"] = (
                    query.strip(),
                    data["results"],
                )
                st.session_state.pop(key + "_address_choice", None)
            except ApiError as error:
                st.warning(str(error))
    saved = st.session_state.get(key + "_address_results")
    st.caption("Place data © OpenStreetMap contributors · Photon")
    if not saved or saved[0] != query.strip():
        return None
    results = saved[1]
    if not results:
        st.info(
            "No matching place in Gainesville. Try a fuller address or coordinates."
        )
        return None
    selected = st.selectbox(
        "Select the matching place",
        range(len(results)),
        index=None,
        format_func=lambda i: results[i]["name"],
        key=key + "_address_choice",
    )
    if selected is None:
        return None
    chosen = results[selected]
    st.caption("Selected: " + chosen["name"])
    return coordinate(chosen["lat"], chosen["lon"])


def choose_stop(key, label):
    if not api_enabled:
        st.info(
            "Stop suggestions are temporarily unavailable. Choose Coordinates or try a sample location."
        )
        return None
    try:
        matches = cached_stops()
    except ApiError as error:
        st.error(str(error))
        return None
    if not matches:
        st.info("No stops are available. Try coordinates or a sample location.")
        return None
    by_id = {str(stop["id"]): stop for stop in matches}
    selected = st.selectbox(
        label,
        options=list(by_id),
        index=None,
        format_func=lambda stop_id: f"{by_id[stop_id]['name']} · stop {stop_id}",
        placeholder="Type a stop or destination, e.g. Reitz, Rosa Parks, Shands…",
        filter_mode="fuzzy",
        key=key + "_stop",
    )
    st.caption(
        "Start typing to filter RTS stops, then select a suggestion. For street addresses, choose Coordinates."
    )
    if selected is None:
        return None
    stop = by_id[selected]
    return coordinate(stop["lat"], stop["lon"])


def choose_coordinates(key):
    col1, col2 = st.columns(2)
    lat = col1.number_input(
        "Latitude",
        min_value=29.35,
        max_value=30.1,
        value=(
            None
            if key + "_lat" in st.session_state
            else (29.64514 if key == "origin" else 29.645567)
        ),
        format="%.6f",
        key=key + "_lat",
    )
    lon = col2.number_input(
        "Longitude",
        min_value=-82.9,
        max_value=-81.9,
        value=(
            None
            if key + "_lon" in st.session_state
            else (-82.346983 if key == "origin" else -82.322697)
        ),
        format="%.6f",
        key=key + "_lon",
    )
    if key == "destination":
        st.caption(
            "Enter your actual destination coordinates; defaults are only a Gainesville example."
        )
    return coordinate(lat, lon)


left, right = st.columns(2)
with left:
    markup(
        '<div class="ln-kicker"><span class="ln-pin">●</span>01 / STARTING FROM</div>'
    )
    origin_mode = st.radio(
        "Starting location method",
        ["Search a stop", "Use my location", "Coordinates", "Address or place"],
        horizontal=True,
        key="origin_method",
    )
    if origin_mode == "Use my location":
        st.caption(
            "Click the location button below and allow browser permission. GPS needs localhost or HTTPS."
        )
        gps = gps_component(
            key="origin_gps",
            default={"location": None},
            on_location_change=lambda: None,
        )
        location = gps.location
        if location and location.get("error"):
            messages = {
                "denied": "Location permission was denied. Allow location for this website in your browser settings, then retry.",
                "timeout": "GPS timed out. Retry or use address search.",
                "unavailable": "Your device could not determine its location. Try your phone or address search.",
                "unsupported": "GPS is unavailable in this browser context. Open LeaveNow directly in a normal HTTPS browser tab.",
            }
            st.warning(
                messages.get(location["error"], "Location unavailable. Please retry.")
            )
        if (
            location
            and location.get("latitude") is not None
            and location.get("longitude") is not None
        ):
            try:
                origin = coordinate(location["latitude"], location["longitude"])
                if not (
                    29.35 <= origin["lat"] <= 30.1 and -82.9 <= origin["lon"] <= -81.9
                ):
                    origin = None
                    st.warning(
                        "Your location is outside Gainesville RTS coverage. Use a Gainesville address or stop instead."
                    )
                else:
                    st.success("Current location received.")
                    if location.get("accuracy") is not None:
                        st.caption(
                            f"Device-reported accuracy: about {round(location['accuracy'])} m"
                        )
            except (ValueError, TypeError):
                origin = None
                st.warning(
                    "The browser returned an invalid position. Use stop search or coordinates instead."
                )
        else:
            origin = None
            st.info(
                "Your location has not been received yet. Press ‘Use my current location’ above. If the button is missing in an embedded browser, open LeaveNow directly in Chrome or Safari."
            )
    elif origin_mode == "Address or place":
        origin = choose_address("origin")
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
        ["Search a stop", "Coordinates", "Address or place"],
        horizontal=True,
        key="destination_method",
    )
    if destination_mode == "Address or place":
        destination = choose_address("destination")
    elif destination_mode == "Coordinates":
        destination = choose_coordinates("destination")
    else:
        destination = choose_stop("destination", "Destination stop")

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
    "Auto-refresh bus tracking every 20 seconds", value=True
)
timing, connection_options = st.columns(2)
travel_mode = timing.selectbox(
    "Travel time", ["Leave now", "Depart at", "Arrive by"], key="travel_mode"
)
allow_transfer = connection_options.toggle("Allow one transfer", value=True)
transfer_buffer = connection_options.select_slider(
    "Minimum transfer buffer",
    options=[3, 5, 8, 10],
    value=5,
    format_func=lambda n: f"{n} min",
)
mode = {"Leave now": "leave_now", "Depart at": "depart_at", "Arrive by": "arrive_by"}[
    travel_mode
]
when = None
time_valid = True
if mode != "leave_now":
    local_now = datetime.now(ZoneInfo("America/New_York"))
    day_col, time_col = st.columns(2)
    day = day_col.date_input(
        "Travel date · Gainesville",
        value=local_now.date(),
        min_value=local_now.date(),
        max_value=(local_now + timedelta(days=14)).date(),
    )
    clock = time_col.time_input(
        "Travel time · America/New_York",
        value=(local_now + timedelta(minutes=30))
        .time()
        .replace(second=0, microsecond=0),
        step=300,
    )
    try:
        when = travel_timestamp(day, clock)
    except ValueError as error:
        st.error(str(error))
        time_valid = False
    st.caption(
        "Scheduled times use the RTS timetable. Live predictions are overlaid only when the exact trip is available."
    )
payload = {
    "origin": origin,
    "destination": destination,
    "maxWalk": max_walk,
    "mode": mode,
    "maxTransfers": 1 if allow_transfer else 0,
    "transferBuffer": transfer_buffer,
}
if when is not None:
    payload["when"] = when
if st.session_state.get("planned_trip") and st.session_state["planned_trip"] != payload:
    st.session_state.pop("planned_trip", None)
if st.button(
    "Find my next bus",
    type="primary",
    disabled=not api_enabled or not time_valid or origin is None or destination is None,
    use_container_width=True,
):
    st.session_state["planned_trip"] = payload


@st.fragment(run_every="20s" if auto_refresh else None)
def show_bus_tracking(trip, journey, leg, light):
    st.subheader("Track your bus")
    st.caption(
        f"Route {leg['route']} · boarding at {leg['boarding']['name']} · get off at {leg['alighting']['name']}"
    )
    st.button("Refresh bus location", key="refresh_bus_location")
    bus = None
    try:
        data = api_request(
            "/api/tracking?"
            + urlencode({"stop": leg["boarding"]["id"], "route": leg["route"]})
        )
        buses = {b["id"]: b for b in data.get("buses", [])}
        key = "tracked_bus_" + str(leg["boarding"]["id"]) + "_" + str(leg["route"])
        if st.session_state.get(key) not in buses:
            st.session_state.pop(key, None)
        selected = st.selectbox(
            "Choose a live bus on this route",
            list(buses),
            index=None,
            format_func=lambda id: f"Bus {id} · {buses[id]['destination']} · "
            + (
                f"arrives {clock_time(buses[id]['arrivalAt'])}"
                if buses[id].get("arrivalAt")
                else "GPS only · boarding ETA unavailable"
            ),
            key=key,
            placeholder="Select a live bus",
        )
        if selected:
            bus = buses[selected]
            if bus.get("arrivalAt"):
                minutes = max(
                    0, math.ceil((bus["arrivalAt"] - time.time() * 1000) / 60000)
                )
                st.metric(
                    "Bus reaches your boarding stop",
                    "Due now" if minutes == 0 else f"{minutes} min",
                    clock_time(bus["arrivalAt"]),
                )
            else:
                st.info(
                    "Live GPS is available, but RTS has not provided an arrival prediction for this bus at your boarding stop. This vehicle is on the route; its direction and service to your destination are not confirmed. Check the destination sign before boarding."
                )
            if not bus.get("position"):
                st.info(
                    "Arrival prediction is available, but this bus has no fresh GPS position. Its marker is hidden until GPS returns."
                )
        elif not buses:
            st.info(
                "No active bus with fresh GPS or a stop-arrival prediction is available on this route right now. The timetable above is a scheduled service, not confirmation that a vehicle is currently running. Check again closer to departure."
            )
        if data.get("partial"):
            st.warning("Some live tracking data is temporarily unavailable.")
    except ApiError as error:
        st.warning(str(error))
    map_view(trip["origin"], trip["destination"], journey, light=light, bus=bus)
    st.caption(
        "Pink marker = selected bus. Start, destination, boarding and get-off stops remain on the map. Enable auto-refresh for updates every 20 seconds. Arrival times are provider predictions; route number alone does not identify your scheduled trip."
    )


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
    refresh = st.button("Refresh arrivals now", key="refresh_arrivals")
    try:
        with st.spinner("Finding direct journeys and transfer connections…"):
            cached = st.session_state.get("trip_result")
            if (
                refresh
                or not cached
                or cached[0] != trip
                or time.time() - cached[1] > 60
            ):
                cached = (dict(trip), time.time(), api_request("/api/plan", trip))
                st.session_state["trip_result"] = cached
            plan = cached[2]
    except ApiError as error:
        st.error(str(error))
        return
    st.caption("Checked " + clock_time(plan["checkedAt"]) + " · Gainesville local time")
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
    if plan.get("liveStatus"):
        st.caption(plan["liveStatus"])
    if plan.get("feed"):
        feed = plan["feed"]
        st.caption(
            f"RTS timetable: {feed['version']} · service through {feed.get('endDate', 'unknown')}"
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
            "Try Depart at or Arrive by, increase the walking allowance, or allow a transfer. Results are limited to the published feed dates."
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
        st.link_button("Check official RTS trip planning", "https://go-rts.com/")
        return
    if st.session_state.get("journey_choice", 0) >= len(journeys):
        st.session_state["journey_choice"] = 0
    selected = st.selectbox(
        "Journey options",
        range(len(journeys)),
        format_func=lambda i: f"{journeys[i]['timingLabel'] if 'timingLabel' in journeys[i] else 'Live'} · {journeys[i]['route']} · {clock_time(journeys[i]['departsAt'])} · {journeys[i].get('transfers', 0)} transfer(s)",
        key="journey_choice",
    )
    journey = journeys[selected]
    st.subheader(journey["headsign"])
    label = journey.get("timingLabel", "Live")
    st.caption(
        f"{label} · {journey.get('transfers', 0)} transfer(s) · arrive at destination {clock_time(journey['destinationAt'])}"
    )
    ticket(journey)
    bus, leave, walk, arrive = st.columns(4)
    bus.metric(
        "Departure",
        clock_time(journey["departsAt"]),
    )
    leave.metric("Leave by", clock_time(journey["leaveAt"]))
    walk.metric("Estimated walk to stop", f"{journey['walkMinutes']} min")
    arrive.metric("Reach destination", clock_time(journey["destinationAt"]))
    timeline(journey)
    legs = journey.get("legs") or [journey]
    leg_index = (
        st.selectbox(
            "Bus leg to track",
            range(len(legs)),
            format_func=lambda i: f"Leg {i+1} · Route {legs[i]['route']} · {legs[i]['boarding']['name']}",
        )
        if len(legs) > 1
        else 0
    )
    show_bus_tracking(trip, journey, legs[leg_index], light_map)
    st.caption(
        "Blue/purple lines follow published RTS bus routes. Green walking links are approximate. Route lines do not show the live bus’s recorded travel history."
    )
    st.link_button(
        "Walking directions to your boarding stop ↗",
        f"https://www.google.com/maps/dir/?api=1&origin={trip['origin']['lat']},{trip['origin']['lon']}&destination={journey['boarding']['lat']},{journey['boarding']['lon']}&travelmode=walking",
    )


show_results()
with st.expander("How this prototype works"):
    st.write(
        "The Streamlit service calls the private Node API and never receives the RTS key. Published timetable stop sequences and service calendars determine scheduled journeys. Fresh live predictions are used only for the exact matching trip, and all walking/transfer buffers are checked again after updates."
    )
    st.write(
        "Timetable routing supports direct journeys and one transfer, Leave now / Depart at / Arrive by, service calendars and holiday exceptions. Transfer walks are limited to 400 meters and your selected walking allowance. The selected connection buffer and any longer GTFS minimum are enforced. Scheduled connections are not guarantees; check changes before travel. Walking is estimated rather than street-routed. Locations remain in session memory, not a database."
    )

markup(
    '<div class="ln-footer"><span>BUILT FOR THE JOURNEY, NOT THE WAIT.</span><span>LEAVENOW / GAINESVILLE</span></div>'
)
