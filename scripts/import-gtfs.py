"""Compile the official RTS GTFS feed into a compact, credential-free routing artifact."""

import argparse
import csv
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import urlopen, Request
import zipfile

URL = "https://go-rts.com/wp-content/uploads/2026/08/RTSGTFS_Fall2026-1.zip"


def compile_feed(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if sum(i.file_size for i in archive.infolist()) > 100_000_000:
            raise ValueError("GTFS archive exceeds the uncompressed size limit")

        def iter_rows(name):
            if name not in archive.namelist():
                return
            with io.TextIOWrapper(archive.open(name), encoding="utf-8-sig") as stream:
                for row in csv.DictReader(stream):
                    yield {
                        key.strip(): value.strip() if isinstance(value, str) else value
                        for key, value in row.items()
                        if key is not None
                    }

        def rows(name):
            return list(iter_rows(name))

        agency = rows("agency.txt")
        if not agency or any(
            a.get("agency_timezone") != "America/New_York" for a in agency
        ):
            raise ValueError("Expected an America/New_York feed")
        for name in ["stops.txt", "routes.txt", "trips.txt", "stop_times.txt"]:
            if name not in archive.namelist():
                raise ValueError("Missing required GTFS table: " + name)
        stops = [
            {
                "id": s["stop_id"],
                "code": s.get("stop_code") or s["stop_id"],
                "name": s["stop_name"],
                "lat": float(s["stop_lat"]),
                "lon": float(s["stop_lon"]),
                "parent": s.get("parent_station", ""),
            }
            for s in rows("stops.txt")
            if s.get("stop_lat") and s.get("stop_lon")
        ]
        stop_index = {s["id"]: i for i, s in enumerate(stops)}
        routes = {
            r["route_id"]: {
                "short": r.get("route_short_name") or r["route_id"],
                "name": r.get("route_long_name", ""),
            }
            for r in rows("routes.txt")
            if r.get("route_type") == "3"
        }
        shapes = {}
        for row in iter_rows("shapes.txt"):
            lat, lon = float(row["shape_pt_lat"]), float(row["shape_pt_lon"])
            traveled = (
                float(row["shape_dist_traveled"])
                if row.get("shape_dist_traveled")
                else None
            )
            if (
                not all(math.isfinite(v) for v in [lat, lon])
                or abs(lat) > 90
                or abs(lon) > 180
                or (
                    traveled is not None
                    and (not math.isfinite(traveled) or traveled < 0)
                )
            ):
                raise ValueError("Invalid GTFS shape point")
            shapes.setdefault(row["shape_id"], []).append(
                [int(row["shape_pt_sequence"]), lon, lat, traveled]
            )
        for key, points in shapes.items():
            points.sort(key=lambda p: p[0])
            shapes[key] = [p[1:] for p in points]
            if any(
                a[2] is not None and b[2] is not None and b[2] < a[2]
                for a, b in zip(shapes[key], shapes[key][1:])
            ):
                raise ValueError("Nonmonotonic GTFS shape distance")
        trips = {
            t["trip_id"]: {
                "id": t["trip_id"],
                "route": t["route_id"],
                "service": t["service_id"],
                "headsign": t.get("trip_headsign", ""),
                "direction": t.get("direction_id", ""),
                "shape": t.get("shape_id", ""),
                "stops": [],
            }
            for t in rows("trips.txt")
            if t["route_id"] in routes
        }

        def seconds(value):
            parts = value.split(":")
            if len(parts) != 3:
                raise ValueError(
                    "A stop time is missing; interpolation is not implemented"
                )
            h, m, s = map(int, parts)
            if h < 0 or m not in range(60) or s not in range(60):
                raise ValueError("Invalid GTFS time")
            return h * 3600 + m * 60 + s

        for row in iter_rows("stop_times.txt"):
            trip = trips.get(row["trip_id"])
            if trip is not None and row["stop_id"] in stop_index:
                trip["stops"].append(
                    [
                        int(row["stop_sequence"]),
                        stop_index[row["stop_id"]],
                        seconds(row["arrival_time"]),
                        seconds(row["departure_time"]),
                        int(row.get("pickup_type") or 0),
                        int(row.get("drop_off_type") or 0),
                        (
                            float(row["shape_dist_traveled"])
                            if row.get("shape_dist_traveled")
                            else None
                        ),
                    ]
                )
        for t in trips.values():
            t["stops"].sort(key=lambda s: s[0])
            t["stops"] = [s[1:] for s in t["stops"]]
            distances = [s[5] for s in t["stops"] if s[5] is not None]
            if any(not math.isfinite(d) or d < 0 for d in distances) or any(
                b < a for a, b in zip(distances, distances[1:])
            ):
                raise ValueError("Invalid stop shape distance")
            if any(b[1] < a[2] for a, b in zip(t["stops"], t["stops"][1:])):
                raise ValueError("Trip stop times are not monotonic: " + t["id"])
        info = (rows("feed_info.txt") or [{}])[0]
        result = {
            "schema": 1,
            "timezone": "America/New_York",
            "source": URL,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "importedAt": datetime.now(timezone.utc).isoformat(),
            "info": info,
            "stops": stops,
            "routes": routes,
            "shapes": shapes,
            "trips": [t for t in trips.values() if len(t["stops"]) >= 2],
            "calendar": rows("calendar.txt"),
            "exceptions": rows("calendar_dates.txt"),
            "transfers": rows("transfers.txt"),
        }
        if not result["calendar"] and not result["exceptions"]:
            raise ValueError("No service calendar is available")
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--zip", type=Path, help="Use an already downloaded official feed"
    )
    parser.add_argument("--output", type=Path, default=Path("data/gtfs.json.gz"))
    args = parser.parse_args()
    if args.zip:
        raw = args.zip.read_bytes()
    else:
        with urlopen(
            Request(
                URL,
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
                    "Referer": "https://go-rts.com/rts-data/",
                    "Accept": "*/*",
                },
            ),
            timeout=60,
        ) as response:
            raw = response.read(20_000_001)
        if len(raw) > 20_000_000:
            raise ValueError("GTFS download exceeds 20 MB")
    data = compile_feed(raw)
    if not data["stops"] or not all(
        29.35 <= s["lat"] <= 30.1 and -82.9 <= s["lon"] <= -81.9 for s in data["stops"]
    ):
        raise ValueError("Only Gainesville RTS stops are accepted by this deployment")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    with gzip.open(temporary, "wt", encoding="utf-8") as output:
        json.dump(data, output, separators=(",", ":"))
    temporary.replace(args.output)
    print(
        f"Compiled {len(data['stops'])} stops and {len(data['trips'])} trips; feed {data['info'].get('feed_version', 'unknown')}."
    )
