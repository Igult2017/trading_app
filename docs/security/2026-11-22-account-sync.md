# Security pass — account sync on the one shared cTrader app (steps 1-9)

**Date:** 22 Nov 2026 · **Scope:** commits c87af7d3 … 1c9329d1 (`.claude/plans/declarative-roaming-bentley.md`).
**Result: no High or Critical finding. Nothing new to fix; one Low hardening note recorded below.**

## What changed, and what each change could expose

| Surface | What it can do | Who can reach it | Finding |
|---|---|---|---|
| `POST /api/broker-accounts/sync-all` (new) | Starts a sync of the CALLER's accounts, one after another | Logged-in users (`verifyToken`); **401 without login, checked on the live site** | Takes no input; the account list comes from the caller's own id, so no one can start another user's sync. One run per user. None |
| `GET /api/broker-accounts/sync-all` (new) | Reads the caller's own run | Logged in; **401 without** | Keyed by the caller's id only. None |
| `GET /api/broker-accounts/limit` (new) | Reads the account limit | Logged in; **401 without** | A number. None |
| `GET /api/broker-accounts/:id/sync-log` (new) | Reads one account's sync events | Logged in AND the account's owner — **404 otherwise, never 403, so an id cannot be probed** | Detail lines are written by the sync for the owner (symbols, counts, broker refusal text) — no token or password is ever written to `sync_events`. None |
| `POST /api/broker-accounts` (changed) | Now refuses past the admin limit | As before | The check runs BEFORE any row is created (`__tests__/accountLimit.check.ts`). None |
| Requests on SHARED live-feed connections (`ctraderHub.onFeed/onAnyFeed`) | Several users' accounts are asked about on one connection | Server only | The real risk of this change: one account handed another's history or one user another's account list. Every per-account answer is matched to the asking account (`forAcct`) and account lists to the token, one at a time per connection — with the matching removed on purpose, the test DID cross them, so the matching is load-bearing and tested (`__tests__/syncOnFeed.check.ts`). None |
| Journal push stream (`type: 'sync-all'`) | Sends Sync All progress to open tabs | Only to the run's own user (`pushToUser`) | Account names and counts of the user's own accounts. None |
| Signal engine order connection kept open (`order_line.py`) | Orders on one long-lived connection | Engine only | Execution events filtered to the order that asked (`_mine`); the token is re-checked on every use and the line reopens if it changed. None |

## Companion checks
- **Dependencies (`npm audit --omit=dev`):** 5 moderate — `uuid` < 11.1.1 inside `node-telegram-bot-api`; the same
  item deferred this morning with its reason (`2026-11-22-copier-pool-jobs-sweep.md`). Nothing new.
- **Secret scan** of every line added since c87af7d3~1: clean.
- **Access check by hand** of the four new routes: each calls `verifyToken` first; the sync-log route also checks
  ownership and answers 404.

## OWASP ZAP passive baseline — live site, after the step 9 deploy
Plan `C:\Users\FSD\zap-tools\baseline-2026-11-22-sync.yaml` (spider with form submission off, passive rules only; the
four new routes, the capacity page and the Accounts page added to the start list).

| Risk | Finding | Count | Status |
|---|---|---|---|
| Medium | Content Security Policy header not set | 11 | Same as 15, 19 and 22 Nov (morning) — deferred with its reason in `2026-11-15-settings-privacy.md` |
| Medium | A CSP directive with no fallback | 1 | Same, same reason |
| Info | Suspicious comments; modern web app; cache-control | — | Informational |

**No active scan:** there is no staging copy of the app, and an active scan fires real attack payloads, which must
never be aimed at production. The passive baseline and the companion checks above ran.

## Low — recorded, not changed
A user can press Sync All again the moment a run finishes. Each press is bounded (one run at a time, accounts one
after another, requests paced per connection with "too many" waited out), so the cost lands on that user's own
connection allowance, not on anyone else's — the same as pressing Sync on one account repeatedly, which has always been
possible. No cooldown added; revisit if the usage page ever shows one user dominating a connection.
