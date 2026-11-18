import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "walking_import", ROOT / "scripts/import-walking.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WalkingImportTests(unittest.TestCase):
    def test_private_motorway_and_barrier_links_are_not_routable(self):
        nodes = [
            {
                "type": "node",
                "id": i,
                "lat": 29.65,
                "lon": -82.34 + i * 0.001,
                "tags": ({"barrier": "wall"} if i == 5 else {}),
            }
            for i in range(1, 7)
        ]
        way = lambda i, tags, ids: {"type": "way", "id": i, "tags": tags, "nodes": ids}
        data = {
            "elements": nodes
            + [
                way(10, {"highway": "footway"}, [1, 2]),
                way(11, {"highway": "footway", "access": "private"}, [2, 3]),
                way(12, {"highway": "motorway"}, [3, 4]),
                way(13, {"highway": "footway"}, [4, 5, 6]),
            ]
        }
        graph = module.compile_graph(json.dumps(data).encode())
        self.assertEqual(len(graph["segments"]), 1)
        self.assertEqual(graph["license"], "ODbL-1.0")

    def test_specific_foot_access_stairs_and_foot_oneway_are_preserved(self):
        data = {
            "elements": [
                {"type": "node", "id": 1, "lat": 29.65, "lon": -82.34},
                {
                    "type": "node",
                    "id": 2,
                    "lat": 29.65,
                    "lon": -82.339,
                    "tags": {"highway": "crossing"},
                },
                {
                    "type": "way",
                    "id": 10,
                    "nodes": [1, 2],
                    "tags": {
                        "highway": "steps",
                        "access": "private",
                        "foot": "yes",
                        "oneway:foot": "yes",
                    },
                },
            ]
        }
        graph = module.compile_graph(json.dumps(data).encode())
        self.assertGreater(graph["segments"][0][3], 0)
        self.assertFalse(graph["segments"][0][4])
        self.assertEqual(graph["nodes"][1][2], 15)

    def test_partial_extracts_fail_instead_of_silently_building_incomplete_graphs(self):
        with self.assertRaises(ValueError):
            module.compile_graph(b'{"remark":"timeout","elements":[]}')
