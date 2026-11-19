# Security pass — DM-order exemption and engine settings on the admin page (19 Nov 2026)

**What was added:** two admin endpoints (`GET` / `PUT /api/admin/engine-settings`, `server/routes.ts`) that change
how the trading engine behaves — risk per trade, the largest order, which pairs and strategies autotrade may place —
and a change to which safety checks an order he decides must pass (`signal_platform/execution/guards.py`). Both can
move money, so they are the parts that matter.

## Findings

| # | Severity | What | Status |
|---|---|---|---|
| 1 | — | **Changing a setting without being admin.** Both endpoints sit behind `requireAdmin`. | **Measured live:** no login → 401; a forged token → 401 (GET and PUT) |
| 2 | — | **A harmful value saved** (risk 50%, 999 lots, a made-up pair, a script in a text box). Only names on the one list (`signal_platform/config/engine_settings.json`) are accepted; each value is checked against its kind and range before it is written (`server/lib/engineSettings.ts` `checkValue`), stored as plain text, and never executed. | Built in; 28 checks incl. the refusals (`server/lib/engineSettings.test.ts`, on PGlite) |
| 3 | — | **A bad value reaching the engine some other way** (a row written by hand). The engine checks the same list again and IGNORES a failing row, logging it (`config/live_settings.py` `get`). | Built in; tested (`tests/test_live_settings.py`, with teeth) |
| 4 | — | **The exemption widening too far.** An order he decides skips ONLY autotrade's strategies, pairs, sessions and cut-off. Demo-only, an honest size, the daily cap and one-trade-at-a-time still refuse it; a Confirm while trading is OFF places nothing. | Built in; tested (`tests/test_dm_exemption.py`, 25 checks with teeth) |
| 5 | — | **Who can make an order "his".** Unchanged: a Confirm press is accepted only from `WATCHDOG_CHAT_ID` (`server/services/tradeConfirmPress.ts`), and /level and Tradeable likewise only from his chat. | Unchanged; covered by their existing tests |
| 6 | — | **Database down → settings read as something unsafe.** Unreadable keeps the LAST GOOD read, never an empty or permissive value. | Built in; tested |
| 7 | Moderate ×6 (dependency) | `npm audit --omit=dev`: 6 moderate, 0 high, 0 critical. This change added no packages. The two deferred items are recorded in `2026-11-16-trade-switch-dm-confirm.md` (#7, #8). | Unchanged; deferred there with reasons |

## What was not possible
- **No active OWASP ZAP scan.** There is no staging copy, and an active scan fires real attack payloads, so it is
  not pointed at production. The code audit, the tests and the live access checks above stand in.
- **Secret scan** of the change: nothing found.

## Passive baseline (production-safe)
Plan `C:\Users\FSD\zap-tools\baseline-2026-11-19.yaml` — spider with form submission off, passive rules only, plus
direct requests to the two admin endpoints.

**Run 19 Nov 2026, against https://app.dorixe.com after the deploy** (`docs/security/zap-baseline-2026-11-19.json`):

| risk | finding | count |
|---|---|---|
| High / Critical | none | 0 |
| Medium | No Content-Security-Policy header | 11 pages |
| Medium | A CSP directive with no fallback | 1 |
| Informational | suspicious comments, modern web app, cache-control | 25 |

Both Medium items are the SAME as the 15 Nov baseline and stay deferred there with the reason and the plan
(`2026-11-15-settings-privacy.md`, the CSP row: a wrong policy would block the app's own scripts, so it needs an
origin inventory and a report-only rollout first). Nothing new came from this change; the 15 Nov Low item
(cross-domain script) no longer appears.

## Live check after deploy (19 Nov 2026)
- The engine read the breakeven setting from the database at boot (`[live_settings] auto_breakeven_enabled = 'true'
  (from the admin panel)`), both before and after the five Coolify variables were deleted.
- After the deletion and a redeploy: scanning ran (`tick complete … 6/6 instruments scanned`), no errors in the log,
  `/api/trading-signals` answered 200.
