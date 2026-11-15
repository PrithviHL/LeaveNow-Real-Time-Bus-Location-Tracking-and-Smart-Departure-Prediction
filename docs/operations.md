# Configuration and operations

## Environment

| Variable      | Required | Default | Meaning                           |
| ------------- | -------- | ------- | --------------------------------- |
| `RTS_API_KEY` | Yes      | None    | Server-side RTS access credential |
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
| Missing API key at startup     | Set RTS_API_KEY in the root .env                                                            |
| Credential rejected            | Confirm the credential is active with RTS; do not paste keys in logs/issues                 |
| No stops near origin           | Confirm device location and Rochester coverage; choose a map pin or raise walking allowance |
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
