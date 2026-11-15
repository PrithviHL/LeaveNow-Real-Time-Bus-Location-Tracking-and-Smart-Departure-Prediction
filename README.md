# LeaveNow

**Your next bus, figured out.** A Rochester RTS trip planner that combines published timetables with available live predictions to find nearby stops, direct or one-transfer journeys, and when to leave.

**[Open the live app](https://leavenow-prithvihl.onrender.com)** · [Routing rules](docs/timetable-routing.md) · [Deployment](docs/public-deployment.md) · [Google sign-in](docs/google-sign-in.md)

The live Streamlit application runs from **`feature/streamlit-containers`**. The `main` branch retains the earlier direct-bus browser application. Use this branch for the current deployed UI and routing features.

## Use the live app

1. Continue with Google. After login, **Your account** is in the top-right header and includes **Sign out**.
2. For either location, choose **Search a stop** and type part of a name or stop ID. Select a suggestion from the searchable dropdown. The starting point also supports browser GPS; coordinates are available for either end.
3. Choose **Leave now**, **Depart at**, or **Arrive by**. Set your walking allowance and enable or disable a transfer; choose a connection buffer when transfers are enabled.
4. Select **Find my next bus**. Review the walking legs, bus legs, boarding/alighting stops, transfer allowance, final arrival, and map.
5. Check the timing label: **Live**, **Scheduled**, or **Live + Scheduled**. These indicate the source of the displayed times, not a guarantee that a service will run on time.

Suggestions cover **RTS stop names**, not general street-address geocoding. Browser GPS requires permission. The map and timeline provide estimates; dotted connections are not street-following directions or actual bus route geometry. Results depend on the selected service date and provider availability.

### Example inputs

| Starting stop | Destination | Useful check |
| --- | --- | --- |
| East & Alexander | Park & Berkeley | Nearby stops and a short journey |
| Airport & Terminal Lower Level | Park & Berkeley | Transfer-enabled vs direct-only results |
| RTS Transit Center | Strong Memorial Hospital | Downtown/hospital journey and future time controls |

Use a future weekday during service hours to test **Depart at** and **Arrive by**. These are test inputs, not promises of a particular bus or connection. Live predictions usually cover a shorter window than the timetable.

## Features and scope

- Google sign-in, account menu, logout, and a sign-in gate before the planner.
- Searchable stop suggestions in both location fields, current-location permission flow, coordinates, and sample-trip presets.
- Official RTS GTFS calendars, stop/trip order, and direct or **one-transfer** timetable routing.
- Transfer walking time, boarding allowance, minimum connection buffers, and final walking time.
- Fresh RTS predictions applied only to matching GTFS trip identities, with connection and arrival-deadline rechecks.
- Separate Live/Scheduled labels, multi-leg timelines, journey cards, maps, manual refresh, and Leave-now auto-refresh.
- A private Node API in the hosted container; the RTS key is kept out of browser code and the Streamlit child's environment.

Search is bounded: departures up to 36 hours forward; Arrive-by lookback up to eight hours excluding departures you can no longer catch; date controls cover the next 14 days within published service dates. Walking uses straight-line distance × 1.25 at 80 meters/minute, plus a two-minute boarding buffer. A no-result message means no journey was verified within these limits, not that every possible transit journey is impossible.

The GTFS artifact is built during deployment and must be refreshed before its service dates expire. This app does not train a bus-location prediction model or guarantee future positions. The original HTML browser interface remains a direct-only compatibility view. [Full timetable rules and limits](docs/timetable-routing.md).

## Local setup

Requires Node.js 22.9+, Git, Python 3.12, an RTS credential, and Google OAuth configuration for the Streamlit interface.

```sh
git clone --branch feature/streamlit-containers https://github.com/PrithviHL/LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction.git
cd LeaveNow-Real-Time-Bus-Location-Tracking-and-Smart-Departure-Prediction
# On a new checkout only; keep any existing .env.
cp .env.example .env
# Set RTS_API_KEY in the ignored .env.
python3 scripts/import-gtfs.py
npm start
```

There are no Node runtime packages to install. The API and original browser interface run at [localhost:3001](http://localhost:3001). In a second terminal:

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r prototypes/streamlit/requirements.txt
LEAVENOW_API_URL=http://127.0.0.1:3001 .venv/bin/python -m streamlit run prototypes/streamlit/app.py --server.port=8501
```

Open [localhost:8501](http://localhost:8501). Configure the ignored `.streamlit/secrets.toml` and Google's localhost callback as described in [Google setup](docs/google-sign-in.md); the planner stays locked until sign-in is configured. `./run.sh` is an optional Node launcher for a machine with the bundled Codex runtime.

## Render deployment

| Setting | Current deployment |
| --- | --- |
| Public URL | https://leavenow-prithvihl.onrender.com |
| Source branch | `feature/streamlit-containers` |
| Dockerfile | `deploy/docker/public.Dockerfile` |
| Public process | Streamlit on the platform `PORT` |
| Private API | Node on `127.0.0.1:3001` |
| Health endpoint | `/_stcore/health` |
| Google callback | `https://leavenow-prithvihl.onrender.com/oauth2callback` |

The free Render service can sleep when idle. The service display name is `leavenow`; its actual public hostname still includes `prithvihl`. Use the verified URL above when sharing it, including on LinkedIn.

Store `RTS_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_COOKIE_SECRET`, and `AUTH_REDIRECT_URI` in Render's environment settings. Preserve a stable random auth cookie secret. The supervisor writes Google's configuration to a private runtime-only file. Do not commit keys, cookies, or secret files. Deployment security details and the existing RTS credential policy are documented in [public deployment](docs/public-deployment.md).

## Docker and Kubernetes

The local Compose profile runs separate API and Streamlit containers:

```sh
docker compose up --build --wait
```

Open [localhost:8501](http://localhost:8501). Authentication still needs its runtime secrets file; see the container and OAuth guides. The public Render profile uses one supervised Docker container instead. Kubernetes manifests and a kind workflow are provided for local development/CI; Render is **not** running this app on a Kubernetes cluster you manage. [Container architecture, secrets, commands, and validation limits](docs/streamlit-containers.md).

## Validation

```sh
npm run check
npm test
# After installing Python requirements:
.venv/bin/python -m unittest discover -s prototypes/streamlit/tests
```

Tests cover routing, service calendars, overnight trips, live overlay checks, API boundaries, credential handling, authentication UI, stop selection, and presentation. Provider data is mocked in deterministic tests. Browser GPS, actual Google login, and live arrival correctness require separate live checks; a healthy process alone does not verify them.

## Project map and documentation

| Path | Purpose |
| --- | --- |
| `src/server/` | Node API, RTS client, GTFS schedules, and routing |
| `prototypes/streamlit/` | Current public UI, account controls, and Python tests |
| `scripts/import-gtfs.py` | Official feed import and compact timetable build |
| `public/` | Original direct-only HTML app and vendored Leaflet |
| `deploy/` | Public supervisor, Dockerfiles, and development Kubernetes manifests |
| `tests/` | Node tests |
| `legacy/` | Archived research materials; not the current runtime |

- [Architecture](docs/architecture.md) · [API reference](docs/api.md)
- [Timetable routing](docs/timetable-routing.md) · [Google sign-in](docs/google-sign-in.md)
- [Public deployment](docs/public-deployment.md) · [Operations](docs/operations.md)
- [Docker and Kubernetes](docs/streamlit-containers.md) · [Testing](docs/testing.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Change log](CHANGELOG.md)

Data: [RTS](https://www.myrts.com/RGRTA-API). Maps: [OpenStreetMap](https://www.openstreetmap.org/copyright). The original HTML interface includes Leaflet under its [BSD license](public/vendor/leaflet/LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md). Archived claims about model accuracy, AWS, or research deployments are not claims about the current application.
