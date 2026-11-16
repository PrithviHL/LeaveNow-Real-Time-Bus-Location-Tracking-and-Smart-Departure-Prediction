import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from client import (
    ApiError,
    api_request,
    clock_time,
    coordinate,
    search_stops,
    travel_timestamp,
)


class ClientTests(unittest.TestCase):
    def test_coordinate_validation(self):
        self.assertEqual(coordinate("43", "-77"), {"lat": 43, "lon": -77})
        for a, b in [(91, 0), (0, 181), (float("nan"), 0)]:
            with self.assertRaises(ValueError):
                coordinate(a, b)

    def test_timezone_conversion(self):
        self.assertEqual(clock_time(1794697200000), "6:00 PM")

    def test_gainesville_travel_controls_handle_timezone_and_invalid_dst_time(self):
        from datetime import date, time

        self.assertEqual(
            travel_timestamp(date(2026, 11, 16), time(8, 0)), 1794834000000
        )
        with self.assertRaises(ValueError):
            travel_timestamp(date(2026, 3, 8), time(2, 30))

    def test_payload_and_response(self):
        reply = io.BytesIO(b'{"ok":true}')
        with patch("client.urlopen", return_value=reply) as upstream:
            self.assertEqual(api_request("/api/plan", {"maxWalk": 15}), {"ok": True})
        request = upstream.call_args.args[0]
        self.assertEqual(json.loads(request.data), {"maxWalk": 15})
        self.assertNotIn("RTS_API_KEY", str(request.headers))

    def test_unreachable_api_has_safe_message(self):
        with patch(
            "client.urlopen", side_effect=URLError("private internal information")
        ):
            with self.assertRaisesRegex(ApiError, "could not be reached"):
                api_request("/api/health")

    def test_slow_search_has_actionable_timeout_message(self):
        with patch("client.urlopen", side_effect=TimeoutError()):
            with self.assertRaisesRegex(ApiError, "took too long"):
                api_request("/api/plan", {})

    def test_api_error_display(self):
        error = HTTPError(
            "http://api",
            400,
            "bad",
            {},
            io.BytesIO(b'{"error":"Choose valid coordinates"}'),
        )
        with patch("client.urlopen", side_effect=error):
            with self.assertRaisesRegex(ApiError, "Choose valid coordinates"):
                api_request("/api/plan", {})
        with self.assertRaises(ApiError):
            search_stops("x")
