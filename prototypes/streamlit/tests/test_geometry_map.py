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
