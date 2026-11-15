"""Check reachable Git blobs for known-exposed RTS key fingerprints, without printing keys."""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
blocked = set(
    json.loads((root / "security/blocked-credential-fingerprints.json").read_text())[
        "sha256"
    ]
)
revision = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
objects = subprocess.check_output(
    ["git", "rev-list", "--objects", revision], cwd=root
).splitlines()
hits = []
for entry in objects:
    oid, _, name = entry.partition(b" ")
    if (
        subprocess.check_output(["git", "cat-file", "-t", oid], cwd=root).strip()
        != b"blob"
    ):
        continue
    body = subprocess.check_output(["git", "cat-file", "blob", oid], cwd=root)
    if any(
        hashlib.sha256(candidate).hexdigest() in blocked
        for candidate in re.findall(rb"\b[0-9a-fA-F]{32}\b", body)
    ):
        hits.append(name.decode(errors="replace") or "[unnamed blob]")
if hits:
    print("Known exposed credential remains in historical blobs:")
    for name in hits:
        print("-", name)
    raise SystemExit(1)
print("Reachable history contains no known exposed RTS key.")
