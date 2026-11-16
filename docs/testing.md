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
  -d '{"origin":{"lat":43.155028,"lon":-77.594012},"destination":{"lat":43.148116,"lon":-77.578088},"maxWalk":15}' \
  http://localhost:3001/api/plan
```

## Browser checklist

The local preview is exposed at the printed app address. Browser automation was unavailable in this session; the following visual/device checks require manual verification:

- Accept and decline geolocation; exercise both fallback paths
- Search and choose stops with keyboard and pointer; enter coordinates
- Set origin and destination pins, and cancel selection
- Check mobile layout, map controls, dialog, and readable attribution
- Inspect a successful journey, no-direct-trip result, and network-failure message
- Check live refresh, boarding-stop walking link, countdowns and alternative journeys

## Known limits

Upstream prediction accuracy is outside this app’s control. Direct matching is bounded to nearby stops and the live window. Walking is estimated rather than street-routed, and map connectors do not depict actual bus paths. There are no transfer, timetable, account, or multi-user hosting guarantees. Archived research-model binaries are not loaded, tested, or endorsed by the current app.
