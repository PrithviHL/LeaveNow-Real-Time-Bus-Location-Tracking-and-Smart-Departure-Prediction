"""Compile a deliberately downloaded OSM/Overpass extract for local walking routes."""

import argparse
import gzip
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

BBOX = [29.58, -82.52, 29.74, -82.24]  # south, west, north, east
ALLOWED = {
    "footway",
    "pedestrian",
    "path",
    "steps",
    "living_street",
    "residential",
    "service",
    "unclassified",
    "tertiary",
    "tertiary_link",
    "secondary",
    "secondary_link",
    "primary",
    "primary_link",
    "track",
    "cycleway",
    "road",
}
DENIED = {"no", "private", "customers", "delivery", "destination"}
PUBLIC_FOOT = {"yes", "designated", "permissive"}


def accessible(tags):
    foot = tags.get("foot", "")
    if foot in DENIED or foot == "use_sidepath" or tags.get("locked") == "yes":
        return False
    if "foot:conditional" in tags or "access:conditional" in tags:
        return False  # Don't guess time-dependent access.
    return tags.get("access") not in DENIED or foot in PUBLIC_FOOT


def meters(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, [a[1], a[0], b[1], b[0]])
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0, 1 - h)))


def compile_graph(raw):
    data = json.loads(raw)
    if data.get("remark"):
        raise ValueError("Overpass returned an incomplete extract")
    nodes = {e["id"]: e for e in data["elements"] if e["type"] == "node"}
    blocked = {
        i
        for i, n in nodes.items()
        if not accessible(n.get("tags", {}))
        or n.get("tags", {}).get("barrier")
        in {"wall", "fence", "hedge", "block", "retaining_wall"}
    }
    coords, segments, index = [], [], {}

    def vertex(i):
        if i not in index:
            n = nodes[i]
            lon, lat = float(n["lon"]), float(n["lat"])
            if (
                not math.isfinite(lon)
                or not math.isfinite(lat)
                or not -180 <= lon <= 180
                or not -90 <= lat <= 90
            ):
                raise ValueError("Invalid OSM coordinate")
            index[i] = len(coords)
            tags = n.get("tags", {})
            coords.append([lon, lat, 15 if tags.get("highway") == "crossing" else 0])
        return index[i]

    ways = 0
    for way in data["elements"]:
        if way["type"] != "way":
            continue
        tags = way.get("tags", {})
        if (
            tags.get("highway") not in ALLOWED
            or not accessible(tags)
            or tags.get("area") == "yes"
        ):
            continue
        if tags.get("highway") == "cycleway" and tags.get("foot") not in PUBLIC_FOOT:
            continue
        if tags.get("sidewalk") == "separate" and tags.get("foot") not in PUBLIC_FOOT:
            continue
        ways += 1
        for a, b in zip(way["nodes"], way["nodes"][1:]):
            if a in blocked or b in blocked or a not in nodes or b not in nodes:
                continue
            u, v = vertex(a), vertex(b)
            length = meters(coords[u], coords[v])
            if length < 0.05:
                continue
            foot_direction = tags.get("oneway:foot", "no")
            if foot_direction == "-1":
                u, v = v, u
            extra = (
                length * (60 / 45 - 60 / 65) if tags.get("highway") == "steps" else 0
            )
            segments.append(
                [
                    u,
                    v,
                    round(length, 2),
                    round(extra, 2),
                    foot_direction not in {"yes", "1", "true", "-1"},
                ]
            )
    if not segments:
        raise ValueError("No usable walking edges")
    return {
        "schema": 1,
        "source": "https://overpass-api.de/api/interpreter",
        "license": "ODbL-1.0",
        "attribution": "© OpenStreetMap contributors",
        "bbox": BBOX,
        "osmTimestamp": data.get("osm3s", {}).get("timestamp_osm_base"),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "compiledAt": datetime.now(timezone.utc).isoformat(),
        "speedMetersPerMinute": 65,
        "crossingAllowanceSeconds": 15,
        "ways": ways,
        "nodes": coords,
        "segments": segments,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/server/walking-data/gainesville.json.gz"),
    )
    args = parser.parse_args()
    graph = compile_graph(args.input.read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(args.output, "wt", encoding="utf8") as output:
        json.dump(graph, output, separators=(",", ":"))
    print(
        f"Compiled {len(graph['nodes'])} nodes and {len(graph['segments'])} walking segments; {args.output.stat().st_size} bytes compressed"
    )
