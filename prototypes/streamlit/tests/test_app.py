import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

APP = Path(__file__).resolve().parents[1] / "app.py"
sys.path.insert(0, str(APP.parent))
from client import ApiError


def trip_fixture():
    now = int(time.time() * 1000)
    boarding = {
        "id": "1007",
        "name": "Reitz Union",
        "lat": 29.64514,
        "lon": -82.346983,
        "meters": 50,
        "walkMinutes": 1,
    }
    alighting = {
        "id": "2940",
        "name": "Rosa Parks RTS Downtown Station",
        "lat": 29.645567,
        "lon": -82.322697,
    }
    return {
        "checkedAt": now,
        "partial": False,
        "nearestStop": boarding,
        "journeys": [
            {
                "route": "10",
                "tripId": "selected-trip",
                "boarding": boarding,
                "alighting": alighting,
                "departsAt": now + 900000,
                "arrivesAt": now + 1500000,
                "leaveAt": now + 720000,
                "destinationAt": now + 1560000,
                "walkMinutes": 1,
                "finalWalkMinutes": 1,
                "headsign": "17 Downtown",
                "direction": "Outbound",
            }
        ],
    }


def picker_event(app, key, event):
    app.session_state["_test_" + key + "_picker"] = {
        **event,
        "nonce": str(time.time_ns()),
    }
    return app.run()


def ready_app():
    app = AppTest.from_file(str(APP), default_timeout=20).run()
    picker_event(app, "origin", {"type": "select", "id": "stop:1007"})
    picker_event(app, "destination", {"type": "select", "id": "stop:2940"})
    return app


class AppTests(unittest.TestCase):
    def setUp(self):
        CATALOG = [
            {"id": "1007", "name": "Reitz Union", "lat": 29.64514, "lon": -82.346983},
            {
                "id": "2940",
                "name": "Rosa Parks RTS Downtown Station",
                "lat": 29.645567,
                "lon": -82.322697,
            },
        ]
        stops = patch("client.stop_catalog", return_value=CATALOG)
        stops.start()
        self.addCleanup(stops.stop)
        identity = patch(
            "authentication.st.user", {"is_logged_in": True, "name": "Test Traveler"}
        )
        identity.start()
        self.addCleanup(identity.stop)

        def component(name, **definition):
            from types import SimpleNamespace
            import streamlit as st

            def render(**kwargs):
                key = kwargs["key"]
                if name == "leavenow_location_picker":
                    st.session_state["_test_render_" + key] = kwargs["data"]
                    return SimpleNamespace(event=st.session_state.get("_test_" + key))
                return SimpleNamespace(location=st.session_state.get("_test_gps"))

            return render

        components = patch("streamlit.components.v2.component", side_effect=component)
        components.start()
        self.addCleanup(components.stop)

    def test_stop_and_place_suggestions_share_one_autocomplete(self):
        with patch(
            "client.api_request",
            return_value={
                "results": [
                    {"name": "Reitz Cafe", "lat": 29.6479899, "lon": -82.3439469}
                ]
            },
        ):
            app = AppTest.from_file(str(APP), default_timeout=20).run()
            picker_event(app, "origin", {"type": "query", "value": "Reitz"})
            data = app.session_state["_test_render_origin_picker"]
            self.assertTrue(any(s["name"] == "Reitz Union" for s in data["stops"]))
            self.assertEqual(data["places"][0]["label"], "Reitz Cafe")
            picker_event(
                app, "origin", {"type": "select", "id": data["places"][0]["id"]}
            )
            self.assertFalse(app.exception)
            self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.6479899)

    def test_location_edits_clear_selection_and_old_gps_does_not_overwrite_them(self):
        app = ready_app()
        app.session_state["_test_gps"] = {
            "latitude": 29.65,
            "longitude": -82.34,
            "accuracy": 15,
            "requestId": 1,
        }
        app.run()
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.65)
        picker_event(app, "origin", {"type": "edit", "value": "new address"})
        self.assertIsNone(app.session_state["resolved_origin"])
        self.assertTrue(
            next(b for b in app.button if b.label == "Find my next bus").disabled
        )
        picker_event(app, "origin", {"type": "select", "id": "stop:1007"})
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.64514)

    def test_gps_success_and_denial_are_handled_separately(self):
        for location in [
            {"latitude": 29.65, "longitude": -82.34, "accuracy": 15, "requestId": 1},
            {"error": "denied"},
        ]:
            app = AppTest.from_file(str(APP), default_timeout=20)
            app.session_state["_test_gps"] = location
            app.run()
            self.assertFalse(app.exception)
            if "error" in location:
                self.assertIsNone(app.session_state["resolved_origin"])
                self.assertTrue(
                    any("permission was denied" in w.value for w in app.warning)
                )
            else:
                self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.65)

    def test_autocomplete_selection_resolves_both_locations(self):
        app = ready_app()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.64514)
        self.assertEqual(app.session_state["resolved_destination"]["lat"], 29.645567)
        self.assertFalse(
            next(b for b in app.button if b.label == "Find my next bus").disabled
        )
        picker_event(app, "origin", {"type": "query", "value": ""})
        self.assertTrue(
            next(b for b in app.button if b.label == "Find my next bus").disabled
        )

    def test_initial_screen_and_missing_locations(self):
        app = AppTest.from_file(str(APP), default_timeout=20).run()
        self.assertFalse(app.exception)
        self.assertTrue(
            next(b for b in app.button if b.label == "Find my next bus").disabled
        )

    def test_unconfigured_public_service_disables_live_calls(self):
        with patch.dict("os.environ", {"LEAVENOW_API_CONFIGURED": "0"}), patch(
            "client.api_request"
        ) as request:
            app = AppTest.from_file(str(APP), default_timeout=20).run()
            self.assertFalse(app.exception)
            self.assertTrue(
                next(b for b in app.button if b.label == "Find my next bus").disabled
            )
            self.assertTrue(
                any("temporarily unavailable" in w.value for w in app.warning)
            )
            request.assert_not_called()

    def test_presets_and_swap_update_locations(self):
        app = AppTest.from_file(str(APP), default_timeout=20).run()
        next(b for b in app.button if b.label == "↗ Reitz → Downtown").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["origin_value"], "Reitz Union")
        self.assertEqual(
            app.session_state["destination_value"], "Rosa Parks RTS Downtown Station"
        )
        app.run()
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.64514)
        self.assertEqual(app.session_state["resolved_destination"]["lat"], 29.645567)
        next(b for b in app.button if b.label == "⇄ Swap locations").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(
            app.session_state["origin_value"], "Rosa Parks RTS Downtown Station"
        )
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.645567)
        next(b for b in app.button if b.label == "↙ Downtown → Reitz").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(
            app.session_state["origin_value"], "Rosa Parks RTS Downtown Station"
        )

    def test_select_live_bus_shows_boarding_eta_without_replanning(self):
        now = int(time.time() * 1000)

        def reply(endpoint, payload=None):
            if endpoint.startswith("/api/tracking"):
                return {
                    "buses": [
                        {
                            "id": "901",
                            "tripId": "selected-trip",
                            "route": "10",
                            "destination": "Downtown",
                            "arrivalAt": now + 300000,
                            "position": {"lat": 29.64, "lon": -82.34, "updatedAt": now},
                        }
                    ]
                }
            return trip_fixture()

        with patch("client.api_request", side_effect=reply) as request:
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(
                any(
                    s.label == "Choose a bus toward your destination"
                    for s in app.selectbox
                )
            )
            self.assertTrue(
                any("trip=selected-trip" in c.args[0] for c in request.call_args_list)
            )
            self.assertFalse(app.exception)
            self.assertTrue(
                any(
                    "until selected bus reaches this stop" in m.value
                    for m in app.markdown
                )
            )
            self.assertEqual(
                sum(c.args[0] == "/api/plan" for c in request.call_args_list), 1
            )

    def test_gps_only_bus_can_be_selected_without_inventing_eta(self):
        now = int(time.time() * 1000)

        def reply(endpoint, payload=None):
            if endpoint.startswith("/api/tracking"):
                return {
                    "buses": [
                        {
                            "id": "902",
                            "tripId": "selected-trip",
                            "route": "10",
                            "destination": "Downtown",
                            "arrivalAt": None,
                            "position": {"lat": 29.64, "lon": -82.34, "updatedAt": now},
                        }
                    ]
                }
            return trip_fixture()

        with patch("client.api_request", side_effect=reply):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()

            self.assertFalse(app.exception)
            self.assertTrue(
                any("Live GPS · no boarding ETA" in m.value for m in app.markdown)
            )
            self.assertFalse(
                any(m.label == "Bus reaches your boarding stop" for m in app.metric)
            )

    def test_successful_trip_renders_ticket_and_separates_planned_arrival(self):
        with patch("client.api_request", return_value=trip_fixture()):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertTrue(any("Planned departure" in c.value for c in app.caption))
            self.assertTrue(any("selected journey leg" in c.value for c in app.caption))
            self.assertTrue(any("17 Downtown" in s.value for s in app.markdown))

    def test_travel_modes_and_transfer_controls_are_forwarded(self):
        with patch("client.api_request", return_value=trip_fixture()) as request:
            app = ready_app()
            next(s for s in app.selectbox if s.label == "Travel time").set_value(
                "Arrive by"
            ).run()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            payload = next(
                c.args[1]
                for c in reversed(request.call_args_list)
                if c.args[0] == "/api/plan"
            )
            self.assertEqual(payload["mode"], "arrive_by")
            self.assertEqual(payload["maxTransfers"], 1)
            self.assertEqual(payload["transferBuffer"], 5)
            self.assertIsInstance(payload["when"], int)

    def test_transfer_timeline_and_scheduled_labels(self):
        plan = trip_fixture()
        j = plan["journeys"][0]
        transfer = {"id": "hub", "name": "Transit Center", "lat": 29.64, "lon": -82.34}
        j.update(
            route="23 → 10",
            headsign="Route 23 → Route 10",
            transfers=1,
            timingSource="scheduled",
            timingLabel="Scheduled",
            transferWaitMinutes=8,
            connection={
                "from": transfer,
                "to": transfer,
                "walkMinutes": 0,
                "minimumSeconds": 300,
            },
        )
        j["legs"] = [
            {
                "route": "23",
                "tripId": "leg-one",
                "boarding": j["boarding"],
                "alighting": transfer,
                "departsAt": j["departsAt"],
                "arrivesAt": j["departsAt"] + 600000,
                "timingSource": "scheduled",
                "direction": "0",
            },
            {
                "route": "10",
                "tripId": "leg-two",
                "boarding": transfer,
                "alighting": j["alighting"],
                "departsAt": j["departsAt"] + 1080000,
                "arrivesAt": j["departsAt"] + 1500000,
                "timingSource": "scheduled",
                "direction": "1",
            },
        ]

        def reply(endpoint, payload=None):
            return {"buses": []} if endpoint.startswith("/api/tracking") else plan

        with patch("client.api_request", side_effect=reply) as request:
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertTrue(any("Scheduled" in c.value for c in app.caption))
            self.assertTrue(
                any("Transfer · 8 min available" in m.value for m in app.markdown)
            )

            next(s for s in app.selectbox if s.label == "Bus leg to track").set_value(
                1
            ).run()
            self.assertFalse(app.exception)
            queries = [
                c.args[0]
                for c in request.call_args_list
                if c.args[0].startswith("/api/tracking")
            ]
            self.assertIn("trip=leg-one", queries[0])
            self.assertIn("trip=leg-two", queries[-1])
            self.assertIn("stop=hub", queries[-1])

    def test_empty_and_api_failure_states(self):
        empty = {
            "checkedAt": int(time.time() * 1000),
            "partial": False,
            "nearestStop": None,
            "journeys": [],
            "departures": [],
            "reason": "No direct bus available",
        }
        with patch("client.api_request", return_value=empty):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertIn("No direct bus", app.info[0].value)
        with patch("client.api_request", side_effect=ApiError("API unavailable")):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(app.error[0].value, "API unavailable")

    def test_unrelated_bus_is_not_used_for_selected_journey(self):
        def reply(endpoint, payload=None):
            if endpoint.startswith("/api/tracking"):
                return {
                    "buses": [
                        {
                            "id": "wrong",
                            "tripId": "different-trip",
                            "route": "10",
                            "arrivalAt": int(time.time() * 1000) + 120000,
                        }
                    ]
                }
            return trip_fixture()

        with patch("client.api_request", side_effect=reply):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertTrue(
                any(
                    "Live tracking unavailable for this trip" in i.value
                    for i in app.info
                )
            )
            self.assertFalse(
                any("assigned to this journey" in c.value for c in app.caption)
            )

    def test_exact_trip_live_destination_includes_final_walk(self):
        now = int(time.time() * 1000)

        def reply(endpoint, payload=None):
            if endpoint.startswith("/api/tracking"):
                return {
                    "buses": [
                        {
                            "id": "v",
                            "tripId": "selected-trip",
                            "route": "10",
                            "arrivalAt": now + 300000,
                            "alightingAt": now + 600000,
                            "destination": "Downtown",
                        }
                    ]
                }
            return trip_fixture()

        with patch("client.api_request", side_effect=reply):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            metric = next(
                m
                for m in app.metric
                if m.label == "Destination · Live bus + estimated walk"
            )
            from client import clock_time

            self.assertEqual(metric.value, clock_time(now + 660000))
