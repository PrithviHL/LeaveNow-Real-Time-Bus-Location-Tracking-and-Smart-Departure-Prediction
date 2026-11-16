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


def ready_app():
    app = AppTest.from_file(str(APP), default_timeout=20).run()
    next(s for s in app.selectbox if s.key == "origin_method").set_value("Coordinates")
    next(s for s in app.selectbox if s.key == "destination_method").set_value(
        "Coordinates"
    )
    return app.run()


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

    def test_address_search_requires_explicit_search_and_selection(self):
        def reply(endpoint, payload=None):
            self.assertTrue(endpoint.startswith("/api/addresses?"))
            return {
                "results": [
                    {
                        "name": "Marston Science Library",
                        "lat": 29.6479899,
                        "lon": -82.3439469,
                    }
                ]
            }

        with patch("client.api_request", side_effect=reply) as request:
            app = ready_app()
            next(s for s in app.selectbox if s.key == "origin_method").set_value(
                "Address or place"
            ).run()
            next(
                t for t in app.text_input if t.key == "origin_address_query"
            ).set_value("Marston Science Library")
            request.assert_not_called()
            next(b for b in app.button if b.label == "Search places").click().run()
            self.assertFalse(app.exception)
            next(
                s for s in app.selectbox if s.key == "origin_address_choice"
            ).set_value(0).run()
            self.assertFalse(app.exception)
            self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.6479899)

    def test_gps_success_and_denial_are_handled_separately(self):
        from types import SimpleNamespace

        for location in [
            {"latitude": 29.65, "longitude": -82.34, "accuracy": 15},
            {"error": "denied"},
        ]:
            with patch(
                "streamlit.components.v2.component",
                return_value=lambda **kwargs: SimpleNamespace(location=location),
            ):
                app = ready_app()
                next(s for s in app.selectbox if s.key == "origin_method").set_value(
                    "Use my location"
                ).run()
                self.assertFalse(app.exception)
                if "error" in location:
                    self.assertIsNone(app.session_state["resolved_origin"])
                    self.assertTrue(
                        any("permission was denied" in w.value for w in app.warning)
                    )
                else:
                    self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.65)

    def test_autocomplete_selection_resolves_both_locations(self):
        app = AppTest.from_file(str(APP), default_timeout=20).run()
        origin = next(s for s in app.selectbox if s.key == "origin_stop")
        self.assertIsNone(origin.value)
        self.assertTrue(any("Reitz Union" in label for label in origin.options))
        origin.set_value("1007")
        next(s for s in app.selectbox if s.key == "destination_stop").set_value("2940")
        app.run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.64514)
        self.assertEqual(app.session_state["resolved_destination"]["lat"], 29.645567)
        self.assertFalse(
            next(b for b in app.button if b.label == "Find my next bus").disabled
        )
        next(s for s in app.selectbox if s.key == "origin_stop").set_value(None).run()
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
            app = ready_app()
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
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.64514)
        self.assertEqual(app.session_state["resolved_destination"]["lat"], 29.645567)
        next(b for b in app.button if b.label == "⇄ Swap locations").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.645567)
        self.assertEqual(app.session_state["resolved_destination"]["lat"], 29.64514)
        next(b for b in app.button if b.label == "↙ Downtown → Reitz").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 29.645567)

    def test_select_live_bus_shows_boarding_eta_without_replanning(self):
        now = int(time.time() * 1000)

        def reply(endpoint, payload=None):
            if endpoint.startswith("/api/tracking"):
                return {
                    "buses": [
                        {
                            "id": "901",
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
            selector = next(
                s for s in app.selectbox if s.label == "Choose a live bus on this route"
            )
            selector.set_value("901").run()
            self.assertFalse(app.exception)
            self.assertTrue(
                any(m.label == "Bus reaches your boarding stop" for m in app.metric)
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
            next(
                s for s in app.selectbox if s.label == "Choose a live bus on this route"
            ).set_value("902").run()
            self.assertFalse(app.exception)
            self.assertTrue(any("Live GPS is available" in i.value for i in app.info))
            self.assertFalse(
                any(m.label == "Bus reaches your boarding stop" for m in app.metric)
            )

    def test_successful_trip_renders_metrics(self):
        with patch("client.api_request", return_value=trip_fixture()):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(app.metric), 2)
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
                "boarding": j["boarding"],
                "alighting": transfer,
                "departsAt": j["departsAt"],
                "arrivesAt": j["departsAt"] + 600000,
                "timingSource": "scheduled",
                "direction": "0",
            },
            {
                "route": "10",
                "boarding": transfer,
                "alighting": j["alighting"],
                "departsAt": j["departsAt"] + 1080000,
                "arrivesAt": j["departsAt"] + 1500000,
                "timingSource": "scheduled",
                "direction": "1",
            },
        ]
        with patch("client.api_request", return_value=plan):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertTrue(any("Scheduled" in c.value for c in app.caption))
            self.assertTrue(
                any("Transfer · 8 min available" in m.value for m in app.markdown)
            )

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
