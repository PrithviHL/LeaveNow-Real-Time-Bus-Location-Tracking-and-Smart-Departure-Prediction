# LeaveNow evaluation — November 16, 2026

Evaluated repository commit `9891f7f`, branch `feature/streamlit-containers`. The measurements were collected before this documentation change.

## Recommended resume bullets

- Built a real-time transit planner for Gainesville RTS using Node.js and Streamlit, integrating GTFS data across 27 routes, 972 stops, and 3,321 scheduled trips.
- Expanded journey availability 3.1× over direct-only routing (16 to 49 of 60 sampled searches) by implementing one-transfer planning with walking limits and connection buffers.
- Benchmarked the local routing engine at 7.4 ms median and 31.3 ms p95 across 60 sampled searches spanning leave-now, depart-at, and arrive-by modes.

Optional correctness bullet if more relevant to the role:

- Implemented trip-identity and stop-sequence validation for live bus tracking; achieved 100% line coverage for tracking and recommendation modules in the measured Node test run.

For a short two-bullet project entry, combine the first and third bullets, then use the second.

## Measurements

| Metric | Result | Meaning |
|---|---:|---|
| Stops | 972 | Records in the evaluated GTFS artifact |
| Routes | 27 | Route records; not necessarily all active simultaneously |
| Scheduled trips | 3,321 | GTFS trip definitions, not daily completed trips or tracked buses |
| Stop-time records | 89,517 | Scheduled arrival/departure entries |
| Shapes | 56 | Published route geometries |
| Direct-only searches with a result | 16/60 | Identical sampled locations, times, and walking limits |
| Direct or one-transfer searches with a result | 49/60 | 33 additional searches returned journeys |
| Availability ratio | 3.06× | 49 / 16; sample-specific, not a citywide coverage estimate |
| Local routing median / p95 | 7.44 / 31.31 ms | Second pass, 60 sequential searches |
| Local routing maximum | 41.02 ms | Second pass |
| Python tests | 31/31 passed | unittest discovery |
| Node tests | 47/47 passed on permission-enabled recheck | Initial restricted run: 44 passed, 3 socket listen EPERM failures |
| Schedule module line coverage | 92.88% | Current restricted Node run |
| Tracking / recommendation line coverage | 100% / 100% | Branch coverage 93.48% / 80%; line coverage is not proof of correctness |

## Method

Requires Node 24 and Python 3.12. From the repository root:

```sh
# Import the official feed, or pass --zip /path/to/the/archived/feed.zip.
python3 scripts/import-gtfs.py --output data/gtfs.json.gz
node benchmarks/routing/evaluate.mjs "$PWD" "$PWD/data/gtfs.json.gz" /tmp/leavenow-routing-results.json
node --test --experimental-test-coverage tests/*.test.js
python3 -m unittest discover -s prototypes/streamlit/tests -v
```

The benchmark itself needs no secrets, network requests, or running server. Feed import requires network access unless using a downloaded ZIP. The original run used `.cache/gainesville/with-shapes.json.gz`; the script now accepts explicit feed/output paths to preserve the committed reference results. Compare the feed SHA-256 in the output before comparing results: future upstream feed changes can alter the dataset and availability. Timing naturally varies between runs. See [raw results](evaluation-results.json), [benchmark source](evaluate.mjs), [Node log](node-coverage.log), and [Python log](python-tests.log).

Environment: Apple M4 Pro, macOS arm64, Node v24.22.1. Feed source SHA-256: b273632dde42ba6dee2b3a9cb9d0b802f60d18917d90016f3ff5faa9ce64420f. Service range: August 17, 2026–May 2, 2027.

Deterministic seed 20261116 selects 60 ordered pairs uniformly from the artifact's stop array, with replacement. Twenty cases per mode. Leave-now cases use November 16 at 08:00 Eastern, depart-at cases 12:00, and arrive-by cases 17:00. Arrive-by assumes a current time four hours before the deadline. Walking limit is 15 minutes, transfer buffer defaults to five minutes. One direct-only pass is followed by two passes allowing one transfer on the same Schedule instance. The reported second pass benefits from initialized day/footpath caches and runtime warmup; the first transfer pass is also recorded. Percentiles use the nearest-rank method. These are 60 distinct generated cases repeated twice, not 120 independent cases.

This is a small convenience sample on one service date with modes tied to different times. Result availability is neither routing accuracy nor population-weighted coverage. No independent optimal-route oracle was used. No-result cases can reflect service, distance, or configured search limits.

The timer surrounds Schedule.search, including local geometry extraction, but excludes artifact loading, HTTP, Streamlit rendering, OAuth, geocoding, live BusTime calls, and network latency. It measures sequential local latency, not concurrency, throughput, or Render production performance. The artifact includes 3,321 trip definitions across service calendars, not 3,321 daily trips.

## Test evidence and limits

After network permission was granted for publishing, a recheck passed **47/47 Node tests**, with **90.68% aggregate line coverage**. Together with the 31 passing Python tests, all **78 tests passed**. See [permission-enabled recheck log](node-recheck.log). Module-specific coverage values in the table were unchanged.

See node-coverage.log and python-tests.log. The initial restricted Node run discovered 47 tests: 44 passed; three integration tests could not open 127.0.0.1 because of sandbox restrictions. In that initial run, 75 of 78 discovered tests passed, with three blocked by the environment. The later recheck resolved the environment restriction; retain both logs to distinguish these runs. Aggregate Node line coverage was 82.61%, depressed by the blocked HTTP integration tests. The tracking and recommendation module percentages above are module-specific.

Do not claim prediction accuracy, reduced passenger wait time, user adoption, production uptime, requests per second, or percentage performance improvement from this evaluation. Those require separate ground-truth, usage, monitoring, load, or before/after measurements. LeaveNow consumes provider predictions; this evaluation does not establish a trained machine-learning model.

## Version scope: pre-OSM baseline

These recorded results predate commit `918c803` (November 18, 2026), which added network-routed OSM walking legs and changed access/transfer feasibility. The 3.1× availability and 31.3 ms p95 figures are historical baseline measurements, not measurements of the current walking-enabled deployment. Rerun the documented benchmark on the new commit before making updated performance claims. See [walking rollout evidence](../../docs/walking-routing.md).
