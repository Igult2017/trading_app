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


### B20 - ~~A locked R could be given back: a failed stop move was never retried~~ FIXED 02 Sep 🔴
**His instruction, 02 Sep:** *"make sure whatever is locked is never taken by the market."* It could
be, and this is how.

The rung was marked as done **before** the stop was moved:

```
position_tracker.py   delivery_ledger.mark_delivered(k)     <- marked here
position_tracker.py   await _auto_move(p, tag, new_sl, ...)  <- amended here
```

and the next poll starts `if delivery_ledger.is_delivered(k): continue`.
[`breakeven.move_stop_to`](../signal_platform/execution/breakeven.py#L106) has three failure
returns — *"broker refused the amend"*, *"amend failed"*, and a blocked guard. **None was ever
retried.** The rung was already ticked off.

**The sequence that loses money:** price reaches 2.5R → the "lock 2.4R" rung fires and is marked
done → the amend fails → the stop is still at breakeven and nothing will try again → price reverses
→ he is stopped at breakeven having been told +2.4R was protected.

**FIXED:** `_auto_move` now returns whether the stop is **at or beyond** the target, and the rung is
marked done only on that. A failure leaves it unmarked, so the next pass retries — every 0.5 s on the
fast watcher, 30 s on the safety net. `move_stop_to` is ratchet-only so a retry can never lower a
stop, and *"already at or beyond"* counts as success rather than a repeat amend. Three failures in a
row escalate to one loud DM naming the level and the broker's reason.

**Why it had to be built WITH B21:** today a failed lock at least produced a "STOP NOT MOVED" DM.
Once the lock messages go quiet (B21), that failure would have been completely silent.

**Proved by** `test_position_tracker.py` — a stubbed failing amend is attempted twice across two
polls and never marked done; once it confirms, it is marked and not attempted again.

### B21 - Only breakeven and the exit are announced. DONE 02 Sep
**His instruction, 02 Sep:** *"Locking Rs should only be announced when we move to breakeven and when
we are out of the market... We dont need to get all the messages like 1R locked in the DM."*

Every locking rung is now `quiet=True` — the fixed +1R and every trailing tenth. The DM carries four
things and nothing else:

| | event | where |
|---|---|---|
| a trade is **placed** | `placer.placement_message` — **already existed**, and fired in production at 07:28:51 on 02 Sep (`could not send the autotrade DM` appears 0 times in 6.8 h of log, so it was delivered) |
| the stop moves to **breakeven** | `position_tracker._lines` |
| the **stop is hit** | `exit_watch`, from the real closing deal |
| we are **out** | `exit_watch` |

**QUIET IS ABOUT ROUTINE SUCCESS, NEVER ABOUT FAILURE.** `_auto_move` still speaks — loudly — on any
outcome where the stop did NOT reach the broker, however quiet the rung. That pairing is what makes
B20 safe.

**And the exit now says WHY.** `ctrader_positions.closing_deal` reads the deal that actually closed
the position (`ProtoOADealListReq`, matched on positionId), so the message can say *"Your stop was
hit"* with the real exit price and the realised money, instead of describing the stop the position
happened to be carrying. A stop fills THROUGH its level, never exactly on it, so the comparison uses
a tenth of the stop distance rather than a fixed pip count — which would be wrong on gold and wrong
again on EUR/USD. **If that read fails it falls back to the old wording**, so a broker hiccup still
tells him he is out.

### B18 - ~~Autotrade never said when a trade was over~~ FIXED 02 Sep 🔴
**His report, 02 Sep:** *"It doesnt even communicate. When SL is hit it should say, when we lock 1R
and later it is hit and we are out it should say... When we are out it should announce because like
right now i dont know whether we are out or not."*

**He was right, and it was not a missing message — nothing was watching the right thing.**

| | what it watches | what it says on an exit |
|---|---|---|
| [`monitor/signal_monitor.py:218`](../signal_platform/monitor/signal_monitor.py#L218) | the SIGNAL's ORIGINAL `sl`/`tp`, from the database row | announces only if price touches **those original levels** |
| [`monitor/position_tracker.py`](../signal_platform/monitor/position_tracker.py) | the broker's **open** positions | nothing — a closed position just stops appearing |

The ladder moves the REAL stop. The signal monitor never learns that: the state that advances a
signal's stop is built **for `bx_sd` only** ([`signal_monitor.py:173`](../signal_platform/monitor/signal_monitor.py#L173)),
so for VIX.1 `sl` stays the original stop for the signal's whole life. **So the exits he most wanted
to hear about were exactly the silent ones** — stopped out at breakeven, at +1R, at a trailed level:
all at prices the signal's original levels never see. The signal then sat "triggered" until it
expired 24 hours later. A plain stop-out at the untouched original level *was* announced, which is
why it felt random rather than absent.

And the one place that already noticed a position had vanished,
[`fill_watch._forget_closed`](../signal_platform/execution/fill_watch.py#L72), just deleted it from a
dictionary.

**FIXED:** new [`monitor/exit_watch.py`](../signal_platform/monitor/exit_watch.py) keeps a last-seen
snapshot per position and announces once when it disappears — the stop it was carrying, whether that
was profit / breakeven / a loss, and the best R it reached. It says plainly that the level is the
**stop**, not a confirmed fill, because the exit price is not in the open-position feed.

**THE CASE THAT MUST NEVER FIRE, and the one its test guards hardest:** `open_positions()` returns
`None` for *"I could not read the broker"* and `[]` for *"nothing open"*. Announcing an exit from a
failed read would tell him he is out of a trade he is still in. A `None` read announces nothing and
keeps watching.

### B19 - ~~On the fast path, a failed Telegram message stopped the stop from moving~~ FIXED 02 Sep 🔴
**Found 02 Sep while reading the ladder for B18.**
[`trade_watcher.py`](../signal_platform/monitor/trade_watcher.py) had the amend nested INSIDE the send:

```python
if await self.send(message):
    delivery_ledger.mark_delivered(k)
    log.info(...)
    await _auto_move(p, tag, new_sl, self.send, price)   # only runs if Telegram accepted
```

`position_tracker` has always done the opposite deliberately, with a comment saying why: *"the advice
DM above is sent either way and first: if the amend fails he still knows what to do by hand"*. **On
the fast path — the 0.5s one that exists to act within a second — that was inverted: a failed or
rate-limited DM left his stop exactly where it was.** The amend is now outside the send, matching.

### B17 - ~~cTrader refused the gold order: a gold lot is 100 ounces, not 100,000 units~~ FIXED 02 Sep 🔴
**His report, 01 Sep:** *"Ctrader rejected this autotrader order because the number was too big.
Can you investigate and fix it from the root cause."*

**The broker's own words:** *"Order volume = 13000.00 is bigger than maximum allowed volume =
5000.00"* on a 0.13-lot XAU/USD signal.

**The risk maths was right; the CONVERSION was wrong.** `execution/sizing.py` held one constant —
`LOT_UNITS = 100_000` — and used it for every instrument. That is the size of a **currency** lot.
**A gold lot is 100 ounces.** So 0.13 lots went onto the wire as 13,000 ounces instead of 13, a
factor of 1,000, and the broker refused it outright.

**What made it POSSIBLE, which is the real answer.** The symbol list the order path already
fetches is `ProtoOASymbolsListRes`, whose entries are `ProtoOALightSymbol`. Confirmed against the
live demo account on 02 Sep — 1,940 symbols, and XAUUSD came back as exactly
`{symbolId, symbolName, enabled, baseAssetId, quoteAssetId, symbolCategoryId, description}`.
**No `lotSize`, no volume limits.** There was nothing to check the constant against, and no reason
to doubt it while only currency pairs traded. *Adding an instrument re-opened a constant calibrated
for the old ones* — the rule from 19 Aug, and this is what it looks like when it is ignored.

**The fix, in three parts:**

| where | what |
|---|---|
| [`execution/connection.py`](../signal_platform/execution/connection.py) | `load_symbol_spec` — `ProtoOASymbolByIdReq` returns the FULL `ProtoOASymbol`, which does carry `lotSize`, `minVolume`, `maxVolume`, `stepVolume`. One extra round trip, only for a new order |
| [`execution/sizing.py`](../signal_platform/execution/sizing.py) | `lots_to_volume(lots, symbol, lot_size)` uses the broker's own figure when known and a per-instrument-class table (XAU 100, XAG 5,000) when the fetch fails; `clamp_to_broker` fits the size to the broker's step/min/max |
| [`execution/orders.py`](../signal_platform/execution/orders.py) | `build_stop` re-derives the volume from the lots and the broker's `lotSize`, then refuses — with a readable reason that reaches his DM — anything outside the broker's own limits |

**Over the maximum is REFUSED, never capped.** A capped size is not the risk that was asked for.
Quantising DOWN to the step is the one adjustment made, and it is logged, because on a coarse step
it is not small (0.13 lots against a 0.1-lot step is a quarter of the position, silently).

**A spec that cannot be read does not take the trade down** — it falls back to the per-instrument
table, which is now right for metals instead of wrong for everything but currencies. This differs
deliberately from `copy_platform.lot_calc.volume_for`, which REFUSES without a spec: mirroring
someone else's trade can wait, a signal cannot, and the fallback is no longer a guess.

**Proved by:** [`tests/vix1/test_order_volume.py`](../signal_platform/tests/vix1/test_order_volume.py)
— 33 checks including the exact refused number, the currency pairs bit-for-bit unchanged, and teeth
both ways (the 01 Sep volume is caught, the correct one passes).

**Still not verified:** the live `minVolume`/`stepVolume` for XAUUSD. The env token is stale
(`CH_ACCESS_TOKEN_INVALID` — Node holds the live one) and the hosted read-only MCP returns the same
light symbol. The RUNNING code reads them from the broker, so this is a gap in the test fixture
only, and the fixture says so in place.

**CHECKED AGAINST THE cTRADER SKILL, 02 Sep**, at his request. Three independent confirmations:
* `assets/symbol_precision_table.json` gives **XAUUSD lotSize 100**, XAGUSD 5,000, every currency
  pair 100,000 — the same figures the fix derived from the broker's own refusal message.
* the skill's own converter, `scripts/units_encoding.py lots-to-cents`, returns **1,300** for
  0.13 lots of gold and **1,300,000** under the old forex assumption — exactly the number the broker
  printed as 13,000.00. Compared against our conversion across **2,500 sizes on five instruments:
  0 disagreements.**
* quirk **Q-L1** (*"Volume is broker-defined; lotSize may be 1 … cross-reference the precision table
  for a BASELINE only"*) is the design this fix already follows — ask the broker, table as fallback.

**And it found one more thing, which is the real root cause rather than gold specifically.** The
fallback ended in `return LOT_UNITS`, so **any instrument it did not recognise was silently treated
as a currency pair**. Gold was 1,000× out; an index (contract size 1) would be 100,000× out. The
table now carries the skill's figures for indices, oil and crypto, and `contract_size_for` returns
**None** for anything it genuinely cannot size — `build_stop` then REFUSES, in words, rather than
assuming. Assuming is what caused this.

### B15 - ~~Autotrade was switched ON and refusing EVERY order — it could not read the balance~~ FIXED 31 Aug 🔴
**His question:** *"Is autotrading working now?"* **It was not, and the answer took reading rather
than remembering.** Everything looked right: `AUTOTRADE_ENABLED=true` in production, the order path
proved on the demo account on 30 Aug, the demo-only guard passing, `AUTOTRADE_STRATEGIES` defaulting
to vix1. And the demo account holds **no pending orders and no open positions** — nothing had ever
been placed from a signal.

**Cause: the credential bridge never sent any money figure.** Queried against production, the
endpoint's keys were exactly `access_token, account_id, account_type, ctrader_id, environment,
expires_at, is_live, refresh_token`. `execution/account._equity` reads the first positive value
among equity / balance / account_equity / accountBalance, found none, returned `0.0`, and
`guards.check` answered **"account equity unknown"** on every signal — one log line, indistinguishable
from a quiet market.

**The same shape as D4**, which refused every order because the demo guard read a field the endpoint
never sent. That fix added `account_type` and `environment`. Nobody checked whether the OTHER thing
the guard needs was there.

**Fix:** `SELECT` now includes `balance, currency` and `ctraderCredsFor` returns them, under both
`balance` and `equity` for the same reason `account_type` and `environment` are both sent — the
reader looks for several spellings and neither side should have to know which it picks.

⚠ **THIS IS WHAT MAKES AUTOTRADE ACTUALLY START PLACING ORDERS.** It has been on and inert; after
this deploy it will place. Demo-only is enforced at runtime, VIX.1 only, 0.5% risk, max 6 per
rolling 24h, one live order per symbol+direction.

### B16 - Autotrade trades London and New York sessions only. DONE 31 Aug
**His instruction:** *"I want you to make it trade during London and New York Sessions only."*

New guard in `execution/guards.check` (step 4b), driven by `AUTOTRADE_SESSIONS`, default
`london,new_york`. Empty = any session, so it is reversible without a code change.

**No hours are written into the guard.** `scheduler/session_windows.get_current_sessions` already
computes the windows from each centre's real timezone (Europe/London and America/New_York,
08:00-17:00 local), so daylight saving is handled in one place and this agrees with the sessions
page. A second definition would drift from the first twice a year.

**It gates ORDERS ONLY** — signals still fire in every session and still reach Telegram. He asked
for autotrade to be restricted, not the strategy. **It refuses if the session cannot be read**, like
every other guard in that module.

### B14 - ~~VIX.1 fired a Sunday-open signal on a candle that closed FRIDAY~~ FIXED 31 Aug 🔴
**His report, 31 Aug:** *"Why did this signal fire and when I looked at it there was no momentum
candle forming."* **He was right, and the event is REPRODUCED, not inferred.**

The signal: `vix1 GBP/USD SELL`, fired **Sun 30 Aug 22:01:05 UTC**, card said *"Momentum candle
CLOSED on the 1H — SELL bias confirmed, 18 pip body"*.

**Real broker candles at that moment** (pulled via `trading_app_data/tools/vix1_candles.py`):

| bar (UTC) | dir | body |
|---|---|---|
| Fri 28 Aug 20:00 — last bar of the week | DOWN | 5.2 pips |
| **Sun 30 Aug 21:00 — the bar that had just closed** | DOWN | **1.7 pips** |
| Sun 30 Aug 22:00 | UP | 4.1 pips |

Nothing resembling momentum. **Replayed through VIX.1's OWN `momentum_run`** on the exact window
the platform held at 22:01:05, it picked:

    Fri 28 Aug 15:00   body 18.2 pips   run of 1   6 bars back
    closed Fri 28 Aug 16:00  ->  54.0 HOURS before the signal fired

18.2 pips and a run of 1 match the card's *"18 pip body"* and *"1 momentum candle in the run"*
exactly. It is that candle.

**ROOT CAUSE: `LOOKBACK = 12` counts BARS, NOT TIME**
([`vix1_momentum.py:238`](../signal_platform/strategies/vix1_momentum.py#L238) —
`start = max(1, len(h1) - LOOKBACK)`). The market is shut ~48 hours over a weekend, so at the
Sunday open **11 of the 12 bars in the window are Friday's**. Intraday the same rule permits a
candle up to 12 hours old; across a weekend it permits 54+.

**NEITHER EXISTING GUARD CAN SEE IT, and both were built for the neighbouring case:**
* The **stale-data guard** ([`candle_fetcher.py:85`](../signal_platform/data/candle_fetcher.py#L85))
  checks only the **last bar of the series**, and measures age in **market-open time**, so the
  weekend costs nothing. The series was genuinely fresh — the old candle sat *inside* it.
* The **backfill guard** ([`vix1_bias.py:207`](../signal_platform/strategies/vix1_bias.py#L207))
  only refuses a candle that closed before the instrument was first scanned. It exists for the
  18 Aug gold incident — the *cold-start* form of this same defect. The platform had been running,
  so it passed. Its own comment states the assumption that fails here: *"in continuous running the
  momentum candle is a median 0 bars old… it only stops a cold start mining the past."*
* **There is NO time-based recency rule on the momentum candle anywhere.** Verified by reading
  every reference to `is_backfill`, `bar_age`, `market_clock` in the bias and momentum modules.

**This is the third appearance of one defect:** a momentum candle outliving the moment that made it
true. Gold, 18 Aug (11 hours, cold start — guarded). Gold again (13 hours re-firing). Now GBP/USD,
54 hours across a weekend. Each fix addressed the instance, not the class.

**Aggravating:** it fired in the first minute of the trading week — the thinnest liquidity and
widest spreads of the week.

**HIS RULE, given 31 Aug:** *"I trade the current and newest momentum candle that complies with my
strategy rules. I want for the current momentum candle to close then take a trade."* He also
corrected the framing — I had offered his own settled rule as one option of three and called it
"strictest". The doc had carried it all along: *"the freshest 1HR momentum candle leads"* (vix1.md).

**FIXED:** `momentum_run` now requires the **newest closed 1H bar to BE the momentum candle**.
`LOOKBACK` is no longer the search window (it survives only as the 1M window size). Applied in the
one place both routes share, so the trend route AND the change-of-character route are covered.

**Proved both ways on real broker bars through the real function:** Fri 28 Aug 16:02 still picks the
candle at **0 bars back**; Sun 30 Aug 22:01 now returns **None**.

**One more link found in the audit trail:** the Friday signal **expired at 24h on the Saturday and
its dedup reservation was freed** (`signal_monitor.py:95`), which is why the re-fire was not blocked
as a duplicate. Left as-is — the newest-bar rule makes it unreachable for this case — but noted,
because a 24h release across a shut market is a weekend-shaped hole in the duplicate guard.

**Two tests changed because they encoded the old assumption**, not because the rule is wrong:
`test_choch.py` now asserts the refusal happens earlier and for a better reason, and
`test_choch_bearish_proof.py`'s fixture put the momentum candle 6 bars back — corrected to the
newest bar, with the 6-bar version kept as a check that the new rule reaches that route too.

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

**02 Sep — candidate 1's PRECONDITION is now confirmed as fact, read off production's own settings:**

| setting | value | what it feeds |
|---|---|---|
| `CTRADER_ACCOUNT_ID` | **47535327** | the Open API session — the broker candles we compare against |
| `CTRADER_FIX_ACCOUNT_ID` | **5296567** | the FIX price session — the ticks we build our candles from |

**They are two different accounts.** That was listed above as untested; it is now tested and true.
It does NOT prove causation — it proves the precondition. Broker spread markup is configured per
symbol per account group, so two accounts can price identically on four symbols and differ on the
fifth, which is exactly the shape of the evidence (a constant 0.005 on GBP/JPY, nothing anywhere
else). Candidate 3 (wrong instrument number) is now the weakest reading: a wrong symbol id gives a
wildly different price, not one that tracks correctly half a pip away for 780 consecutive bars.

**What would actually settle it, and why it was not done here:** read GBP/JPY from BOTH accounts at
the same instant and compare. That needs a live Open API token for the data account, which only
production holds — the local one is stale (`CH_ACCESS_TOKEN_INVALID`) and the hosted read-only
connection is a third account again. **Not guessed at, not "fixed" by widening a tolerance:** a
tolerance that swallowed 0.005 would also swallow a real half-pip error, and the whole value of this
audit is that it caught a difference nobody knew about. GBP/JPY stays untrusted, which costs nothing.

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

### D23 - ~~A synced trade reached the journal but not the same journal a typed trade reaches~~ FIXED 02 Sep 🔴
**His question, 02 Sep:** *"have you audited journal and ctrader account sync to ensure it provided
data of trades to all the pages of the journal like calender, dashboard, drawdown, etc like i would
do manually using journal form?"*

**The good news first, because it shapes everything else.** Every page is built from ONE list.
[`routes.ts` `resolveComputeScope`](../server/routes.ts) reads `journal_entries` for the user
(optionally scoped to a session) and the calendar, drawdown, metrics, timeframe-matrix and
strategy-audit engines all consume that same list. So **reaching the pages was never the problem** —
carrying the same FIELDS was. And the session wiring is sound: every broker account creates a
trading session at connect (`routes.ts:3849`) and `defaultSessionId` is stamped on it, so synced
entries are inside a session and appear in session-filtered views.

**Six real gaps between the two paths, every one verified by reading both:**

| # | gap | evidence |
|---|---|---|
| 1 | **The cached pages were never cleared** — a broker trade was invisible on calendar/drawdown/metrics/timeframe for up to 5 minutes | `invalidateComputeCaches` was a local function in `routes.ts` with exactly **three callers**, all of them the manual create/update/delete endpoints. The sync writes through `storage.createJournalEntry` directly |
| 2 | **No account balance, no monetary risk** | `POST /api/journal/entries` calls `enrichTradeWithBalance` before inserting; `autoJournalTrade` did not, so both columns were blank while the metrics engine reads `account_balance` |
| 3 | **No risk percent** | the manual endpoint defaults it to `1`; this left it null, and the drawdown engine reads `riskPercent` |
| 4 | **A trade could never be BREAKEVEN** | `netPl >= 0 ? 'WIN' : 'LOSS'`. The form offers Win/Loss/**BE** and BOTH engines carry a breakeven class — `metrics_calculator.BE_OUTCOMES`, whose own comment says omitting BE *"inflates the mean"* and leaves *"a phantom run"* in the streaks. **VIX.1's ladder moves the stop to breakeven at 0.4R**, so this is the ordinary outcome of a managed trade, not an edge case |
| 5 | **Pips were guessed from the price** | `const pipMultiplier = ep > 100 ? 100 : 10000`. Right for the four currency pairs **by luck**; gold quotes to 2 decimals so a pip is 0.10 and the multiplier is 10 — **every gold trade recorded ten times its real pips** |
| 6 | **The stop and target were thrown away** | `ProtoOAPosition` carries `stopLoss` and `takeProfit` and neither mapper read them, so no synced trade had a risk/reward, a stop distance or an achieved R |

**Gap 5 had a correct table three feet away.** `signal_platform/shared/pip.py` has held the right
figures since 2026-07-25 — including the override that gold is 2 decimals, which **the broker itself
established** by refusing a 3-decimal price on 31 Aug. Node could not import Python, so Node kept
its guess. That table is now `server/lib/pipMath.ts`, carrying the same values and the same
evidence; **the two must be changed together.**

**One asymmetry is left, deliberately, and it is not a defect.** Only the LIVE feed can supply the
stop and target — a closed position's deals carry no stop, so a trade recovered by the 15-minute
sweep (after a restart, say) has none, and the journal shows those columns blank rather than
inventing a number.

**Genuinely not knowable from a broker feed:** `entryTF` / `analysisTF` / `contextTF`, `mae` / `mfe`,
and the written-analysis fields. Synced trades therefore land in the timeframe matrix under an
unlabelled bucket (`tf_metrics/grouping.py:153` falls through to a normalised blank — it does not
crash). **For autotrade specifically the platform DOES know them** — VIX.1 enters on the 1-minute
and reads structure on the 1-hour — so passing them through is a real improvement and is **NOT built**;
it is carried forward below.

**Proved by:** [`journalParity.test.ts`](../server/services/journalParity.test.ts) — 38 checks, and
it strips comments before the "is the old rule gone?" searches because each fix quotes the rule it
replaced (the same trap `entryParity.test.ts` documents).

### D22 - ~~No cTrader trade EVER reached the journal — one line rejected every real deal~~ FIXED 02 Sep 🔴
**His report, 01 Sep:** *"The trades taken by autotrader are not being captured and recorded or
synced in the journal. Can you check that pipeline and fix it properly so that trades taken in
ctrader can be captured in the journal just like trades uploaded through journal form."*

**It was never a journal problem.** Nothing came out of the adapter. Both routes into the journal —
the 15-minute sweep (`fetchCTraderTrades`) and the live push feed (`ctraderRealtime.onTrade`) —
funnel through one function, [`mapClosedDeal`](../server/services/brokerAdapters/ctrader.ts), whose
first line was:

```ts
if (!d || d.dealStatus !== 2 || d.closePositionDetail == null) return null;
```

**Measured against the live Pepperstone demo account, 02 Sep, 14-day window, 30 deals:**

| what the code required | what the broker actually sends |
|---|---|
| `dealStatus === 2` (the protobuf integer) | `dealStatus: "FILLED"` — **all 30**. The JSON gateway serialises enum values BY NAME |
| `closePositionDetail` present | **0 of 30 carried it** — including the six that genuinely closed a position |

Either alone was fatal, and **both failed silently**: a `null` there means *"an opening fill,
ignore it"*. The sweep returned an empty list every time; the live feed dropped every close.

**His actual trade was found in the broker's data**: position `239582511`, the stop order signal
`70d8dac7` placed (STOP BUY 1.16048, SL 1.15986, TP 1.16295), filled 1.16046, closed 1.15983,
−$51.03 on 0.81 lots. It existed at the broker and was absent from the journal. That is the defect
in one row.

**The fix.** A closed position is now recognised from what IS present:

| function | how it knows |
|---|---|
| `pairDealsIntoTrades` | groups a position's deals — the first opens it, the last closes it. Used by the sweep |
| `mapClosedFromEvent` | the live event carries `deal` AND `position`; the position's `positionStatus` says CLOSED, or the deal's side is opposite the position's. The feed was reading only the deal and throwing the position away |
| `mapClosedDeal` | kept, and now accepts the named status — a gateway that DOES send the detail gives the broker's own gross profit and swap |

All three key a closed position on its **closing deal id**, so the live feed and the sweep produce
the same `externalId` and `processIncomingTrades` de-duplicates: **the two routes cannot double-record.**

**Three further defects found while fixing it, all on the same path:**
* `mapClosedDeal` read the **deal's** side for direction. A closing deal is the OPPOSITE side of the
  position, so every recorded trade would have been the inverse of the one actually taken.
* `lots` was `filledVolume / 100`, which is **units**: a 1-lot forex trade recorded as 100,000 lots.
  Now divided by the instrument's contract size (and gold's is 100 oz — see **B17**).
* `mapClosedFromEvent` left `openTime` undefined although the position carries `tradeData.openTimestamp`.
  **This one is load-bearing, not cosmetic.** `processIncomingTrades` journals a trade only when BOTH
  times survive — `if (openTime && closeTime) autoJournalTrade(...)` — so even with the mapping fixed,
  every live-recorded trade would have landed in `synced_trades` and **never reached the journal**,
  which is precisely what he asked for. Asserted through the real `toDate` in the test.

Money fields now scale by the broker's own `moneyDigits` rather than a hardcoded 100.

**Proved by:** [`ctraderDeals.test.ts`](../server/services/brokerAdapters/ctraderDeals.test.ts) —
42 checks against `__fixtures__ctrader_deals.json`, **six deals captured verbatim from the live
account**, no hand-written values. His trade must come out at 1.16046 → 1.15983, 0.81 lots, −$51.03.

### D14 - ~~Trade sync died with "Invalid time value", and six other brokers silently dated trades to the year 58,633~~ FIXED 31 Aug 🔴
**He sent a screenshot of the accounts page: both accounts showing "Issues syncing".** Two different
faults, one of them affecting the very account the signal platform trades.

**Fault 1 — `Invalid time value` on `ctrader` (login 5296567, $10,000, the signal platform's own account).**

`brokerSyncService.toDate` decided the unit from the TYPE — *number = Unix seconds, string = date
string* — and **seven of the eight adapters disagreed with it**:

| adapter | sends | real unit | what the old rule produced |
|---|---|---|---|
| **ctrader** | `String(ms / 1000)` | seconds, as a **string** | **Invalid Date -> RangeError** |
| binance, bitget, bitunix, bybit, dxtrade, tradelocker | a number | **milliseconds** | multiplied by 1000 again -> **year 58,633** |
| coinbase | ISO string | ISO | correct — the only one that matched |

`new Date("1788123600")` is an **Invalid Date**, and an Invalid Date is **truthy**, so every
`openTime ? openTime.toISOString() : undefined` guard walked straight past itself and threw. That is
the error on the screen, and it killed every sync of that account.

The six millisecond ones never errored at all — they just wrote trades dated to the year 58,633,
which can never appear in any date-ranged view. Nothing complained, which is why it survived.

**Fix:** the unit is now read from the **magnitude**, numeric strings are treated as numbers, and
`toDate` **never returns an Invalid Date** — it returns undefined, which is what makes the callers'
own `? :` guards mean what they look like they mean. 1e11 separates the two units by three orders of
magnitude (the year 5138 in seconds, 1973 in milliseconds); nothing real is near it. The cTrader
adapter now passes the broker's own milliseconds through untouched — converting in the adapter AND
in `toDate` is how the two halves came to disagree.

**27 checks** in `server/services/brokerSyncService.test.ts`, including three TEETH cases that
restore the old rule and confirm it produced an Invalid Date, that the Invalid Date was truthy, and
that it dated the millisecond adapters to the year 58,633.

### D21 - ~~My own fix for D19/D20 recognised nothing, because it keyed on HOW a row was created~~ FIXED 01 Sep 🔴
**He tested it and said so:** *"I dont think it fixed anything... I did it and then reloaded the page
and I think all was undone."* He was right, and the cause was my own D19 fix.

**Read from the live database** (admin copy overview, which reads production):

| | |
|---|---|
| cTrader masters | **exactly one** — `67470ef2`, `strategy_name` = **"My signal service"**, created 01 Sep 02:46:38 |
| followers | **one** — `a1e39efa` on that master, created 02:49:45, `deployed_at` set, active |

So the relationship he built is real and saved. **The panel could not see it.**

**Root cause — mine.** D19 decided "which rows are his self-copy setup" by looking for
`description = 'Self-copy source'`, the marker `POST /api/copy/self-copy` stamps. But **two paths
build the same thing**: he created his through the Provider Studio (`POST /api/copy/masters`), whose
default name is exactly `"My signal service"`. No master carrying the marker exists at all, so
`selfCopy` came back null and the panel restored nothing. A rename through the studio erases the
marker too, since `saveProfile` overwrites both name and description.

**The same wrong key was in D20**, so the provider stats went on counting his own account as a
customer — that half of D20 never worked either.

**Fix: key on WHOSE the rows are, not on which endpoint wrote them.** `rels` is already restricted to
his own followers, so "the master is his too" (`m.user_id = uid`) is exactly the question, and it is
path-independent. Telegram masters are excluded — they read a channel and have no broker account to
mirror from. The Provider Studio queries use the mirror of it, `f.user_id <> m.user_id`: him copying
himself is not a customer.

**The lesson, and it is the one already written down:** *reproduce the ACTUAL event before touching
anything.* D19 was built and shipped without once reading what was in his `copy_masters` row. One
query would have shown the name was "My signal service" and that the marker did not exist.

**Verified against the real shape this time** — 27 checks in `copySetup.test.ts` and 34 in
`providerStudio.test.ts`, including explicit assertions that the creation-path marker is NOT what
selects those rows. The absence checks strip comments first; both files explain the marker they
stopped using and failed on their own prose on the first run.

### D20 - ~~Provider Studio: Decline always failed, his own accounts appeared as customers, and support sent nothing~~ FIXED 01 Sep 🔴
Found by tracing the studio from its controls back to the database, at his request. **Five defects.**

**1. Decline returned 403 for every real request.** The two buttons ask different ownership
questions: Accept checks you own the **master** (right for a provider), while Decline called
`DELETE /api/copy/followers/:id`, which checks you own the **follower row** — and that row belongs
to the person asking to follow you. Side by side, only one could work. It looked fine because the
only follower rows in existence were his own.

**Loosening the DELETE route would have been the wrong fix** — it would let a provider destroy a
follower's own record, and that route is correct for its actual job (a follower cancelling their own
subscription). New `POST /api/copy/followers/:id/decline` mirrors approve exactly. It **deletes**
rather than deactivates: a pending request already IS an inactive row, so deactivating would leave
it in the queue and the button would appear to do nothing.

**2. His own accounts showed up as strangers asking to follow him.** Pending requests were "any
inactive follower on any master I own" — so pressing **Stop mirroring** put his own mirror accounts
in the Provider Studio queue. Now three clauses, each killing a different false positive: the
self-copy master is excluded; only masters with `require_approval` can have a queue; and
`deployed_at IS NULL` separates *never started* from *paused* (every path that creates an ACTIVE
follower stamps `deployed_at`; the subscribe path deliberately does not).

**3. His provider statistics counted his own money.** `AUM COPIED` and `ACTIVE FOLLOWERS` summed
every master including the self-copy one, so mirroring his own $9,999 account into his own $1,000
account reported him as a provider with a follower and $1,000 under management — while the profile
shown directly above those numbers already excluded self-copy. The header and the statistics were
describing two different businesses. Same exclusion now applied to both.

**4. "Send message" to support sent nothing** while showing *"Message sent to support — we'll reply
within one business day."* No request, no email, no record. **The worst of the five: it failed while
claiming success.** Now `POST /api/copy/support-message`, delivered to the same Telegram admin chat
the health watchdog already uses — no new delivery mechanism to keep alive — and the response says
"sent" **only if Telegram accepted it**. On failure his text stays in the box; it is his only copy.

The "Email support" button showed `support@tradesync.app`, a string that appeared exactly once in the
whole codebase, in that button, on an app that runs at `fsdzones.cloud`. Mockup text, removed rather
than shown to a real provider. **It returns when there is an address that receives mail.**

**5. The fee-model dropdown had nowhere to go** — never sent, never loaded, and `copy_masters` has
**no fee column at all**. Removed rather than persisted: storing it would advertise a charging model
to followers that nothing charges. It returns when there is billing behind it.

**Dead props swept.** Removing the fake email button orphaned `setToast` in `SupportBox` — and
`BusinessSetup` turned out to have been taking it without ever using it, from before this change.
Both gone, along with the page passing them.

**Untouched and verified still working:** the profile save, the marketplace listing checkbox, the
seed-once guard on the editable fields, and Accept.

**33 checks** in [`providerStudio.test.ts`](../client/src/features/trade-sync/hooks/providerStudio.test.ts).
The absence checks strip comments first — these files explain the mockup address they removed, and
the first run failed on its own documentation.

**NOT verified by hand** — declining a real third-party request needs a second user account.


### D19 - ~~The copy setup panel forgot everything on reload, and locked him out of stopping~~ FIXED 01 Sep 🔴
**His report:** *"I would try connect a slave account and when I reload the page everything is
undone."* He was exactly right, and his screenshot proved both halves of it at once — a **"Stop
mirroring"** button (which only renders when active follower rows exist in the database) sitting
above a header reading **"no master set"**.

**Four separate defects.**

**1. The buttons never saved.** "Set as master" and "Add as mirror" wrote to browser memory and
stopped there ([`useCopySetup.ts:63-75`](../client/src/features/trade-sync/hooks/useCopySetup.ts#L63-L75)),
and every other control started from a hardcoded default on each page load.

**2. The saved setup was never returned.** Pressing Start DOES persist — `POST /api/copy/self-copy`
writes the master and follower rows — but the overview's relationships query omitted
`f.broker_account_id` and `m.broker_account_id`, so the panel could not say which account was master
or which were mirrors. **The data was in the database the whole time; the page never asked.** Fixed
by selecting both columns and returning a `selfCopy` block, read from the master the endpoint marks
`description = 'Self-copy source'` — the string the studio query already excludes, so the two never
claim the same row. **Paused relationships are included on purpose**: stopping keeps the rows, and
filtering to active ones would blank the panel the moment he stopped and leave nothing to restart
from.

**3. Stop was gated by the START blockers.** `canStart` required `startBlockers.length === 0`, and
that same button stops mirroring. After a reload the master was blank, so "declare a master" fired
and **he could not switch off copying that was already live.** Blockers now apply only when starting.

**4. Editing a live setup did nothing.** `/api/copy/self-copy` was create-or-nothing — once a pair
was linked, changing the sizing, drawdown, instruments or sessions and pressing Start again was a
silent no-op. It now updates an existing follower (and re-activates it, which is how a stopped
mirror is resumed).

**The two button rows that were decoration.** *Allowed instruments* was collected and never sent; the
server accepted `symbolWhitelist` all along and the engine enforced it. The mismatch was that the
buttons offer CATEGORIES while the column holds SYMBOLS — `lot_calc.asset_class` now resolves that at
the one point that asks "may this symbol be copied?", accepting both forms so an existing symbol list
behaves exactly as before. *Allowed sessions* did nothing anywhere: the engine's follower model did
not even map `session_filter` / `active_sessions`. Now mapped, with
[`copy_platform/session_filter.py`](../copy_platform/session_filter.py) as the gate — local hours
matching the platform's existing session windows rather than a fifth opinion about when London opens,
DST handled via IANA zones, and **OPENs only**: gating a close would strand him in a live position
because a session shut.

**Off by default, two ways** — `session_filter` false, or an empty session list. Either would
otherwise refuse every trade for followers saved before this shipped, which looks like "copy trading
is broken" with nothing in the log but SKIP.

**57 checks**: 33 in [`test_copy_setup_roundtrip.py`](../copy_platform/tests/test_copy_setup_roundtrip.py)
and 24 in [`copySetup.test.ts`](../client/src/features/trade-sync/hooks/copySetup.test.ts), including
a teeth case for the seed-once guard — the overview refetches every 20 seconds, and seeding on every
payload would wipe his selections mid-edit twice a minute, which is worse than the bug being fixed.

**NOT verified by hand in a browser** — the reload walkthrough, the stop path and the 20-second trap
are asserted at source level only. They need a login against real data.


### D18 - ~~The copy engine died and reconnected every 6 seconds, forever — it could not decode a single broker message~~ FIXED 01 Sep 🔴
**Found by reading the production logs**, not reported. In a 7.5-minute window the copy provider
logged **63 disconnects** — one roughly every 6 seconds — for master `67470ef2`, continuously:

```
File "/app/copy_platform/providers/ctrader.py", line 137, in _on_message
  res = Protobuf.extract(message, ProtoOASymbolsListRes)
builtins.TypeError: Protobuf.extract() takes 2 positional arguments but 3 were given
```

It authenticated, asked for the symbol list, and died on the reply. Every time. **Copy trading could
never have worked** — the master feed never got past its first message.

**Root cause.** `Protobuf.extract` is a **classmethod taking only `(message)`** — it works the type
out itself from `message.payloadType`. Passing the expected type as a second argument makes three
(`cls` + message + type). **All EIGHT call sites did it**: four in
[`providers/ctrader.py`](../copy_platform/providers/ctrader.py) and four in
[`executors/ctrader.py`](../copy_platform/executors/ctrader.py). Fixing four would have fixed
nothing — the executor would have died the same way on the first copied order.

**NOT a library upgrade.** `ctrader-open-api` is pinned at `0.9.2` in
[`copy_platform/requirements.txt`](../copy_platform/requirements.txt) and in the signal platform, and
0.9.2 is what is installed — its `extract(cls, message)` has always taken one argument. The call was
wrong against the pinned version from the start, so no rebuild would ever have fixed it. The second
argument was also **redundant**: every call already sits inside `elif ptype == X().payloadType:`, so
the type is confirmed before the call. Dropping it changes nothing but the crash.

**Why nothing caught it.** The call only runs when a real broker message of that exact type arrives,
so it needs a live socket to fail at all. Nothing in the suite decoded a real message — the whole
decoder was unexercised.

**Fix:** `Protobuf.extract(message)` at all eight sites. The imported type names stay — the
`payloadType` guards still use them, so nothing was orphaned.

**11 checks** in [`copy_platform/tests/test_protobuf_extract.py`](../copy_platform/tests/test_protobuf_extract.py).
It builds real protobuf payloads and decodes them **through the real installed library** — a mock of
the library is exactly what would have let this through. Plus a source scan that fails if any call
site regains a second argument, and a teeth case firing the original call to prove it still raises.

**Still open, deliberately not changed:** the provider retries every 5 seconds forever after any
disconnect ([`providers/ctrader.py:118`](../copy_platform/providers/ctrader.py#L118)). With the
decoder fixed the loop stops, but a different fault would produce the same hammering — against the
**one** cTrader application the scanner also uses, since Spotware refused the second. Worth a backoff
that widens; not done here because it is a design change, not this defect.


### D17 - ~~Production ran a different server than dev: no trade recording, and no security middleware~~ FIXED 31 Aug 🔴
**This is the other half of his question** *"How do we expect it to show trades?"* — and the answer
was that nothing recorded them.

`start.sh:69` runs `node dist/index.prod.js`, built from **`server/index.prod.ts`** — a second entry
file, separate from the `server/index.ts` every change has been made to. The only two things that
record a broker trade were called from `index.ts` alone:
`startAutoSync()` (index.ts:199) and `startCTraderRealtime()` (index.ts:201).

**Proved from the boot log, not from reading.** The scraper (line 198) and the health watchdog (line
200) both logged at boot; `[AutoSync] Starting` — the line *between* them — was absent from the whole
buffer.

**It cost security too, measured on the live site.** Helmet and both rate limiters were added to
`index.ts` on 2026-06-07 (`fe8401c`) and never mirrored, so production served `X-Powered-By: Express`
(helmet removes it), no `X-Frame-Options`, no HSTS, no `X-Content-Type-Options`, and no `RateLimit-*`
header at all — **the login endpoint had no brute-force limit.** `trust proxy`, the `/uploads` mount
and the signal-platform status mirror were missing as well; the mirror only runs when
`SIGNAL_PLATFORM_MANAGED` is set, i.e. only in the container, and it lived in the dev entry, so it
had never run anywhere.

**Why the two files were not merged into one.** Checked, not assumed: `index.ts` reaches Vite through
`await import("./vite")` — a RELATIVE path, so esbuild bundles it and ESM hoists its package imports.
`dist/index.js` carries top-level `from "vite"`, `@vitejs/plugin-react` and
`@replit/vite-plugin-runtime-error-modal`; all three are devDependencies and the image installs
`npm ci --omit=dev` ([`Dockerfile:29`](../Dockerfile#L29)), so `node dist/index.js` would die at
startup. **The split is load-bearing** — see the SETTLED table in MAP.md.

**Fix — one copy of what they share, not one entry file:**
* [`server/lib/appSetup.ts`](../server/lib/appSetup.ts) — trust proxy, helmet, compression, both rate
  limiters, json/urlencoded, `/uploads`, the request logger, and the error handler
* [`server/lib/backgroundServices.ts`](../server/lib/backgroundServices.ts) — scraper, autosync,
  health watchdog, cTrader realtime, the status mirror, behind one `isPrimaryWorker` check

Both entries now call `applyAppSetup` / `installErrorHandler` / `startBackgroundServices` and differ
in **one** respect: Vite dev middleware vs `serveStatic`.

**The two Python spawns deliberately stay in `index.ts`.** `start.sh` already runs both under its own
watchdogs, and `startCopyPlatform` has no `MANAGED` guard of its own — putting it in the shared module
would run a **second copy engine** in production and duplicate every copied trade.

Also removed `index.prod.ts`'s `throw err` from inside its own error handler: nothing catches a throw
there, so it surfaced as an unhandled rejection after the client already had a clean 500.

**38 checks** in [`server/lib/entryParity.test.ts`](../server/lib/entryParity.test.ts). They strip
comments before matching — these files *explain* the drift they prevent, so their prose names the
very things they forbid, and the first run failed on its own documentation.


### D16 - ~~The account's session showed Current Equity $0 on an account holding real money~~ FIXED 31 Aug 🔴
**He sent the sessions page:** the `ctrader` card read `Current Equity $0`, `Net P&L —`,
`Total Return —`, `Trades 0`. *"It does not even show account balance. How do we expect it to show
trades?"*

**The card is innocent.** `CreateSession.tsx:582` computes equity as `startingBalance + P&L`, so a
starting balance of 0 with no trades is `$0` — correct arithmetic on a wrong input.

**Root cause.** A broker account creates its own session at the same moment it is created, and that
session takes its starting balance straight from the request body
([`routes.ts:3778`](../server/routes.ts#L3778), `req.body.startingBalance ?? '0.00'`). For an account
added BY HAND that is right — he types the balance. For a cTrader account added by **OAuth the broker
has not been contacted yet**, so there is no balance to put there and `0.00` is written. **No path
ever went back and filled it in.**

**Fix — one owner, four callers.** `storage.seedSessionStartingBalance` ignores a zero or missing
balance, **refuses to overwrite a starting balance that is already set** (his own number always
wins), and never throws — a balance we could not carry across must not fail the sync that produced
it. Wired at every point Node learns a balance, because missing one leaves the card empty on exactly
that path:

| where | when it fires |
|---|---|
| [`routes.ts:4001`](../server/routes.ts#L4001) | manual refresh-balance |
| [`routes.ts:4262`](../server/routes.ts#L4262) | OAuth connect callback |
| [`routes.ts:4345`](../server/routes.ts#L4345) | multi-account picker |
| [`autoSyncService.ts:125`](../server/services/autoSyncService.ts#L125) | after each sync — **repairs accounts connected before this existed**, with nothing for him to do |

**The multi-account picker was missed on the first pass.** Only a written check caught it, which is
why the test COUNTS the balance writes rather than spot-checking them: one un-seeded write is
invisible until he opens the page.

**The trades half of his question** now has a route — the 15-minute sync no longer skips cTrader
(D14), and `lastSyncAt` is stamped only on success, so an account that has never completed a sync
still asks for the full 2-year history rather than silently starting from now. The second account
(`ct`) will still show nothing until he reconnects it — see D15 immediately below, which is a stored
credential problem no code change can fix.

**23 checks** in `server/services/tradeRecording.test.ts` (section 5), `tsc` clean.


### D15 - ~~The second account (`ct`, login 5834793) has no stored access token~~ RESOLVED 31 Aug — no longer needs him
**It has a working token now.** On the first boot after the trade recorders were switched on (D17),
that account both attached to the live feed and completed a sync:

```
[cTraderRT] live feed attached — account f0844dd7… (ctid 47535327)
[cTrader] PT_TRADER_RES raw for 47535327: {"balance":100000,…}
[Storage] seeded session 548bc4c3… starting balance 1000.00 from broker account f0844dd7…
```

**Why that is proof rather than a hopeful reading:** the balance fetch runs ONLY on the success
branch of `syncAccount`, after `syncStatus: 'ok'` is written
([`autoSyncService.ts:158`](../server/services/autoSyncService.ts#L158)) — and fetching a balance
needs a valid access token. A sync completed and a token was used, so neither of the two things this
item was about is still true. The $1,000 balance matches the figure recorded below.

**The original problem, kept for the record:** its sync error was `cTrader: not connected. Complete
OAuth first.`, thrown at [`brokerAdapters/index.ts:56`](../server/services/brokerAdapters/index.ts#L56)
when the decrypted credentials carried no `accessToken`. It was a data/state problem, not a code
defect, and it needed him to reconnect the account — which has since happened.

<details><summary>original entry</summary>
Its sync error is `cTrader: not connected. Complete OAuth first.` — thrown at
[`brokerAdapters/index.ts:56`](../server/services/brokerAdapters/index.ts#L56) when the decrypted
credentials carry no `accessToken`.

**This is a data/state problem, not a code defect, and no code change can fix it**: the account
simply has no usable token stored. It shows a $1,000 balance, so it was connected at some point.
**He needs to reconnect it** on the accounts page (or delete it if unused).

**It is NOT the signal platform's account** — that is `ctrader` / 5296567 / $10,000, pinned by
`CTRADER_SIGNAL_ACCOUNT_ID=47535363`. Nothing about the scanner, autotrade or the copy engine depends
on `ct`.
</details>


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


### D1 — ~~Production routes new account connections through a BLOCKED app~~ FIXED 31 Aug 🔴
**It was not just "carried" — it was breaking account connection for every user, and he hit it.**
Clicking "Add Account" sent him to connect.spotware.com and returned a bare **404 NOT FOUND**. The
sign-in link carried `client_id=34053_…`, which is `CTRADER_SYNC_CLIENT_ID` — the second app
("Journal Trade Sync") that Spotware has never approved. Verified against the production
environment: that id is the sync app's, and the approved one is `30153_…`.

**Root cause: being CONFIGURED was treated as being APPROVED.** `newConnectApp()` returned `'sync'`
whenever the sync app's id and secret were merely present, and they have been present since the
apps were split. The function's own comment warned *"deploy the cutover only once the portal shows
the app Active"* — but **setting the variables WAS the cutover**, so the warning had nothing behind
it. A note telling the next person to be careful is not a guard.

**Fix:** approval is now stated explicitly and separately — `CTRADER_SYNC_APP_APPROVED=true`. Until
that is set, every new connect uses the legacy (approved) app. The day Spotware approves it, that is
one environment variable and no code change.

**Deliberately NOT the fix that was written down here.** Unsetting the two `CTRADER_SYNC_*`
variables would also have changed the READ path, because `appCreds` falls back to the legacy pair
when they are absent — so accounts already connected under the sync app would silently start
authenticating with the wrong credentials. The code change leaves reading untouched and only
redirects NEW connects. 16 checks, including two TEETH cases reproducing production's exact state.

**Still open, and worth watching after this deploys:** whether
`https://www.fsdzones.cloud/api/broker/ctrader/callback` is registered as a redirect URI on the
LEGACY app in the cTrader portal. **I have not been able to verify that from here.** If it is not,
the 404 becomes a redirect-mismatch error instead — a different message, same inability to connect.
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

### D28 - ~~The copy engine crash-looped 56 times in 7 hours on a one-word typo~~ FIXED 02 Sep 🔴
**Found 02 Sep reading production logs at his request.** `providers/ctrader.py` `_want_spec` said
`self._client`; the attribute is `self.client` — as it is at `__init__` (line 69) and at every other
use in the file (70, 71, 72, 78, 81, 94). Nothing defines `_client` and there is no `__getattr__`
fallback; I checked. Introduced in `5b8b572`.

| measured over 6.8 hours of production | count |
|---|---|
| `AttributeError: 'CTraderProvider' object has no attribute '_client'` | **64** |
| broker connection dropped and reconnected | **56** — one every ~7 minutes |
| Twisted timeout tracebacks these produced | **147** |

**THE TYPO IS THE TRIGGER. THE CAUSE IS THAT NOTHING CAUGHT IT.** `_on_message` — the function
Twisted calls for every message — had **no try/except at all**. An exception raised inside it escapes
into Twisted, which reads that as a failed connection and tears the session down; the provider
reconnects, re-authenticates, reads the same position and raises again. That is how one wrong word
became an outage, and why 147 tracebacks looked like dozens of faults instead of one.

**The rule was already written down elsewhere in this codebase** — `signal_platform/data/fix_book.absorb`:
*"A bar builder must never be able to kill the price stream that feeds it."* Same principle: the
transport must outlive a fault in anything that reads from it. `_on_message` is now a guard around
`_dispatch`; the fault is logged in full with a stack trace, and the connection survives it.

**A SECOND, WORSE DEFECT FOUND WHILE FIXING IT.** If `_snap` raises for a position, that position is
absent from the reconcile's `fresh` map — and the diff reads absent as *"closed on the master"* and
emits a synthetic CLOSE. **So a failure to READ the master's position would have closed the
FOLLOWER's real position.** The previous snapshot is now carried forward, so an unreadable position
is treated as unchanged; a position that genuinely vanished still closes.

**And the test caught a third, in my own fix:** the guard named the failing message with
`getattr(message, "payloadType", "?")`, whose default only swallows `AttributeError` — so a message
whose `payloadType` raised anything else re-raised out of the except block and killed the connection
anyway. Everything in the handler is now individually guarded.

**Proved by:** [`copy_platform/tests/test_provider_resilience.py`](../copy_platform/tests/test_provider_resilience.py)
— 16 checks, running the real methods, with teeth that run the same message through the UNGUARDED
path to prove the guard is what contains it.

### D27 - ~~The FIX price stream cried wolf one millisecond after opening~~ FIXED 02 Sep
**His report:** *"The FIX data system still makes noise when I deploy... Can you find a way that
makes it not to make false alarm."*

**Measured from his own production log.** At boot:

```
03:56:11.853  [fix] price stream open, subscribed to 5 instruments
03:56:11.854  [entry-watcher] price stream quiet — falling back to the scheduled scan   ← 1 ms later
03:56:11.913  [dispatcher] message sent                                                 ← his DM
03:56:12.623  [entry-watcher] price stream is flowing again                             ← 769 ms later
```

**And it was never only about deploys.** The same thing fired mid-session whenever a new position
opened its own stream — 09:54:11.305 stream open, 09:54:11.306 *"stream stale for GBP/USD"*, DM
sent, recovered 3.9 s later.

**Root cause, one line.** [`data/fix_book.py`](../signal_platform/data/fix_book.py) `age()` returns
`None` in two different situations, and its own docstring says so: *"None means nothing has EVER
arrived, a different problem from a stream gone quiet."* The very next function collapsed them:

```python
return a is None or a > limit_s
```

So a session was judged dead in the same instant it was born. The book recorded **that** it was
connected but not **when**, so there was nothing to measure the silence against.

**The fix is timing, not suppression.** `connected` is now a property that stamps the clock, and
when nothing has ever arrived the silence is measured from the moment the stream opened — judged by
the same 90-second limit as any other silence. **A subscription that logs on and never delivers is
still caught, at 90 seconds instead of 1 millisecond.** That case is the one the test pushes hardest,
because a fix that merely silenced alarms would pass everything else.

**Both watchers inherit it** — `entry_watcher.py:160` and `trade_watcher.py:126` — including the
mid-session case, which was not a deploy at all.

**And the all-clear now goes out.** Recovery only ever wrote a log line, which dies at the next
deploy, so the last thing he was left holding was a warning that the feed was dead — for a feed that
had come back a second later. A warning with no all-clear is worse than no warning.

**THE THIRD PART OF THE SAME COMPLAINT: 93% of the log noise was one known finding, repeated.**
Of 434 tick-audit mismatch warnings in 6.8 hours, **405 were GBP/JPY** — every bar, all saying the
identical thing: all four prices out by exactly 0.005, the shape right and only the level shifted.
That is already recorded (**B13**), already acted on (the symbol is untrusted, so its bars are never
served) and already reported every 15 minutes by the scoreboard. **A warning should tell you
something you do not already know.**

**Classification, not suppression.** `tick_bar_audit._constant_offset` asks whether every price is
out by the SAME amount:
* **a clean constant offset** — the candle was built correctly and the price SOURCE differs. Said
  once, and again the moment the offset CHANGES, which is the event that would mean something new.
* **anything else** — a wrong high, a dropped tick, different amounts on different prices. That is a
  real candle fault and is logged every time, exactly as before.

The scoreboard still counts every bar as a miss either way, so **trust is completely unaffected** and
GBP/JPY stays untrusted. His real GBP/USD and XAU/USD mismatches (where only the OPEN differs) are
not constant offsets, so they stay loud — asserted in the test with the actual logged numbers.

**Proved by:** [`tests/vix1/test_stream_grace.py`](../signal_platform/tests/vix1/test_stream_grace.py)
— 33 checks including his two exact production timings, a reconnect getting a fresh window, his real
GBP/JPY bar classified as a −0.005 offset, his real GBP/USD and gold bars classified as genuine
faults, and teeth proving the old rule would have alarmed.

### C5 - Blog covers are stored as base64 INSIDE the database row. Served around, not fixed
**Found 02 Sep, measured against production.** `/api/blog` returned **2.23 MB for eight posts**, and
the article page fetched it **twice** — ~4.45 MB of blocking JSON to draw a category bar and five
related links.

**My first guess was wrong and the measurement said so.** I assumed the article bodies:

| field | bytes across 8 posts | share |
|---|---|---|
| **`imageUrl`** | **2,301,540** | **98.6%** |
| `content` | 27,480 | 1.2% |
| everything else | ~3,400 | 0.2% |

Every cover is a `data:` URI — the whole picture base64-encoded in the row. One post's is **430 KB
of text**. That is the worst possible shape for an image: it cannot be cached as an image, so it is
re-sent on every page that lists posts; `loading="lazy"` is INERT because the bytes already arrived
inside the JSON; base64 is ~33% bigger than the binary; and it must all be JSON-parsed before
anything renders.

**FIXED AT THE TRANSPORT, NOT AT THE STORE.** `/api/blog` and `/api/blog/:id` now return a URL to
`GET /api/blog/:id/image`, which decodes the data URI and serves the bytes with a cache header.
Measured on production's real rows: **2,335,163 → 6,471 bytes, 99.72% smaller**, and the article
page drops from two 2.23 MB fetches to one 6.3 KB fetch with images streaming separately and caching.
**Nothing is migrated** — the rows keep their data URIs and are decoded on the way out, so no image
can be lost.

**STILL OPEN: they should not be STORED that way.** The upload path writes base64 into the row
instead of a file in `uploads/` (which is already served, `appSetup.ts:82`). Until that changes,
every image costs a database read and a base64 decode per request rather than being a static file a
CDN could serve. **Not done here** because it needs the editor's upload path changed and the existing
rows migrated — a separate task with its own risk.

**Also fixed on the way past:** `og:image` was the data URI, which no social crawler can fetch, so
the blog has never had a working share preview. It is now an absolute URL to the image endpoint.

### D27b - The copy provider's execution-event handler is still unguarded
**Noted 02 Sep while reading production logs. NOT fixed here.**

D28 fixed the `_client` typo and guarded `_on_message` and the reconcile loop. **A third call site
was not guarded:** `copy_platform/providers/ctrader.py` `_handle_execution` calls `self._snap(pos)`
directly, and it runs as a detached task (`asyncio.ensure_future`), so an exception in it is never
retrieved by anything.

Today's log shows exactly that at 07:28:51:

```
[asyncio] ERROR  Task exception was never retrieved
future: <Task finished coro=<CTraderProvider._handle_execution()>
        exception=AttributeError("'CTraderProvider' object has no attribute '_client'")>
```

The typo behind that particular failure is fixed, so it will not recur — but the **shape** remains:
a fault reading one position on the live-event path is silently swallowed by the event loop, and
that position's copy event is lost with no trace beyond an asyncio warning. Same guard as the
reconcile loop needs applying. **Copy trading, not autotrade**, so it is written up rather than
bundled into an autotrade change.

### D26 - `brokerSyncService.ts` is 330 lines and now holds two jobs
**Noted 02 Sep, deliberately NOT split.** It was already 234 lines (over the 200 limit) and D23 took
it to 330. It now does two separate things: turning ONE broker trade into a journal entry
(`autoJournalTrade`, `classifyOutcome`, `detectSession`) and running the BATCH (`processIncomingTrades`,
`toDate`, `normaliseDirection`, `RawBrokerTrade`).

**Not split here because moving files is a planned exercise, not a side effect of a bug fix** —
`docs/RESTRUCTURE.md` already places this file under a `broker/` folder (line 133), and CLAUDE.md
says to read that plan before moving ANY file. Splitting it inside a fix that also changes its
behaviour would make the change impossible to review. `autoJournalTrade` has exactly one real caller
(line 312 of the same file), so the split is cheap whenever the restructure reaches it.

### D25 - The `/history` page is backed by a DIFFERENT table, and the sync does not write to it. NEEDS HIS RULING
**Found 02 Sep while auditing D23. NOT changed — deliberately.**

Everything on the **Journal** page (calendar, drawdown, metrics, timeframe matrix, strategy audit)
reads `journal_entries` through `resolveComputeScope`, and the sync now fills that correctly.

**But `/history` is a separate route** ([`TradeHistoryPage.tsx`](../client/src/pages/TradeHistoryPage.tsx)
→ `TradeHistory.tsx` → `GET /api/trades`) and that endpoint reads the **`trades` table**, which is a
different table written **only** by `POST /api/trades` (`storage.createTrade`, `routes.ts:403`).
Broker-synced trades never appear there.

**Why I did not just write to both.** Nothing else reads `trades` — the three `from(trades)` reads in
`storage.ts` are all this one page — so populating it would not corrupt any metric today. But it
would mean one real trade stored in three tables (`synced_trades`, `journal_entries`, `trades`), and
any future report that sums across them double-counts. **That is a design decision, not a bug fix.**

**The question for him:** should `/history` show broker trades? If yes, the clean answer is to point
that page at the same journal entries every other page uses and retire the `trades` table, rather
than write the same trade to a third place.

### D24 - Autotrade knows the timeframes it traded, and throws them away
**Found 02 Sep while auditing D23. NOT a defect in the sync — a real improvement that is not built.**

The timeframe matrix groups trades by `entryTF` / `analysisTF` / `contextTF`
([`tf_metrics/grouping.py:153`](../server/python/tf_metrics/grouping.py#L153)). A broker feed cannot
know these, so a synced trade lands in an unlabelled bucket. That is correct and unavoidable **for a
trade the user placed by hand**.

**But autotrade is not that.** The platform placed the order itself and knows exactly what it read:
VIX.1 enters on the 1-minute and takes its structure from the 1-hour. Those two values could travel
with the order and reach the journal, and then the timeframe page would say something real about the
trades the platform took.

**Where:** the order carries a `label`/`comment` field
([`orders.build_stop`](../signal_platform/execution/orders.py)) that survives to the deal, so the
strategy and its timeframes could ride along and be read back in
[`brokerAdapters/ctrader.ts`](../server/services/brokerAdapters/ctrader.ts). **Not started.**

**Also still blank on synced trades and genuinely unknowable:** `mae` / `mfe` (the worst and best
price reached while the trade was open — the broker does not report it) and the written-analysis
fields. Those stay empty unless he fills them in, which is the honest answer.

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
