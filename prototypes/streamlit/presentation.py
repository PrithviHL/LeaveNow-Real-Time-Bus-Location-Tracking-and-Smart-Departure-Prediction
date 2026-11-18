"""Escaped presentation components and an interactive map for the Streamlit UI."""

from html import escape
import hashlib
import json
from pathlib import Path
from urllib.parse import quote
import math
import time

import pydeck as pdk
import streamlit as st
from client import clock_time


def markup(content):
    st.markdown(content, unsafe_allow_html=True)


def theme():
    markup(Path(__file__).with_name("theme.css").read_text())


def map_icon(kind, color):
    """Inline SVG markers need no external icon service or API key."""
    if kind == "bus":
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect x="2" y="2" width="36" height="36" rx="10" fill="{color}" stroke="white" stroke-width="2"/><rect x="11" y="8" width="18" height="23" rx="4" fill="white"/><rect x="14" y="11" width="12" height="9" rx="1" fill="{color}"/><circle cx="15" cy="26" r="2" fill="{color}"/><circle cx="25" cy="26" r="2" fill="{color}"/><path d="M13 32v2m14-2v2" stroke="white" stroke-width="3"/></svg>'
        return {
            "url": "data:image/svg+xml," + quote(svg, safe=""),
            "width": 40,
            "height": 40,
            "anchorY": 20,
        }
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44"><path d="M16 42C12 35 2 25 2 16a14 14 0 1 1 28 0c0 9-10 19-14 26Z" fill="{color}" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="5" fill="white"/></svg>'
    return {
        "url": "data:image/svg+xml," + quote(svg, safe=""),
        "width": 32,
        "height": 44,
        "anchorY": 44,
    }


def map_view(origin=None, destination=None, journey=None, light=False, bus=None):
    points = []
    markers = []
    for point, label, color in [
        (origin, "Your start", "#22c55e"),
        (destination, "Your destination", "#ef4444"),
    ]:
        if point:
            markers.append(
                {
                    "position": [point["lon"], point["lat"]],
                    "label": label,
                    "detail": "Trip location",
                    "icon": map_icon("pin", color),
                }
            )
    if journey and journey.get("legs"):
        for leg in journey["legs"]:
            for stop, label in [
                (leg["boarding"], "Board here"),
                (leg["alighting"], "Get off here"),
            ]:
                points.append(
                    {
                        "position": [stop["lon"], stop["lat"]],
                        "label": stop["name"],
                        "detail": label,
                        "color": [101, 178, 255],
                    }
                )
    elif journey:
        for stop, label in [
            (journey["boarding"], "Board here"),
            (journey["alighting"], "Get off here"),
        ]:
            points.append(
                {
                    "position": [stop["lon"], stop["lat"]],
                    "label": stop["name"],
                    "detail": label,
                    "color": [101, 178, 255],
                }
            )
    if bus and bus.get("position"):
        position = bus["position"]
        markers.append(
            {
                "position": [position["lon"], position["lat"]],
                "label": f"Bus {bus['id']} · Route {bus['route']}",
                "detail": "Live position · updated "
                + clock_time(position["updatedAt"]),
                "icon": map_icon("bus", "#2563eb"),
            }
        )
    if journey:
        legs = journey.get("legs") or [journey]
        for stop, label, color in [
            (legs[0]["boarding"], "Board here", "#22c55e"),
            (legs[-1]["alighting"], "Get off here", "#ef4444"),
        ]:
            markers.insert(
                0,
                {
                    "position": [stop["lon"], stop["lat"]],
                    "label": stop["name"],
                    "detail": label,
                    "icon": map_icon("pin", color),
                },
            )
    layers = [
        pdk.Layer(
            "ScatterplotLayer",
            points,
            id="trip-stops",
            get_position="position",
            get_fill_color="color",
            get_radius=4,
            radius_units="pixels",
            radius_min_pixels=3,
            radius_max_pixels=5,
            pickable=True,
            stroked=True,
            get_line_color=[255, 255, 255],
            line_width_min_pixels=2,
        ),
        pdk.Layer(
            "IconLayer",
            markers,
            id="trip-markers",
            get_position="position",
            get_icon="icon",
            get_size=22,
            size_units="pixels",
            size_max_pixels=24,
            pickable=True,
            billboard=True,
            parameters={"depthTest": False},
        ),
    ]
    if journey and origin and destination:
        legs = journey.get("legs") or [journey]
        paths = []
        for index, leg in enumerate(legs):
            geometry = leg.get("geometry")
            if geometry and len(geometry.get("path", [])) >= 2:
                paths.append(
                    {
                        "path": geometry["path"],
                        "color": (
                            [101, 178, 255, 220] if index == 0 else [180, 130, 255, 220]
                        ),
                        "label": f"Route {leg['route']}",
                        "detail": "Published RTS route · not recorded vehicle history",
                    }
                )
        walks = []
        connections = [
            (origin, legs[0]["boarding"], journey.get("boarding", {}).get("walkPath")),
            (
                legs[-1]["alighting"],
                destination,
                journey.get("alighting", {}).get("walkPath"),
            ),
        ]
        connections += [
            (
                a["alighting"],
                b["boarding"],
                (journey.get("connection") or {}).get("walkPath"),
            )
            for a, b in zip(legs, legs[1:])
        ]
        for a, b, route in connections:
            walks.append(
                {
                    "path": route or [[a["lon"], a["lat"]], [b["lon"], b["lat"]]],
                    "label": "Walk · OpenStreetMap" if route else "Walk · estimate",
                    "detail": (
                        "Mapped footpaths; short access links estimated"
                        if route
                        else "Routing unavailable · approximate connection"
                    ),
                }
            )
        if paths:
            layers.insert(
                0,
                pdk.Layer(
                    "PathLayer",
                    paths,
                    id="trip-bus-paths",
                    get_path="path",
                    get_color="color",
                    width_min_pixels=4,
                    pickable=True,
                ),
            )
        layers.insert(
            0,
            pdk.Layer(
                "PathLayer",
                walks,
                id="trip-walks",
                get_path="path",
                get_color=[197, 242, 103, 120],
                width_min_pixels=2,
                pickable=True,
            ),
        )
        if len(paths) < len(legs):
            st.caption(
                "Published route geometry is unavailable for one or more bus legs; their bus lines are hidden."
            )
    approach = (bus or {}).get("approachGeometry") or {}
    approach_path = approach.get("path") or []
    if len(approach_path) >= 2:
        layers.insert(
            max(0, len(layers) - 2),
            pdk.Layer(
                "PathLayer",
                [
                    {
                        "path": approach_path,
                        "label": "Live bus → boarding stop",
                        "detail": "Verified bus route · short GPS/stop connectors estimated",
                    }
                ],
                get_path="path",
                id="live-bus-approach",
                get_color=[37, 99, 235, 255],
                width_min_pixels=5,
                pickable=True,
            ),
        )
    bounds = (
        points
        + markers
        + [{"position": p} for p in approach_path]
        + (
            [{"position": p} for row in paths + walks for p in row["path"]]
            if journey and origin and destination
            else []
        )
    )
    center = (
        [sum(p["position"][i] for p in bounds) / len(bounds) for i in [0, 1]]
        if bounds
        else [-82.3394, 29.6516]
    )
    spread = max(
        (
            max(abs(p["position"][0] - center[0]), abs(p["position"][1] - center[1]))
            for p in bounds
        ),
        default=0,
    )
    zoom = max(3, min(14, math.log2(0.09 / max(spread, 0.003)) + 10)) if bounds else 12
    context = hashlib.sha256(
        json.dumps(
            {
                "origin": origin,
                "destination": destination,
                "journey": (journey or {}).get("id"),
                "legs": [
                    {
                        "trip": leg.get("tripId"),
                        "route": leg.get("route"),
                        "board": leg["boarding"].get("id"),
                        "off": leg["alighting"].get("id"),
                    }
                    for leg in (
                        (journey or {}).get("legs") or ([journey] if journey else [])
                    )
                ],
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()[:16]
    camera = st.session_state.get("_leavenow_map_camera")
    fit = st.button("Fit route", key="fit_route_" + context)
    if not camera or camera["context"] != context or fit:
        camera = {
            "context": context,
            "view": {
                "longitude": center[0],
                "latitude": center[1],
                "zoom": zoom,
                "pitch": 25,
            },
            "revision": (camera.get("revision", 0) + 1) if camera else 0,
        }
        st.session_state["_leavenow_map_camera"] = camera
    deck = pdk.Deck(
        layers=layers,
        initial_view_state=pdk.ViewState(**camera["view"]),
        map_provider="carto",
        map_style="light" if light else "dark",
        tooltip={"text": "{label}\n{detail}"},
    )
    st.pydeck_chart(
        deck,
        height=420,
        key=f"route_map_{context}_{camera['revision']}",
        on_select="rerun",
    )
    if journey:
        st.caption(
            "Walking routes [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) · Short access links and times are estimates."
        )
    markup(
        '<div class="ln-legend"><span><i class="you"></i>Start / boarding</span><span><i class="dest"></i>Destination / get off</span><span><i class="bus"></i>Live bus</span></div>'
    )


def ticket(journey, bus=None):
    live = bus is not None
    departure = bus.get("arrivalAt") if live else journey["departsAt"]
    label = escape(
        "Live boarding ETA"
        if live and departure
        else (
            "Live GPS · no boarding ETA"
            if live
            else journey.get("timingLabel", "Scheduled")
        )
    )
    transfer_label = "Direct" if not journey.get("transfers", 0) else "1 transfer"
    scheduled = not live and journey.get("timingLabel", "Scheduled") == "Scheduled"
    minutes = (
        max(0, math.ceil((departure / 1000 - time.time()) / 60)) if departure else None
    )
    countdown = (
        (f"{minutes} min" if minutes <= 120 else clock_time(departure))
        if departure
        else "GPS only"
    )
    countdown_caption = (
        "until selected bus reaches this stop"
        if live and departure
        else (
            "boarding ETA unavailable"
            if live
            else "until scheduled departure" if scheduled else "until planned departure"
        )
    )
    leave_at = departure - (journey["walkMinutes"] + 2) * 60000 if departure else None
    leave_label = (
        ("Leave by " + clock_time(leave_at))
        if leave_at
        else "Waiting for RTS arrival prediction"
    )
    warning = ""
    if live and leave_at and leave_at < time.time() * 1000:
        warning = '<p class="ln-kicker">Walking time + boarding buffer may exceed the available time.</p>'
    headsign = (
        bus.get("destination") or journey["headsign"] if live else journey["headsign"]
    )
    markup(
        f"""<div class="ln-ticket"><div class="ln-ticket-top"><span class="ln-route">RTS {escape(str(journey['route']))}</span><span class="ln-ticket-status">{label} · {transfer_label}</span></div><h2>{escape(headsign)}</h2><div class="ln-countdown">{countdown}<span>{countdown_caption}</span></div><div class="ln-leave"><b>↗ {escape(leave_label)}</b><span>{journey['walkMinutes']} min walk + 2 min boarding buffer</span></div>{warning}</div>"""
    )


def timeline(journey):
    if journey.get("legs"):
        steps = [("01", "Walk to your stop", journey["boarding"]["name"])]
        for i, leg in enumerate(journey["legs"]):
            steps.append(
                (
                    str(len(steps) + 1).zfill(2),
                    f"{clock_time(leg['departsAt'])} · Route {leg['route']}",
                    f"{leg['boarding']['name']} → {leg['alighting']['name']} · {leg.get('timingSource','scheduled').title()}",
                )
            )
            if i < len(journey["legs"]) - 1:
                connection = journey["connection"]
                steps.append(
                    (
                        str(len(steps) + 1).zfill(2),
                        f"Transfer · {journey['transferWaitMinutes']} min available",
                        f"Walk about {connection['walkMinutes']} min to {connection['to']['name']}; required connection time {math.ceil(connection['minimumSeconds']/60)} min",
                    )
                )
        steps.append(
            (
                str(len(steps) + 1).zfill(2),
                f"{journey['finalWalkMinutes']} min final walk",
                f"Destination around {clock_time(journey['destinationAt'])}",
            )
        )
    else:
        steps = [
            ("01", "Walk to your stop", journey["boarding"]["name"]),
            (
                "02",
                f"Board at {clock_time(journey['departsAt'])}",
                f"Route {journey['route']} · {journey['direction']}",
            ),
            (
                "03",
                f"Off at {clock_time(journey['arrivesAt'])}",
                journey["alighting"]["name"],
            ),
            ("04", f"{journey['finalWalkMinutes']} min final walk", "You’ve arrived."),
        ]
    markup(
        '<div class="ln-timeline">'
        + "".join(
            f'<div class="ln-step"><div class="ln-step-icon">{n}</div><b>{escape(title)}</b><p>{escape(detail)}</p></div>'
            for n, title, detail in steps
        )
        + "</div>"
    )


def empty_card(reason):
    markup(
        f'<div class="ln-empty"><div class="ln-empty-icon">◷</div><h3>No journey in these limits.</h3><p>{escape(reason)}</p><small>Try another time, a wider walking limit, or allow one transfer.</small></div>'
    )
