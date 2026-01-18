#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure HOME is set (systemd doesn't set it by default)
export HOME="${HOME:-$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6)}"
export HOME="${HOME:-/root}"

# Load local .env if exists
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

cd "$SCRIPT_DIR"
exec node build/main.js
