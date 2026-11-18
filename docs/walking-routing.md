# Local OpenStreetMap walking routes

LeaveNow bundles a Gainesville walking graph compiled from one public OpenStreetMap/Overpass extract. No routing API, account, key, paid add-on, or extra service is used during trip searches. The pinned graph is distributed under ODbL; see `src/server/walking-data/LICENSE-OSM.md`.

## Planning

- Snap endpoints to a mapped segment within 60 m; short access links remain estimated.
- Use local A* over permitted pedestrian links. Explicitly private/prohibited links, locked/blocking barriers, motorways, and uncertain conditional access are excluded by the importer. Pedestrian one-way restrictions are retained; ordinary car one-way restrictions are not applied to walking.
- Use 65 m/min, extra time for mapped stairs, and a 15-second allowance at mapped crossings. These are model assumptions, not live traffic signals or individualized walking speed.
- Route access, egress, and transfer walks before checking departure/arrival/connection feasibility. Keep a two-minute initial boarding buffer while approaching a stop; use zero when origin and boarding stop coincide (within 1 m) with a zero-minute calculated walk. Transfer buffers are unchanged. Known disconnected paths are excluded rather than bridged with a straight-line shortcut.
- If an endpoint has no nearby mapped segment or is outside graph coverage, use an explicitly labelled conservative fallback: straight-line distance × 1.5 at 65 m/min. This does not verify that a physical path exists. Legacy schedule fixtures without a graph retain their old estimator for compatibility.

Green map lines show routed paths when available; fallback links are labelled estimates. GPS error, missing OSM connections, temporary closures, accessibility needs, crossing delays, and off-network building entrances can affect the estimate. This is not turn-by-turn accessibility guidance or a guarantee that a bus will wait.

## Coverage and refresh

The snapshot covers 29.58–29.74 N, 82.52–82.24 W, including the current Gainesville RTS stop area plus a margin. It has 171,202 vertices and 190,432 segments and compresses to about 2.6 MB. Source timestamp, source-extract hash, and compilation provenance are embedded in the file. It is not a daily automatic feed.

To refresh deliberately, use the source query in the data license notice, save a complete response locally, and run:

```sh
python3 scripts/import-walking.py --input path/to/extract.json
```

Review access-policy/data changes and rerun walking tests before rebuilding. The public Overpass endpoint is not used as a live backend or queried during Docker builds.

## Resource limits and verification

Routing uses compact adjacency arrays, reusable query buffers, bounded segment snapping, a 40-minute route-search bound, and bounded route/snap caches. Docker Node processes use a 160 MB old-space / 4 MB semi-space heap configuration to leave room for Streamlit. Five local real-feed searches with the tighter 128 MB old-space test setting stayed around 238 MB Node RSS after warmup; hosted memory was checked separately after deployment.

Tests cover real network detours, sub-edge snapping, foot one-ways, disconnected graphs, crossing/stair time, import access restrictions, map geometry, and rejecting a departure the old straight-line estimate would incorrectly consider catchable. A real-data check for Marston Science Library → Reitz Union routed approximately 510 m in 486 seconds (rounded up to 9 minutes), before the boarding buffer. Results vary with the chosen endpoints and data snapshot.

## Deployment verification — November 18, 2026 (Eastern)

Commit `918c803` was pushed to `feature/streamlit-containers` and deployed to [the live app](https://leavenow-prithvihl.onrender.com). The hosted startup probe returned three timetable journeys, all with OSM access walks, and the public Streamlit health endpoint returned `ok`. Render reported 215,678,980 bytes (about 206 MiB) for the new instance against its 512 MiB limit after the probe. This is one post-startup measurement, not a peak-load capacity guarantee. No paid service or routing key was added.

The clean committed-source check passed 58 Node tests and 36 Python tests (94 total). Both GitHub workflows passed: [continuous integration](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/actions/runs/44242682755) and [Streamlit containers](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/actions/runs/44242682998). Browser/device GPS and visual checks were not manually verified during this rollout.

The earlier [60-search benchmark](../benchmarks/routing/README.md) predates OSM walking and must not be presented as current walking-enabled latency or journey availability.
