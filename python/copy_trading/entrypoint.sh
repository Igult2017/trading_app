#!/bin/sh
# Bridge container entrypoint.
# Waits for the MT5 RPyC server to accept connections before starting
# the Python service.  On first boot the MT5 container installs MT5 under
# Wine which can take up to 8–10 minutes — the long timeout handles that.
set -e

HOST="${MT5_BRIDGE_HOST:-mt5}"
PORT="${MT5_BRIDGE_PORT:-8812}"
TIMEOUT=600   # 10 minutes — covers first-boot Wine + MT5 installation
INTERVAL=10

echo "[Bridge] Waiting for MT5 RPyC at ${HOST}:${PORT} (max ${TIMEOUT}s)..."

elapsed=0
while ! nc -z "$HOST" "$PORT" 2>/dev/null; do
    if [ "$elapsed" -ge "$TIMEOUT" ]; then
        echo "[Bridge] ERROR: MT5 RPyC not available after ${TIMEOUT}s."
        echo "[Bridge] Check the mt5 container:  docker compose logs mt5"
        exit 1
    fi
    echo "[Bridge] MT5 not ready yet — ${elapsed}s elapsed, retrying in ${INTERVAL}s..."
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
done

# Extra settle time after port opens — MT5 needs a few seconds to finish
# initialising its internal state before accepting API calls.
echo "[Bridge] MT5 RPyC is up. Waiting 10s for full initialisation..."
sleep 10

echo "[Bridge] Starting: $*"
exec "$@"
