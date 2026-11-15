# API reference

All responses are JSON except static assets. The API defaults to local-only access and is not versioned as a public service. The container prototype explicitly allows its internal service hostname; it does not add public authentication. Mutations require `Content-Type: application/json`; browser Origin must match the requested origin.

## GET /api/health

Returns application readiness and whether an API credential is configured. This is not an upstream RTS availability check.

```json
{
  "ok": true,
  "configured": true,
  "service": "RTS Rochester",
  "timeZone": "America/New_York"
}
```

## GET /api/places?q=East%20Alexander

Searches provider stop names (all query words) or an exact stop ID. Query length: 2–100 characters. Returns up to 12 results and the total number of matches.

```json
{
  "results": [
    {
      "id": "1007",
      "name": "East & Alexander",
      "lat": 43.155062,
      "lon": -77.594633
    }
  ],
  "count": 1
}
```

The example illustrates the schema; actual matching counts and stop data come from RTS.

## GET /api/vehicles

Returns `vehicles` and `checkedAt` (Unix milliseconds). Each vehicle has `id`, `route`, `label`, `lat`, `lon`, `timestamp`, and `positionTimestamp`. Positions older than three minutes or more than one minute in the future are filtered out.

## POST /api/plan

```json
{
  "origin": { "lat": 43.155028, "lon": -77.594012 },
  "destination": { "lat": 43.148116, "lon": -77.578088 },
  "maxWalk": 15
}
```

Coordinates must be finite numbers in valid latitude/longitude ranges. `maxWalk` is optional and defaults to 15; supported values are 5, 10, 15, and 20 minutes at each end. Maximum request body: 16 KB.

Response fields:

| Field                             | Meaning                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `origin`, `destination`           | Validated points                                              |
| `nearestStop`                     | Closest physical origin stop within walking range, or null    |
| `originStops`, `destinationStops` | Candidate stops with `meters` and estimated `walkMinutes`     |
| `journeys`                        | Up to eight verified direct, catchable options                |
| `departures`                      | Nearby departures; destination reachability is not guaranteed |
| `reason`                          | Explanation when no direct recommendation exists, or null     |
| `partial`                         | Some stop prediction requests failed                          |
| `checkedAt`                       | Response calculation time in Unix milliseconds                |
| `walking`                         | Estimate assumptions and boarding buffer                      |
| `scope`                           | Description of search limits                                  |

Journey fields include route/headsign/direction, trip and vehicle IDs, boarding/alighting stops, `departsAt`, `arrivesAt`, `leaveAt`, `destinationAt`, `rideMinutes`, walking durations, and `feedTimestamp`. Times are Unix milliseconds.

## Errors

Errors use `{"error":"message"}`. Status codes include 400 (invalid input), 403 (Host/Origin restriction), 404 (missing asset), 405 (unsupported method), 413 (request too large), 415 (unsupported content type), and 503 (upstream failure). Credential values and upstream URLs containing keys must never be returned.
