import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from presentation import ticket


class TicketTests(unittest.TestCase):
    def setUp(self):
        self.now = 1795029600
        self.journey = {
            "route": "13",
            "headsign": "To US 441",
            "timingLabel": "Scheduled",
            "departsAt": (self.now + 14 * 60) * 1000,
            "walkMinutes": 0,
        }

    def render(self, bus=None):
        with patch("presentation.time.time", return_value=self.now), patch(
            "presentation.markup"
        ) as out:
            ticket(self.journey, bus=bus)
        return out.call_args.args[0]

    def test_scheduled_countdown_is_explicit(self):
        self.assertIn("until scheduled departure", self.render())

    def test_selected_live_bus_replaces_schedule_countdown(self):
        html = self.render(
            {"arrivalAt": (self.now + 2 * 60) * 1000, "destination": "To US 441"}
        )
        self.assertIn("Live boarding ETA", html)
        self.assertIn(">2 min<", html)
        self.assertNotIn(">14 min<", html)
        self.assertIn("until selected bus reaches this stop", html)

    def test_gps_only_never_borrows_scheduled_countdown(self):
        html = self.render({"arrivalAt": None})
        self.assertIn("GPS only", html)
        self.assertNotIn(">14 min<", html)
        self.assertIn("boarding ETA unavailable", html)

    def test_unreachable_live_bus_warns_about_walking_buffer(self):
        self.journey["walkMinutes"] = 5
        self.assertIn(
            "may exceed the available time",
            self.render({"arrivalAt": (self.now + 60) * 1000}),
        )
