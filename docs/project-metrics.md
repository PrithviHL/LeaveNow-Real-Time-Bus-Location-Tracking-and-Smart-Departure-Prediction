# LeaveNow metrics and release evidence

Recorded November 18, 2026 for code commit `732ef01`. [Machine-readable snapshot](../benchmarks/timing/metrics.json) · [Raw current-policy run](../benchmarks/timing/at-stop-report.json) · [Methods and limits](../benchmarks/timing/README.md).

| Measurement | Latest result | What it means |
|---|---:|---|
| Automated tests | **127 passed** (77 Node + 50 Python) | Clean committed release, zero failures |
| Walking oracle | **1,296 ordered pairs** | Local A* agrees with independent Dijkstra on a generated directed/stair/crossing graph |
| Prediction evidence | **128 combinations** | Route/trip/vehicle/stop/freshness/order rejection checks |
| Transfer delay stress | **600 cases** | Catchability, arrival arithmetic and connection minimums remain valid |
| Real-feed searches | **120 generated cases** | One service date, seed 20261118; direct/transfer and three time modes |
| Candidate journeys | **2,428**, including **31 transfer candidates** | Internal enumeration, not the final three UI choices or observed trips |
| Walking legs | **4,887 routed instances** | Includes repeated candidate legs; no fallback occurred in this sample |
| Timing invariant failures | **0** | Arithmetic/feasibility checks; not zero forecast error |
| Local latency | **16.77 ms median / 62.54 ms p95** | Node v24.22.1; excludes HTTP, UI and live provider calls |
| Local Node RSS | **265,109,504 bytes (~253 MiB)** | End-of-run sample, not peak load |
| Hosted memory | **~174–184 MiB** | Three post-startup samples on the 512 MiB plan, not a capacity guarantee |
| Timetable | **972 stops / 3,321 trip definitions** | GTFS definitions across calendars, not daily operated trips |
| OSM graph | **171,202 vertices / 190,432 segments** | ~2.6 MB compressed, ODbL attribution retained |

The [standard CI](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/actions/runs/44395294965) and [container/Kubernetes workflow](https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction/actions/runs/44395294970) passed for this code release. Render runs Docker; Kubernetes is a local/CI check, not the production hosting platform.

## Current behavior

Tracking is automatic for the selected journey's exact trip/service date. Transfer journeys retain a leg selector. A blue bus/approach path leads to a green boarding pin; destination pins are red. The five-second update preserves manual pan/zoom; **Fit route** resets the view. Provider predictions remain cached for 15 seconds, so screen refresh frequency is not GPS/forecast publication frequency.

Walking uses mapped OSM links at 65 m/min with mapped crossing/stair allowances. The initial two-minute approach buffer becomes zero only for a zero-walk origin within 1 m of the actual boarding stop. Transfers keep their minimum buffers. A 12:59 search at the stop can retain a 1:00 departure; departed buses remain excluded. This describes the entered origin, not proof of a user's physical presence.

The newest generated prediction wins over older optimistic records. Contradictory records fail closed. A live final-leg destination estimate requires a same-trip/same-vehicle downstream ETA plus estimated final walking time. Missing live downstream data stays unavailable; timetable times remain labelled. Live boarding alone does not establish final destination/transfer accuracy.

## Version history and claims

The initial OSM rollout passed 94 tests. The earlier timing audit passed 122 tests and generated 2,426 candidates / 34 transfer candidates / 4,886 walking-leg instances; its raw artifact remains [report.json](../benchmarks/timing/report.json). The at-stop policy rerun above passed 127 tests and uses [at-stop-report.json](../benchmarks/timing/at-stop-report.json). These are separate policy versions, not an accuracy improvement comparison.

The pre-OSM 60-search benchmark measured 3.1× sampled availability (16/60 → 49/60) and 31.3 ms local p95. Those are historical results, not current-policy latency or observed arrival accuracy. The older instrumented coverage percentages belong to the 122-test audit and have not been remeasured for this release.

**No real-world forecast MAE or measured walking accuracy is available.** Independently observed arrivals and timed pedestrian walks are needed for that evaluation. Generated checks and one-date samples cannot establish citywide coverage, every possible journey, or guaranteed connections. [Live snapshot consistency evidence](../benchmarks/timing/live-check.json) is recorded separately and is not proof that the bus subsequently arrived on time.

## Publication copies

The portfolio and GitHub profile carry the same `metrics/leavenow.json` snapshot with a link back here. Update the canonical evidence first, then sync those files and public summaries. Keep previous runs and source hashes; do not silently overwrite historical metrics or describe them as prediction accuracy.
