# Validation

## Automated checks

`npm run check` runs Node syntax checks for application, test, and script JavaScript and scans source for common hardcoded credential assignments. This scan is a guardrail, not a comprehensive secret detector. Third-party vendor code and historical binary artifacts are not executed.

`npm test` uses Node’s built-in runner. Tests mock the provider and use only local HTTP for integration tests. An RTS key and internet access are not needed. Coverage reporting is available through `npm run test:coverage`.

The suite exercises:

- Gainesville timezone conversion across summer/winter and AM/PM boundaries
- Coordinate validation, stop normalization, distance and walking rules
- Matching downstream stops on the same trip and vehicle
- Rejection of wrong-trip, wrong-direction, stale, malformed, and uncatchable predictions
- Nearby-stop bounds, upstream failures, and no-service-area results
- HTTPS provider requests, caching/coalescing, unreadable responses and credential-safe errors
- HTTP assets, search, input validation, origin checks and secret-file exclusion
- Configuration validation and startup requirements

CI runs syntax/credential checks and coverage tests on Node 22 and 24. Passing local tests does not mean a remote GitHub Actions run has occurred.

## Live smoke check

On November 14, 2026, a real RTS request for Reitz Union → Rosa Parks RTS Downtown Station returned a direct Route 10 match, with matching trip identity, downstream ETA, a walking allowance, and no failed stop requests. The endpoint returned six candidate stops at each end. Live data depends on the current time and service and is not snapshotted into tests or presented as a permanent schedule.

Useful local smoke request:

```sh
curl -H 'Content-Type: application/json' \
  -d '{"origin":{"lat":29.64514,"lon":-82.346983},"destination":{"lat":29.645567,"lon":-82.322697},"maxWalk":15}' \
  http://localhost:3001/api/plan
```

## Browser checklist

The local preview is exposed at the printed app address. Browser automation was unavailable in this session; the following visual/device checks require manual verification:

- Accept and decline geolocation; exercise both fallback paths
- Search and choose stops and addresses with keyboard and pointer in both combined fields
- Use the current-location button below the origin; clear and replace selections
- Check mobile layout, map controls, dialog, and readable attribution
- Inspect a successful journey, no-direct-trip result, and network-failure message
- Check live refresh, boarding-stop walking link, countdowns and alternative journeys

## Known limits

Provider ETA accuracy is outside the app’s control. The current Gainesville planner supports direct and one-transfer timetable journeys with verified live overlays; walking follows mapped OSM paths where covered, with modelled times and labelled fallback estimates. Blue/purple paths use published GTFS shapes, not recorded GPS history. Google sign-in is required on the hosted app. Archived research-model binaries are not loaded or evaluated by the current app.

See [routing rules](timetable-routing.md) for search bounds and [measured evaluation](../benchmarks/routing/README.md) for benchmark methodology, raw results, and test evidence.

## OSM walking rollout

The November 18, 2026 rollout passed 58 Node and 36 Python tests, plus both remote workflows. Tests cover detours, partial-edge snapping, pedestrian one-ways, access restrictions, disconnected paths, crossing/stair costs, map geometry, and a missed-departure regression. See [deployment evidence and resource limits](walking-routing.md#deployment-verification--november-18-2026-eastern). Counts describe that commit, not a permanent suite size.

## Rigorous timing audit

See [the November 18 timing audit](../benchmarks/timing/README.md) for independent walking-oracle checks, delayed-transfer stress cases, current-feed search invariants, reproduced bugs and fixes, and the limits of live forecast validation. The report deliberately distinguishes calculation correctness, snapshot consistency, and real-world prediction error; it does not claim guaranteed arrivals or measured walking accuracy.

## Current metrics snapshot

The at-stop release passed **127 tests (77 Node + 50 Python)** and both remote workflows. Its 120-case real-feed rerun validated 2,428 candidates, including 31 transfer candidates and 4,887 routed walking-leg instances, with zero invariant failures. [Versioned metrics, raw artifacts and scope](project-metrics.md) distinguish these from the earlier 122-test audit and unmeasured real-world forecast accuracy.
