# Gainesville walking graph — OpenStreetMap data

`gainesville.json.gz` is a derived database licensed under the Open Database License 1.0 (ODbL), separately from the application source code.

© OpenStreetMap contributors. Copyright and attribution: https://www.openstreetmap.org/copyright
License: https://opendatacommons.org/licenses/odbl/1-0/

The database includes source timestamp, bounding box, source-extract SHA-256, import time and routing-policy metadata. It was compiled with `scripts/import-walking.py` from one public Overpass extract, not from Google Maps. The public endpoint is not queried during trip searches or Docker builds.

Rebuild source query (south,west,north,east):

```
[out:json][timeout:120];
way["highway"](29.58,-82.52,29.74,-82.24);
(._;>;);
out body;
```

Save the result locally and run `python3 scripts/import-walking.py --input extract.json`. Respect the Overpass operator's current usage policy when refreshing. The importer and this graph's modifications are available in this repository. The snapshot covers the Gainesville RTS stop area plus a margin; it is not a worldwide routing dataset.
