import importlib.util
import io
from pathlib import Path
import unittest
import zipfile

root = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "import_gtfs", root / "scripts/import-gtfs.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def archive(stop_time="25:05:00"):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as z:
        for name, text in {
            "agency.txt": "agency_timezone\nAmerica/New_York\n",
            "stops.txt": 'stop_id,stop_name,stop_lat,stop_lon\na,"Origin, north",43.15,-77.6\nb,Destination,43.18,-77.6\n',
            "routes.txt": "route_id,route_short_name,route_type\nr,10,3\n",
            "trips.txt": "route_id,service_id,trip_id\nr,s,t\n",
            "stop_times.txt": f"trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt,{stop_time},{stop_time},a,1\nt,25:30:00,25:30:00,b,2\n",
            "calendar_dates.txt": "service_id,date,exception_type\ns,20261116,1\n",
        }.items():
            z.writestr(name, text)
    return output.getvalue()


class FeedImportTests(unittest.TestCase):
    def test_compiles_quoted_names_exception_only_calendar_and_overnight_times(self):
        result = module.compile_feed(archive())
        self.assertEqual(result["stops"][0]["name"], "Origin, north")
        self.assertEqual(result["trips"][0]["stops"][0][1], 25 * 3600 + 5 * 60)
        self.assertEqual(result["schema"], 1)
        self.assertEqual(result["exceptions"][0]["date"], "20261116")

    def test_rejects_missing_and_nonmonotonic_times(self):
        with self.assertRaises(ValueError):
            module.compile_feed(archive(""))
        with self.assertRaises(ValueError):
            module.compile_feed(archive("26:00:00"))
