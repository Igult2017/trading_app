#!/usr/bin/env bash
# run.sh — ask the app whether a Barchart options fetch is due, and if so run one (19 Nov 2026).
#
# ⚠ NOT INSTALLED, NOT ENABLED — his order: "After creating it just disable it first, i will tell you what to do with
# it." It is switched off TWICE: this timer is not installed on the host, AND the app refuses every claim until
# BARCHART_ENABLED=true (server/scrapers/bcLimits.ts). Installing the timer alone still runs nothing.
#
# SAME SHAPE AS scripts/mfb/run.sh, which it copies: the host only asks; the app decides (six slots a day — Asia,
# London, New York open + 5 and + 20 min); the browser runs in a container REMOVED ON EXIT, capped, killed if it
# overruns. ⚠ One difference: no Cloudflare solver — a refusal is reported as BLOCKED and the app waits until tomorrow.
#
# Install (as root), only when he says so:
#   mkdir -p /opt/bc && cp run.sh /opt/bc/run.sh && chmod +x /opt/bc/run.sh
#   cp ../../server/python/barchart_greeks.py ../../server/python/barchart_parse.py \
#      ../../server/python/barchart_levels.py ../../server/python/barchart_message.py /opt/bc/
#   install bc.timer + bc.service beside this file, then: systemctl enable --now bc.timer
#   and set BARCHART_ENABLED=true on the app.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "$DIR/env" ] && . "$DIR/env"
APP="${APP:-https://app.dorixe.com}"
SECRET="${SECRET:-}"
IMAGE="${IMAGE:-pyd4vinci/scrapling:latest}"
APP_CONTAINER="${APP_CONTAINER:-dm96yia8e3dmg5lhjc2bu2de}"
if [ -z "$SECRET" ]; then
  cid="$(docker ps --filter "name=^${APP_CONTAINER}" --format '{{.Names}}' | head -1)"
  [ -n "$cid" ] && SECRET="$(docker exec "$cid" printenv ADMIN_SECRET 2>/dev/null || true)"
fi
log() { echo "[bc $(date -u '+%H:%M:%S')] $*"; }
if [ -z "$SECRET" ]; then log "no SECRET set — refusing to run"; exit 1; fi

due_json="$(curl -fsS --max-time 20 -H "x-admin-secret: $SECRET" "$APP/api/internal/barchart/due" || true)"
if [ -z "$due_json" ]; then log "could not reach the app — not scraping"; exit 0; fi
case "$due_json" in *'"due":true'*) : ;; *) log "not due: $due_json"; exit 0 ;; esac

claim="$(curl -fsS --max-time 20 -X POST -H "x-admin-secret: $SECRET" -H 'Content-Type: application/json' \
         -d '{}' "$APP/api/internal/barchart/claim" || true)"
run_id="$(printf '%s' "$claim" | sed -n 's/.*"runId":"\([^"]*\)".*/\1/p')"
slot="$(printf '%s' "$claim" | sed -n 's/.*"slot":"\([^"]*\)".*/\1/p')"
if [ -z "$run_id" ]; then log "claim refused: $claim"; exit 0; fi
log "claimed $slot run $run_id"

# Three markets, each its own browser visit (Barchart allows a visit only a few full pages) — up to ~4 min each on a
# slow machine; 900 s here is the outer kill.
timeout 900 docker run --rm \
  --name "bc-$slot" \
  --memory=1g --cpus=1 \
  -e "BC_APP=$APP" \
  -e "BC_SECRET=$SECRET" -e "BC_RUN_ID=$run_id" -e "BC_SLOT=$slot" \
  --entrypoint /app/.venv/bin/python -w /tmp -v /opt/bc:/opt/bc:ro \
  "$IMAGE" /opt/bc/barchart_greeks.py >/dev/null 2>>/var/log/bc.log
rc=$?
if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then
  # 1 = the scraper itself reported the failure; anything else (killed, crashed) never reached the app.
  curl -fsS --max-time 20 -X POST -H "x-admin-secret: $SECRET" -H 'Content-Type: application/json' \
    -d "{\"ok\":false,\"runId\":\"$run_id\",\"slot\":\"$slot\",\"error\":\"host runner exited $rc\"}" \
    "$APP/api/internal/barchart/levels" >/dev/null || true
fi
docker rm -f "bc-$slot" >/dev/null 2>&1 || true
log "done (exit $rc)"
