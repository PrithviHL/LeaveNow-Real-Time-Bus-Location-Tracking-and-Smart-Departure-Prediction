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
    st.session_state["destination_point"] = {
        "lat": destination[0],
        "lon": destination[1],
    }
    st.session_state["origin_selected_name"] = origin_name
    st.session_state["destination_selected_name"] = destination_name
    for key in ("origin", "destination"):
        st.session_state[key + "_command"] = (
            st.session_state.get(key + "_command", 0) + 1
        )
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
    for key in ("origin", "destination"):
        st.session_state[key + "_command"] = (
            st.session_state.get(key + "_command", 0) + 1
        )
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
    html='<button type="button" aria-label="Use my current location">⌖ Use my current location</button><p role="status" aria-live="polite"></p>',
    css="button {background:#c5f267;color:#152217;border:0;border-radius:8px;padding:12px 18px;font:600 14px sans-serif;cursor:pointer} p {font:13px sans-serif;color:var(--st-text-color)}",
    js=r"""export default function({parentElement,setStateValue}) {
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
          setStateValue('location',{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,requestId:Date.now()});
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


location_picker_component = st.components.v2.component(
    "leavenow_location_picker",
    html='<div class="picker"><input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" maxlength="150" placeholder="Stop, address, or place"><div class="suggestions" role="listbox"></div></div>',
    css=""".picker{font:14px sans-serif;color:#e8eef4}
.picker input{box-sizing:border-box;width:100%;padding:13px 14px;border:1px solid #64748066;border-radius:10px;background:#0f1d2b;color:#f5f7fa;font:inherit;outline:none}.picker input:focus{border-color:#c5f267;box-shadow:0 0 0 2px #c5f26733}.suggestions:not(:empty){margin-top:4px;max-height:240px;overflow-y:auto;border:1px solid #64748066;border-radius:10px;background:#14232d;box-shadow:0 10px 24px #0005}.suggestion{display:block;width:100%;padding:11px 13px;border:0;border-bottom:1px solid #ffffff12;background:transparent;color:#eef4f5;text-align:left;font:inherit;cursor:pointer}.suggestion:hover,.suggestion[aria-selected="true"]{background:#254047}.kind{display:inline-block;min-width:60px;color:#c5f267;font-size:11px}.empty{padding:11px 13px;color:#aab8c2;font-size:12px}""",
    js=r"""export default function({parentElement, data, setStateValue}) {
      const input=parentElement.querySelector('input'), list=parentElement.querySelector('.suggestions');
      let timer, composing=false, active=true, closed=Boolean(data.resolved)||input.dataset.open==='0', selected=-1, matches=[];
      input.setAttribute('aria-label',data.label);
      list.id=data.id+'-options';input.setAttribute('aria-controls',list.id);
      if(input.dataset.command!==String(data.command)) {
        input.value=data.value||'';input.dataset.command=String(data.command);
      }
      const emit=event=>{
        const count=Number(input.dataset.sequence||0)+1;input.dataset.sequence=String(count);
        setStateValue('event',{...event,command:data.command,nonce:String(Date.now())+':'+count});
      };
      const choose=item=>{clearTimeout(timer);input.value=item.label;closed=true;input.dataset.open='0';list.replaceChildren();input.setAttribute('aria-expanded','false');emit({type:'select',id:item.id});};
      const draw=()=>{
        list.replaceChildren();matches=[];selected=-1;input.removeAttribute('aria-activedescendant');
        const query=input.value.trim().toLowerCase();
        if(closed||query.length<2){input.setAttribute('aria-expanded','false');return;}
        const terms=query.split(/\s+/);
        for(const stop of data.stops||[]) {
          if(terms.every(t=>stop.name.toLowerCase().includes(t))||String(stop.id)===query)
            matches.push({id:'stop:'+stop.id,kind:'stop',label:stop.name+' · stop '+stop.id});
          if(matches.length===6)break;
        }
        if(query===(data.placeQuery||'').toLowerCase())matches.push(...(data.places||[]));
        matches=matches.slice(0,12);
        matches.forEach((item,index)=>{
          const button=document.createElement('button');button.type='button';button.className='suggestion';button.id=data.id+'-option-'+index;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;
          const kind=document.createElement('span');kind.className='kind';kind.textContent=item.kind==='stop'?'STOP':'PLACE';
          const title=document.createElement('span');title.textContent=item.label;button.append(kind,title);
          button.onmousedown=e=>e.preventDefault();button.onclick=()=>choose(item);list.append(button);
        });
        if(!matches.length){const note=document.createElement('div');note.className='empty';note.textContent=query.length<3?'Type one more letter for places.':query===(data.placeQuery||'').toLowerCase()?(data.placeError?'Place search unavailable. Try a stop.':'No matches. Try a fuller name or address.'):'Searching places…';list.append(note);}
        input.setAttribute('aria-expanded','true');
      };
      const change=()=>{
        clearTimeout(timer);closed=false;input.dataset.open='1';draw();
        if(!composing && data.resolved && input.dataset.invalidated!==String(data.command)){
          input.dataset.invalidated=String(data.command);emit({type:'edit',value:input.value});
        }
        if(!composing)timer=setTimeout(()=>{if(active)emit({type:'query',value:input.value});},1100);
      };
      const focus=()=>{closed=false;input.dataset.open='1';draw();};
      const blur=()=>{closed=true;input.dataset.open='0';list.replaceChildren();input.setAttribute('aria-expanded','false');};
      const start=()=>{composing=true;clearTimeout(timer);};
      const end=()=>{composing=false;change();};
      const keydown=e=>{
        if(e.isComposing||composing)return;
        if(e.key==='Escape'){closed=true;input.dataset.open='0';list.replaceChildren();input.setAttribute('aria-expanded','false');return;}
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){
          e.preventDefault();if(closed){closed=false;input.dataset.open='1';draw();}if(!matches.length)return;
          selected=(selected+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;
          [...list.children].forEach((button,i)=>button.setAttribute('aria-selected',String(i===selected)));
          input.setAttribute('aria-activedescendant',data.id+'-option-'+selected);return;
        }
        if(e.key==='Enter'&&!closed&&matches.length){e.preventDefault();choose(matches[Math.max(0,selected)]);}
      };
      input.addEventListener('input',change);input.addEventListener('focus',focus);input.addEventListener('blur',blur);input.addEventListener('compositionstart',start);input.addEventListener('compositionend',end);input.addEventListener('keydown',keydown);draw();
      if(!data.resolved && (data.typing || input.value!==(data.value||''))) timer=setTimeout(()=>{if(active)emit({type:'query',value:input.value});},1100);
      return ()=>{active=false;clearTimeout(timer);for(const [type,fn] of [['input',change],['focus',focus],['blur',blur],['compositionstart',start],['compositionend',end],['keydown',keydown]])input.removeEventListener(type,fn);};
    }""",
)


def set_location(key, value, point):
    st.session_state[key + "_value"] = value
    st.session_state[key + "_selected_name"] = value
    st.session_state[key + "_point"] = point
    st.session_state[key + "_typing"] = False
    st.session_state[key + "_command"] = st.session_state.get(key + "_command", 0) + 1


def apply_location_event(key, event, stops, places):
    if (
        not isinstance(event, dict)
        or not event.get("nonce")
        or event["nonce"] == st.session_state.get(key + "_last_event")
    ):
        return False
    st.session_state[key + "_last_event"] = event["nonce"]
    if "command" in event and event["command"] != st.session_state.get(
        key + "_command", 0
    ):
        return False
    if event.get("type") in ("query", "edit"):
        st.session_state[key + "_typing"] = event.get("type") == "edit"
        st.session_state[key + "_value"] = str(event.get("value", ""))[:150]
        st.session_state.pop(key + "_point", None)
        st.session_state.pop(key + "_selected_name", None)
        return True
    if event.get("type") == "select":
        options = {
            "stop:"
            + str(s["id"]): {
                "label": s["name"] + " · stop " + str(s["id"]),
                "lat": s["lat"],
                "lon": s["lon"],
            }
            for s in stops
        }
        options.update({place["id"]: place for place in places})
        item = options.get(event.get("id"))
        if item:
            set_location(key, item["label"], coordinate(item["lat"], item["lon"]))
            return True
    return False


def location_suggestions(key, label):
    query = st.session_state.get(key + "_value", "")
    point = st.session_state.get(key + "_point")
    resolved = (
        point is not None and st.session_state.get(key + "_selected_name") == query
    )
    stops, places, failed = [], [], False
    if api_enabled:
        try:
            stops = cached_stops()
        except ApiError:
            st.caption("Stop search temporarily unavailable.")
    if (
        not resolved
        and not st.session_state.get(key + "_typing")
        and len(query.strip()) >= 3
        and api_enabled
    ):
        cache = st.session_state.setdefault(key + "_place_cache", {})
        qkey = query.strip().casefold()
        try:
            if qkey not in cache:
                found = api_request(
                    "/api/addresses?" + urlencode({"q": query.strip()})
                ).get("results", [])
                if len(cache) >= 100:
                    cache.clear()
                cache[qkey] = found
            places = [
                {
                    "id": f"place:{qkey}:{i}",
                    "kind": "place",
                    "label": p["name"],
                    "lat": p["lat"],
                    "lon": p["lon"],
                }
                for i, p in enumerate(cache[qkey])
            ]
        except ApiError:
            failed = True
    result = location_picker_component(
        key=key + "_picker",
        data={
            "id": key,
            "label": label,
            "value": query,
            "command": st.session_state.get(key + "_command", 0),
            "resolved": resolved,
            "typing": st.session_state.get(key + "_typing", False),
            "stops": stops,
            "places": places,
            "placeQuery": query.strip(),
            "placeError": failed,
        },
        default={"event": None},
        on_event_change=lambda: None,
    )
    if apply_location_event(key, result.event, stops, places):
        st.rerun()
    return point if resolved else None


def current_location():
    """Render the device location action immediately under the origin field."""
    gps = gps_component(
        key="origin_gps",
        default={"location": None},
        on_location_change=lambda: None,
        width="content",
    )
    location = gps.location
    if location and location.get("error"):
        messages = {
            "denied": "Location permission was denied. Allow it in browser settings.",
            "timeout": "Location timed out. Try an address or place search.",
            "unavailable": "Location unavailable. Try an address or place search.",
            "unsupported": "Open LeaveNow directly in Chrome or Safari to use location.",
        }
        st.warning(
            messages.get(location["error"], "Location unavailable. Please retry.")
        )
        return None
    if (
        not location
        or location.get("latitude") is None
        or location.get("longitude") is None
    ):
        return None
    try:
        point = coordinate(location["latitude"], location["longitude"])
    except (ValueError, TypeError):
        st.warning(
            "The browser returned an invalid position. Search for an address or stop instead."
        )
        return None
    if not (29.35 <= point["lat"] <= 30.1 and -82.9 <= point["lon"] <= -81.9):
        st.warning("Outside Gainesville. Choose a local address, place, or stop.")
        return None
    if location.get("accuracy") is not None and location["accuracy"] > 100:
        st.caption("Approximate device location; check the map before travelling.")
    token = location.get("requestId") or str(sorted(location.items()))
    if token == st.session_state.get("origin_gps_seen"):
        return None
    st.session_state["origin_gps_seen"] = token
    return point


left, right = st.columns(2)
with left:
    markup(
        '<div class="ln-kicker"><span class="ln-pin">●</span>01 / STARTING FROM</div>'
    )
    origin = location_suggestions("origin", "Starting from")
    device_origin = current_location()
    if device_origin is not None:
        set_location("origin", "Current location", device_origin)
        st.rerun()
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


@st.fragment(run_every="5s" if auto_refresh else None)
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
    st.caption("Blue bus + line → green boarding pin · Updates every 5s.")


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
    if any(
        part.get("walkSource") == "estimate"
        for part in [
            journey.get("boarding", {}),
            journey.get("alighting", {}),
            journey.get("connection") or {},
        ]
    ):
        st.caption(
            "Some walking paths are unavailable; those times are conservative estimates."
        )
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
    st.caption("Blue/purple = bus route · Green = walking path.")
    st.link_button(
        "Walking directions to your boarding stop ↗",
        f"https://www.google.com/maps/dir/?api=1&origin={trip['origin']['lat']},{trip['origin']['lon']}&destination={journey['boarding']['lat']},{journey['boarding']['lon']}&travelmode=walking",
    )


show_results()
with st.expander("About the estimates"):
    st.caption(
        "Live = RTS prediction. Scheduled = timetable. Walks use mapped OSM paths where available."
    )
    st.caption("Route lines show the published path, not GPS history.")
