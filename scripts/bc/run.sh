#!/usr/bin/env bash
# run.sh — ask the app whether a Barchart options fetch is due, and if so run one (19 Nov 2026).
#
# Reads Investing.com's overnight options table and Barchart's at each open (docs/options-levels.md). First installed
# on the server 23 Nov 2026, with his permission — it had NEVER been installed before (no /opt/bc, no timer). The app
# decides every run (server/scrapers/bcLimits.ts) and the admin switch "Post the options levels" must be on.
#
# SAME SHAPE AS scripts/mfb/run.sh: the host only asks; the app decides (one run 10 min after the Sydney (Tue-Fri),
# London and New York opens); the browser runs in a container REMOVED ON EXIT, capped, killed if it overruns. A refusal
# is reported as BLOCKED and the day is skipped — never retried.
#
# Install (as root):
#   mkdir -p /opt/bc && cp run.sh /opt/bc/ && chmod 755 /opt/bc/run.sh
#   cp ../../server/python/{barchart_greeks,barchart_read,barchart_parse,barchart_levels,barchart_message,\
#      barchart_snapshot,sentry_options}.py /opt/bc/          (after that, each run fetches them itself — see below)
#   cp bc.timer bc.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now bc.timer
# Stop it: systemctl disable --now bc.timer
set -uo pipefail
FILES="barchart_greeks.py barchart_read.py barchart_parse.py barchart_levels.py barchart_message.py barchart_snapshot.py
       sentry_options.py popups.py"

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

# THE NEWEST SCRAPER FILES FROM THE APP, every run (23 Nov 2026) — so a deploy reaches this scraper without anyone
# copying files here by hand. Each file is swapped in only when it downloaded whole; a failed download keeps the copy
# already here, so a run never starts with a half file.
for f in $FILES; do
  if curl -fsS --max-time 30 -H "x-admin-secret: $SECRET" "$APP/api/internal/options/scraper/$f" -o "$DIR/$f.new" \
     && [ -s "$DIR/$f.new" ]; then
    mv -f "$DIR/$f.new" "$DIR/$f"
  else
    rm -f "$DIR/$f.new"; log "could not fetch $f — using the copy already here"
  fi
done

# Investing.com's panel first (~1 min), then Barchart's three markets, each its own browser visit (Barchart allows a
# visit only a few full pages) — up to ~4 min each on a slow machine, 10-25 s apart — and up to THREE tries of each,
# five minutes apart (his order 23 Nov 2026), with patient page waits. 5400 s (90 min) here is the outer kill.
timeout 5400 docker run --rm \
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
