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

## 0. THREE THINGS I RAISED ON 2026-08-20 — one was real, two were not (settled same day)

Recorded in full because **two of the three were my own measurement errors reported as platform
defects**, and the pattern that produced them will otherwise repeat.

| # | claim | verdict | what actually happened |
|---|---|---|---|
| 1 | The card's chart draws the still-forming bar, so every on-time alert looks a candle late | **REAL — fixed** | `_attach_chart` passed the raw feed to the renderer and `closed_only` appeared nowhere in `charting/` or `orchestrator/`. A card sent seconds after an H1 close drew the momentum candle SECOND from the right with a near-zero-range stub beside it. Trimmed now, unless the signal MARKS that bar. The order type still reads the raw last close — that is a trigger, not a level |
| 2 | The heartbeat is dead — 58 minutes stale while audit writes work fine | **NOT REAL — my error** | The `ts` I read as a stale heartbeat is `platformStatus.ts`, the Python **BOOT** timestamp from `/app/.signal_platform_status.json`. It matched my own deploy time. The heartbeat is written by every completed scan tick and was fine. **The real gap was that it was write-only** — read once at boot by `detect_downtime()`, exposed by no API — so neither of us could observe it, which is exactly why a boot timestamp got mistaken for it. Now returned by `/api/signal-platform/status` |
| 3 | Scan cycles occasionally take 174 seconds against a 5-second median | **UNPROVEN — my method could not support it** | Measured from gaps between `signal_events` rows, treating a >45s gap as a cycle boundary. Those rows are **throttled** (`STAGE_EVALUATED` is written only when strategy state changes), so a gap between them is not a tick and never was. Nothing in the platform measured tick duration, so the figure could be neither confirmed nor refuted. It is measured now — `platform_heartbeat.last_tick_ms`, plus a `SLOW TICK` warning naming the three slowest instruments whenever a tick overruns its interval |

**MEASURED AFTER DEPLOY, same day.** Eight consecutive production ticks: **11.5–12.5 s, median
12.0 s**, against a 30 s interval (London/NY overlap — the tightest the platform ever uses). ~40%
utilisation, comfortable headroom, no outliers. Item 3 is **closed**: the real median is 12 s, not the
5 s I claimed, and nothing resembling 174 s occurred.

## 0c. THE LATE SIGNAL HAD A CAUSE AFTER ALL — the 1HR feed was cached for 48 minutes

**Found 2026-08-20 by reading production logs, and it corrects an earlier "all clear" from me.**

`candle_cache._ttl_for` returned a flat `max(55, duration × 0.80)` — **2,880s on H1**. Right for bars
that have already closed (a finished bar never changes); wrong for the forming bar, and wrong for
noticing a bar has closed at all. A candle closing at 15:00 was seen whenever the copy next expired:
**anywhere from seconds to 48 minutes later**, because the 48-minute refresh cycle drifts against the
60-minute bar cycle.

**That intermittency is why one measurement cleared it and the user's experience did not.** I timed a
single delivery at 13.7s after the close and told him the platform was correct. One fast sample from
a process whose delay varies from 0 to 48 minutes proves nothing, and I presented it as proof.

Fixed: a copy never spans a bar close, and refreshes every ~55s through the last 6 minutes. New TTL
is always ≤ the old, so it can only make candles fresher. **How it was found is the transferable
part:** the pre-close warning fired zero times in its first hour, which is statistically normal — and
instead of accepting that, the question asked was *"can I prove the path is REACHABLE, not just
quiet?"* That question found a defect that had been live for months.

## 0b. THE PLATFORM WAS DOWN FOR 4h45m ON 15 AUGUST — nobody knew

`platform_downtime` held this the whole time and nothing surfaced it, because the heartbeat was
write-only (item 2 above):

> `down_from` 2026-08-15 **09:00:15 UTC** → `down_to` **13:45:25 UTC** — 17,109 s, *"heartbeat stale
> at boot (285.2 min)"*

**No signal could have been sent in that window**, on either strategy. The container logs from then
are long gone, which is exactly why that table exists — but it also means the CAUSE is not
recoverable now. Nothing to fix retroactively; the open question is whether this recurs. Now that the
heartbeat is exposed, `lastDowntime` on `/api/signal-platform/status` answers *"was it up when that
candle closed?"* in one request.

**BOOT ALERT BUILT the same day, at his request.** `startup_helpers.report_downtime` DMs the coded
private chat (`🛰️ S3 ⏫`) with the window, the length in plain words, and what it means. **It is not a
duplicate of the existing S3 alert** — that one fires from `write_status` on a boot *error*, so a
killed process or a dead container reports nothing at all, which is exactly why 15 Aug was silent.
No dedup needed: a crash-loop sees a fresh heartbeat and falls under the 300s threshold.

**The rule this is evidence for** (`~/.claude/CLAUDE.md`, "FIX THE UNDERLYING PROBLEM"): a number
produced by a harness I wrote is a claim about the harness until it is a claim about the platform.
Both bad calls here came from reading a value that was *available* rather than the value that was
*meant*. **What to do differently: before reporting a metric as a defect, name the exact field it
came from and what writes it.** Item 2 dies instantly under that question; so does item 3.

---

## 1. ~~Telegram signals carry NO CHART~~ — **DONE 2026-08-03**

Charts were **rebuilt from scratch** at the user's instruction (*"This is not just wiring but full
rebuilt because the existing may not be reliable"*). The orphaned `chart_generator.py` was deleted
rather than revived — it had no callers for months and nothing ever set `chart_path`, so it was
never exercised, and unexercised code is untrusted code.

New package: `charting/` — `theme.py` (Playfair + palette), `price_panel.py` (candles, generic
bands, the axis), `annotations.py` (everything drawn on top: risk/reward shading, level labels,
the marked candle, the projection arrow), `card_panel.py` (the text card), `signal_card.py` (public
`render` / `render_async`). Wired at ONE choke point, `strategy_runner._attach_chart`, covering both
the confirmed and the alert emit — not in the strategies, which return from ~7 places each and would
drift.

Both strategies render. `Signal.chart_bands` is a generic `(low, high, colour, label)` contract so
the renderer never learns what a supply zone is.

**REDESIGNED 2026-08-11** — the user, with a reference card: *"Can you make our chart card look
this cool"* and *"the arrow that shows expected price direction — style it properly."* What changed,
and the two real defects found while doing it:

- **Labels could sit on top of each other.** Every label was drawn at its own price with no regard
  for the others, so the tighter the stop the less readable the card: a 4.3-pip GBP/USD stop printed
  STOP, ENTRY and both prices in the same place. Labels are now spaced to a minimum 9.8% of the
  visible range and joined back to their true price with a hairline — **the lines never move, only
  the text.**
- **A band's name was thrown away.** Only a zero-height band ever drew a label, so BX's `4H SUPPLY`
  arrived on every card and rendered nowhere. Bands now share the one label column. A zone is named
  but shows **no** number — printing its midpoint would put a price on the card at a level that is
  not a level.
- Risk and reward are **shaded areas** now, not three bare rules; the arrow is heavy, opaque and
  drawn in the reserved margin to the right (i.e. in the future) so it can't be read as something
  price already did; the marked candle gets a soft filled column instead of a dashed ring that
  vanished once Telegram scaled the card down.
- Both were invisible to `test_signal_card.py`, which only asks whether a PNG came out.
  `tests/test_card_annotations.py` (33 checks) reads back what was actually drawn on the axis.
  Its first fixture spanned 19 pips and **passed with the anti-collision spacing set to zero** — a
  label collides relative to what is ON SCREEN, so the fixture now spans a realistic ~112 pips.

## 1b. npm audit — AUDITED 2026-08-03. 21 → 14. Two left, both assessed and accepted.

The first pass reported "21, all transitive under node-telegram-bot-api". That was **wrong** — it
was reading the summary rather than enumerating. Enumerated properly, they split by *reachability*,
which is the only thing that decides priority:

**FIXED — non-breaking (`npm audit fix`), 1 critical + 4 high:**
`shell-quote` (critical, but only under `drizzle-kit`, a CLI tool) · `axios` · `brace-expansion` ·
`postcss` · `undici`.

**FIXED — `sharp` 0.34.5 → 0.35.3 (HIGH, the one that actually mattered).** libvips CVE-2026-33327
/ 33328 / 35590 / 35591, and `sharp` processes **user-uploaded screenshots**
(`server/services/screenshotExtract.ts`) — attacker-controlled bytes reaching libvips. npm marks it
"breaking" only because 0.x minor bumps are semver-major; the five methods used (`metadata`,
`resize`, `jpeg`, `toBuffer`) are unchanged. **Verified by running the exact production call chain
on a real PNG**: libvips 8.18.3, 81698 → 51183 bytes, valid JPEG magic.

**ACCEPTED, NOT FIXED — 2 critical + 1 high:**

| pkg | why it stays |
|---|---|
| `request` (critical, SSRF) | transitive under `node-telegram-bot-api`. SSRF needs an attacker-controlled URL; every call goes to a hardcoded `api.telegram.org`. Fix = breaking bump of the library **every signal is delivered through**. |
| `form-data` (critical, weak boundary RNG) | same chain. Exploiting it needs injection into a multipart body we construct ourselves. |
| `vite` (high, path traversal in `.map`) | **devDependency**. The flaw is in the vite DEV SERVER; production serves static files through express and never runs it. Fix = vite 5 → 8, a large config migration for zero production exposure. |

Re-check `node-telegram-bot-api` when a non-breaking release lands. Do the vite 8 migration attended.

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
