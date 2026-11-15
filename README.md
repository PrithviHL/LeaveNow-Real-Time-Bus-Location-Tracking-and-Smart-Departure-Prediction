# LeaveNow

**Your next bus, figured out.** A trip planner for Rochester’s RTS network with live predictions, published timetables, and direct or one-transfer journeys. Choose a starting location and destination; LeaveNow finds nearby stops, checks live arrivals at both ends, and shows a catchable bus and when to leave.

**[Open the live Streamlit app](https://leavenow-prithvihl.onrender.com)**

The main Streamlit interface offers **Leave now**, **Depart at**, and **Arrive by**, with distinct **Live**, **Scheduled**, and **Live + Scheduled** labels. See [timetable routing](docs/timetable-routing.md) for search limits, data refresh, and verification.

## Quick start

Requires **Node.js 22.9+** and an RTS API key. There are no npm dependencies to install. Compile timetable data with `npm run gtfs:import` (Python 3.12 recommended).

```sh
cp .env.example .env
# Set RTS_API_KEY in .env.
npm run gtfs:import
npm start
```

Open [localhost:3001](http://localhost:3001). This checkout already has a local `.env` configured. Do not overwrite it unless you intend to replace the credential.

On the current Codex machine, `./run.sh` also works when Node is absent from the shell path. It uses the bundled Node runtime as a fallback. Keep the process running while using the app; press Ctrl+C to stop it.

## Using the app

1. Click the location button to use device GPS, search for an RTS stop or intersection, enter `latitude, longitude`, or choose a starting pin on the map.
2. Choose the destination in the same way. Search results are RTS stop names, not a general address directory. For another location, place a map pin.
3. Set the walking allowance at each end and click **Find my next bus**.
4. Read the recommended route, boarding/alighting stops, live arrival times, and leave-by time. The closest physical stop is shown separately if the recommendation uses another nearby stop.

Search and location permission failures have manual fallbacks. **Try a trip from East & Alexander** fills an example Rochester journey using current API stop data. Example results depend on which buses are actually running.

## What is included

- Responsive trip planner, interactive map, current-location permission flow, and keyboard-accessible stop selection
- Current RTS stops and vehicle positions, cached server-side
- Direct-trip verification using matching trip identity and downstream arrival times, with vehicle agreement when IDs are available
- Walking allowance, boarding buffer, stale-feed filtering, nearby departures, and explicit no-direct-trip states
- Automatic arrival refresh while a planned trip is visible, plus manual refresh
- Backend-only API credential, local-only listener, origin validation, request-size limits, and generic upstream errors
- Automated planner, API client, HTTP, and configuration tests; CI for Node 22 and 24

## Repository structure

```text
src/server/       HTTP application, configuration, RTS client, trip planning
public/           Browser interface and vendored Leaflet 1.9.4 assets
scripts/          Syntax and hardcoded-credential checks
tests/           Deterministic unit and HTTP integration tests
docs/            Architecture, API reference, operations, validation, archive
 prototypes/      Streamlit interface and Python tests
deploy/          Dockerfiles and Kubernetes manifests
legacy/          Original research notebooks and Streamlit submission
.github/          Continuous integration
```

The active application lives in `src/server` and `public`. Earlier project reports, models, and notebooks are retained for reference, not used by the new application. Historical claims about model accuracy, AWS, and Kubernetes are not claims about this implementation.

## Public portfolio deployment

The Render deployment profile keeps the RTS API private inside one container and stores credentials outside Git. A previously exposed key is explicitly blocked; live arrivals remain disabled until a replacement is configured in the hosting service. See [public deployment and credential security](docs/public-deployment.md).

## Streamlit prototype with Docker and Kubernetes

An additional Streamlit interface is available in `prototypes/streamlit`. It reuses the existing Node planner. With Docker running and the local `.env` configured:

```sh
docker compose up --build --wait
```

Open http://localhost:8501. Kubernetes manifests, a local kind workflow, native Python setup, security boundaries, and verification limits are documented in [Streamlit containers](docs/streamlit-containers.md). Docker/cluster execution must be validated on a machine or CI runner with those runtimes; having manifests alone is not a running deployment.

## Development

```sh
npm run dev            # Restart the server after backend changes
npm run check          # Syntax validation and source credential scan
npm test               # Deterministic tests, no RTS credential/network required
npm run test:coverage  # Same tests with Node’s coverage report
```

Static assets reload on browser refresh. The RTS provider is mocked in tests. A real live-data check is documented separately; it is not part of CI.

## Scope and limitations

The Streamlit planner supports **direct journeys and up to one transfer** using the current RTS GTFS feed. Departures are searched up to 36 hours forward; Arrive by looks back up to eight hours while excluding trips you can no longer catch. Future controls cover the next 14 days within published service dates. The original browser interface keeps a direct-only view. No result means none was found within these bounded limits, not that all transit is impossible.

Walking is an estimate: straight-line distance × 1.25, at 80 meters/minute, with a two-minute boarding buffer. Dotted map lines are connection guides, not street-following walking or bus routes. Use the boarding-stop walking-directions link and check crossings. Results and trip times can change; verify before travel.

Normal startup binds the API to `127.0.0.1`. The public Render profile serves Streamlit over HTTPS while keeping this API on loopback; it has no account system. Read [operations](docs/operations.md) before adapting it for shared hosting.

## Documentation

- [Architecture and planning rules](docs/architecture.md)
- [API reference](docs/api.md)
- [Configuration and operations](docs/operations.md)
- [Validation and known limits](docs/testing.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Change log](CHANGELOG.md)

Live data is provided by [RTS](https://www.myrts.com/RGRTA-API). Maps use [OpenStreetMap](https://www.openstreetmap.org/copyright) data and tiles. Leaflet is redistributed under its included [BSD license](public/vendor/leaflet/LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md).
