# OPEN — everything we have NOT addressed

**His instruction, 2026-08-25:** *"consolidate the issues we havent address so that we can address
them one at a time — a problem comes up we know where to look at."*

**This is the ONE list.** Before this, open items were spread across `open-items.md` (409 lines,
fixed and open items mixed together), the KNOWN OPEN DEFECTS section of the BX architecture doc
(where the id scheme had collapsed — `0u`, `0v`, `0y` and `0z` each appeared **twice**, meaning two
different defects), the VIX.1 docs, and a dozen memory notes.

## How to use it

- **Ids never change and are never reused.** When something is fixed, strike it and date it here —
  do not delete the row and do not renumber.
- **Every row says WHERE to look.** That is the whole point: a problem comes up, you open this file,
  you know which file to read.
- **"Verified" means I checked it today.** "Carried" means it comes from an older doc and I have
  **not** re-checked it — treat those as claims, not facts, and verify before acting.
- Nothing here is urgent unless marked 🔴. Production is running.

---

## A. Supply & demand zones (BX-S/D)

### A1 — The two Telegram cards can't actually collide. ⚠ I OVERSTATED THIS — corrected 25 Aug
**Not a live defect.** I first wrote this as 🔴 *"one tap can fire both the stand-aside card and a
real entry"*, having checked that the `role` divider was gone from both sides but **never checking
whether anything else kept them apart.** Something does.

**The chain, all four links read and then tested:**

| step | file:line | what it establishes |
|---|---|---|
| 1 | [`bx_sd_registry.py:401`](../signal_platform/strategies/bx_sd_registry.py#L401) | a zone is only labelled `decisional` if `respected_at` is set |
| 2 | [`bx_sd_registry.py:554`](../signal_platform/strategies/bx_sd_registry.py#L554) | `respected_at` is only ever stamped together with `state = "respected"` |
| 3 | [`bx_sd_registry.py:575`](../signal_platform/strategies/bx_sd_registry.py#L575) | once respected, always respected — it only leaves that state by breaking |
| 4 | [`bx_sd_setup.py:309`](../signal_platform/strategies/bx_sd_setup.py#L309) | the entry path's FIRST gate takes only `unmitigated` or wick-only zones |

So **decisional ⟹ respected ⟹ the entry path skips it at its first line.** Tested on both live
books: **0 zones satisfy both paths**, and every `decisional` zone is in state `respected`.

**What IS real, and why this row stays open:** the guarantee is **accidental**. It rests on two
unrelated rules happening to line up, and the comment that documented the *intended* divider was
false for six days — so the next session reading `bx_sd_reports.py` was told the wrong mechanism.
Either of these would re-open the collision without anything failing loudly:
* labelling a zone `decisional` before it has been respected, or
* letting the entry path take a `respected` zone.

**Fix when convenient:** a test asserting no zone can satisfy both paths, so the guarantee stops
being a coincidence and starts being enforced. **Low priority — nothing is broken today.**

### A2 — What happens when the 4H is going sideways is MY decision, not his
**Verified 25 Aug.** His definition of an extreme zone covers price swinging **up** and **down**.
When the market is going sideways there is no "above it" to point at, so I coded it as: **no new
extreme candidate opens** while ranging (a zone already respected keeps its status).
**Where:** `signal_platform/strategies/bx_sd_extreme.py`, `extreme_candidate_at`.
**Why open:** he never ruled on it, and **how often the 4H reads sideways has not been measured.**
**Needs from him:** a ruling — or approval to measure it first.

### A3 — Signal 1 will fire less often now, and by how much is unmeasured
**Verified 25 Aug.** Signal 1 gained two tests it never had: the zone must stand against the swing,
and price must have swept liquidity to reach it. Both will cut how often it fires. The one-year
baseline is 4.9 signal 1 / 0.6 advisory / 7.3 signal 2 per month
([bx-sd-measured.md](./strategies/bx-sd-measured.md)).
**Why open:** measuring it is a **frequency backtest**, and backtests need his explicit approval
every time. Plan approval is not backtest approval.
**Needs from him:** "run it".

### A4 — `test_aug03_regression.py` is red, and two of its assertions pin something I invented
**Verified 25 Aug** (confirmed red *before* any of this week's work, by stashing). 3 of 6 assertions
fail. Two assert a "16 Jul zone he drew" — **no such zone exists**; I traced it to a test label I
wrote on 3 Aug and then repeated into three doc places.
**Where:** `signal_platform/tests/bx_sd/test_aug03_regression.py`.
**Why open:** a test that pins a fabricated fact is worse than a red test, because the next session
will bend the *code* to satisfy it. I will not quietly delete his regression test either.
**Needs from him:** delete those assertions, or keep the file red.

### A8 — ~~The mitigation heads-up contradicts its own comment~~ CONFIRMED and corrected 25 Aug
**Settled by reading production, not by reasoning.** `bx_sd_reports.py` carried the comment *"a
heads-up is not a signal -> admin DM, never the channel"*. **It was false, and had been for as long
as the current settings have held.** The card sets `to_channel = True`, and the alert path routes on
exactly that — the `_watch` suffix only forces the DM on the *confirmed* path, which this card never
takes because it is an alert.

Production, read from Coolify 25 Aug: `SIGNALS_DM_ONLY=true`, `DM_ONLY_EXEMPT` **not set** so the
default `"bx_sd,vix1"` applies and BX is exempt. That makes the branch
`to_channel and (not dm_only or exempt)` reduce to `to_channel` — **true**. So the heads-up has been
going to the **public channel** all along.

**Comment corrected.** The suffix stays because it does real work as the dedup namespace; only the
claim about routing was wrong. Moot for routing now that everything BX is public, but it would have
misled the next session the moment `CHANNEL_ALL` was turned off.

### A9 — SIXTEEN production environment variables are stored WITH quote marks, and 19 keys are duplicated
**⚠ MEASURED 30 Aug AND IT IS FAR WIDER THAN THIS ENTRY SAID.** When it was written on 25 Aug it
named ONE variable. A full scan of all 47 while adding the autotrade switches found:

* **16 values stored with quote marks**, every one flagged `is_literal` — including
  `CTRADER_ACCESS_TOKEN`, `CTRADER_REFRESH_TOKEN`, `CTRADER_ACCOUNT_ID`, `COPY_ENCRYPTION_KEY`,
  `TELEGRAM_API_HASH`, `WATCHDOG_CHAT_ID`, `COPY_DRY_RUN` and `AUTO_BREAKEVEN_ENABLED`.
* **19 duplicated keys.** Most duplicates are identical and harmless. Four are NOT:
  `WATCHDOG_CHAT_ID`, `COPY_DRY_RUN`, `AUTO_BREAKEVEN_ENABLED` and `SIGNALS_DM_ONLY` each have one
  clean copy and one QUOTED copy — so which one wins decides the behaviour, and nothing here says
  which does.

**Re-confirmed by test, not assumed:** a quoted boolean does not merely misparse, pydantic
**rejects it outright** with a ValidationError. Settings are read at import, so the app would fail
to START rather than fall back to a default.

    env='true'    -> True          env="'true'"   -> REJECTED, ValidationError
    env='false'   -> False         env="'false'"  -> REJECTED, ValidationError

**It still works today** — the platform is running and beating — so the clean copies must be the
ones reaching the container. **That is inferred from the app booting, not observed; the container's
own environment is not visible from here.**

**Deliberately NOT fixed while adding the autotrade switches on 30 Aug.** Cleaning 16 values and 19
duplicates is a large change to live production config, well beyond what was approved, and his
standing instruction is that the signal platform matters more than any feature. The three new
variables were added clean (`is_literal=False`, no quotes) and nothing existing was touched.

**Original 25 Aug note, still accurate for its one variable:** `SIGNALS_DM_ONLY` is stored in
Coolify as **six characters** — `'true'`, quote marks included — and flagged `is_literal` (pass
through unchanged).

**It works today.** The app is running and scanning with no error, so the quotes are being stripped
somewhere between Coolify and the container. **That is inferred from the app booting, not observed —
I cannot see the container's own environment.**

**Why it is worth recording anyway:** tested locally, `'true'` with quote marks does **not** parse —
it raises a validation error, and settings are read at import, so the app would fail to start rather
than fall back to a default. It is one behaviour change in the platform away from a boot failure,
and the failure would look like a crash-loop with no obvious cause.
**Fix:** re-save the value as `true` without quotes. One `PATCH` call, applies on the next deploy.
**Needs from him:** approval to change a live production setting.

### A5 — In 3 of 19 turns, the reaction leaves no zone behind for signal 2 to enter
**Carried** from 23 Aug, plan written and deliberately closed unbuilt. His rule is already recorded:
*"where there is no zone left behind by the reaction…"* — see the BX architecture doc.
**Where:** `signal_platform/strategies/bx_sd_lineage.py` (`child_of`).
**Why open:** it is a feature, not a bug fix, and he has not asked for it.
**Note:** originally reported by me as **5** events; the real number is **3**.

### A6 — The Smart Risk document's own definition of a change of character is not built
**Carried.** The document defines it as a close through the major swing **and** the latest opposite
zone. The engine BX uses to *build* zones is the same one that would have to answer this, so making
it zone-aware is circular.
**Why open:** blocked on a design decision, flagged rather than guessed.

### A7 — Nine BX files are over the 200-line limit
**Verified 25 Aug.** `bx_sd_registry` 586, `bx_sd_setup` 577, `bx_sd_signal1` 340, `bx_sd_zones` 336,
`bx_sd_lineage` 312, `bx_sd_liquidity` 277, `bx_sd_reports` 268, `bx_sd` 267, `bx_sd_entry` 234.
**Correction:** the old doc said *"four BX files over the 150-line limit"* — both numbers were stale.
**Why open:** splitting files that are actively being changed invites regressions; do it when an area
goes quiet.

---

## B. VIX.1

### B1 — The trend flips about 90 times a year, not the 9–10 its own note claims
**Carried** from 15 Aug. Median run 1.6 days. Not a coding error — a consequence of reading the trend
in real time with no "major swing" filter. The table in the doc is stale: it was measured the day
*before* real-time turns shipped.
**Where:** see [strategies/vix1.md](./strategies/vix1.md).

### B2 — The 1-minute entry is mid-rebuild
**Carried.** Do not design it and do not patch the old one — his rules are pending. The audit is in
the VIX.1 docs, including: the stop-level search blocks every entry for ~8 minutes after a momentum
candle, and the fall-back path is unreachable.

---

### B3 — A change of character sets the trend to NOTHING, not to the new direction

**Verified in the code.** `vix1_trend.py` — when price closes through the protecting level, it sets
`st.pending = -1/+1` **and `st.direction = 0`**. So between the turn and its confirmation the strategy
has no trend at all, rather than the new one.

**His rule says otherwise:** *"the CHOCH logic is the only logic responsible for change of character
and the trend logic must obey it at all time."*

**MY EVIDENCE AGAINST CHANGING IT IS WITHDRAWN.** I measured raw direction drifting 48% of the time
(a coin flip) and recommended against the change on that basis. That measurement was worthless: the
strategy never trades raw direction. **Needs either his ruling or a test of what actually trades.**

### B4 — The 8-bar pullback gate is never consulted on the change-of-character route

**Verified:** the gate does not appear in `vix1_choch.py`, and that route returns before the normal
route's gate is reached.

**This may well be correct.** That route exists precisely to trade early *without* waiting for a
pullback, so adding the gate would make it stricter — the opposite of its purpose. **His call, not
mine.** Listed so it is a decision rather than an accident.

### B5 — 94 sell setups a year produce nothing while the buy side trades 281 times

**Measured over one year through the real `detect_bias`, both pairs:**

| | bars with a **down** turn pending | of those, a SELL momentum candle | produced a trade |
|---|---|---|---|
| GBP/USD | 337 | 44 | **0** |
| EUR/USD | 476 | 50 | **0** |
| | **up** turn pending | | |
| GBP/USD | 540 | | **128** |
| EUR/USD | 644 | | **153** |

**This is his own 25 August rule working exactly as specified** — a turn DOWN must run, pull back and
turn back down first, and a turn UP need not. Nothing is broken. **The open question is only whether
he wants the asymmetry at that size**, now that it has been counted.

### B6 — About 1% of cases anchor the 8-bar gate to the wrong turn

Measured, **not diagnosed**. It errs on the safe side (it refuses rather than allows) and the cause is
unknown. Recorded so it is not rediscovered as new.

### B7 — ~~The gold notification case cannot be replayed~~ CLOSED 29 Aug

Real XAU/USD, GBP/USD and EUR/USD H1 bars were pulled from the broker (read-only, demo, token never
refreshed) and now reach **28 Aug 20:00**. Validated on arrival: 0 duplicate timestamps, 0 malformed
bars, no gap longer than a weekend.

**Both of his events replay correctly.** The gold card is refused on the real hour, and for the
reason claimed: the trend was DOWN and the candle's close (4656.87) never reached the level
protecting that downtrend (**4696.78** — the broken fixture had read 4403.72, $255 too low). The test
is restored as the real event, with a guard that the file must REACH the hour rather than merely be
long enough — the absence of that check is what let it run for three days on a six-day hole.

### B8 — The 8-bar gate change was credited to a case it never touched

`test_leg_gate_obeys_choch.py` justified itself by his GBP/USD case of 26 Aug 15:00. **That was
written against a file ending 10 August — 16 days before the event it described.** On real bars the
gate is never consulted at that candle: the trend before it was UP and the candle was a SELL, so the
pro-trend rule refuses it first, and the gate's verdict is identical with and without the change.

**The change still earns its place** — over the last 2,000 bars (~4 months) it changes the gate's
verdict on **134 of the 1,859 bars where the gate is actually consulted (7.2%)**. The docstring now
says that instead. Nothing to fix in the code; recorded so the false justification is not re-quoted.

### B9 — The metrics engine's own self-test has two red checks, and has had for a while

`python server/python/metrics_calculator.py --test` fails on **"missing pnl → None"** and
**"strategy SB present"** (the second then throws `KeyError: 'SB'` and stops the run early, so
anything after it never gets checked).

**Not caused by the monthly work of 2026-08-29** — verified by running the same self-test on the
committed version before those changes and getting the identical two failures. Recorded because a
red self-test that everyone steps around is how a real regression gets missed: the next person to
break something here will see two failures and assume they are the usual two.


### B13 - Tick-built candles: 4 of 5 instruments proved EXACT; serving built, switch OFF

**Opened 30 Aug. Measured 30 Aug, built 31 Aug. The switch stays off until a BUSY session is watched.**

⚠ **I reported this as a failure on 30 Aug. That was wrong.** My watcher only captured log lines
containing the word "MISMATCH", so every line I saw was GBP/JPY, and I generalised it to all five
instruments. The scoreboard was in the same log and said the opposite:

| instrument | bars matched exactly | verdict |
|---|---|---|
| EUR/USD | **200 / 200** | exact |
| GBP/USD | **200 / 200** | exact |
| USD/JPY | **200 / 200** | exact |
| XAU/USD | **200 / 200** | exact |
| GBP/JPY | 0 / 200 | every bar 0.005 low |

**Every instrument VIX.1 trades** (EUR/USD, GBP/USD, XAU/USD - `vix1.py:114`) **is proved exact.**
GBP/JPY is BX-S/D only.

**The GBP/JPY difference is a CONSTANT, not noise.** All 3,120 individual price comparisons
(780 bars x 4 prices) differ by exactly 0.005 - minimum 0.005, maximum 0.005, one unique value. So
the candle SHAPE is right and only the level is shifted by half a pip. That rules out dropped ticks
(which give random wrong highs and lows) and rules out my bid/ask theory (if the broker's bars were
ask or mid, EUR/USD would be shifted by its spread too, and it is dead-on; the price side is chosen
explicitly by FIX tag 269, `fix_wire.py:62`).

**Cause NOT established.** Three candidates, none tested: the two connections may not be quoting the
same account (price feed logs in as `5296567`, data as `47535363`); a fixed per-symbol markup; or
the instrument number (7) being wrong. Until one is proved, GBP/JPY is simply not trusted - which
costs nothing, because trust is per symbol.

**What is now BUILT (31 Aug):**
* `data/tick_serving.py` - appends the bars the broker has not published yet onto the ones it has.
  Three locks, all required: the switch, per-symbol trust, and an **unbroken join** (a gap between
  the broker's newest bar and ours is refused outright, because a hole in a candle series is
  invisible to every indicator downstream).
* **M1 and H1 both.** H1 matters because that is where the complaint began - *"the delay begins from
  1HR momentum candle"* - and the hourly bar is served natively by the broker, so nothing in the
  scan-on-close work touched its 10-70s delay. An hour is only ever built from **sixty whole
  minutes**; `candle_aggregator.aggregate` drops any incomplete bucket, so a partial hour cannot
  become a level.
* The switch: `TICK_BARS_SERVE_ENABLED`, **default false**. Turning it on does not turn it on for
  everything - per-symbol trust still applies, so GBP/JPY keeps using broker candles regardless.
* 21 checks in `tests/vix1/test_tick_serving.py`, including two TEETH cases.

**Already live, and it is NOT the same thing:** scanning the instant a minute closes
(`monitor/entry_watcher.py:88`) has been running since 30 Aug and is not gated on trust, so
**GBP/JPY already gets that half of the win**. It removes the wait for the next scheduled scan. It
cannot remove the broker's 10-70s publication delay - only serving our own bars does that.

**READ 31 Aug, 45 minutes of live log after the deploy — and it found a flaw in the SCOREBOARD:**

* **The same minute was being scored over and over.** `_audit_against_ticks` re-compares every
  overlapping bar on every M1 fetch, and `compare()` counted each one, so the "200" window was 200
  COMPARISONS, not 200 bars. GBP/USD read `183/200` then `193/200`, which looks like 7-17 separate
  failures; there was exactly **ONE** bad minute (22:47), re-scored until it filled a twelfth of the
  window. It flattered the good side just as much: a `200/200` was roughly **33 real minutes counted
  six times each**, so `MIN_SAMPLE = 30` could be satisfied by about five minutes of evidence.
  **Fixed** — every minute is now scored once (`tick_bar_audit.compare`, `last_scored`), which is
  what the constant's own comment always claimed it did.
* **⚠ So the "200/200 exact" I reported is weaker than it sounded.** It is real evidence and it is
  still four instruments matching to the last decimal — but it is tens of distinct minutes, not two
  hundred. The busy-session watch matters more than ever.
* **GBP/USD produced its first genuinely wrong bar** — 22:47, and **only the OPEN**, by 0.00002
  (0.2 pips); high, low and close were exact. The open is the first tick of the minute, so this
  looks like a dropped first tick — precisely the failure this gate exists to catch, and it caught
  it: trust was withdrawn automatically.
* **GBP/JPY unchanged** — 41 consecutive minutes, every one exactly 0.005 low. Same constant.
* **The unpinned credential read I flagged on 30 Aug did NOT recur.** Every read in this window
  carried `?ctrader_id=47535363`. Treating that as a one-off from the earlier boot, not a live
  defect — I have not traced what produced the original line.
* The boot probe timed out once at 22:43 (EUR/USD H1, 20s) and self-healed; the platform scanned
  normally for the rest of the window.

**BEFORE THE SWITCH IS FLIPPED:** the 200/200 runs came from the **Sunday-night open, the thinnest
market of the week**, and the way this fails is dropped ticks under heavy traffic. Watch a full
London or New York session first. The design withdraws trust automatically on a single wrong bar,
but that should be seen holding under load rather than assumed.

### B12 — ~~Nothing records how late a signal is~~ FIXED 30 Aug — and one claim in this entry was WRONG

**`signal_events` was NEVER empty.** This entry originally said it was. The admin endpoint defaults
to `created_at > now() - interval '1 day'` and I queried it with no `since` on a weekend when the
market had been shut since Friday 22:00. **My window was empty, not the table** — it holds 1000+ rows
going back through Friday. The recorder (`observability_repo.record`) has been working all along and
is called from five places. Correcting it here because a wrong "there is no data" is exactly the kind
of claim that stops the next person looking.

**What was genuinely missing** was one number: how stale the data was when a signal was built.
`orchestrator/lateness.data_lag` now stamps it onto the BUILT row as ` lag=42s(M1)` — seconds between
the freshest CLOSED bar closing and the signal being built, on the FINEST timeframe the strategy
holds, which is the one the entry is read off.

**Read it back:** `ADMIN_SECRET=… python signal_platform/tools/signal_lag.py "7 days"` — median,
worst, how many exceed 20s, and the slowest ten.

**WHAT THE NUMBER IS NOT.** It is the platform's OWN delay only. A 1M entry legitimately takes
minutes to form and that waiting is not in it — so a small lag beside a late-feeling signal means the
strategy was waiting, not that we were slow. The tool says so in its own output, and it reports rows
carrying no stamp separately rather than averaging over an unknown denominator.

**Before this shipped the delay was 30–60s by design** (the scan landed wherever it landed).
Scanning on the bar close should put the median in single figures — but that is a prediction, and
the point of the stamp is that it will shortly be a measurement instead.


### B11 — ~~Autotrade STILL cannot place an order~~ FIXED 30 Aug — the order path now has its own socket

**Fixed by rewriting `execution/broker.py` onto this platform's own asyncio connection, and split
into `execution/connection.py` (getting an authenticated socket) + `broker.py` (the conversation).
Twisted is gone from the order path entirely.**

**Proved on the live demo account, not just in tests:** `place_stop("GBP/USD", …)` → accepted,
re-read off the broker showing `stop=1.349 SL=1.352 TP=1.343`, cancelled cleanly. The slashed symbol
resolves, and stop and target are attached in the same message.

**The isolation he asked for is proved, not asserted.** His condition was *"if it will bring the
signal platform down just drop it. But if it is stand alone, it is approved."* An order was placed
and cancelled WHILE the scanner fetched candles on its own connection: **6/6 fetches correct, no
misalignment.** That test deliberately recreates the 2026-08-21 outage — one execution-event push on
the shared socket desynchronising the candle stream — and it no longer happens, because order pushes
land on a different socket. `test_execution_placement.py` also asserts on the syntax tree that the
order path never calls `get_connection()`, never refreshes the shared token, and imports no Twisted.

**Two further defects were found by testing rather than reading, and both are fixed:**

* **A single timeout budget was wrong.** Opening a fresh socket was measured at **15.4s** on a slow
  link; under one 20s budget covering connect + auth + the 1,938-symbol list + the order, a slow
  CONNECT alone consumed nearly all of it and the order timed out **having never been sent** — while
  reporting "state UNKNOWN", the most alarming message the path can produce, for an account nothing
  had been sent to. Now three budgets, and a failure before the request is written says **"not
  sent"** — a fact — while UNKNOWN is reserved for a request that really did go out.
* **A refusal was being ignored.** cTrader answers a bad order operation with `ProtoOAOrderErrorEvent`
  (payload **2132**), which is NOT the generic error type the code handled. Cancelling an order id
  that did not exist sat for **22.3s** and returned UNKNOWN; it now answers in **2.5s** with
  *"ORDER_NOT_FOUND Order not found with id 999999999"*. The same path carries insufficient margin,
  a bad price and a closed market — so every one of those was previously a 22-second false alarm.

**Still true, and it is the one that matters:** autotrade has never placed a real signal. See B10.

**Found 30 Aug by the end-to-end step of the B10 fix — the two defects there were real and are
fixed, and they were not sufficient.**

`execution/broker.py::_run()` builds a `ctrader_open_api.Client` and calls `startService()`. That is
Twisted, and Twisted needs a reactor running. `copy_platform/main.py:13-15` installs one, with the
comment *"MUST install asyncio reactor before any other twisted import"*, and runs it at line 45.
**`signal_platform/main.py` contains no twisted, no reactor, no asyncioreactor** — it runs plain
asyncio (`main.py:163-164`).

**Measured, not inferred:** with the callbacks instrumented, `_on_connected` never fires at all — the
socket is never opened. `place_stop` times out at 20s and correctly reports the order state as
UNKNOWN rather than failed; reconcile after every attempt confirmed nothing was placed. Installing
the reactor in a test script did **not** fix it on its own, so "just install a reactor" is an
unconfirmed hypothesis, not a diagnosis.

**This also affects `execution/breakeven.py:109`**, which moves a live stop through the same client.
So the breakeven feature has the same problem: it has never run either.

**The root cause is one sentence, and it is the same one as B10.** `execution/` was written by
copying copy_platform's approach rather than using the signal platform's own —
[`broker.py:22`](../signal_platform/execution/broker.py#L22) says so: *"Mirrors the copy executor's
proven lifecycle."* Proven inside copy_platform, which supplies the path, the bare imports and the
reactor it needs. None of those exist here.

**The fix is a decision, not a detail, so it is his:** either install a Twisted reactor in the
signal platform's startup (small diff, large blast radius — it rewires the event loop under the scan
loop, the monitor, APScheduler and the dispatcher, to serve a feature that is switched off), or make
`StopOrderClient` use `data/ctrader_session.py`, the pure-asyncio connection this platform already
owns and which placed `orderId 358160376` tonight with both protective legs attached. The second is
the same "reuse what we own" shape as the B10 fixes, but it rewrites the transport of the code that
changes his account, so it needs its own plan.

**Not yet known:** whether Linux changes the outcome. Production is Linux; my measurements are on
Windows, where the default event loop is additionally incompatible with Twisted's asyncio reactor.
The "no reactor is installed" fact holds on both; the rest I have not tested in production.


### B10 — ~~Autotrade could never have placed an order~~ PARTLY FIXED 30 Aug (see B11)

Two defects on the order path, both dormant behind the kill switch, both fatal the moment it was
turned on. `execution/broker.py` imported its host and port from `copy_platform`, which is not
importable from production's working directory; and `execution/orders.py` used copy_platform's
`resolve_symbol_id`, which has no rule for a slash and so returned `None` for every instrument this
platform trades. Fixed by using what the signal platform already owns. Full account in the
`vix1.md` fix log.

**These two fixes are necessary but NOT sufficient — B11 above is the third defect and it is still
open, so autotrade remains unable to place an order.**

**And beyond all three: autotrade has still never placed an order.** The account and credentials are
proved — an order with stop and target attached was accepted on the demo account — but no VIX.1
signal has ever reached a broker, so there is no fill quality, no slippage figure and no live
outcome. `placer.fill_report` exists precisely to measure the gap between the modelled entry and the
real fill, and it has never run. **Nothing here says the strategy is worth arming.**


## C. The web app

### C1 — ~~18 TypeScript errors, and the build does not typecheck~~ CLOSED 26 Aug
**0 errors, and the build now refuses new ones.** `npm run build` gained `npm run check` (a `tsc`
script that already existed and nothing called), placed **before** the bundlers so a type error stops
the build instead of producing a bundle nobody checked. **Proved by breaking it on purpose:** a
deliberate type error made the build exit 2 and vite never ran.

**11 of the 18 were one missing line.** `tsconfig.json` set **no `target` at all**, so TypeScript
assumed 2009-era JavaScript while `lib` was already modern. (Measure this with `--incremental false`
— the build cache serves stale results and made the first attempt look like it changed nothing.)

**`useDefineForClassFields: false` was pinned alongside it, and that mattered.** At ES2022 the flag
defaults to true and changes class-field behaviour at RUNTIME, and esbuild honours it. **Measured
A/B with only that flag differing: 649,326 vs 648,950 bytes** — so without the pin, raising the
target would have silently changed the shipped server bundle.

**Two real behaviour changes**, both improvements, both deliberate:
* [`routes.ts:2184`](../server/routes.ts#L2184) — the notification-status endpoint called a service
  that can be null. A muted Telegram made it throw, and the catch returned **HTTP 500** — the very
  fact the caller was asking about is what made it fail. It now answers `telegramBotActive: false`.
* [`signalScanner.ts:376`](../server/services/signalScanner.ts#L376) — the same unguarded call, on a
  path `index.ts` and `index.prod.ts` both start via the scraper scheduler. A muted bot turned every
  saved signal into a thrown error, logged as *"Error saving signal"* — **naming the wrong thing**,
  since the signal HAD saved and only the notification failed. Now guarded, and the log says which
  half happened.

**⚠ I ALMOST DELETED A LIVE FILE.** The plan called for deleting `signalScanner.ts` as an orphan, on
a repo-wide search that returned one match — itself. **That search was wrong.** `scrapers/scheduler.ts`
imports it and calls `scanMarkets()` twice, and both server entry points start that scheduler. Caught
by re-checking at delete time, which the plan required precisely because a search is not proof.

The other four were ordinary: a guard that did not survive into an async callback, a Map key used
before its null check, ten fields missing from an object that claimed a type, and a `videoUrl` the
related-posts list never set.

**NOT verified: a full local boot.** This machine has no database, Redis or Supabase credentials, so
the app loads its modules and then blocks on infrastructure that is not here. Typecheck, build and
the module graph are verified; the running app is not.

### C2 — The journal sidebar shows made-up numbers
**Carried.** The data source is decided (`/api/metrics/compute`); 7 of 10 fields map, and
`bestTrade`, `worstTrade` and `totalFees` must be added server-side first.

### C3 — Past journal entries may have profit/loss recorded wrong
**Carried, needs his data.** Cannot be confirmed without him identifying an affected trade.

### C4 — The legal pages need a rewrite
**Carried.** The governing-law clause names no law, and there is no risk / not-advice disclaimer
anywhere. Blocked on one question: does copy trading auto-execute on a user's account?

---

## D. cTrader & copy trading

### D3 - ~~Any user's account could become the signal platform's credentials~~ FIXED 30 Aug

**He reported it: *"add account has not been isolated and it normally disrupts signal platform's
connection."* He was right, and I had audited the wrong half** - the copy ENGINE is correct
(separate process, own watchdog, own broker connection, resolves credentials per
`broker_account_id`) and is untouched. The coupling was on the Node side.

**Root cause, one line.** `/api/internal/ctrader-credentials` selected
`ORDER BY updated_at DESC` with **no filter on `broker_accounts.user_id`** - "whichever cTrader
account was touched most recently" is not an identity.

**The trigger was routine activity, not adding an account.** `storage.updateBrokerAccount`
(storage.ts:938) and `updateBrokerAccountSyncStatus` (storage.ts:956) both stamp `updated_at`, and
they are called from **twelve places** - every connect, every sync start and finish, every balance
read, every account edit. So any user syncing their own account became the platform's credentials.

**And it landed within ~3 minutes with no restart:** `ctrader_session.py:131` re-reads the token
every ~3 minutes, `node_bridge` passed no account identifier on that call, and the account we
authenticate AS is fixed at boot. Token from B, identity as A - cTrader rejects it, crash-loop.

**A SECOND enforcement point** a narrower fix would have missed: `healthWatchdog.ts:65` ran the
identical query with `LIMIT 1`, so it would have kept a stranger's token fresh while the pinned
one expired.

**Fixed:** `CTRADER_SIGNAL_ACCOUNT_ID=47535363` names the account by its cTrader NUMBER (which
survives delete-and-reconnect; the row id does not). The endpoint takes `?ctrader_id=` and returns
that row's token, type and id **together**, so they cannot disagree - which was the original
crash-loop's cause. Missing pin -> 404, dead token -> 409; it never substitutes another account.
All four credential reads pass it, plus the watchdog. Unset = old behaviour, with a warning.

**Verified against a baseline captured before deploy:** a bogus pin returned the REAL account and
HTTP 200 before; it returns 404 now. Production boot log shows
`?ctrader_id=47535363` on every read.

### D4 - ~~Autotrade refused every order: the guard read a field the endpoint never sent~~ FIXED 30 Aug

Found while fixing D3. The endpoint returned only `is_live`, but `execution/account.py:58` reads
`environment` or `account_type` and falls back to `"live"`. **Neither field existed**, so the
demo-only guard computed `"live"` and refused every order - with autotrade switched ON. It failed
safe, not dangerously, but it did not work and I would have reported it armed.

Both field names are now returned. Verified on production: `account_type='demo'`, and
`execution/account.py` computes `'demo'` - so the guard permits.

**Second time in one day for this shape of bug** (the first was the FIX account id): two sides of
an internal boundary disagreeing about a field name, failing silently. Worth a habit - when one
side reads a field, assert the other side sends it.


### D1 — Production routes new account connections through a BLOCKED app
**Carried.** The fix is to unset two `CTRADER_SYNC_*` environment variables and redeploy.
**Blocked on:** the Spotware reply.
**Where:** [ctrader-open-api-apps.md](./ctrader-open-api-apps.md).

### D2 — ~~An orphaned copy master logs "broker account not found" every 30 seconds~~ FIXED 30 Aug — but the fix had a defect, corrected 31 Aug
**Carried** from 30 Jun. The engine now deactivates a master whose broker account is gone, which
ends the noise permanently and is reversible from the UI.

**The fix as first written was wrong — see D5.** It deactivated MT5 masters too.

### D13 - ~~Three Telegram masters logged every 35 seconds, for ever~~ FIXED 31 Aug
**Read from 45 minutes of live log, 31 Aug: 228 lines** — three unconfigured Telegram masters
(`735f444b…`, `fa3da8e4…`, `7ffe8368…`) each printing *"no active source/channel — skipping"* on
every reload. `_load_masters` runs every 60s and the supervisor calls it again every 90s.

Exactly the noise problem D2 was about, in the branch D2 did not cover. Now said **once per master**
(`engine._quiet_telegram`), and re-armed if that master ever starts working, so a later outage is
still reported. Noise at that scale is not harmless — it is what a real fault has to be spotted
among, and these three lines were 15% of everything the platform logged.

### D5 - ~~The engine switched off MT5 providers it does not even run~~ FIXED 31 Aug 🔴
**Mine, introduced 30 Aug by the D2 fix.** The deactivation branch was placed **before** the test
for whether the engine owns the master at all.

MT5 masters have no `broker_account_id` **by design** — they link through `account_id` →
`copy_accounts` and are run by a **separate external bridge**, which fetches its work from
`/api/internal/active-providers` filtered on `is_active = TRUE`. So the engine saw "no broker
account", called it an orphan, and switched off a provider it does not run and cannot see. Nothing
failed loudly; the trades would simply have stopped. Not confined to old rows either —
[`routes.ts:3355`](../server/routes.ts#L3355) (`/api/copy/deploy`) still creates exactly that shape.

**Root cause:** the ORDER of two tests. "Is its account missing?" was asked before "is this mine?".

**Fix:** the decision is now one pure function, [`engine.classify_master`](../copy_platform/engine.py),
which asks ownership first and returns one of `telegram` / `not_ours` / `deactivate` / `start`.
A master the engine does not serve is skipped silently — not started, and **not disabled**.

**Locked by:** [`test_master_ownership.py`](../copy_platform/tests/test_master_ownership.py) — 16
checks including a TEETH case that restores the old ordering and confirms the suite goes red.

### D6 - ~~Anyone on the internet could list every connected broker account~~ FIXED 31 Aug 🔴
**Verified live against production, 31 Aug: HTTP 200 with no credentials at all.**

`GET /api/copy/providers` had no login check, and `getProviderDirectory` had no owner filter. It
returned **every** connected account in the system — the account's id, **the owner's user id**, its
name, platform, demo/live status and P&L — including accounts whose owner had never switched copying
on. Both of his own accounts were being published this way with `followingEnabled: false`.

**Fix:** the route requires a login; the query now returns only accounts actually offered for
copying **plus the caller's own**; and `ownerId` is replaced by a computed `isOwn`, so no user id
leaves the server. The one client call was a bare `fetch` sending no credentials and is now
`apiRequest` — without that the marketplace would have gone blank.

### D7 - ~~A logged-in stranger could attach themselves to your broker account~~ FIXED 31 Aug 🔴
`POST /api/copy/masters` and `POST /api/copy/followers` passed the request body straight to the
database and only overwrote `userId`. Neither checked that `brokerAccountId` belonged to the caller,
and the `PUT`s let it be swapped in afterwards. `insertCopyMasterSchema` existed and was unused.
Nothing downstream re-checks — the copy engine takes the row at its word, decrypts that account's
credentials and trades it.

**Chained with D6 this was a complete path**, because D6 handed out the exact id D7 needed: read a
victim's `brokerAccountId` from the public endpoint, sign up, then either publish their account as a
master and follow it (their positions stream to you), or point a **follower** row at it — which
places copied orders **on their money**.

**Not proven by exploit, and deliberately not:** confirming it end to end would mean putting a real
order on a real account. The code path is unambiguous on reading.

**Fix:** one helper, `requireOwnBrokerAccount` in [`routes.ts`](../server/routes.ts), called by all
four; bodies are now `safeParse`d so unknown fields are dropped rather than written; it answers 404
rather than 403, because a "forbidden" confirms the id exists.

### D8 - ~~Five more copy endpoints served or wrote other users' data with no login~~ FIXED 31 Aug 🔴
Found by sweeping **every** route for a missing auth check after D6/D7 — the same defect had five
more instances in the same feature, which is exactly why the sweep was worth doing rather than
fixing only the two that were reported.

| endpoint | what it exposed |
|---|---|
| `GET /api/copy/trades/follower/:followerId` | any user's copied trade history |
| `GET /api/copy/logs/:followerId` | broker error messages and refusal reasons for that account |
| `GET /api/copy/trades/master/:masterId` | a **private** or self-copy master's whole trade history |
| `GET /api/copy/masters/:id` | the full master row — owner id, notification email, preferences |
| `PATCH /api/copy/telegram-journal/:id/outcome` | **an unauthenticated WRITE** — anyone could mark any user's trade a win or a loss |

All five now require a login and check ownership. The write scopes the caller into the `UPDATE`'s
own `WHERE` clause rather than doing a separate `SELECT` first, so there is no gap between checking
and writing. Two client callers had to change with them: an admin `fetch` that sent no credentials,
and a `View all →` link that opened the raw endpoint in a new tab — a browser navigation cannot send
a Bearer header, so that link could only ever have shown `Unauthorized` and was removed.

**A correction to my own sweep:** I first counted `/api/admin/copy/all-trades` and
`/api/admin/copy/overview` among the unauthenticated. They are **not** — both carry `requireAdmin`,
which my keyword list had missed. Reading them is what caught it.

**Locked by:** [`test_route_ownership.py`](../copy_platform/tests/test_route_ownership.py) — 33
checks, read off the source rather than by grepping for text, because the failure being guarded is
"someone adds a sixth endpoint and forgets", which a request against five known endpoints cannot see.

### D9 - ~~A missing setting killed the copy engine with no explanation~~ FIXED 31 Aug
[`config.py`](../copy_platform/config.py) read four required settings with `os.environ["..."]`,
which fails on the **first** missing name, at import time, before logging exists. The result was a
bare `KeyError`, exit, and a 60-second restart loop forever — with the only outward symptom being
the engine's heartbeat quietly going stale.

Now one `_require()` names **every** missing setting at once (one restart cycle is a minute, so
finding them one at a time costs a minute each), and treats a blank-but-set value as missing — which
is what a deployment dashboard produces when a field is saved empty. `main.py` validates **before**
the reactor starts, deliberately: anything raised inside `_startup` is swallowed by asyncio into a
"Task exception was never retrieved" line, leaving a misconfigured engine looking **alive** while
copying nothing.

### D10 — Risk-mode sizing refuses indices instead of guessing them. FIXED 31 Aug
`pip_value()` returned $10/pip/lot for every symbol it did not recognise. For US30, NAS100, GER40
and the rest the true figure is about $0.10, so a risk-sized copy came out **100× too small**, hit
the 0.01-lot floor, and placed a token position that looked like it had worked. It now returns 0.0
meaning **refuse**, which `calc_lots` already treats as "skip", matching the rule `volume_for`
follows for a missing contract spec. Mult and fixed modes need no pip value, so indices still copy
through those, and the skip message now names the symbol and says which mode to use instead.

⚠ **A correction to what I said on 30 Aug:** I reported gold as mislabelled "exact". **It is not —
I was wrong.** Gold's contract is 100 oz and its pip is 0.1, so $10/pip/lot is correct for XAUUSD.
Indices were the actual defect.

### D11 — The copy platform had no tests at all. FIXED 31 Aug
Every defect above was found by **reading**, because `copy_platform/` had no test directory.
There is now [`copy_platform/tests/`](../copy_platform/tests) — `python run_all.py`, 99 checks in
four files, same plain-script harness as the signal platform's suite (no framework, no new
dependency). The one that matters most is `test_crypto.py`: it decrypts a vector produced by **the
real Node encryptor**, because a test that encrypts and decrypts with the same Python function
proves only that Python agrees with itself, and would stay green through any Node-side change that
made every stored credential unreadable.

### D12 — Neither of his cTrader accounts is offered for copying. NOT A DEFECT
Recorded because I spent time on it twice. Both accounts show no provider link simply because
**copy-listing was never switched on for them** — the add-account → provider chain is sound.
`register-as-provider`, `register-as-follower` and `copy-listing` all check ownership and platform,
and the OAuth callback stores exactly the fields the engine needs. Turning one on is one toggle.

---

## E. Parked — do not start these

| | | |
|---|---|---|
| **E1** | Landing page redesign | parked 7 Aug until he asks. Zip and tokens kept |
| **E2** | Correlated-pair study (`fx_smt_lab`) | paused. The lead-lag idea was **rejected** by measurement; the "candle at a zone" finding is the part worth keeping |
| **E3** | Logo artwork | his supplied image is used as-is. Dark variant still undecided |

---

## CLOSED — kept so they are not re-opened by mistake

| id | what | closed |
|---|---|---|
| ~~A0~~ | Tap was one-sided — a bar far below a demand zone counted as touching it. Three copies, all fixed. Measured impact under 1%, zero lifecycles changed | 25 Aug |
| ~~A0b~~ | `decisional` assigned by position | 25 Aug — replaced by the creation test |
| ~~A0c~~ | Zones marked off a structure break that pre-dated them | 25 Aug |
| ~~A0d~~ | Telegram signals carried no chart | 3 Aug |
| ~~A0e~~ | 1-hour candles cached for 48 minutes | 20–21 Aug |
| ~~A0f~~ | Light theme unverified | 1 Aug — seen, it is fine |
| ~~A0g~~ | 11 orphaned files | deleted 1 Aug |

---

## The three mistakes of mine that this list exists to stop

1. **Reporting one copy of a bug as the whole bug.** The tap fix was three places, not one.
4. **Calling something broken after checking only the mechanism I expected.** A1 was filed 🔴
   because the divider I looked for was gone — I never asked whether anything ELSE kept the two cards
   apart. Something did, and the answer was four lines away in a file I had already read.
2. **Asserting a number I had not measured.** Two claims about the tap bug — the log line it
   supposedly caused, and a "70% false" rate — were both wrong and both had to be retracted.
3. **Inventing evidence.** A "zone he sent on 16 Jul" never existed and reached three documents
   before he caught it (A4).
