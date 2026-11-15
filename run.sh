#!/bin/sh
set -eu
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  leavenow_node="$(command -v node)"
else
  leavenow_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$leavenow_node" ]; then
  echo "Install Node.js 22.9+ and run npm start." >&2
  exit 1
fi
exec "$leavenow_node" src/server/index.js
