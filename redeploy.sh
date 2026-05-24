#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Pulling latest code ==="
git pull

echo "=== Rebuilding and restarting containers ==="
docker compose up -d --build

echo "=== Done. App is live ==="
