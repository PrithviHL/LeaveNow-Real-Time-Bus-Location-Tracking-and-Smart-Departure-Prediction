# Security

Do not publish credentials in issues, pull requests, screenshots, or logs. Contact the repository owner privately for credential leaks or vulnerabilities.

## Current boundaries

- The service binds to localhost and has no hosted-user authentication model.
- RTS credentials are loaded server-side and sent only over HTTPS.
- The browser cannot read `.env`; only static public assets are served.
- POST bodies are size-limited and browser origins are checked.
- Provider errors are translated without returning credential-bearing URLs.
- Location and trip data are not persisted by the app.

The historical prototype previously contained an API credential. Source copies have been sanitized, but previous Git commits still contain the old content. Rotate the credential with RTS before broader use. History rewriting is not part of this change.

The archived notebooks and serialized Python models are research artifacts, not trusted runtime dependencies. Do not load untrusted pickle files. The current Node application never loads these models.
