#!/usr/bin/env bash
# run.sh — ask the app whether a MyFXBook fetch is due, and if so run one.
#
# THIS IS THE ONLY PIECE THAT LIVES ON THE HOST, and it is deliberately thin. It holds no schedule
# and no rate limit of its own: it asks the app, because only the app knows what is already in the
# calendar and how often we have asked today. A second copy of those rules here is exactly how the
# two would drift apart.
#
# ⚠ THE BROWSER RUNS IN A CONTAINER THAT EXITS. The app's own Dockerfile forbids a browser in its
# image because on 2026-09-07 a Chrome that failed to shut down was started every 15 minutes until
# the box ran out of memory and both the site and Coolify stopped answering. A container that is
# removed on exit answers that by construction: nothing survives it. Measured 2026-11-09 — 13
# browser processes during a fetch, 0 afterwards, free memory 1251MB -> 1325MB.
#
# ⚠ DORIXE RUNS ON THIS SAME MACHINE (2 CPUs). The caps below are what keep a scrape from being
# anyone else's problem.
#
# Install (as root):
#   cp run.sh /opt/mfb/run.sh && chmod +x /opt/mfb/run.sh
#   cp myfxbook_calendar.py myfxbook_parse.py calendar_filter.py /opt/mfb/
#   printf 'APP=https://app.dorixe.com\nSECRET=<ADMIN_SECRET>\n' > /opt/mfb/env && chmod 600 /opt/mfb/env
#   install the .timer + .service beside this file, then: systemctl enable --now mfb.timer
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
[ -f "$DIR/env" ] && . "$DIR/env"
# ⚠ NOT localhost. This script runs on the HOST, and the app listens inside its own container —
# measured on the first real run: `Failed to connect to localhost port 5000`, and the script
# correctly refused to scrape rather than going ahead blind. The public address is the one route
# that works from out here. Override with APP= in $DIR/env on another machine.
APP="${APP:-https://app.dorixe.com}"
SECRET="${SECRET:-}"
IMAGE="${IMAGE:-pyd4vinci/scrapling:latest}"
APP_CONTAINER="${APP_CONTAINER:-dm96yia8e3dmg5lhjc2bu2de}"

# ⚠ THE SECRET IS NOT KEPT IN A FILE HERE. It is read out of the running app container, which
# already holds it — so there is no second copy on disk to leak, and nothing goes stale when it is
# rotated. A $DIR/env file still wins if one exists, for a machine where this does not run beside
# the app, but nothing has to be written for the normal case.
if [ -z "$SECRET" ]; then
  cid="$(docker ps --filter "name=^${APP_CONTAINER}" --format '{{.Names}}' | head -1)"
  [ -n "$cid" ] && SECRET="$(docker exec "$cid" printenv ADMIN_SECRET 2>/dev/null || true)"
fi

log() { echo "[mfb $(date -u '+%H:%M:%S')] $*"; }

if [ -z "$SECRET" ]; then log "no SECRET set — refusing to run"; exit 1; fi

# ── 1. IS IT DUE? The app decides; we only carry out the answer. ──────────────────────────────
due_json="$(curl -fsS --max-time 20 -H "x-admin-secret: $SECRET" "$APP/api/internal/calendar/due" || true)"
if [ -z "$due_json" ]; then log "could not reach the app — not scraping"; exit 0; fi
case "$due_json" in
  *'"due":true'*) : ;;
  *) log "not due: $due_json"; exit 0 ;;
esac

# ── 2. CLAIM A SLOT. Re-checked server-side at this exact moment, so two timers cannot both go. ──
claim="$(curl -fsS --max-time 20 -X POST -H "x-admin-secret: $SECRET" -H 'Content-Type: application/json' \
         -d "$due_json" "$APP/api/internal/calendar/claim" || true)"
run_id="$(printf '%s' "$claim" | sed -n 's/.*"runId":"\([^"]*\)".*/\1/p')"
kind="$(printf '%s' "$claim" | sed -n 's/.*"kind":"\([^"]*\)".*/\1/p')"
if [ -z "$run_id" ]; then log "claim refused: $claim"; exit 0; fi
log "claimed $kind run $run_id"

# ── 3. FETCH. One container, capped, removed on exit, and killed from outside if it overruns. ──
# `--rm` removes it, `timeout` is the belt to the script's own braces: the Python caps itself at
# 600s, and 780 here is longer than that so a normal slow run is never cut off mid-solve.
timeout 780 docker run --rm \
  --name "mfb-$kind" \
  --memory=1.5g --cpus=1 \
  -e "MFB_INGEST_URL=$APP/api/internal/calendar/ingest" \
  -e "MFB_SECRET=$SECRET" \
  -e "MFB_RUN_ID=$run_id" \
  -e "MFB_KIND=$kind" \
  --entrypoint /app/.venv/bin/python \
  -w /tmp \
  -v /opt/mfb:/opt/mfb:ro \
  "$IMAGE" /opt/mfb/myfxbook_calendar.py >/dev/null 2>>/var/log/mfb.log
rc=$?

# ⚠ A RUN KILLED FROM OUTSIDE NEVER REPORTED ITSELF, so the app would hold an unfinished row and
# the lock would sit shut until it aged out. Close it here instead.
if [ "$rc" -ne 0 ]; then
  log "fetch exited $rc — telling the app so the slot is released"
  curl -fsS --max-time 20 -X POST -H "x-admin-secret: $SECRET" -H 'Content-Type: application/json' \
    -d "{\"ok\":false,\"runId\":\"$run_id\",\"kind\":\"$kind\",\"error\":\"host runner exited $rc\"}" \
    "$APP/api/internal/calendar/ingest" >/dev/null || true
fi

# Leave nothing behind, even if docker was interrupted before --rm could act.
docker rm -f "mfb-$kind" >/dev/null 2>&1 || true
log "done (exit $rc)"
