# Security pass — the copier rebuild (connection pool, copy jobs, repair sweep, copy speed page)

**Date:** 21-22 Nov 2026 · **Scope:** the changes of `docs/copy-realtime-plan.md` steps 1-10 (commits 840eb09f … 986d41af)
and the dependency pin. **Result: no High or Critical finding. One dependency item fixed; nothing else to fix.**

## What changed, and what each change could expose

| Surface | What it can do | Who can reach it | Finding |
|---|---|---|---|
| `GET /api/admin/copy/delay` (new) | Reads copy delays, account names and numbers | Admins only (`requireAdmin`); **401 without login, checked on the live site** | Takes no input, so nothing can be injected; read-only. None |
| `copy_jobs` table (new) | Holds each follower's copy job | The copy engine and that admin endpoint | Trade details only (symbol, side, size, levels, ids) — **no token, no password**. None |
| `copy_platform/pool.py` (new) | Keeps follower and master accounts logged in on shared connections | Inside the engine only | Tokens stay in memory; log lines carry the broker's refusal text, never a token. A refused login is retried with freshly read credentials, never a second token refresher (the shared-token rule). None |
| `copy_platform/sweep.py` (new) | **Can cancel and close trades on follower accounts** | Inside the engine, only while `COPY_USE_POOL` is on (today: demo accounts only) | Touches only trades the copier itself labelled `cp-…`; only copies older than 2 minutes; only on master reads under 90 s old; checks EVERY master an account copies (another master's copy is never closed — tested); never opens a trade. Accepted as designed; `tests/test_sweep.py` |
| `copy_platform/follower_watch.py` (new) | Listens to follower accounts | Inside the engine | Read-only — writes drift to the Activity log, sends nothing to the broker. None |
| `copy_platform/tests/fake_ctrader.py`, `capacity_dispatch.py` | A stand-in broker and a load kit | Started by hand only, never by the app | Listen on 127.0.0.1 only. None |

## Companion checks
- **Dependencies (`npm audit --omit=dev`):** `qs` — 4 moderate denial-of-service advisories (GHSA-q8mj-m7cp-5q26,
  GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, GHSA-6pq8-jhm2-2vcw) — **FIXED**: Express asked for 6.14.x; pinned to
  `^6.16.2` in `package.json` overrides, every copy is now 6.17.1, the app builds and is deployed.
  **Deferred (5 moderate):** `uuid` < 11.1.1 inside `node-telegram-bot-api` (GHSA-w5hq-g745-h8pq — a missing bounds
  check in v3/v5/v6 when a buffer is passed). The only automatic fix installs node-telegram-bot-api 2.4.1, an
  incompatible release from years ago, and the app never calls uuid v3/v5/v6 with a buffer. Revisit when that library
  ships a release on uuid 11.
- **Secret scan** of every line added since 840eb09f: clean.
- **Python side:** no new third-party package (PGlite's socket server is used by the load kit only, installed outside
  the repo).

## OWASP ZAP passive baseline — live site, after the deploy (22 Nov)
Plan `C:\Users\FSD\zap-tools\baseline-2026-11-22.yaml` (spider with form submission off, passive rules only; the new
and changed admin endpoints added to the start list). Result: `docs/security/zap-baseline-2026-11-22.json`.

| Risk | Finding | Count | Status |
|---|---|---|---|
| Medium | Content Security Policy header not set | 11 | Same as 15 and 19 Nov — deferred with its reason in `2026-11-15-settings-privacy.md` (a wrong policy would block the app's own scripts; it needs its own measured rollout) |
| Medium | A CSP directive with no fallback | 1 | Same, same reason |
| Info | Suspicious comments; modern web app; cache-control | — | Informational |

**No active scan:** there is no staging copy of the app, and an active scan fires real attack payloads, which must
never be aimed at production. The passive baseline and the companion checks above ran.
