# API reference

All responses are JSON except static assets. The API defaults to local-only access and is not versioned as a public service. The container prototype explicitly allows its internal service hostname; it does not add public authentication. Mutations require `Content-Type: application/json`; browser Origin must match the requested origin.

## GET /api/health

Returns application readiness and whether an API credential is configured. This is not an upstream RTS availability check.

```json
{
  "ok": true,
  "configured": true,
  "service": "RTS Gainesville",
  "timeZone": "America/New_York"
}
```

## GET /api/places?q=Reitz%20Union

Searches provider stop names (all query words) or an exact stop ID. Query length: 2–100 characters. Returns up to 12 results and the total number of matches.

```json
{
  "results": [
    {
      "id": "473",
      "name": "Reitz Union",
      "lat": 29.64514,
      "lon": -82.346983
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
  "origin": { "lat": 29.64514, "lon": -82.346983 },
  "destination": { "lat": 29.645567, "lon": -82.322697 },
  "maxWalk": 15
}
```

Coordinates must be finite numbers in valid latitude/longitude ranges. `maxWalk` is optional and defaults to 15; supported values are 5, 10, 15, and 20 minutes at each end. Maximum request body: 16 KB.

`mode` is `leave_now` (default), `depart_at`, or `arrive_by`. Future modes require `when` as UTC Unix milliseconds, from now through 14 days ahead. `maxTransfers` accepts 0 or 1 (default 1). `transferBuffer` accepts 3, 5, 8, or 10 minutes (default 5). Without a compiled timetable, future modes return an availability error and Leave now falls back to direct live-only retrieval.

Journeys include `legs`, `transfers`, connection walk/minimum/wait information, and `timingSource` / `timingLabel`. Source labels are `Live`, `Scheduled`, or `Live + Scheduled`; individual leg times also carry provenance. `feed` contains the official source, service date range, version, import date, and checksum. Scheduled legs retain their baseline arrival/departure timestamps when live updates are applied.

Response fields:

| Field                             | Meaning                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `origin`, `destination`           | Validated points                                              |
| `nearestStop`                     | Closest physical origin stop within walking range, or null    |
| `originStops`, `destinationStops` | Candidate stops with `meters` and estimated `walkMinutes`     |
| `journeys`                        | Up to three ranked direct/one-transfer timetable choices; legacy live-only fallback may return up to eight                |
| `departures`                      | Nearby departures; destination reachability is not guaranteed |
| `reason`                          | Explanation when no direct recommendation exists, or null     |
| `partial`                         | Some stop prediction requests failed                          |
| `checkedAt`                       | Response calculation time in Unix milliseconds                |
| `walking`                         | Estimate assumptions and boarding buffer                      |
| `scope`                           | Description of search limits                                  |

Journey fields include route/headsign/direction, trip and vehicle IDs, boarding/alighting stops, `departsAt`, `arrivesAt`, `leaveAt`, `destinationAt`, `rideMinutes`, walking durations, and `feedTimestamp`. Times are Unix milliseconds.

## Walking provenance

Timetable `boarding` and `alighting` stop objects and a transfer `connection` include `walkPath` (longitude/latitude pairs) and `walkSource` (`osm` or `estimate`). Walk distances are meters and durations are rounded-up minutes. `walking` describes graph provenance, modelled pace, and boarding allowance. Missing coverage permits a labelled fallback; a known disconnected network does not. Do not interpret bus GTFS geometry as walking geometry or recorded GPS history. See [walking rules](walking-routing.md).

## Errors

Errors use `{"error":"message"}`. Status codes include 400 (invalid input), 403 (Host/Origin restriction), 404 (missing asset), 405 (unsupported method), 413 (request too large), 415 (unsupported content type), and 503 (upstream failure). Credential values and upstream URLs containing keys must never be returned.

### `GET /api/stops`

Returns `{ "results": [{ "id", "name", "lat", "lon" }] }`, sorted by name and stop ID. Uses the loaded GTFS stop catalog, falling back to the RTS stop list when no timetable is loaded. The Streamlit UI caches this public catalog for one hour and filters searchable dropdowns locally as users type; no API request or RTS credential is sent from the browser for each keystroke. Selecting an option resolves coordinates; clearing it removes the resolved location. This covers RTS stops, not arbitrary street-address geocoding.

## GET /api/tracking?stop=473&alight=1&route=17

Private tracking requires a valid boarding stop, get-off stop, and route. Bus choices need either fresh boarding/alighting predictions for the same vehicle and live trip, with the alighting time later, or a fresh vehicle whose live BusTime pattern has the boarding stop ahead of its current pattern distance and the get-off stop after it. GPS-only choices keep a null ETA. Route number, destination text, and compass heading alone never establish direction. Missing/failed pattern verification hides unverified buses. Positions older than three minutes remain hidden. Each transfer leg uses its own boarding/get-off pair.

## GET /api/addresses?q=Marston%20Science%20Library

Explicit address/place search via Photon, bounded to Gainesville and returning selectable names/coordinates. This is separate from stop-name suggestions. The backend caches successful results for 24 hours in process memory, coalesces identical requests, and limits uncached provider requests to one per second for this single-instance demo. `GEOCODER_URL` can select a compatible self-hosted or replacement endpoint. No API key is required. Queries go to the external search provider; avoid confidential text. Provider failures give an actionable error instead of invented coordinates. OSM attribution appears in the UI.

Tracking polls the selected route’s vehicles with a shared five-second cache. Prediction and pattern caches remain 15 seconds and five minutes respectively. The UI refreshes its tracking fragment every five seconds when enabled, without repeating trip search. Provider position timestamps, not the UI refresh rate, determine GPS freshness.

### Exact journey tracking

The UI adds `trip=<GTFS trip id>&date=YYYYMMDD` to `/api/tracking`. The server validates the trip route and ordered boarding/get-off stops. Returned buses include `tripId`; matching route alone is insufficient. A native ID mismatch can resolve only through one active timetable trip with an exact service-date/start-second/route/full-stop-sequence signature. GPS requires the same GTFS trip assignment and service date, in addition to freshness and direction checks. Ordered, exact-trip predictions can supply ETA without GPS. No match returns an empty list; there is no route-only substitution. The optional unbound mode remains for server diagnostics and legacy clients. The public UI never uses that mode.

### Prediction timestamps and downstream arrival

Tracking buses include nullable `alightingAt` and `alightingPredictionAt` (Unix milliseconds), sourced from fresh, ordered, same-trip/same-vehicle downstream predictions. GPS-only data cannot invent either boarding or destination ETA. Plan legs include nullable `boardingPredictionAt` and `alightingPredictionAt` so clients/tests can distinguish a new provider snapshot from an application inconsistency. Duplicate records use their newest generation time; contradictory same-generation ETAs, wrong-stop records, invalid times and out-of-window predictions are discarded. The UI derives a final-leg destination estimate as `alightingAt + finalWalkMinutes × 60000`; it does not extrapolate a final destination from the first bus of a transfer.
