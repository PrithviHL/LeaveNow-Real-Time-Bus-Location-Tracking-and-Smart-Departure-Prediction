# Prometheus and Grafana

This free local Docker stack monitors the Node API serving this Compose deployment. It does **not** automatically monitor the public Render deployment. Render keeps the API and `/metrics` bound to loopback behind the Streamlit app; no public metrics endpoint is exposed. A remote scraper would require a separate secured collector/network setup.

## Start

Install Docker Desktop and run these commands from the repository root. Keep the RTS key in the ignored `.env.gainesville` file, using `GAINESVILLE_RTS_API_KEY=...`. Never commit that file.

Create an ignored monitoring password file once:

```sh
python3 -c 'import secrets; from pathlib import Path; p=Path(".env.monitoring"); p.write_text("GRAFANA_ADMIN_PASSWORD="+secrets.token_urlsafe(32)+"\n") if not p.exists() else None; p.chmod(0o600)'
docker compose --env-file .env.gainesville --env-file .env.monitoring -f compose.yaml -f compose.monitoring.yaml up -d --build
```

Open [Grafana](http://localhost:3000), sign in as `admin` with the password in `.env.monitoring`, and choose **LeaveNow → LeaveNow · API and Live Tracking**. [Prometheus targets](http://localhost:9090/targets) should show `leavenow-api` as UP. Use the local [app](http://localhost:8501) to generate search and tracking traffic. Graph rates need several scrapes; empty graphs before traffic are expected.

Both monitoring ports bind only to your computer. Grafana signup and anonymous access are disabled. Its initial password is applied only when creating the persistent Grafana database; changing the environment file later does not reset an existing account.

```sh
# Stop the stack; keep dashboard/database history.
docker compose --env-file .env.gainesville --env-file .env.monitoring -f compose.yaml -f compose.monitoring.yaml down
```

Prometheus retains at most three days or approximately 1 GB of samples. Named volumes persist across restarts. `down -v` deletes monitoring history and Grafana account data. No paid resources are provisioned. Docker uses local CPU, memory and disk.

## What is measured

- API request totals, status codes and latency, including search/tracking p95.
- Searches returning journeys versus no result; journey counts and partial upstream failures.
- Tracking responses with GPS + ETA, GPS only, ETA only, or no verified live evidence.
- Age of returned GPS, boarding and alighting prediction timestamps.
- Actual RTS HTTP attempts, network/HTTP failures and latency (cache hits excluded).
- Node process memory, CPU, event loop and garbage collection metrics.

Counters measure responses/attempts, not unique buses or people. An HTTP success is not proof of valid prediction content. Evidence age measures freshness, **not ETA accuracy**. No ground-truth arrival or walking-time error is measured. No-result tracking outside service hours is normal.

Metric labels are bounded: normalized API route, method, status, outcome and evidence kind. They exclude keys, coordinates, address text, stop IDs, trip IDs, bus IDs and query strings. Scraping does not issue RTS requests or execute journey searches. The exporter runs only on the private API server and obeys its allowed-host check. Do not publish port 3001 or expose Prometheus directly to the internet.

## Alerts and validation

Prometheus evaluates API scrape failure (2 minutes), sustained API errors (>5% with ≥20 requests), and predominantly unavailable tracking (>80% with ≥30 responses). The tracking alert is informational because service hours and unassigned scheduled trips can explain it. Alerts appear in Prometheus; notification delivery requires separately configuring Alertmanager, which is not included.

```sh
docker run --rm --entrypoint promtool -v "$PWD/deploy/monitoring:/etc/prometheus:ro" prom/prometheus:v3.16.0 check config /etc/prometheus/prometheus.yml
docker run --rm --entrypoint promtool -v "$PWD/deploy/monitoring:/etc/prometheus:ro" prom/prometheus:v3.16.0 test rules /etc/prometheus/alerts.test.yml
node --test tests/observability.test.js
```

Dashboard and datasource provisioning are version controlled. Edit the JSON/configuration in this directory and restart Grafana to reload. Deploying the instrumented API to Render enables the private exporter but does not deploy Grafana or Prometheus there.

## Verification record

Validated locally on 2026-11-19 using the release snapshot (excluding unrelated working changes): 82 Node tests passed; Prometheus configuration and alert unit tests passed; API Docker image built and became healthy; Prometheus target `api:3001/metrics` reported UP; Grafana 13.3.1 provisioned all 12 panels and successfully queried its datasource. The smoke test used a placeholder RTS key and made no live provider requests. The upstream client’s default Node metric names produce promtool style warnings; Prometheus successfully scrapes them. Custom metrics have bounded labels and dedicated privacy/cache tests.
