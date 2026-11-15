import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "public_entrypoint", root / "deploy/public_entrypoint.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicEntryTests(unittest.TestCase):
    def test_key_is_removed_from_ui_and_api_stays_on_loopback(self):
        port, api, ui = module.child_environments(
            {"RTS_API_KEY": "new-test-credential", "PORT": "10000", "HOST": "0.0.0.0"}
        )
        self.assertEqual(port, 10000)
        self.assertEqual(api["HOST"], "127.0.0.1")
        self.assertEqual(api["PORT"], "3001")
        self.assertEqual(api["RTS_API_KEY"], "new-test-credential")
        self.assertNotIn("RTS_API_KEY", ui)
        self.assertEqual(ui["LEAVENOW_API_CONFIGURED"], "1")
        self.assertTrue(ui["STREAMLIT_SERVER_COOKIE_SECRET"])

    def test_missing_or_known_exposed_key_disables_live_api(self):
        self.assertFalse(module.safe_api_key(None))
        self.assertFalse(module.safe_api_key(""))
        digest = module.hashlib.sha256(b"exposed-test-value").hexdigest()
        with patch.object(
            Path, "read_text", return_value=json.dumps({"sha256": [digest]})
        ):
            self.assertFalse(module.safe_api_key("exposed-test-value"))
        _, _, ui = module.child_environments({"PORT": "10000"})
        self.assertEqual(ui["LEAVENOW_API_CONFIGURED"], "0")

    def test_public_port_cannot_collide_with_private_api(self):
        with self.assertRaises(ValueError):
            module.child_environments({"PORT": "3001"})
