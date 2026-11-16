# Timetable and transfer routing

The main Streamlit planner combines the official RTS GTFS schedule with available RTS live predictions. A lack of a live departure is no longer interpreted as a lack of later scheduled service.

## Travel controls

- **Leave now:** find catchable journeys from the current instant, including later scheduled departures.
- **Depart at:** leave no earlier than the selected Gainesville date/time.
- **Arrive by:** reach the final destination, including the final walk, by the selected Gainesville date/time. Rank valid journeys by latest leave-by time.
- **Allow one transfer:** include two-bus journeys; turn off for direct-only options.
- **Minimum transfer buffer:** choose 3, 5, 8, or 10 minutes in addition to the transfer walk. A longer GTFS minimum overrides the shorter estimate.

All date/time controls use America/New_York regardless of the visitor's computer timezone. Nonexistent spring-forward wall times are rejected. An ambiguous fall-back control time selects its first occurrence. GTFS service times use the specification's local-noon-minus-twelve-hours anchor, and times after 24:00 belong to the preceding service date.

## Source labels

- **Scheduled:** published timetable times; no live confirmation was found for these times.
- **Live:** all transit legs have fresh boarding and alighting predictions for their exact GTFS trips.
- **Live + Scheduled:** only some legs or endpoints have matching fresh predictions.

RTS `ExternalTripId` must equal the GTFS `trip_id`; route numbers alone never establish a match. Vehicle IDs must agree when both endpoint predictions include them. Live updates are limited to nearby-time candidates and fresh observations; missing predictions are not treated as cancellations. A delayed leg that misses its connection or arrival deadline is removed rather than silently presented using the original schedule.

## Search and correctness boundaries

The router enumerates eligible first and final transit legs from active trips, joins them over nearby transfer stops, and ranks by final arrival for departure searches or latest leave time for arrival searches. It considers pickup/dropoff permissions, service calendars and exception dates, GTFS transfer bans/minimums, and route/trip-scoped transfer rules. Trip instance identity includes service date.

Bounds keep the portfolio service practical:

| Constraint                           | Limit                                            |
| ------------------------------------ | ------------------------------------------------ |
| Transit rides                        | 1 or 2 (at most one transfer)                    |
| Requested date                       | Now through 14 days ahead, within feed coverage  |
| Departure search                     | 36 hours forward                                 |
| Arrival search                       | 8 hours back from the deadline, never before now |
| Nearby access/egress stops           | Up to 12 at each end                             |
| Transfer walking distance            | Up to 400 m and the selected walking allowance   |
| Wait for connecting bus              | Up to 2 hours                                    |
| Total door-to-door duration          | Up to 6 hours                                    |
| Ranked candidates before live checks | Up to 24 unique trip chains                      |
| Live lookup scope                    | Up to 12 endpoint IDs for near-time candidates   |
| Returned choices                     | Up to 8                                          |

The GTFS rules do not guarantee a bus will hold a connection. Demand-responsive pickup/dropoff types and in-seat/interlining transfers are not implemented as passenger-ready options. No fare optimization, wheelchair filtering, turn-by-turn walking, or actual bus-path geometry is claimed. Map lines connect stops schematically. Walking uses straight-line distance × 1.25 at 80 m/min; initial boarding includes two extra minutes.

## Feed lifecycle

Source: https://go-rts.com/wp-content/uploads/2026/08/RTSGTFS_Fall2026-1.zip

```sh
npm run gtfs:import
# Or use an already downloaded feed:
python3 scripts/import-gtfs.py --zip path/to/google_transit.zip
```

The importer uses standard-library ZIP/CSV readers, validates required tables/timezones and monotonic times, and supports quoted fields, exception-only calendars, and >24-hour times. It writes ignored `data/gtfs.json.gz`, recording source checksum, publisher version, service range, and import time. Missing stop times fail explicitly instead of inventing interpolation.

Docker builds fetch and compile the official feed into the image; the raw ZIP and data artifacts are not committed. The Node service loads it once and maintains a small bounded service-day cache. There is no database or paid storage dependency.

**Refresh by reimporting/restarting locally, or rebuilding/redeploying the image.** This is build-time ingestion, not an automatic daily data sync. Monitor feed dates before expiry. Requests outside feed coverage show an explicit message; previous-day late-night trips remain eligible after the nominal final service date. The current feed covers August 17, 2026 through May 2, 2027. The app shows feed provenance and the date range.

Data source: [Gainesville RTS data](https://go-rts.com/rts-data/). GTFS download and routing use no secret. The importer strips whitespace from CSV fields and rejects stops outside Gainesville. The November 2026 feed contains 972 stops and 3,321 trips, with service dates August 17, 2026–May 2, 2027.

## Live integration

Clever Devices BusTime v3 runs at `https://riderts.app/bustime/api/v3/`. The server discovers its data feed (or uses `GAINESVILLE_RTS_FEED`), batches vehicle lookups into at most ten routes, and normalizes compact local timestamps and Unix milliseconds. Only exact `origtatripno`/`tatripid` matches to GTFS trip IDs enable live timetable overlays. Otherwise journeys remain explicitly Scheduled.

## Verification

Deterministic tests cover transfers, service dates, DST, API errors, timestamps, geographic limits, and secret isolation. Real-feed checks found direct Reitz-area → Rosa Parks journeys and a two-leg Route 37 → Route 1 option. These are observations, not guaranteed departures.
