import sys
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest.mock import patch
from streamlit.testing.v1 import AppTest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "deploy"))
from public_entrypoint import configure_google_auth, child_environments


class AuthenticationTests(unittest.TestCase):
    def test_missing_and_incomplete_configuration(self):
        self.assertFalse(configure_google_auth({}))
        with self.assertRaises(ValueError):
            configure_google_auth({"GOOGLE_CLIENT_ID": "test"})

    def test_runtime_secrets_are_private_valid_toml_and_not_passed_to_children(self):
        env = dict(
            GOOGLE_CLIENT_ID="test-client",
            GOOGLE_CLIENT_SECRET='test"secret\\value',
            AUTH_COOKIE_SECRET="x" * 40,
            AUTH_REDIRECT_URI="https://example.com/oauth2callback",
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertTrue(configure_google_auth(env, root))
            path = root / ".streamlit/secrets.toml"
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(
                tomllib.loads(path.read_text())["auth"]["client_secret"],
                env["GOOGLE_CLIENT_SECRET"],
            )
        _, api, ui = child_environments(env)
        for key in env:
            self.assertNotIn(key, api)
            self.assertNotIn(key, ui)
        for redirect in (
            "http://example.com/oauth2callback",
            "https://example.com/",
            "https://example.com/oauth2callback?x=1",
        ):
            with self.assertRaises(ValueError):
                configure_google_auth(dict(env, AUTH_REDIRECT_URI=redirect))

    def test_signed_out_users_cannot_access_planner_without_configuration(self):
        app = AppTest.from_file(str(ROOT / "prototypes/streamlit/app.py")).run()
        self.assertFalse(app.exception)
        self.assertFalse(any(b.label == "Find my next bus" for b in app.button))
        self.assertEqual(len(app.radio), 0)
        self.assertTrue(
            next(b for b in app.button if b.key == "account_login").disabled
        )

    def test_configured_login_and_verified_identity_logout(self):
        app = AppTest.from_file(str(ROOT / "prototypes/streamlit/app.py"))
        app.secrets["auth"] = dict(
            redirect_uri="https://example.com/oauth2callback",
            cookie_secret="x" * 40,
            client_id="test",
            client_secret="test",
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        )
        with patch("authentication.st.login") as login:
            app.run()
            self.assertFalse(any(b.label == "Find my next bus" for b in app.button))
            next(b for b in app.button if b.key == "account_login").click().run()
            login.assert_called_once_with()
        app = AppTest.from_file(str(ROOT / "prototypes/streamlit/app.py"))
        with patch(
            "authentication.st.user",
            new=type("Identity", (dict,), {"is_logged_in": True})(
                name="Test Traveler", email="test@example.com", is_logged_in=True
            ),
        ), patch("authentication.st.logout") as logout:
            app.run()
            self.assertTrue(any(b.label == "Find my next bus" for b in app.button))
            self.assertTrue(any("Test Traveler" in item.value for item in app.markdown))
            next(b for b in app.button if b.key == "account_logout").click().run()
            logout.assert_called_once_with()
