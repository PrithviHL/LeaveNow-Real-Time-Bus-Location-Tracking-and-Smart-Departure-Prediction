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

from presentation import theme, markup, map_view, ticket, timeline
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
            '<div class="ln-nav"><div class="ln-brand"><i>↗</i>Leave<span>Now</span></div><div class="ln-city">GAINESVILLE, FL</div><div class="ln-live"><span class="ln-dot"></span>GAINESVILLE RTS</div></div>'
        )
    with account:
        account_menu()
else:
    markup(
        '<div class="ln-nav"><div class="ln-brand"><i>↗</i>Leave<span>Now</span></div><div class="ln-city">GAINESVILLE, FL</div><div class="ln-live"><span class="ln-dot"></span>GAINESVILLE RTS</div></div>'
    )
markup(
    '<div class="ln-hero ln-hero-depth"><div class="ln-hero-copy"><span class="ln-hero-tag">YOUR NEXT MOVE</span><h1>Where to<span>?</span></h1></div>'
    '<div class="ln-scene" aria-hidden="true"><div class="ln-road-grid"></div><div class="ln-route-glow"></div><div class="ln-orbit ln-orbit-a"></div><div class="ln-orbit ln-orbit-b"></div>'
    '<div class="ln-bus-shadow"></div><div class="ln-bus-float"><div class="ln-bus-3d"><div class="ln-bus-top"></div><div class="ln-bus-end"><i></i></div><div class="ln-bus-side"><span class="ln-bus-logo">↗</span><div class="ln-bus-windows"><i></i><i></i><i></i></div><b class="ln-wheel ln-wheel-a"></b><b class="ln-wheel ln-wheel-b"></b></div></div></div></div></div>'
)

account_controls()

if not api_enabled:
    st.warning("Service temporarily unavailable. Try again later.")


def apply_preset(reverse=False):
    origin_name, destination_name = "Reitz Union", "Rosa Parks RTS Downtown Station"
    origin, destination = (29.64514, -82.346983), (29.645567, -82.322697)
    if reverse:
        origin_name, destination_name = destination_name, origin_name
        origin, destination = destination, origin
    st.session_state["origin_value"] = origin_name
    st.session_state["destination_value"] = destination_name
    st.session_state["origin_point"] = {"lat": origin[0], "lon": origin[1]}
    st.session_state["destination_point"] = {"lat": destination[0], "lon": destination[1]}
    st.session_state["origin_selected_name"] = origin_name
    st.session_state["destination_selected_name"] = destination_name
    st.session_state.pop("planned_trip", None)


def swap_locations():
    a = st.session_state.get("resolved_origin")
    b = st.session_state.get("resolved_destination")
    if not a or not b:
        return
    origin_label = st.session_state.get("origin_selected_name", "")
    destination_label = st.session_state.get("destination_selected_name", "")
    st.session_state["origin_value"] = destination_label
    st.session_state["destination_value"] = origin_label
    st.session_state["origin_selected_name"] = destination_label
    st.session_state["destination_selected_name"] = origin_label
    st.session_state["origin_point"] = b
    st.session_state["destination_point"] = a
    st.session_state["origin_gps_result"] = None
    st.session_state.pop("origin_selected_suggestion", None)
    st.session_state.pop("destination_selected_suggestion", None)
    st.session_state.pop("planned_trip", None)


for _key in ("origin", "destination"):
    st.session_state.setdefault(_key + "_value", "")

with st.expander("Try an example"):
    preset_a, preset_b, spacer = st.columns([1, 1, 2])
    preset_a.button(
        "↗ Reitz → Downtown", on_click=apply_preset, use_container_width=True
    )
    preset_b.button(
        "↙ Downtown → Reitz",
        on_click=apply_preset,
        args=(True,),
        use_container_width=True,
    )


@st.cache_data(ttl=3600, show_spinner=False)
def cached_stops():
    return stop_catalog()


# Components v2 renders in the app page, avoiding iframe geolocation policy issues.
gps_component = st.components.v2.component(
    "leavenow_gps",
    html='<button type="button" aria-label="Use my current location">⌖ Use my current location</button><p role="status" aria-live="polite">Click to request your location.</p>',
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
        const success=position=>{
          if(!active)return;
          status.textContent='Location received.';button.disabled=false;
          setStateValue('location',{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy});
        };
        const failure=(error,mayRetry)=>{
          if(!active)return;
          if(error.code!==1 && mayRetry){
            status.textContent='Precise location unavailable. Trying an approximate device location…';
            navigator.geolocation.getCurrentPosition(success,e=>failure(e,false),{enableHighAccuracy:false,timeout:20000,maximumAge:60000});
            return;
          }
          button.disabled=false;
          const reason=error.code===1?'denied':error.code===3?'timeout':'unavailable';
          status.textContent=reason==='denied'?'Location permission was denied. Check this site’s browser permissions.':reason==='timeout'?'Both location attempts timed out. Check device Location Services, then retry or use address search.':'Your device could not determine its location. Check device Location Services or use address search.';
          setStateValue('location',{error:reason});
        };
        navigator.geolocation.getCurrentPosition(success,e=>failure(e,true),{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
      };
      return ()=>{active=false;button.onclick=null;};
    }""",
)


def select_suggestion(key):
    selected = st.session_state.get(key + "_suggestion")
    item = st.session_state.get(key + "_suggestions", {}).get(selected)
    if item:
        st.session_state[key + "_value"] = item["name"]
        st.session_state[key + "_point"] = {
            "lat": float(item["lat"]),
            "lon": float(item["lon"]),
        }
        st.session_state[key + "_selected_name"] = item["name"]


def edit_location(key):
    st.session_state.pop(key + "_point", None)
    st.session_state.pop(key + "_selected_name", None)


def location_suggestions(key, label):
    """Searchable stop/address field with one suggestion menu."""
    query = st.text_input(
        label,
        placeholder="Type a stop, address, or place…",
        key=key + "_value",
        autocomplete="street-address",
        on_change=edit_location,
        args=(key,),
    ) or ""
    point = st.session_state.get(key + "_point")
    if point and st.session_state.get(key + "_selected_name") == query:
        return point

    matches = {}
    normalized = query.strip()
    if len(normalized) >= 2 and api_enabled:
        terms = normalized.casefold().split()
        try:
            for stop in cached_stops():
                if all(term in stop["name"].casefold() for term in terms) or str(stop["id"]) == normalized:
                    title = f"🚏 {stop['name']} · stop {stop['id']}"
                    matches[title] = {"name": stop["name"], "lat": stop["lat"], "lon": stop["lon"]}
        except ApiError as error:
            st.warning(str(error))
        if len(normalized) >= 3:
            cache = st.session_state.setdefault(key + "_place_cache", {})
            qkey = normalized.casefold()
            if qkey not in cache:
                try:
                    cache[qkey] = api_request("/api/addresses?" + urlencode({"q": normalized})).get("results", [])
                except ApiError:
                    cache[qkey] = []
            for place in cache[qkey]:
                matches[f"⌖ {place['name']} · place"] = place

    st.session_state[key + "_suggestions"] = matches
    st.selectbox(
        label + " suggestions",
        options=[""] + list(matches),
        index=0,
        format_func=lambda value: value or "Choose a matching stop or place",
        key=key + "_suggestion",
        on_change=select_suggestion,
        args=(key,),
        label_visibility="collapsed",
    )
    return None


def current_location():
    """Render the device location action immediately under the origin field."""
    gps = gps_component(
        key="origin_gps",
        default={"location": None},
        on_location_change=lambda: None,
    )
    location = gps.location
    if location and location.get("error"):
        messages = {
            "denied": "Location permission was denied. Allow it in browser settings.",
            "timeout": "Location timed out. Try an address or place search.",
            "unavailable": "Location unavailable. Try an address or place search.",
            "unsupported": "Open LeaveNow directly in Chrome or Safari to use location.",
        }
        st.warning(messages.get(location["error"], "Location unavailable. Please retry."))
        return None
    if not location or location.get("latitude") is None or location.get("longitude") is None:
        return None
    try:
        point = coordinate(location["latitude"], location["longitude"])
    except (ValueError, TypeError):
        st.warning("The browser returned an invalid position. Search for an address or stop instead.")
        return None
    if not (29.35 <= point["lat"] <= 30.1 and -82.9 <= point["lon"] <= -81.9):
        st.warning("Outside Gainesville. Choose a local address, place, or stop.")
        return None
    if location.get("accuracy") is not None and location["accuracy"] > 100:
        st.caption("Approximate device location; check the map before travelling.")
    return point


left, right = st.columns(2)
with left:
    markup(
        '<div class="ln-kicker"><span class="ln-pin">●</span>01 / STARTING FROM</div>'
    )
    origin = location_suggestions("origin", "Starting from")
    gps_column, _ = st.columns([1, 2])
    with gps_column:
        device_origin = current_location()
    if device_origin is not None:
        st.session_state["origin_gps_result"] = device_origin
        st.session_state["origin_point"] = device_origin
        st.session_state["origin_selected_name"] = "⌖ Current location"
        origin = device_origin
with right:
    markup(
        '<div class="ln-kicker"><span class="ln-pin destination">◆</span>02 / WHERE TO?</div>'
    )
    destination = location_suggestions("destination", "Where to")


st.session_state["resolved_origin"] = origin
st.session_state["resolved_destination"] = destination
st.button(
    "⇄ Swap locations",
    on_click=swap_locations,
    disabled=origin is None or destination is None,
)
with st.expander("Trip options"):
    options, refresh_options = st.columns(2)
    light_map = refresh_options.toggle("Day map", value=False)
    max_walk = options.select_slider(
        "Maximum walk",
        options=[5, 10, 15, 20],
        value=15,
        format_func=lambda n: f"{n} min",
    )
    auto_refresh = refresh_options.checkbox("Auto-refresh live bus", value=True)
    timing, connection_options = st.columns(2)
    travel_mode = timing.selectbox(
        "Travel time", ["Leave now", "Depart at", "Arrive by"], key="travel_mode"
    )
    allow_transfer = connection_options.toggle("Allow one transfer", value=True)
    transfer_buffer = connection_options.select_slider(
        "Connection buffer",
        options=[3, 5, 8, 10],
        value=5,
        format_func=lambda n: f"{n} min",
    )
    mode = {
        "Leave now": "leave_now",
        "Depart at": "depart_at",
        "Arrive by": "arrive_by",
    }[travel_mode]
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
        st.caption("Times are local to Gainesville.")
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
    st.session_state["journey_choice"] = 0
    st.session_state.pop("trip_result", None)


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
            + urlencode(
                {
                    "stop": leg["boarding"]["id"],
                    "alight": leg["alighting"]["id"],
                    "route": leg["route"],
                }
            )
        )
        buses = {b["id"]: b for b in data.get("buses", [])}
        key = "tracked_bus_" + str(leg["boarding"]["id"]) + "_" + str(leg["route"])
        if st.session_state.get(key) not in buses:
            st.session_state.pop(key, None)
        selected = st.selectbox(
            "Choose a bus toward your destination",
            list(buses),
            index=None,
            format_func=lambda id: f"Bus {id} · {buses[id]['destination']} · "
            + (
                f"arrives {clock_time(buses[id]['arrivalAt'])}"
                if buses[id].get("arrivalAt")
                else "GPS only · no ETA"
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
                st.info("Direction verified · Live GPS · Stop ETA unavailable.")
            if not bus.get("position"):
                st.info("ETA available. Waiting for fresh GPS.")
        elif not buses:
            st.info(
                "No live bus verified in this direction. Scheduled trips remain available."
            )
        if data.get("partial"):
            st.warning("Some live tracking data is temporarily unavailable.")
    except ApiError as error:
        st.warning(str(error))
    map_view(trip["origin"], trip["destination"], journey, light=light, bus=bus)
    st.caption("Pink = live bus · Updates every 20s when enabled.")


def show_results():
    trip = st.session_state.get("planned_trip")
    if not trip or not api_enabled:
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
    journeys = plan["journeys"]
    if not journeys:
        reason = (
            plan.get("reason") or "No verified catchable direct bus in the live window."
        )
        st.info(reason.split(". ")[0].rstrip(".") + ".")
        map_view(trip["origin"], trip["destination"], light=light_map)
        st.caption("Adjust your search in Trip options.")
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
        format_func=lambda i: f"{journeys[i].get('recommendation', 'Recommended' if i == 0 else 'Alternative')} · Route {journeys[i]['route']} · {clock_time(journeys[i]['departsAt'])} · "
        + ("Direct" if not journeys[i].get("transfers", 0) else "1 transfer"),
        key="journey_choice",
    )
    journey = journeys[selected]
    label = journey.get("timingLabel", "Live")
    st.caption(
        f"{label} · {journey.get('transfers', 0)} transfer(s) · arrive at destination {clock_time(journey['destinationAt'])}"
    )
    ticket(journey)
    walk, arrive = st.columns(2)
    walk.metric("Estimated walk to stop", f"{journey['walkMinutes']} min")
    arrive.metric("Reach destination", clock_time(journey["destinationAt"]))
    with st.expander("Trip details"):
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
    st.caption("Blue/purple = bus route · Green = estimated walk.")
    st.link_button(
        "Walking directions to your boarding stop ↗",
        f"https://www.google.com/maps/dir/?api=1&origin={trip['origin']['lat']},{trip['origin']['lon']}&destination={journey['boarding']['lat']},{journey['boarding']['lon']}&travelmode=walking",
    )


show_results()
with st.expander("About the estimates"):
    st.caption(
        "Live = RTS prediction. Scheduled = timetable. Walking distances are approximate."
    )
    st.caption("Route lines show the published path, not GPS history.")
