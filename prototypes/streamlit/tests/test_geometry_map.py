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
        self.assertEqual(paths[0].data[0]["label"], "Walking connection")

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
        caption.assert_called_once()
