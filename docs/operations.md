# Configuration and operations

## Environment

| Variable      | Required | Default | Meaning                           |
| ------------- | -------- | ------- | --------------------------------- |
| `GAINESVILLE_RTS_API_KEY` | Yes      | None    | Server-side RTS access credential |
| `PORT`        | No       | 3001    | Integer TCP port, 1–65535         |

The server reads the root `.env` using Node’s native environment loader. Existing environment variables take precedence. Use `.env.example` as the schema and never commit `.env`. No dependency installation, model runtime, Python environment, or database is required.

## Starting and stopping

Run `npm start` from the repository root, or `./run.sh` on this machine. The latter locates Codex’s bundled Node runtime only when normal `node` is absent from PATH. Keep that terminal open; Ctrl+C performs graceful shutdown. Use `npm run dev` for backend watch mode.

If the port is busy, stop the previous owned process or select another PORT. The startup message prints the local address. Do not stop unrelated processes merely to free a port.

## Readiness and diagnosis

```sh
curl http://localhost:3001/api/health
curl 'http://localhost:3001/api/places?q=East%20Alexander'
```

The health route checks local readiness/configuration. A stop search exercises the actual RTS connection (or a valid cache entry).

| Symptom                        | Check                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Connection refused             | Ensure the process is running and PORT matches the browser URL                              |
| Missing API key at startup     | Set GAINESVILLE_RTS_API_KEY in the root .env                                                            |
| Credential rejected            | Confirm the credential is active with RTS; do not paste keys in logs/issues                 |
| No stops near origin           | Confirm device location and Gainesville coverage; choose a map pin or raise walking allowance |
| No direct trip                 | The current prediction window may not cover a direct journey; transfers are unsupported     |
| Old or missing vehicle markers | Stale positions are removed; check the provider and network connection                      |
| Location permission denied     | Search a stop, enter coordinates, or place a map pin                                        |
| Blank basemap                  | OpenStreetMap tiles require external network access; planning can still work                |

## Container prototype

The Streamlit variant adds explicitly configured container service hosts while retaining loopback-only defaults for normal startup. See [Streamlit Docker/Kubernetes](streamlit-containers.md) for setup and verification limits. `HOST=0.0.0.0` and `ALLOWED_HOSTS` are opt-in settings for those containers.

## Shared hosting

The listener deliberately binds to 127.0.0.1. Host/Origin checks only allow local access. The direct Node listener is intended for local development. The separate [public Render profile](public-deployment.md) is deployed with a Google-protected Streamlit UI and loopback-only API. Shared hosting needs a reviewed reverse proxy/HTTPS and host configuration, request/rate limits, monitoring, secrets management, and a capacity-appropriate map/data provider. Browser geolocation requires HTTPS outside localhost.

The stop search uses RTS data rather than the public Nominatim geocoder. OpenStreetMap map tiles are loaded only for the active view, without prefetch or offline downloads; browser HTTP caching and visible attribution are preserved. Follow the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and choose a commercial/self-hosted tile service if traffic requires it.

## Credentials and legacy data

A credential embedded in the old prototype and notebooks was removed from the working tree during this change. Its prior Git history still exists. Rotate that credential with RTS before treating this repository as clean of historical exposure. Do not rewrite shared history without a separate coordinated migration.

The current local `.env` is ignored and used only for this local setup. No user location is persisted. Caches are in memory and disappear on restart. The ignored `.cache/` directory contains only development verification output, not runtime requirements.

## Browser location troubleshooting

Press **Use my current location** below the left side of the **Starting from** field. The browser request starts only on click, first requests high accuracy with a 15-second timeout and a 30-second cached position. On timeout/unavailability it makes one approximate-device request with a 20-second timeout and a maximum 60-second cached position. Permission denial is not retried. Accuracy over 100 meters is called out so users can switch to an address for walking estimates. Denied permission, unsupported browser context, unavailable device position, and timeout have separate messages. The component uses Streamlit v2 on the app page rather than a third-party iframe. Open the public HTTPS app directly in a normal browser when an embedded browser blocks GPS. Browser and operating-system location permissions are both required; the app cannot override either. Received points outside Gainesville are rejected with a coverage message. Positions stay in the visitor session/request memory; no location database is used.

## Walking graph operations

The OSM pedestrian snapshot is bundled in the image, so walking searches need no additional key or routing service. Refresh it deliberately using [the import and review procedure](walking-routing.md#coverage-and-refresh); do not query Overpass per search or during image builds. After deployment, verify the startup log reports OSM access walks, check `/_stcore/health`, and inspect the new instance’s memory rather than the old instance. Investigate out-of-coverage or disconnected paths before changing access rules. The initial hosted measurement was about 206 MiB of a 512 MiB limit; it is not a load guarantee.

## Live tracking refresh

The tracking fragment refreshes every five seconds by default; users can disable Auto-refresh live bus or refresh manually. Trip search is not rerun on each tracking tick. Vehicle polling is scoped to the selected leg’s route and cached/coalesced for five seconds; fleet diagnostics retain their 20-second cache, stop predictions 15 seconds, and route patterns five minutes. The process-wide 60-request/minute budget still applies. Five-second UI refresh does not guarantee five-second provider GPS or ETA updates. Different routes and stop pairs across many users can exhaust the budget; partial data warnings remain visible. Frequent map redraws may use more browser CPU/battery, especially on mobile.

## BusTime stop identity

Gainesville BusTime uses four-digit numeric stop codes (for example `0473`) while the GTFS stop ID is `473`. Prediction requests pad short numeric codes to four digits; pattern stop IDs remove numeric leading zeros for GTFS comparisons. Alphanumeric identifiers are preserved. This fixes false no-live-bus results without weakening ordered-stop, direction, or freshness checks. The bounded server-side startup diagnostic reports only public bus/stop metadata and verifies a real GPS-backed pair when service is available; it is not a permanent test timetable.

## Map markers

Green pins show the starting location and boarding stop; red pins show the destination and final get-off stop. The live vehicle uses a blue bus icon, distinct from endpoint pins. Endpoint icons render above route lines and stop circles so a coincident bus stop does not hide the start/destination color. Icons are bundled inline SVGs and need no external image service.

The selected blue bus has a matching blue approach path to its green boarding pin when its live pattern supplies usable geometry. Provider pattern distance bounds the GPS projection to the current stop interval; the path ends at the upcoming boarding stop. GPS gaps over 100 m or boarding offsets over 80 m hide the approach line. Short connectors are estimates, and the line is the current published pattern, not a recorded vehicle trail. When the origin is an address, the green walking path still leads to the boarding stop. Missing geometry never produces a fabricated straight bus line.

Stop circles use pixel units capped at 5 px radius; endpoint/bus icons use 22 px sizing capped at 24 px. Marker size stays bounded while zooming rather than expanding with map distance units.

## Journey-bound live tracking

Selecting a Journey option automatically tracks its exact GTFS trip; there is no separate bus picker. Transfer journeys retain a leg selector, and each leg can independently have live GPS, prediction-only data, or no assignment. The API first matches GTFS trip IDs from BusTime `origtatripno`/`tatripid`. Where numeric provider IDs differ, an exact service-date + scheduled-start-second + route + full ordered stop-sequence signature must resolve to one active GTFS trip; otherwise there is no assignment. Predictions can inherit this mapping only when both vehicle ID and a same-namespace native trip ID agree. a same-route bus without the exact assignment is excluded. Fresh GPS also requires a matching vehicle service date (or position date when absent). Non-current service-date queries conservatively return no tracking rather than show another day's repeated trip ID.

The primary ticket refreshes inside the five-second tracking fragment. A matched bus uses its boarding ETA and recalculates leave-by from walking plus the boarding buffer; GPS-only data never borrows a scheduled countdown. Unmatched trips show **Live tracking unavailable for this trip** and keep clearly labelled planned times. Journey-option departure times are labelled planned. Destination and connection times remain in a collapsed details section, last checked by Refresh arrivals; a boarding update alone does not recalculate them or guarantee a connection. Conflicting multiple vehicle assignments are not selected arbitrarily.

Journey options show **Live bus assigned** only for a unique fresh vehicle matched to that exact trip/service date whose verified pattern still reaches both stops in order. Other options show **No live assignment**. The planner uses the same strict identity mapping for native predictions as tracking, then rechecks catchability and transfer buffers. An earlier stop-pair tracking sample is not proof that a later recommended trip has a vehicle; the startup smoke check now also verifies the matching trip is present in the plan.

## Tracking map camera

The initial map view is frozen per selected origin/destination and journey. Five-second position/approach updates keep the same initial view and layer identities, allowing the browser to retain manual pan/zoom. Conditional tracking messages occupy a fixed container so they do not shift the map in the render tree. **Fit route** deliberately refits the current route and bus; changing the journey or endpoints initializes a new camera. A full browser reload may reset the view.

## Timing verification and live destination estimates

Use [the timing audit](../benchmarks/timing/README.md) when changing ETA, walking or transfer logic. Live destination display requires a verified downstream prediction; the final walk stays estimated. For a transfer’s first leg, a new live arrival that exceeds the last-checked connection buffer triggers a warning to refresh alternatives, not a promise of reaching the destination. Predictions are selected by generation time, never by the most optimistic ETA. Rechecking every five seconds does not force RTS to publish new forecasts at that rate.
