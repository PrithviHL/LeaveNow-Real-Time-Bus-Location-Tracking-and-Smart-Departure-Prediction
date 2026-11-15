# Change log

## Unreleased

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
