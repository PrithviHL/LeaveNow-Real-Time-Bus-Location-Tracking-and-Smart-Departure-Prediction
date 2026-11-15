"""Google identity UI backed by Streamlit's verified OIDC session."""

import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError


def configured():
    try:
        auth = st.secrets.get("auth", {})
        return all(
            auth.get(key)
            for key in (
                "redirect_uri",
                "cookie_secret",
                "client_id",
                "client_secret",
                "server_metadata_url",
            )
        )
    except StreamlitSecretNotFoundError:
        return False


def account_controls():
    signed_in = st.user.get("is_logged_in", False)
    with st.expander("Your account", expanded=not signed_in):
        if signed_in:
            # Identity comes from the OIDC token, never query parameters or form input.
            st.write(f"Signed in as {st.user.get('name', 'traveler')}")
            st.caption(st.user.get("email", "Google account"))
            if st.button("Sign out", key="account_logout"):
                st.logout()
        else:
            ready = configured()
            st.caption(
                "Use your Google account to sign in. No separate LeaveNow password is needed."
            )
            if st.button(
                "Continue with Google", disabled=not ready, key="account_login"
            ):
                st.login()
            if not ready:
                st.caption("Google sign-in is being set up. Please try again later.")
            else:
                st.caption(
                    "Sign in to plan your journey. Signing in shares your name and email with LeaveNow."
                )

    if not signed_in:
        st.stop()
