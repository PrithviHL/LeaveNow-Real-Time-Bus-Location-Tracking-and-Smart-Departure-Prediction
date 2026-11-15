"""Escaped presentation components and an interactive map for the Streamlit UI."""

from html import escape
from pathlib import Path
import math
import time

import pydeck as pdk
import streamlit as st
from client import clock_time


def markup(content):
    st.markdown(content, unsafe_allow_html=True)


def theme():
    markup(Path(__file__).with_name("theme.css").read_text())


def map_view(origin=None, destination=None, journey=None, light=False):
    points = []
    for point, label, color in [
        (origin, "Your start", [197, 242, 103]),
        (destination, "Your destination", [255, 178, 118]),
    ]:
        if point:
            points.append(
                {
                    "position": [point["lon"], point["lat"]],
                    "label": label,
                    "detail": "Trip location",
                    "color": color,
                }
            )
    if journey:
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
    layers = [
        pdk.Layer(
            "ScatterplotLayer",
            points,
            get_position="position",
            get_fill_color="color",
            get_radius=32,
            radius_min_pixels=6,
            pickable=True,
            stroked=True,
            get_line_color=[255, 255, 255],
            line_width_min_pixels=2,
        )
    ]
    if journey and origin and destination:
        connections = [
            {
                "path": [
                    [origin["lon"], origin["lat"]],
                    [journey["boarding"]["lon"], journey["boarding"]["lat"]],
                    [journey["alighting"]["lon"], journey["alighting"]["lat"]],
                    [destination["lon"], destination["lat"]],
                ],
                "label": "Connection guide",
                "detail": "Not a street-following route",
            }
        ]
        layers.insert(
            0,
            pdk.Layer(
                "PathLayer",
                connections,
                get_path="path",
                get_color=[101, 178, 255, 160],
                width_min_pixels=3,
                pickable=True,
            ),
        )
    center = (
        [sum(p["position"][i] for p in points) / len(points) for i in [0, 1]]
        if points
        else [-77.6109, 43.157]
    )
    spread = max(
        (
            max(abs(p["position"][0] - center[0]), abs(p["position"][1] - center[1]))
            for p in points
        ),
        default=0,
    )
    zoom = max(3, min(14, math.log2(0.09 / max(spread, 0.003)) + 10)) if points else 12
    deck = pdk.Deck(
        layers=layers,
        initial_view_state=pdk.ViewState(
            longitude=center[0], latitude=center[1], zoom=zoom, pitch=25
        ),
        map_provider="carto",
        map_style="light" if light else "dark",
        tooltip={"text": "{label}\n{detail}"},
    )
    st.pydeck_chart(deck, height=420)
    markup(
        '<div class="ln-legend"><span><i class="you"></i>Your start</span><span><i class="dest"></i>Destination</span><span><i class="stop"></i>Bus stops</span></div>'
    )


def ticket(journey):
    minutes = max(0, math.ceil((journey["departsAt"] / 1000 - time.time()) / 60))
    markup(
        f"""<div class="ln-ticket"><div class="ln-ticket-top"><span class="ln-route">RTS {escape(str(journey["route"]))}</span><span class="ln-ticket-status">VERIFIED DIRECT TRIP</span></div><h2>{escape(journey["headsign"])}</h2><div class="ln-countdown">{minutes} min<span>until your bus</span></div><div class="ln-leave"><b>↗ Leave by {clock_time(journey["leaveAt"])}</b><span>{journey["walkMinutes"]} min walk + 2 min boarding buffer</span></div></div>"""
    )


def timeline(journey):
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
        f'<div class="ln-empty"><div class="ln-empty-icon">◷</div><h3>No direct bus right now.</h3><p>{escape(reason)}</p><small>This is a live-window result, not a full-day timetable.</small></div>'
    )
