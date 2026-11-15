"""Print a Kubernetes Secret from the local ignored .env; pipe directly to kubectl.

Do not redirect this output to a tracked file or run it in a logged CI step.
"""

import base64
import json
import os
from pathlib import Path

key = os.environ.get("RTS_API_KEY", "").strip()
if not key:
    env = Path(__file__).resolve().parents[1] / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("RTS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
if not key or key == "your-rts-api-key":
    raise SystemExit("Set RTS_API_KEY in the environment or root .env first.")
print(
    json.dumps(
        {
            "apiVersion": "v1",
            "kind": "Secret",
            "metadata": {"name": "leavenow-rts", "namespace": "leavenow"},
            "type": "Opaque",
            "data": {"RTS_API_KEY": base64.b64encode(key.encode()).decode()},
        }
    )
)
