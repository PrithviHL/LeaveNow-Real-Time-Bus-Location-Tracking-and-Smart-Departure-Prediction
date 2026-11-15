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

The supervisor in `deploy/public_entrypoint.py` validates the public port, starts and checks the private API before starting Streamlit, and terminates both children on shutdown/failure. It removes RTS_API_KEY from the UI child's environment. The key is never copied into images, browser code, source configuration, or command-line arguments.

## Secret handling and known exposure

The previous RTS key was committed historically before the current application was created. An audit found no exact copy of that key in current public branch histories, but GitHub pull request #1 still retains four historical blobs containing it. A rewritten default branch does not erase read-only pull-request refs, cached commit views, forks, or other people's clones.

**Recommended: revoke the old key and obtain a replacement from RTS.** Removing source copies or making the repo private cannot revoke a credential. The public supervisor rejects the known exposed key by SHA-256 fingerprint by default; no raw credential is stored in the fingerprint file. The owner explicitly requested continuing with the current key, so the hosted service can opt in with `ALLOW_EXISTING_RTS_KEY=true`. This only permits server-side use; it does not undo the earlier exposure or make the credential confidential again. The deployed key is supplied through the Render environment; a developer may also have an ignored local `.env`.

If no acceptable RTS key is configured under the selected policy, live planning is disabled. A signed-in visitor sees an unavailable-service notice; a missing Google configuration keeps the planner locked. Do not describe that state as a fully operational bus planner.

Store the replacement only on the Render service's **Environment** page as `RTS_API_KEY`, then use **Save, rebuild, and deploy**. Do not enter it in chat, GitHub, render.yaml, a Dockerfile, or a URL. `STREAMLIT_SERVER_COOKIE_SECRET` controls the server setting. Google sign-in additionally requires a stable random `AUTH_COOKIE_SECRET`, the client ID/secret, and the exact `AUTH_REDIRECT_URI`; see the OAuth guide.

For historical GitHub cache removal, contact GitHub Support with the repository URL and pull request #1 / old head `70e8dcf2d4c62bdadf11065fe583d9e4ce0f4246` after revocation. Do not include the raw key in a support issue. Follow GitHub's [sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository). Local backup branches from history migrations must never be pushed.

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
