# Change log

## Unreleased

- Added official RTS GTFS ingestion, service calendars, holiday exceptions, overnight times, and feed-expiry checks.
- Added direct and one-transfer scheduled routing with walking and connection buffers.
- Added Leave now / Depart at / Arrive by controls, multi-leg timelines, and source-labelled Live/Scheduled results.
- Revalidate connections and deadlines after exact-trip live updates; retain scheduled results when real-time data is unavailable.

- Added a Render-ready public container with loopback-only API, blocked exposed-key detection, and secret-free UI environment.
- Added upstream request budgeting, history credential scanning, and deployment/security verification tests.

- Redesigned Streamlit with a dark transit theme, route tickets, journey timeline, interactive day/night map, location presets, and location swapping.

- Added a Streamlit trip-planning prototype sharing the Node routing API.
- Added separate Docker images, Compose, Kubernetes deployments/services/probes, and a Secret helper.
- Added explicit container bind/host configuration while preserving local-only defaults.
- Added Python UI/client tests and a CI workflow for Compose and disposable kind verification.

## 1.0.0 — 2026-11-14

- Added a dedicated LeaveNow web app for current location, destination selection, and live direct-bus planning.
- Added a map, fresh bus positions, nearby-stop search, walking allowance, departure cards, and leave-by estimates.
- Matched live trips downstream and filtered stale/uncatchable predictions.
- Added provider caching, failure handling, local HTTP safeguards, configuration validation, and graceful shutdown.
- Added deterministic tests, native syntax checks, credential-scan guardrails, and Node 22/24 CI.
- Organized research reports and the historical Streamlit submission under documented archive/legacy paths.
- Removed the embedded historical RTS credential from source copies; retained existing Git history.
- Added architecture, API, operations, validation, contribution, security, and vendor documentation.

## Gainesville RTS migration

- Restrict planning, stops, vehicles, and map defaults to Gainesville, Florida.
- Integrate Clever Devices BusTime v3 with a server-only Gainesville credential.
- Import official Gainesville GTFS and preserve honest Scheduled/live trip matching.
- Update sample journeys, deployment instructions, and regression tests.
