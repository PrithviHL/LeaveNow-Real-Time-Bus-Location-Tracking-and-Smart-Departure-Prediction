# Google sign-in

LeaveNow uses Streamlit's OpenID Connect authentication with Google. New and returning users use **Your account → Continue with Google**; no separate password or local account database is created. The signed-in panel shows the user's name and email and offers **Sign out**. Google sign-in is required before the journey planner is rendered. Signing in does not yet save trips or provide account-specific features.

## One-time Google setup

1. In Google Cloud Console, select your own project and configure Google Auth Platform branding, audience, and support/contact details.
2. Create an OAuth client of type **Web application**.
3. Add the app's exact origin under authorized JavaScript origins and its exact callback under authorized redirect URIs. For the current deployment:
   - Origin: `https://leavenow-prithvihl.onrender.com`
   - Callback: `https://leavenow-prithvihl.onrender.com/oauth2callback`
4. If the consent configuration is in Testing, add the intended users as test users. Configure the audience/publishing status for public access when ready. Request only the default `openid profile email` scopes.
5. In the existing Render service's **Environment** settings, add these values as secrets:
   - `GOOGLE_CLIENT_ID`: your OAuth client ID.
   - `GOOGLE_CLIENT_SECRET`: your OAuth client secret.
   - `AUTH_COOKIE_SECRET`: a persistent random value, generated with `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`.
   - `AUTH_REDIRECT_URI`: the exact callback URL above.
6. Save and deploy. Open the app, expand **Your account**, sign in with a Google test account, then sign out. Verify another browser can sign in as a different account.

Do not put credential values in chat, Git, screenshots, client-side code, or a URL. A domain change requires updating both Google's authorized callback and `AUTH_REDIRECT_URI` before trying login. Google credentials must belong to a project you control; they cannot be generated from the connected Render account.

## How configuration works

The public supervisor writes the four Render values into a mode-0600 `.streamlit/secrets.toml` file at runtime. The file is excluded from Git and Docker build context. Secrets are not passed to the Node API child. The public UI uses Streamlit's signed identity cookie and OIDC state/nonce handling; token exposure is not enabled. No passwords or identity tokens are stored in the repository, and no user database is required for sign-in alone.

With no auth configuration, the login button is disabled and the planner remains inaccessible. Partial configuration fails startup rather than creating a broken login flow. The cookie secret must stay stable across deployments. Streamlit identity cookies can persist for up to 30 days; users can sign out explicitly. The Streamlit UI stops rendering for signed-out sessions. The hosted transit API remains private on loopback; this does not add authentication to separately exposed API deployments.

## Local development

Install `prototypes/streamlit/requirements.txt` including the `streamlit[auth]` extra. Create the ignored `.streamlit/secrets.toml` file:

```toml
[auth]
redirect_uri = "http://localhost:8501/oauth2callback"
cookie_secret = "REPLACE_WITH_A_LONG_RANDOM_LOCAL_SECRET"
client_id = "YOUR_GOOGLE_CLIENT_ID"
client_secret = "YOUR_GOOGLE_CLIENT_SECRET"
server_metadata_url = "https://accounts.google.com/.well-known/openid-configuration"
```

Register that localhost callback with Google as well. The public supervisor deliberately requires HTTPS; the local Streamlit workflow reads the secrets file directly. For standalone Docker, mount the secrets file read-only into `/app/.streamlit/secrets.toml`; never bake it into an image.

## Verification

`python -m unittest discover -s prototypes/streamlit/tests` covers absent/partial configuration, callback validation, private file permissions, TOML escaping, child secret isolation, signed-out access blocking, login invocation, identity rendering, and logout invocation. A real Google redirect round-trip must be tested after the owner configures credentials; mocked UI tests do not establish provider connectivity.

References: [Streamlit authentication](https://docs.streamlit.io/develop/concepts/connections/authentication), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
