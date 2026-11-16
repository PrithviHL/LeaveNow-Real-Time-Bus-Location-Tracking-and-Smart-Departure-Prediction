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
    app.radio[0].set_value("Coordinates")
    app.radio[1].set_value("Coordinates")
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

    def test_successful_trip_renders_metrics(self):
        with patch("client.api_request", return_value=trip_fixture()):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(app.metric), 4)
            self.assertTrue(any(s.value == "17 Downtown" for s in app.subheader))

    def test_travel_modes_and_transfer_controls_are_forwarded(self):
        with patch("client.api_request", return_value=trip_fixture()) as request:
            app = ready_app()
            next(s for s in app.selectbox if s.label == "Travel time").set_value(
                "Arrive by"
            ).run()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            payload = request.call_args.args[1]
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
            self.assertIn("No direct bus", app.warning[0].value)
        with patch("client.api_request", side_effect=ApiError("API unavailable")):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(app.error[0].value, "API unavailable")
