# Public Streamlit deployment

## Design

`deploy/docker/public.Dockerfile` packages the Streamlit interface and private Node API together for one Render web service. Only Streamlit listens on the public platform port. Node binds exclusively to `127.0.0.1:3001`; it is not an externally exposed API. This single-container profile complements the separate-service Compose and Kubernetes development examples.

The supervisor in `deploy/public_entrypoint.py` validates the public port, starts and checks the private API before starting Streamlit, and terminates both children on shutdown/failure. It removes RTS_API_KEY from the UI child's environment. The key is never copied into images, browser code, source configuration, or command-line arguments.

## Secret handling and known exposure

The previous RTS key was committed historically before the current application was created. An audit found no exact copy of that key in current public branch histories, but GitHub pull request #1 still retains four historical blobs containing it. A rewritten default branch does not erase read-only pull-request refs, cached commit views, forks, or other people's clones.

**Revoke the old key and obtain a replacement from RTS.** Removing source copies or making the repo private cannot revoke a credential. The new public supervisor rejects the known exposed key by SHA-256 fingerprint; no raw credential is stored in the fingerprint file.

If no replacement is configured, the public site can render its interface and maps, but it clearly reports live arrivals unavailable and does not call the private planner. Do not describe that state as a fully operational bus planner.

Store the replacement only on the Render service's **Environment** page as `RTS_API_KEY`, then use **Save, rebuild, and deploy**. Do not enter it in chat, GitHub, render.yaml, a Dockerfile, or a URL. A random Streamlit cookie secret is generated server-side unless one is explicitly configured as `STREAMLIT_SERVER_COOKIE_SECRET` in the hosting environment.

For historical GitHub cache removal, contact GitHub Support with the repository URL and pull request #1 / old head `70e8dcf2d4c62bdadf11065fe583d9e4ce0f4246` after revocation. Do not include the raw key in a support issue. Follow GitHub's [sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository). Local backup branches from history migrations must never be pushed.

## Render profile

The root `render.yaml` describes one **free** Docker web service in Ohio, using branch `feature/streamlit-containers`. It does not contain an RTS key. It checks `/_stcore/health` and waits for CI checks before automatic redeploys. The service can also be created directly with the same Dockerfile settings.

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
