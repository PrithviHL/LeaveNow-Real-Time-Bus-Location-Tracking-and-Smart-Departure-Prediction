# Timing verification — November 18, 2026

This audit checks implementation correctness and live-data consistency. It **does not establish real-world arrival-time accuracy or guarantee every trip**. RTS forecasts can change; GPS, pedestrian mapping, closures and individual walking speed add uncertainty.

## Reproducible checks

- `tests/timing-accuracy.test.js`: newest-generation prediction selection, contradictory/malformed/stale/future data, 128 route/trip/vehicle/stop/time-order combinations, 600 delayed-transfer scenarios, and a recurring-trip service-date boundary.
- Walking A* is compared against a separately implemented Dijkstra oracle for all 1,296 ordered node pairs on a seeded directed network with stairs and crossing costs. It found an endpoint-snapping bug at pedestrian one-way junctions; that bug is fixed. These are generated graph routes, not 1,296 timed walks.
- Python tests cover countdown provenance, final-walk arithmetic, missing downstream predictions, direct live destination display, transfer-stop display, and the minimum connection-buffer boundary.
- `scripts/verify-timing.js` tests 120 generated searches against the downloaded official Gainesville GTFS and bundled OSM graph. It validates 2,426 candidate journeys, 34 of which contain a transfer, and 4,886 routed walking-leg instances. These include repeated candidates/legs; they are not independent real-world observations. Search controls include Leave now, Depart at, Arrive by, 5–20 minute walks, and direct/one-transfer modes. Every checked result preserved departure/walk/boarding-buffer arithmetic, final-walk arrival arithmetic, stop order, walking bounds, transfer feasibility and arrival deadlines. Zero invariant failures were observed.

The committed [report](report.json) records the seed, clocks, source and artifact hashes, generated cases, local latency and process memory. Candidate enumeration is internal; the public API ranks up to three options afterward. Latency excludes HTTP, UI and live provider requests and is not comparable to the older pre-OSM benchmark.

```sh
# Use a supported Node version (22 or newer) and the project's Python environment.
node --test tests/*.test.js
python -m unittest discover -s prototypes/streamlit/tests

# Download/compile the same official feed; verify its source checksum in report.json.
python scripts/import-gtfs.py --output .cache/timing-verification/current-gtfs.json.gz
NODE_OPTIONS='--max-old-space-size=160 --max-semi-space-size=4' \
  node scripts/verify-timing.js \
  --feed .cache/timing-verification/current-gtfs.json.gz \
  --output .cache/timing-verification/report.json
```

The importer may obtain a newer feed; compare the source ZIP hash before interpreting changed results. The compiled gzip hash may also differ because of compilation metadata. The OSM snapshot is pinned in the repository.

## Corrections and provenance

1. Duplicate predictions now use the newest generation time, rather than the smallest ETA. Contradictory ETAs at the same generation time fail closed. The audit reproduced the older-optimistic-ETA bug before fixing it.
2. One-way endpoint snapping now permits legal alternatives at an exact junction while still prohibiting reverse travel along a one-way edge.
3. Stop IDs are checked before timing records are used. Wrong-stop records cannot supply boarding/destination times. Freshness, exact trip, vehicle agreement, service date and time-order protections remain enforced. Non-current service-date overlays stay scheduled conservatively.
4. The tracking API exposes `alightingAt` only from verified downstream evidence for the same bus and trip. The UI adds the final estimated walk for a final-leg destination estimate. A first transfer leg shows only its transfer-stop arrival and warns if the last-checked next departure no longer leaves the required connection time. Missing predictions never borrow timetable times and present them as live.

## Live coherence versus prediction error

The bounded hosted smoke check performs a real plan request, chooses an actually returned journey with a verified vehicle assignment, and tracks that exact leg. It compares boarding and get-off timestamps **only when their source-generation timestamps match** between the plan and tracking responses; intervening provider updates are not falsely counted as application errors. It logs source timestamps and timing provenance, without API keys or user location inputs. A passing observation demonstrates snapshot consistency, not that the bus subsequently arrived on time. Service availability can prevent a live sample; that is reported as unavailable, not passed.

To measure forecast error, collect prediction snapshots and independently observed arrival times over multiple routes, time periods, lead times and days. Compare `predicted arrival − observed arrival` and report sample count, MAE, signed bias and p90 absolute error separately by lead-time bucket. A nearest GPS point is not proof of a boarding/door-open event. Walking calibration similarly requires independently timed pedestrian routes and individual speed/accessibility context. Neither ground-truth dataset is available in this audit, so no MAE or “always accurate” claim is made.

## Remaining limits

Walking uses 65 m/min plus mapped stairs/crossing allowances and a two-minute boarding buffer. It is a model, not a timed personal walk. Missing coverage uses a labelled conservative fallback; graph disconnections are rejected. Search is bounded and can miss a delayed bus whose scheduled departure was already excluded before live overlays. Predictions are cached for 15 seconds even though the tracking panel refreshes every five seconds. Destination/connection estimates do not guarantee that a bus will hold a connection. Broader optimality, actual traffic delays and field accuracy are unmeasured.

## Clean-release automated result

The clean proposed release passed **73 Node tests and 49 Python tests (122 total)**, with zero failures. Node syntax checks and the source credential-pattern scan also passed. Instrumented line coverage for the timing-focused modules was: `predictions.js` 100%, `tracking.js` 94.02%, `walking.js` 97.86%, and `schedule.js` 92.70%. Coverage shows executed code, not measured forecast accuracy. The independently generated scenario counts above are nested cases within the tests, not additional top-level tests.

## Hosted observation

At 3:16 PM Eastern on November 18, the deployed commit `1e0bb6c` returned Bus 1806 on Route 20 for Palm Garden of Gainesville (822) → Oaks Mall (171), with fresh GPS and approach geometry. One same-generation boarding snapshot agreed between the plan and tracking responses. RTS supplied no verified downstream arrival in that sample; `alightingAt` remained null, while the plan retained its scheduled destination time under mixed provenance. This intentionally does not claim downstream live accuracy. The public health check returned `ok`; the new instance used about 230 MiB in a post-startup sample against its configured 512 MiB plan. See [the minimal recorded observation](live-check.json).
