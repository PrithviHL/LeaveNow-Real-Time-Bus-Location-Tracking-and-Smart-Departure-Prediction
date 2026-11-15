"""Run public Streamlit with a private API; never reuse a known-exposed key."""

import hashlib
import json
import os
from pathlib import Path
import signal
import secrets
import subprocess
import sys
import time
import tempfile
from urllib.parse import urlparse
from urllib.error import URLError
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parents[1]


def safe_api_key(value, allow_existing=False):
    if not value or not value.strip() or value == "your-rts-api-key":
        return False
    if allow_existing:
        return True
    blocked = json.loads(
        (ROOT / "security/blocked-credential-fingerprints.json").read_text()
    )["sha256"]
    return hashlib.sha256(value.strip().encode()).hexdigest() not in blocked


def child_environments(env):
    port = int(env.get("PORT", "10000"))
    if not 1 <= port <= 65535 or port == 3001:
        raise ValueError(
            "Public PORT must be valid and different from the private API port 3001."
        )
    api_env = dict(
        env,
        HOST="127.0.0.1",
        PORT="3001",
        ALLOWED_HOSTS="",
    )
    for key in (
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "AUTH_COOKIE_SECRET",
        "AUTH_REDIRECT_URI",
    ):
        api_env.pop(key, None)
    ui_env = {
        k: v
        for k, v in env.items()
        if k
        not in (
            "RTS_API_KEY",
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "AUTH_COOKIE_SECRET",
            "AUTH_REDIRECT_URI",
        )
    }
    ui_env.update(
        LEAVENOW_API_URL="http://127.0.0.1:3001",
        LEAVENOW_API_CONFIGURED=(
            "1"
            if safe_api_key(
                env.get("RTS_API_KEY"),
                allow_existing=env.get("ALLOW_EXISTING_RTS_KEY", "false").lower()
                == "true",
            )
            else "0"
        ),
    )
    ui_env.setdefault("STREAMLIT_SERVER_COOKIE_SECRET", secrets.token_urlsafe(32))
    return port, api_env, ui_env


def configure_google_auth(env, root=ROOT):
    """Create a private runtime-only Streamlit secrets file from hosting secrets."""
    keys = (
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "AUTH_COOKIE_SECRET",
        "AUTH_REDIRECT_URI",
    )
    values = [env.get(key, "").strip() for key in keys]
    if not any(values):
        return False
    if not all(values):
        raise ValueError("Google authentication configuration is incomplete.")
    client_id, client_secret, cookie_secret, redirect = values
    parsed = urlparse(redirect)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.path != "/oauth2callback"
        or parsed.query
        or parsed.fragment
        or parsed.username
    ):
        raise ValueError("AUTH_REDIRECT_URI must be an HTTPS /oauth2callback URL.")
    if len(cookie_secret) < 32:
        raise ValueError(
            "AUTH_COOKIE_SECRET must contain at least 32 random characters."
        )
    config = dict(
        redirect_uri=redirect,
        cookie_secret=cookie_secret,
        client_id=client_id,
        client_secret=client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    )
    directory = root / ".streamlit"
    directory.mkdir(parents=True, exist_ok=True)
    # JSON strings are valid TOML basic strings; never interpolate raw secret values.
    with tempfile.NamedTemporaryFile(mode="w", dir=directory, delete=False) as handle:
        handle.write(
            "[auth]\n"
            + "".join(f"{key} = {json.dumps(value)}\n" for key, value in config.items())
        )
        path = Path(handle.name)
    path.replace(directory / "secrets.toml")
    return True


def main():
    port, api_env, ui_env = child_environments(os.environ)
    configure_google_auth(os.environ)
    children = []
    stopping = False

    def stop(_signum=None, _frame=None):
        nonlocal stopping
        stopping = True
        for child in children:
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        if ui_env["LEAVENOW_API_CONFIGURED"] == "1":
            api = subprocess.Popen(
                ["node", "src/server/index.js"], cwd=ROOT, env=api_env
            )
            children.append(api)
            for _ in range(100):
                if stopping or api.poll() is not None:
                    raise RuntimeError("The private API stopped before becoming ready.")
                try:
                    with urlopen("http://127.0.0.1:3001/api/health", timeout=1):
                        break
                except (URLError, OSError):
                    time.sleep(0.1)
            else:
                raise RuntimeError("The private API did not become ready.")
            try:
                with urlopen(
                    "http://127.0.0.1:3001/api/vehicles", timeout=15
                ) as response:
                    matches = json.load(response).get("vehicles", [])
                print(
                    f"RTS connection verified: live vehicle lookup returned {len(matches)} fresh positions.",
                    flush=True,
                )
            except (URLError, OSError, ValueError):
                print(
                    "RTS startup check unavailable; visitors can retry stop search later.",
                    flush=True,
                )
            try:
                probe = {
                    "origin": {"lat": 43.128105, "lon": -77.6636},
                    "destination": {"lat": 43.148116, "lon": -77.578088},
                    "mode": "depart_at",
                    "when": int(time.time() * 1000) + 3 * 3600_000,
                    "maxWalk": 10,
                    "maxTransfers": 1,
                    "transferBuffer": 5,
                }
                request = Request(
                    "http://127.0.0.1:3001/api/plan",
                    data=json.dumps(probe).encode(),
                    headers={"Content-Type": "application/json"},
                )
                with urlopen(request, timeout=30) as response:
                    journeys = json.load(response).get("journeys", [])
                print(
                    f"Timetable routing startup check: {len(journeys)} journeys, {sum(j.get('transfers',0)>0 for j in journeys)} with transfers.",
                    flush=True,
                )
            except (URLError, OSError, ValueError):
                print(
                    "Timetable routing startup check unavailable; provider and schedule details remain visible in the app.",
                    flush=True,
                )
        else:
            print(
                "Live arrivals disabled: configure a replacement RTS_API_KEY in the hosting secret settings.",
                flush=True,
            )
        # Do not pass the RTS key to the public UI child process.
        api_env.pop("RTS_API_KEY", None)
        os.environ.pop("RTS_API_KEY", None)
        ui = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "streamlit",
                "run",
                "prototypes/streamlit/app.py",
                f"--server.port={port}",
                "--server.address=0.0.0.0",
                "--server.headless=true",
                "--server.fileWatcherType=none",
            ],
            cwd=ROOT,
            env=ui_env,
        )
        children.append(ui)
        while not stopping:
            if any(child.poll() is not None for child in children):
                raise RuntimeError(
                    "An application process stopped; the service will restart."
                )
            time.sleep(0.5)
    finally:
        stop()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == "__main__":
    main()
