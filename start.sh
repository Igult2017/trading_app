#!/bin/sh
echo "=== Environment Check ==="
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "GOOGLE_API_KEY set: $([ -n "$GOOGLE_API_KEY" ] && echo YES || echo NO)"
echo "CTRADER_CLIENT_ID set: $([ -n "$CTRADER_CLIENT_ID" ] && echo YES || echo NO)"
echo "COPY_ENCRYPTION_KEY set: $([ -n "$COPY_ENCRYPTION_KEY" ] && echo YES || echo NO)"
echo "COPY_ENGINE_ENABLED: ${COPY_ENGINE_ENABLED:-true}"
echo "CTRADER_ACCESS_TOKEN set: $([ -n "$CTRADER_ACCESS_TOKEN" ] && echo YES || echo NO)"
echo "CTRADER_REFRESH_TOKEN set: $([ -n "$CTRADER_REFRESH_TOKEN" ] && echo YES || echo NO)"
echo "CTRADER_ACCOUNT_ID: $CTRADER_ACCOUNT_ID"
echo "CTRADER_ENV: $CTRADER_ENV"
echo "========================="

echo "=== Running DB migrations ==="
if [ -n "$DATABASE_URL" ]; then
    psql "$DATABASE_URL" -f /app/docker-migrate.sql && echo "Migrations complete" || echo "Migration warning (non-fatal)"
fi

echo "=== Starting signal platform (with auto-restart) ==="
# Watchdog: restart Python on any non-0 exit except deliberate kill (exit 1 = config error, no point retrying immediately)
(
  ATTEMPTS=0
  while true; do
    ATTEMPTS=$((ATTEMPTS + 1))
    echo "[watchdog] starting signal platform (attempt $ATTEMPTS)..."
    cd /app/signal_platform && python3 -u main.py 2>&1
    EXIT=$?
    if [ $EXIT -eq 1 ]; then
      echo "[watchdog] signal platform exited with code 1 (config/auth error) — retrying in 60s"
    else
      echo "[watchdog] signal platform exited with code $EXIT — restarting in 10s"
    fi
    sleep 60
  done
) &
echo "Signal platform watchdog PID: $!"

echo "=== Starting copy engine (with auto-restart) ==="
# Split-ready seam: a future standalone container sets COPY_ENGINE_ENABLED=false here
# and runs `python3 -u main.py` from its own image — zero code change.
if [ "${COPY_ENGINE_ENABLED:-true}" = "true" ]; then
  (
    ATTEMPTS=0
    while true; do
      ATTEMPTS=$((ATTEMPTS + 1))
      echo "[watchdog] starting copy engine (attempt $ATTEMPTS)..."
      cd /app/copy_platform && python3 -u main.py 2>&1
      EXIT=$?
      if [ $EXIT -eq 1 ]; then
        echo "[watchdog] copy engine exited 1 (config/auth error) — retry in 60s"; sleep 60
      else
        echo "[watchdog] copy engine exited $EXIT — restart in 10s"; sleep 10
      fi
    done
  ) &
  echo "Copy engine watchdog PID: $!"
else
  echo "Copy engine disabled (COPY_ENGINE_ENABLED != true) — skipping"
fi

cd /app
# Tell Node NOT to start a second Python process — we already started it above
export SIGNAL_PLATFORM_MANAGED=true
exec node dist/index.prod.js
