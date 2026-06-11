#!/bin/sh
echo "=== Environment Check ==="
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "GOOGLE_API_KEY set: $([ -n "$GOOGLE_API_KEY" ] && echo YES || echo NO)"
echo "CTRADER_CLIENT_ID set: $([ -n "$CTRADER_CLIENT_ID" ] && echo YES || echo NO)"
echo "CTRADER_ACCESS_TOKEN set: $([ -n "$CTRADER_ACCESS_TOKEN" ] && echo YES || echo NO)"
echo "CTRADER_REFRESH_TOKEN set: $([ -n "$CTRADER_REFRESH_TOKEN" ] && echo YES || echo NO)"
echo "CTRADER_ACCOUNT_ID: $CTRADER_ACCOUNT_ID"
echo "========================="

echo "=== Running DB migrations ==="
if [ -n "$DATABASE_URL" ]; then
    psql "$DATABASE_URL" -f /app/docker-migrate.sql && echo "Migrations complete" || echo "Migration warning (non-fatal)"
fi

echo "=== Starting signal platform ==="
cd /app/signal_platform && python3 -u main.py 2>&1 &
echo "Signal platform PID: $!"

cd /app
exec node dist/index.prod.js
