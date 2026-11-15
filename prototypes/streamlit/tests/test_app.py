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
        "name": "East & Alexander",
        "lat": 43.155,
        "lon": -77.594,
        "meters": 50,
        "walkMinutes": 1,
    }
    alighting = {"id": "2940", "name": "Park & Berkeley", "lat": 43.148, "lon": -77.578}
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
                "headsign": "10 Park",
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
        next(b for b in app.button if b.label == "↗ East → Park").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 43.155028)
        self.assertEqual(app.session_state["resolved_destination"]["lat"], 43.148116)
        next(b for b in app.button if b.label == "⇄ Swap locations").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 43.148116)
        self.assertEqual(app.session_state["resolved_destination"]["lat"], 43.155028)
        next(b for b in app.button if b.label == "↙ Park → East").click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state["resolved_origin"]["lat"], 43.148116)

    def test_successful_trip_renders_metrics(self):
        with patch("client.api_request", return_value=trip_fixture()):
            app = ready_app()
            next(b for b in app.button if b.label == "Find my next bus").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(len(app.metric), 4)
            self.assertTrue(any(s.value == "10 Park" for s in app.subheader))

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
