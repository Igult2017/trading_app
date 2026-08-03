# Open Items — found, recorded, NOT fixed

## THE PHASE PLAN (agreed 2026-08-01)

Work is split so each phase finishes cleanly on its own. **Nothing below is urgent** — BX-S/D is
working and production is stable.

| phase | what | blocked on | risk |
|---|---|---|---|
| **1 — DONE** | Record every finding; delete 11 orphaned files; write the delete-dead-files rule; fix 2 runtime bugs | — | none, verified |
| **2** | `tsc` hygiene — raise `target` to `es2015`+ (clears 11 of 18), fix the remaining 7, then **add `tsc --noEmit` to the build** so type errors can never ship again | — | low; do it first, it is what hid the two bugs |
| **3** | Journal sidebar live data — add `bestTrade`/`worstTrade`/`totalFees` server-side, then point the sidebar at `/api/metrics/compute` | — | low |
| **4** | Unset `CTRADER_SYNC_*` in prod so new connects stop routing through the blocked app | **the user's Spotware reply** | medium — touches live auth |
| **5** | BX 94–115 pip stop tail | **live production data** — only act if it actually hurts | do nothing yet |

**Two decisions belong to the user, not to the next session:**
1. **Telegram charts** — restore them, or delete `charting/chart_generator.py` (item 1 below).
2. **Deploy** — `dfb38b7` (2 runtime bug fixes) and `c0a8b67` (11 deletions) are **pushed to GitHub
   but NOT deployed**. Production runs `f329e94`. Coolify does not auto-deploy on push. Both are
   verified safe but neither ships without an explicit instruction.

---


Everything below was **found by an audit and deliberately left**, either because fixing it is a
behaviour change the user has not asked for, or because it is pre-existing and out of the scope of
the change that surfaced it. Recorded 2026-08-01.

**Nothing here blocks BX-S/D.** It was verified green when this list was written: 7 test files pass,
160 real `BXStrategy.analyze` calls with **0 exceptions**, entries firing at 3R with correct cards.

> **Deleted from this list already:** the light theme. The user confirmed 2026-08-01 that it is
> working. It had been carried as "never verified by eye" — it has now been seen and it is fine.

---

## 1. ~~Telegram signals carry NO CHART~~ — **DONE 2026-08-03**

Charts were **rebuilt from scratch** at the user's instruction (*"This is not just wiring but full
rebuilt because the existing may not be reliable"*). The orphaned `chart_generator.py` was deleted
rather than revived — it had no callers for months and nothing ever set `chart_path`, so it was
never exercised, and unexercised code is untrusted code.

New package: `charting/` — `theme.py` (Playfair + palette), `price_panel.py` (candles, levels,
generic bands), `card_panel.py` (the text card), `signal_card.py` (public `render` / `render_async`).
Wired at ONE choke point, `strategy_runner._attach_chart`, covering both the confirmed and the
alert emit — not in the strategies, which return from ~7 places each and would drift.

Both strategies render. `Signal.chart_bands` is a generic `(low, high, colour, label)` contract so
the renderer never learns what a supply zone is.

## 1b. npm audit — 21 vulnerabilities, DELIBERATELY NOT FIXED

3 critical / 6 high / 11 moderate / 1 low, all pre-existing and all transitive under
`node-telegram-bot-api → request → …`. `npm audit fix` cannot clear them; it requires a **breaking
major bump of `node-telegram-bot-api`**, which is the library every signal is delivered through.

**Not fixed during an unattended deploy on purpose.** Breaking Telegram delivery is a worse outcome
than transitive CVEs in a server-side HTTP client that never parses untrusted input. Do this one
attended, with a delivery test straight after.

---

## 2. 18 pre-existing `tsc` errors

`npm run build` uses **esbuild, which does not typecheck**, so type errors ship. Two real runtime
bugs were hiding in this noise and were fixed 2026-08-01 (`PYTHON_BIN` unimported in `routes.ts`;
`getCalendarServiceStatus()` returning a flat shape the caller read as `.calendar`/`.rates`). The
remaining 18 are config-level:

| count | code | what |
|---|---|---|
| 7 | TS2802 | `downlevelIteration` — iterating `Map`/`Set` under an ES5 target |
| 4 | TS1252 | function declarations inside blocks under an ES5 target |
| 3 | TS2345 | `string \| null` passed where `string` is required |
| 3 | TS18047 | possibly-null (`supabaseAdmin`, `telegramNotificationService`) |
| 1 | TS2322 | drizzle insert type mismatch in `services/fmp.ts` |

**Why it matters more than it looks:** the noise is what let two genuine bugs sit unnoticed. Raising
`target` to `es2015`+ in `tsconfig.json` would clear 11 of the 18 at a stroke. **Run `npx tsc
--noEmit` as part of any Node-side change** — the build will not do it for you.

**Phase 2 finishes with the durable fix:** add `tsc --noEmit` to the `build` script. Clearing the
errors without that only resets the clock — esbuild still will not typecheck, and the next unimported
symbol ships exactly the same way `PYTHON_BIN` did.

---

## 3. Journal sidebar shows fixtures

Metrics / Calendar / Trade Vault panels render fixture data, not live data.

Source **decided**: `/api/metrics/compute`. 7 of 10 fields map directly; `bestTrade`, `worstTrade`
and `totalFees` must be added server-side first. See the `project-journal-sidebar-live-data` memory.

---

## 4. cTrader: production routes new connects through a BLOCKED app

The `CTRADER_SYNC_*` env vars are still set in production, sending new account connections to the
second cTrader app, which was **never approved and is blocked**. Unset the two vars and redeploy.

Scope is per-authorisation, not per-app, so **one app covers data AND copy** — the second app is not
needed. The user was contacting Spotware before changing app permissions; check that first.

---

## 5. BX-S/D — two known, measured, accepted

Both are in `docs/strategies/bx-sd-architecture.md` under KNOWN OPEN DEFECTS with full numbers.

- **The 94–115 pip stop tail.** `pullback_4h` takes the window's highest high as the move's extreme,
  so a deep fall followed by a rally back toward it puts the entry far from the stop. Measured on the
  full path: median 40 pips, **max 93.8 (EUR/USD) / 114.9 (GBP/USD)**. Not capped — the rule as
  stated is "15 pips behind the pullback" with no bound. **GBP/JPY is unmeasured** (no M1 history
  that deep) and looked widest of the three, so watch it first. If it needs fixing, take the extreme
  from the most recent **swing** rather than the window's global extreme — never an arbitrary pip cap.
- **`_RESPECT_BUFFER` is near-vacuous on the pullback path.** It tests that the confirming close sits
  25% of zone height inside the 4H zone — written when the entry WAS at the zone. A pullback entry
  away from the zone passes it trivially. Kept because it still does real work on the retap path.

---

## 6. Four BX files over the 150-line limit

`bx_sd_setup.py` 363 · `bx_sd_zones.py` 289 · `bx_sd_registry.py` 282 · `bx_sd.py` 196.

Pre-existing. `bx_sd_zones` splits cleanly (the marking techniques are one responsibility) but it is
imported widely, so it is a planned refactor, not something to do inside a bug fix.

---

## 7. Dead files — 11 DELETED 2026-08-01, one decision outstanding

The user's rule (now in the global rules): *"if a file is not needed anymore it is deleted. I dont
want dead and orphaned files, that is how hackers access a platform."*

**Deleted** (verified: no importer, no string reference, not a runnable script):

| file | why it was dead |
|---|---|
| `backtest_data.py`, `backtest_report.py`, `test_monthly_backtest.py` | import-guard stubs redirecting to `signal_platform/backtest/` — **a directory that does not exist** |
| `data/yfinance_client.py`, `data/mt5_client.py`, `data/ejtrader_ct_client.py` | `data_source.py` wires **cTrader only**; the "cTrader → MT5 → yfinance" fallback in `candle_fetcher`'s docstring never existed (docstring corrected) |
| `shared/adx.py`, `shared/market_condition.py` | no callers |
| `shared/session_clock.py`, `shared/session_phases.py` | no callers |
| `shared/session_api.py` | **orphaned BY the two deletions above** — the cascade the rule warns about, caught by re-running the audit after deleting |

Verified after: 7 BX test files pass, 160 `analyze()` calls, 0 exceptions, identical entries and
stop distribution to before.

**KEPT, and why:**
- `auth_setup.py` — a runnable script (`if __name__ == "__main__"`), i.e. an operational entrypoint.
  "Nothing imports it" says nothing about whether a tool is needed. The audit script now recognises
  `__main__` so it stops demanding the deletion of every tool in the repo.
- `charting/chart_generator.py` — **awaiting the user's decision on item 1.** If charts are not
  coming back, DELETE THIS FILE.

## Audit tooling

`scripts/audit_dead_code.py` — static reachability check: orphaned modules, unused imports, unread
constants, dead branches, files over 150 lines. Run it after any change that removes a caller.

**Its first version reported 28 live modules as orphaned** because it did not understand
`from core import delivery_ledger` (which imports a MODULE by name). A checker that cries wolf is
worse than none — it trains you to skim the list. Verify a detector before trusting its output.
