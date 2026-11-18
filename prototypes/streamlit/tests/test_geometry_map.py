import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from presentation import map_view


class GeometryMapTests(unittest.TestCase):
    def test_bus_bends_are_preserved_and_walks_are_separate(self):
        a = {"name": "Board", "lat": 29.64, "lon": -82.34}
        b = {"name": "Off", "lat": 29.65, "lon": -82.32}
        path = [[-82.34, 29.64], [-82.33, 29.64], [-82.33, 29.65], [-82.32, 29.65]]
        leg = {"boarding": a, "alighting": b, "route": "1", "geometry": {"path": path}}
        with patch("presentation.st.pydeck_chart") as chart, patch(
            "presentation.markup"
        ), patch("presentation.st.caption"):
            map_view(a, b, {"legs": [leg]})
        layers = chart.call_args.args[0].layers
        paths = [l for l in layers if l.type == "PathLayer"]
        self.assertEqual(len(paths), 2)
        self.assertEqual(paths[1].data[0]["path"], path)
        self.assertEqual(paths[0].data[0]["label"], "Walk · estimate")

    def test_routed_walking_geometry_replaces_the_straight_connection(self):
        a = {"name": "Start", "lat": 29.64, "lon": -82.34}
        b = {"name": "Board", "lat": 29.65, "lon": -82.32}
        path = [[-82.34, 29.64], [-82.34, 29.65], [-82.32, 29.65]]
        leg = {"boarding": b, "alighting": b, "route": "1"}
        with patch("presentation.st.pydeck_chart") as chart, patch(
            "presentation.markup"
        ), patch("presentation.st.caption"):
            map_view(
                a, b, {"legs": [leg], "boarding": {"walkPath": path}, "alighting": {}}
            )
        walks = next(
            layer
            for layer in chart.call_args.args[0].layers
            if layer.type == "PathLayer"
        )
        self.assertEqual(walks.data[0]["path"], path)
        self.assertEqual(walks.data[0]["label"], "Walk · OpenStreetMap")

    def test_missing_shape_does_not_draw_bus_chord(self):
        a = {"name": "Board", "lat": 29.64, "lon": -82.34}
        b = {"name": "Off", "lat": 29.65, "lon": -82.32}
        with patch("presentation.st.pydeck_chart") as chart, patch(
            "presentation.markup"
        ), patch("presentation.st.caption") as caption:
            map_view(a, b, {"legs": [{"boarding": a, "alighting": b, "route": "1"}]})
        self.assertEqual(
            len([l for l in chart.call_args.args[0].layers if l.type == "PathLayer"]), 1
        )
        self.assertTrue(
            any(
                "Published route geometry is unavailable" in call.args[0]
                for call in caption.call_args_list
            )
        )

    def test_endpoint_pins_remain_above_coincident_stops_and_bus_is_distinct(self):
        from urllib.parse import unquote

        a = {"name": "Board", "lat": 29.64, "lon": -82.34}
        b = {"name": "Off", "lat": 29.65, "lon": -82.32}
        bus = {
            "id": "2602",
            "route": "20",
            "position": {**a, "updatedAt": 1795028400000},
        }
        with patch("presentation.st.pydeck_chart") as chart, patch(
            "presentation.markup"
        ), patch("presentation.st.caption"):
            map_view(a, b, {"boarding": a, "alighting": b, "route": "20"}, bus=bus)
        layers = chart.call_args.args[0].layers
        self.assertEqual(layers[-1].type, "IconLayer")
        markers = layers[-1].data
        colors = {m["label"]: unquote(m["icon"]["url"]) for m in markers}
        self.assertIn("#22c55e", colors["Your start"])
        self.assertIn("#ef4444", colors["Your destination"])
        self.assertIn("#ef4444", colors["Off"])
        self.assertIn("#2563eb", colors["Bus 2602 · Route 20"])
        self.assertNotEqual(markers[0]["icon"]["height"], markers[-1]["icon"]["height"])

    def test_live_approach_line_matches_bus_and_preserves_marker_layer_order(self):
        a = {"name": "Board", "lat": 29.64, "lon": -82.34}
        b = {"name": "Off", "lat": 29.65, "lon": -82.32}
        path = [[-82.35, 29.63], [-82.35, 29.64], [-82.34, 29.64]]
        bus = {
            "id": "1",
            "route": "20",
            "position": {**a, "updatedAt": 1795028400000},
            "approachGeometry": {"path": path},
        }
        with patch("presentation.st.pydeck_chart") as chart, patch(
            "presentation.markup"
        ), patch("presentation.st.caption"):
            map_view(a, b, {"boarding": a, "alighting": b, "route": "20"}, bus=bus)
        layers = chart.call_args.args[0].layers
        approach = next(
            l
            for l in layers
            if l.type == "PathLayer"
            and l.data[0]["label"] == "Live bus → boarding stop"
        )
        self.assertEqual(approach.data[0]["path"], path)
        self.assertEqual(approach.get_color, [37, 99, 235, 255])
        self.assertEqual(layers[-1].type, "IconLayer")
