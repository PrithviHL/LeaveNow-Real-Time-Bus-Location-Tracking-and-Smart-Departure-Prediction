# Public Streamlit deployment

## Current live service

- App: https://leavenow-prithvihl.onrender.com
- Health: https://leavenow-prithvihl.onrender.com/_stcore/health
- Source: `feature/streamlit-containers`
- Service display name: `leavenow`; the hostname remains `leavenow-prithvihl.onrender.com`.
- Google sign-in is required before the planner. The top-right account menu includes logout.
- The active UI includes searchable stop dropdowns, Leave now / Depart at / Arrive by, timetable direct/one-transfer routing, and explicit timing-source labels.

See [Google sign-in](google-sign-in.md) and [timetable routing](timetable-routing.md). A 200 health response checks the process, not a completed Google login or a correct live bus prediction.

## Design

`deploy/docker/public.Dockerfile` packages the Streamlit interface and private Node API together for one Render web service. Only Streamlit listens on the public platform port. Node binds exclusively to `127.0.0.1:3001`; it is not an externally exposed API. This single-container profile complements the separate-service Compose and Kubernetes development examples.

The supervisor in `deploy/public_entrypoint.py` validates the public port, starts and checks the private API before starting Streamlit, and terminates both children on shutdown/failure. It removes GAINESVILLE_RTS_API_KEY from the UI child's environment. The key is never copied into images, browser code, source configuration, or command-line arguments.

## Secret handling

Configure `GAINESVILLE_RTS_API_KEY` only in Render Environment. It is passed exclusively to the loopback Node API and removed from the Streamlit process environment. The previous provider’s `RTS_API_KEY` is never used as a fallback or forwarded to Gainesville. `ALLOW_EXISTING_RTS_KEY` does not enable Gainesville credentials.

Do not commit keys or put them in browser code, Docker build arguments, or URLs shared with visitors. Local development uses ignored `.env.gainesville`. Google sign-in still requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, a stable random `AUTH_COOKIE_SECRET`, and `AUTH_REDIRECT_URI`.

The previous provider’s credential had historical exposure. Removing source copies does not revoke it; historical cache removal and revocation remain separate from this new Gainesville integration.

## Render profile

The root `render.yaml` describes one **free** Docker web service in Ohio, using branch `feature/streamlit-containers`. It does not contain an RTS key. The Blueprint specifies `/_stcore/health` and CI-gated deployment. The existing service was created directly, auto-deploys on commits, and currently has no configured HTTP health-check path. The Streamlit health endpoint is available for manual checks. The service can also be created directly with the same Dockerfile settings.

Free instances can sleep when idle, and workspace usage limits apply. This is a public portfolio/demo deployment, not an availability guarantee. See [Render's free-service limits](https://render.com/docs/free). No paid upgrade is authorized by this configuration.

## Abuse controls and limits

The provider client caches and coalesces requests and enforces a process-wide budget of 60 new RTS requests per minute. Cached results do not consume another upstream request. The private API retains input, host, origin, and request-body validation. Streamlit retains default CORS/XSRF protections; they are not disabled to make deployment easier.

This budget protects provider usage but is not a full DDoS or distributed rate-limiting system. Review provider quotas before promotion or higher traffic. Locations remain in the visitor's Streamlit session and request memory, not a database. External fonts and basemap providers receive their normal browser requests.

## Verification

- Node tests include upstream request budgeting and service-host validation.
- Streamlit AppTest covers disabled live calls when the public service is unconfigured.
- Supervisor tests verify key removal from the UI environment, loopback API binding, blocked/missing-key handling, random cookie secrets, and port validation.
- `python3 scripts/audit-credential-history.py HEAD` checks reachable Git history for known exposed key fingerprints.
- A successful Render build/deploy and public HTTPS health request are required before reporting the public URL as live.
- Successful authenticated RTS stop search/planning after a replacement key is configured is a separate final validation step.

## Bundled walking routing

The Docker image includes `src/server/walking-data/gainesville.json.gz` via the server source copy. Keep this artifact and its ODbL notice in release images. No walking-service secret, runtime download, Google Maps billing, or new Render resource is required. Node heap flags reserve room for Streamlit on the free instance. See [coverage, resource assumptions and verified deployment evidence](walking-routing.md).
