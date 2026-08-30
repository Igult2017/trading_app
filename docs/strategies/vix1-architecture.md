# VIX.1 — architecture map (2026-07-27)

**Read this before changing anything in VIX.1.** `vix1.md` holds the settled RULES (his words, the
playbook's words) and the fix log; this holds the SHAPE.

**VIX.1 is self-contained.** It uses only platform RESOURCES — candles, news, pip size, dedup, the
monitor — and no trading logic from anywhere else. Build it, judge it and fix it on its own terms and
on the playbook; never by analogy to anything else.

---

## The model, in one paragraph

**1HR says which way; 1M says when — and NOTHING ELSE.** A confirmed trend carried by momentum sets
the bias off the FIRST momentum candle of a run. A LINE is drawn from that candle's body close. On the
1M a candle must CLOSE past that line; one candle later the order goes in, **one tick beyond the
furthest price reached across those two candles**. If that next candle did not pull back, the pullback
is ASSUMED and the card says so. SL sits beyond the line (or beyond the pullback when it dipped
through); TP is 2R.

His instruction, 2026-08-20: *"Everything has been settled in 1HR, in 1 min we are only looking for
entries."* The 1M reads no structure of its own — no swing points, no zones, no retrace search.

```
 H4 (closed) ── clear trend ─┐
                             ├─► detect_bias ──► 1st momentum candle ──► draw_line (body close)
 H1 (closed) ── momentum ────┘                                                │
                                                                              ▼
 M1 (forming bar KEPT) ──► a 1M candle CLOSES past the line  (vix1_cross)      │
                                    │                                          │
                                    ▼  wait exactly ONE candle                  │
                          pullback there?  yes ─► kind = pullback               │
                                          no  ─► kind = ASSUMED (never skipped) │
                                    │                                          ▼
                        order = one tick beyond the furthest price reached  ◄───┘
                        SL beyond the LINE (or the pullback if it dipped through) · TP 2R
                                                                              ▼
                                            vix1_signal (card) ──► LOCK ──► vix1_watch
                                                                              │
                                            monitor ──► vix1_alerts ──► R ratchet (ADVICE ONLY)
```

## The invariant that governs everything

**A LEVEL comes from a CLOSED candle; a TRIGGER or current price stays LIVE.**

- `vix1.py:86-87` — H1 and H4 go through `closed_only`. A line that moves every scan is not a line.
- `vix1_entry.py` — `wcl = win[:-1] …` — the cross, the order level and the stop are read from
  **closed** bars; `win` (live) answers only *trigger* questions: which side is price on, and is the
  level still ahead of it.
- **The one deliberate exception**: when price is already through the level, the entry IS current
  price (a market entry). That is not a level read from a forming bar — the rule's own wording is *a
  LEVEL from a CLOSED candle, a TRIGGER **or current price** stays LIVE*. `test_invariants_real_data`
  excludes exactly that case and holds every other signal to the invariant.

VIX.1 has shipped a bug from reading the forming bar as a level, and **a backtest can never catch it**
— every historical bar is closed, so the error is invisible to replay and only appears live.

---

## Module map — 22 files, ~2,600 lines

| file | owns |
|---|---|
| `vix1.py` | orchestrator: **pre-close** → watch → bias → news gates → **spacing** → **heads-up** → 1M signals → grade → build |
| `data/candle_aggregator.py` | **the bar currently FORMING**, rebuilt from a finer series already fetched (`forming_bar`, added 2026-08-21). Opt-in per timeframe via `wants_forming`; the runner appends it to `candle_view` so the chart renderer sees it too. `closed_only` drops it, so no LEVEL anywhere can move — asserted on live data |
| `data/ctrader_spread.py` | **the live spread AND the live quote** (added 2026-08-21) — GetTickData BID+ASK, request/response so it can take the candle fetch's `_req_lock`; cached 25s. `quote_for()` returns (bid, ask) — the platform's ONLY genuinely current price, since the feed's newest close can be ~2 min old; `spread_for()` derives from it so the two cannot disagree. Fills `context.spread` and `context.quote`, neither of which anything had populated |
| `data/ctrader_positions.py` | **his REAL open positions** (added 2026-08-21) — one `ProtoOAReconcileReq`; real fill, stop, commission, swap. `Position.r_at()` and `Position.breakeven()` |
| `execution/breakeven.py` | **THE FIRST CODE THAT CHANGES THE ACCOUNT** (added 2026-08-21) — moves a live stop to its net-zero price at 1R. Ratchet-only, demo-only, both SL+TP legs always sent, re-read afterwards. `AUTO_BREAKEVEN_ENABLED` is OFF by default |
| `execution/broker.py` + `orders.py` | **THE ORDER PATH — and until 2026-08-30 it could not have placed a single order.** It reached into `copy_platform` for two things, and both reaches were broken. (a) host and port: production runs `cd /app/signal_platform` (`start.sh:27`), so `copy_platform` is not importable and the line raised `ModuleNotFoundError`, swallowed by `placer.py`'s catch-all. (b) `resolve_symbol_id`: it has no rule for a SLASH, and every instrument here is slashed (`GBP/USD`), so it returned `None` for all of them and every order was refused as *"not on this account"*. **Both now use what this platform already owns** — `data/ctrader_session.HOSTS`/`PORT`, and `shared/symbols.resolve_symbol_id`. The docstring at the top of `broker.py` had stated the rule it was breaking (*"Neither should be able to break the other"*) since the day it shipped. Guarded by `test_execution_placement.py`, including a **static** check that no module here imports `copy_platform` — necessary because both offending imports sat inside functions, so a plain import check cannot see them. **REWRITTEN 30 Aug and now PROVED — it places, on its OWN socket.** Two further defects were behind the first two: `_run()` used Twisted (`Client` + `startService`), needing a reactor `signal_platform/main.py` never installs (measured: `_on_connected` never fired, the socket was never opened); and it called `config.ctrader_app_creds`, which exists only in copy_platform and takes an argument. **All four were one mistake** — `broker.py` said *"Mirrors the copy executor's proven lifecycle"*: proven inside copy_platform, never once run inside this one. Now pure asyncio on this platform's own wire helpers. Live proof: `place_stop("GBP/USD", …)` accepted, re-read off the broker as `stop=1.349 SL=1.352 TP=1.343`, cancelled |
| `execution/connection.py` | **the order path's OWN authenticated socket** (added 2026-08-30, split out when `broker.py` passed 200 lines). Never `ctrader_session.get_connection()` — that is the SCANNER's shared socket, and `recv_expect`'s docstring records the 2026-08-21 outage caused by one execution-event push (2126) landing on it and desynchronising the candle stream. Placing an order is the surest way to make cTrader emit that push, so order traffic gets its own socket and its own fate. **Proved:** an order placed and cancelled while the scanner fetched candles — 6/6 fetches correct. **THREE timeout budgets, measured not guessed** (connect 30s / symbols 25s / command 20s): a fresh socket was timed at 15.4s on a slow link, and under one 20s budget the CONNECT alone ate it, so the order timed out *having never been sent* while reporting "state UNKNOWN". `NotSent` now separates "nothing left this machine" — a fact — from a genuine unknown. **Never refreshes the token**: four consumers share it and cTrader rotates on refresh |
| `data/fix_quotes.py` + `fix_wire.py` | **STREAMED prices over cTrader's FIX price session** (added 2026-08-30) — subscribe once, prices are pushed. A different protocol on a different port (5211) with its own credential, and it **polls nothing**, so it spends NONE of the Open API request budget the candle fetch uses; measured, the scanner's fetch median went 321ms → 312ms with the stream running. **The eyes, not the hands**: cTrader FIX has no stop-loss or take-profit field, so the amend still goes over the Open API. Hand-written (5 messages, no library); proved live — GBP/USD 1.35325, EUR/USD 1.15815, XAU/USD 4454.22, matching the Open API exactly from a separate protocol. `fix_wire` owns the FORMAT, `fix_quotes` the SESSION |
| `orchestrator/scan_on_demand.py` + `monitor/entry_watcher.py` | **SCAN THE MOMENT THE 1M BAR CLOSES** (added 2026-08-30) — because signals were arriving at or PAST their own entry. Measured on real broker bars, all four stored signals: EUR/USD 19 Aug **past by 1.1 pips**, XAU/USD 19 Aug **past by 9.3 pips**, the other two 0.2 and 0.1 pips short. Two of four were unplaceable on arrival. **Cause:** the scan landed at an arbitrary offset, so the deciding 1M bar sat unlooked-at for up to a full interval plus a 20s cache. `scan_on_demand` runs ONE instrument through the SAME `run_strategy` a tick calls behind the SAME gates (paused, scan_enabled, market hours, registered strategies); `entry_watcher` calls it when FIX says a bar closed, judged on the tick's own broker timestamp (tag 52), never the local clock. **Rate unchanged** — a bar closes once a minute, the scan already ran every 30–60s; a minimum gap plus a hand-off from `scanner.py` stops them doubling up. **IT CAN ONLY SCAN SOONER, NEVER DIFFERENTLY** — decides nothing, places nothing, and a fault degrades to today's behaviour |
| `monitor/trade_watcher.py` | **the real-time stop mover** (added 2026-08-30) — watches open positions on the streamed price and acts within a second instead of up to ~110s. **Adds no trading logic at all**: the ladder stays in `position_tracker._lines`, every guard in `breakeven.move_stop_to`, the R maths in `Position`. It decides only WHEN to ask and on WHAT PRICE. **THE WATCHDOG IS THE POINT** — a dead stream is indistinguishable from a quiet market, so no tick for 20s falls back to the Open API quote AND raises an alarm, once per outage, re-armed on recovery. Tested by KILLING the session, not by reading it |
| `shared/symbols.py` | **one place that knows `GBP/USD` is the broker's `GBPUSD`** (added 2026-08-30). `data_source.py` had done this correctly since the beginning and the order path had not; both now call the same function so the rule cannot drift into a third copy. Broker affixes (`EURUSD.r`) and nicknames (`GOLD`) are deliberately NOT handled — Pepperstone serves plain names, and resolution failing loudly beats an order placed on a guessed instrument |
| `monitor/position_tracker.py` | **the trade tracker** (added 2026-08-21) — breakeven at 1R, trail-to-1R and 2R-reached, measured on the REAL position. Advice only |
| `vix1_cross.py` | **THE CROSS and the order level** (added 2026-08-20) — a 1M CLOSE past the line, then one candle, then one tick beyond how far price got. The whole of the 1M's job |
| `vix1_preclose.py` | **the NOTIFICATION before the momentum candle closes, and the STAND-DOWN after it** (added 2026-08-20, loop closed 2026-08-21). The ONE place in VIX.1 that reads the bar still FORMING on purpose. Fires at T-5, DM only, no entry/stop/target. **That bar does not come from the feed** — the feed serves closed bars only, so it is rebuilt from M1 by `candle_aggregator.forming_bar` and appended by the runner (`wants_forming`). Between 2026-08-20 and 08-21 there was no such bar and this fired zero times. `standdown_signal` reports the ~1-in-4 candle that closes WITHOUT qualifying, keyed off the notification's own ledger entry so it fires only for a candle he was told about. Called a NOTIFICATION, never a warning — his word. **IT ONLY ANNOUNCES A CANDLE THAT COULD ACTUALLY TRADE (2026-08-26).** He received *"XAU/USD - BUY - closes in ~1 minute"* on 26 Aug 01:58 UTC and asked what the basis was, because he could not find one: the 1HR trend was DOWN and the card said BUY, and the production log said so four minutes later (*"down trend but no momentum candle that way"*). No route existed to trade it at any body size. `check` now asks the same question `detect_bias` asks - **BUY** needs the trend UP or an upward turn pending; **SELL** needs the trend DOWN. Deliberately NOT "must match the trend": that would mute the very reversals `vix1_choch` exists to catch. Pinned in `test_preclose_needs_a_route.py`. **THAT FILE ONCE CLAIMED TO REPLAY THE REAL GOLD EVENT AND DID NOT — corrected 2026-08-29.** The stored gold file ends 19 Aug 11:00, **158 hours before** the card's hour, so the section appended the 26 Aug forming bar onto bars stopping a week earlier and read the trend off that; the protecting level it compared against was $255 below where gold actually was. The section was REMOVED rather than left asserting a wrong answer on a broken fixture. To restore it, pull real XAU/USD H1 bars through 26 Aug 2026. **AND THE BUY CANDLE THAT IS ITSELF TURNING THE MARKET UP MAY NOW SPEAK (2026-08-29).** The two rules above are asked BEFORE the candle closes, so the state they read is the state BEFORE the break — meaning the bar that CREATES a pending turn up always looked counter-trend at the moment of asking and was always silenced. `_could_trade` now also allows a BUY whose forming close is already through the level protecting a downtrend (`TrendState.protected`), which is the codebase's one definition of a change of character, asked of the bar in progress. **ONE SIDE ONLY, and that is his 2026-08-25 rule rather than a choice made here** — traced through the real `trend_state` and `choch_entry`: a SELL closing through an uptrend's protection proposes `pending -1`, which `choch_entry` refuses outright, so it stays silent; a BUY closing through a downtrend's protection proposes `pending +1`, which yields a BIAS. It grants no permission the `pending == 1` test did not already grant — the SAME one, one bar earlier, on the bar that earns it. Both sides are asserted in `test_preclose_needs_a_route.py`, the refusing side as the control. **A DOWNWARD CANDLE IS ALSO HELD BACK UNTIL THE TURN HAS PROVED ITSELF (2026-08-26).** His rule: *"Send notification of momentum candle closure minutes remaining only when the momentum candle occur after pullback to align with the new pullback logic."* When a downward turn is proposed but not yet confirmed (`TrendState.pending == -1`) a bearish momentum candle produces NO notification — that is the same fact `choch_entry` refuses on, so the alarm clock and the entry can no longer disagree. **A turn UP is untouched**, and so is a down candle in an already-confirmed downtrend. The trend is read only AFTER the momentum test passes, so the cost falls in the few minutes before a qualifying bearish candle closes. The stand-down needed no change: it fires only for a candle he was told about |
| `vix1_spacing.py` | **how long the instrument stays shut after a signal** (added 2026-07-27) |
| `vix1_bias.py` | `detect_bias(h1, h4, symbol) -> Bias \| None` — momentum on H1, trend on H1 (H4 only as a fallback) |
| `vix1_state.py` | **`Bias` (what the 1HR decided) + `market_state` (the state it decided it in)** — added 2026-08-11 |
| `vix1_retracement.py` | **the retracement, counted in real time** — `bars` (the pullback this candle came after) and `stall_bars` (how long since the trend made progress). Added 2026-08-11, decides nothing yet |
| `vix1_swings.py` | **highs and lows in REAL TIME** + `structure_turns()` — the ONE place that decides where turning points come from, and the `REALTIME` flag. - a turn is marked the bar price closes through the candle that made it. No 48-bar wait. Added 2026-08-12 |
| `vix1_regime.py` | **THE REGIME ENGINE — TREND / RANGE / CHOP** on his locked 0.50 / 0.75 ATR numbers. `efficiency()` survives as a reported number only |
| `vix1_momentum.py` | momentum-candle detection + `momentum_grade` (A/B/C → confidence) |
| `vix1_building.py` | the heads-up card — the momentum candle has CLOSED, the entry is not decided yet. **Emitted on the candle alone since 2026-08-20; it used to be the else-branch of the entry search** |
| `vix1_log.py` | per-symbol log throttling, so a silent scan does not spam |
| `vix1_trend.py` | `trend_state` / `clear_trend` — the trend as structure, plus the BOS and CHoCH that move it |
| `vix1_structure.py` | `fast_pattern` / `leg_state` (**its OWN 8-bar lookback** — the `turns=` parameter was deleted 2026-08-19, see the reversal note below) + `market_permits` — the refusals: is the faster structure trending the opposite way (a pullback)? Never decides direction. **IT NOW OBEYS THE CHANGE OF CHARACTER (2026-08-29).** His rule: *"it doesn't make sense that the main pullback logic obeys CHOCH logic and 8 bars pullback logic ignores it."* When a turn is on record, swings that formed at or before it are ignored — structure from before the turn describes the move that ENDED. Too few left afterwards gives `unclear`, which does NOT refuse, so the gate goes quiet while its evidence is stale instead of refusing on it. **It is structural, not bad luck:** a swing needs 8 bars either side, so the newest 8 bars can never hold one — right after a reversal this gate is necessarily still describing the old move. On his GBP/USD 26 Aug case it compared swings 52, 16, 47 and 31 bars old and called a 21.5-pip drop "a pullback". **Measured over 1 year: 39/414 GBP/USD, 30/384 EUR/USD, 16/195 XAU/USD setups recovered, and NOTHING newly refused (0% on all three).** The 10 Aug loss this gate exists to prevent is unaffected — no turn was on record then. `choch_index` must come from the trend state computed on the SAME window. Pinned by `test_leg_gate_obeys_choch.py` |
| `vix1_choch.py` | **the change-of-character route — the one place a pullback is not asked for, and as of 2026-08-25 that is true of a turn UP ONLY** (added 2026-08-15). **A turn DOWN is refused here and handed to the normal route**, which requires a lower high and a lower low — i.e. the run, the pullback and the turn out of it. His rule: *"price breaks down through the old higher low → it runs down → it pulls back up → when that pullback turns back down, that's the proof."* It is a refusal rather than a fifth condition because his proof lands AFTER this function has already returned (the window shuts at the first confirmed low after the break — the moment the pullback begins). The upward path is unchanged. `choch_entry()` returns a `Bias` while a turn is proposed-but-unconfirmed, if momentum developed the new way out of a trending market. Re-detects nothing: reads `pending` / `choch_price` / `choch_index` off `TrendState` |
| `vix1_lines.py` | `draw_line` — ONE line, the momentum candle's body close |
| `vix1_pullback.py` | `is_pullback_candle` — IS this candle a pullback (the whipsaw rejection). The `find_pullback` search and `traded_past` were DELETED 2026-08-20 with the rest of the 1M analysis |
| `vix1_fractal.py` | fractal levels/breaks for the wrong-side case |
| `vix1_entry.py` | `m1_signals` — alignment, cross, entry, SL. Rebuilt 2026-08-20 and now ~165 lines; it reads NO 1M structure |
| `vix1_signal.py` | the card |
| `vix1_watch.py` | invalidation of a LOCKED pending setup |
| `vix1_manage.py` | the R ratchet state machine |
| `monitor/vix1_alerts.py` | emits the ratchet advice (wired at `signal_monitor.py:94`) |

## Entry, stop, target

| | rule |
|---|---|
| **Bias** | 1st momentum candle of a run (`_MIN_RUN = 1` — deliberate; measured on 1,433 real momentum candles) |
| **Line** | that candle's **body close**. ONE line — line 2 was deleted |
| **Alignment** | our side of the line -> wait for the CROSS. Wrong side -> the counter-move's last fractal must break first |
| **Cross** | at least one 1M candle must **CLOSE** past the line — not a touch (`vix1_cross`, 2026-08-20) |
| **Spread** | added to a **BUY** level and never to a sell — cTrader triggers a buy stop on the ASK and candles are BID, so without it a buy fires a spread early, on a break that never happened (2026-08-21) |
| **Entry** | a **STOP order one tick beyond the furthest price reached** between the crossing candle and the ONE candle after it. Measured off his own trade: reach 1.11733 -> order 1.11734 |
| **No pullback** | the setup is **NOT skipped** — the pullback is ASSUMED, the entry is taken and the card says `PULLBACK ASSUMED` on its face. About **half** of all entries |
| **Already through** | price past the level at the decision -> a **MARKET** entry at current price, not a refusal (~25-29%) |
| **SL** | beyond the **LINE**, or beyond the pullback's far edge when it dipped through — **never a pip count**. Gap 0.5x the 1M's recent range; floor **1.0x that range PLUS the spread** (a stop shorter than the cost of getting in cannot win); ceiling one 1HR candle |
| **TP** | **4R** (2026-08-21) — *"take profit at 4R"*; 2R is now the FLOOR, the outcome when momentum dies, not a price on the order |
| **Management** | the LADDER, measured on the REAL position: **1R → breakeven (net-zero, not the entry) · 2R → lock +1R · 3R → lock +2R · 4R → lock +3R, then the order's own 4R take profit exits**. Advice always; MOVED FOR HIM when `AUTO_BREAKEVEN_ENABLED` is on (off by default, demo-only, ratchet-only, both SL+TP legs always sent) |
| **Spacing** | while a signal on this INSTRUMENT is still running, the next needs **3 momentum candles closed after the previous signal's anchor candle**. A closed previous signal — *including a loss* — voids the wait |

### Signal spacing (`vix1_spacing.py`) — added 2026-07-27

The user's rule verbatim: *"if a viable signal is detected immediate[ly] the previous one was taken
and is still running, it must be after 3 momentum candles preceding the 1HR momentum candle where the
first signal was taken has been achieved… However, if the first signal was a loss, the second one if
meets conditions can be fired. This only applies for signals from the same instrument."*

| aspect | rule |
|---|---|
| **scope** | the INSTRUMENT — EUR/USD never gates GBP/USD, and it covers buy and sell alike |
| **when** | only while a previous signal on that instrument is `active` (a resting stop order counts) |
| **anchor** | the 1HR **momentum candle** that produced the previous signal — NOT its creation time |
| **gate** | `_MIN_CANDLES = 3` momentum candles must have CLOSED after the anchor |
| **counting** | any momentum candle, either direction (`_COUNT_BOTH_DIRECTIONS = True`) |
| **release** | a CLOSED previous signal voids the wait entirely, **loss included** |
| **failure** | fails OPEN on a DB error (other guards stand), but always logs why |

**The invariant: DERIVED, NEVER STORED.** The anchor is re-derived from the H1 window (the freshest
momentum candle that had closed when the previous signal was created) and "is one still running" is
asked of the DATABASE. Nothing lives in RAM — deliberately, because the duplicate-signal defect found
the same day was caused by exactly that kind of process-local state.

**This stacks with one-signal-at-a-time; neither replaces the other.** That rule is per
instrument+direction and is enforced in the database; this one is per instrument.

### Momentum-candle gates (`vix1_momentum.py`)
`_MIN_BODY_MULT 2.5` × the 100-bar median body · **`_LONG_BODY_MULT 2.12` × the 2,000-bar median
body** · `_MIN_BODY_FRAC 0.50` of its own range · `_MIN_VS_PREV 1.0` (bigger than the previous body) ·
`_MAX_CWICK_FRAC 0.25` counter-wick.
A-grade: `_A_BODY_FRAC 0.75` + `_A_CWICK_FRAC 0.15` → `_A_CONF 0.85`.

**These were calibrated 2026-07-20/21 against his real candles. Do not re-tune them without his data.**

### The SECOND size test — the long window (added 2026-08-10)

**Two size tests, ANDed.** The 100-bar one is only ~4 trading days and a quiet spell collapses it:
GBP/USD 10-Aug 09:00 UTC, median body 2.9p, so `2.5×` asked for just **7.25 pips** and a 7.5-pip
nothing candle fired a signal. The second test asks `2.12 ×` the median body of the last **2,000
bars** as well, a window a quiet week cannot move.

| | |
|---|---|
| **where 2.12 came from** | HIS standard, not a chosen number. Two GBP/USD candles he named as the minimum he would trade (06-Aug 14:00 and 15:00 UTC, bodies **11.3p** and **12.4p**): 11.0 / 5.20 = **×2.12**; the equally-rare EUR/USD body (8.4p) / 3.95 = **×2.13**. One number serves both pairs |
| **today it asks** | ~**11.0p** GBP/USD · ~**8.4p** EUR/USD |
| **how often it BINDS** | 14% GBP/USD · 16% EUR/USD — the dead patches only; ~85% of the time the 100-bar test is already stricter and nothing changes |
| **cost** | ~1.7 momentum candles per month per pair (55.5→53.8 GBP/USD, 56.2→54.3 EUR/USD) |
| **why 2,000 and not 3,000** | the fetch asks for a WINDOW of `(count+10)` HOURS, but H1 bars exist only while the market is open — 120 a week, not 168. `count=3000` spans 125 calendar days and delivers **~2,150** real bars. 2,000 is what can be relied on |
| **short history** | under `_LONG_MIN_BARS` (1,800) the test SKIPS rather than rejects — a strategy going silent on a short window is a worse bug |
| **float tolerance** | `_LONG_EPS 1e-6` pips. His own 11.3p candle computes as `11.30000000000075`; without tolerance a candle genuinely on the line could be refused by the rule built from it |
| **satisfies** | his settled rule *"nothing hardcoded where the market can say it"* — a flat 11-pip floor would have broken it, and would also have gone stale (GBP/USD's median body halved between 2022 and 2024) |

**`symbol` is a REQUIRED argument** on `is_momentum_candle` / `momentum_run` / `veto_reason` and is
threaded through `vix1_spacing` too. Not defaulted: `pip_size("")` returns the right value for these
two pairs and would be **silently wrong** for a yen pair. A caller that forgets must fail loudly.
`vix1_spacing` uses the same test on purpose — **a momentum candle must mean ONE thing**, or the
spacing gate would count candles the setup would not.

### The turn is TWO-STAGE, and the leg must prove itself (added 2026-08-11)

A body close through the protecting swing no longer flips the trend. It raises a **CHoCH — reversal
proposed**; the trend turns only once the new direction **confirms with a BOS**. Until then it reads
`0` ("changing") and nothing may be traded.

| | measured over 12 months |
|---|---|
| phases under two days (noise) | **2 -> 0** on both pairs |
| median phase length | GBP/USD 334 -> 411 bars · EUR/USD 246 -> 350 |
| the old FREEZE (`protected = None`, trend could never turn) | GBP/USD 62% of bars, once 873 bars — **gone by construction** |
| does a reversal mean anything? | median phase catches **+177 pips** (EUR/USD) / **+227** (GBP/USD) its own way; **1 of 70** phases never moved that way |

> ⚠ **THAT TABLE MEASURED THE 48-BAR LOOKBACK SOURCE AND IS NOT WHAT SHIPS** (corrected 2026-08-15).
> It was taken on 11 Aug; real-time turning points went in on 12 Aug and nobody re-measured. The
> two-stage rule is unchanged and still works — the eyesight feeding it got ~11x sharper, so the
> trend turns far more often. What actually runs, over 12 months of real H1:
>
> | source | direction reversals | median time in one direction | runs under two days |
> |---|---|---|---|
> | **real-time (ships)** | **87 / 94** | **40 bars / 36 bars** | **49 of 91 / 55 of 97** |
> | 48-bar lookback | 10 / 9 | 412 bars / 618 bars | 0 / 0 |
>
> Proved, not assumed: flipping `REALTIME` off reproduces the original table almost exactly (10
> reversals, median 412 bars vs the documented 411). The sliding 1500-bar window is **not** the cause
> — a fixed start gives identical counts. **Operational cost is small:** of 111 / 108 signals in 12
> months, the trend flipped against the resting order inside its 24-hour life on only **18% / 21%**,
> median 13–17 hours in, never sooner than 4. See "the noise guard was blind" below.

**A responsive protection level was tried and REJECTED** — moving protection to each counter-swing
reads a reversal earlier but takes trend changes 10 -> 14 / 10 -> 16, and `test_trend.py` failed it on
the 4-year stability property. Do not retry it without new evidence.

**`test_trend.py` counts COMPLETED reversals** (UP<->DOWN, ignoring the "changing" step) and prints
the OLD raw count beside it. The definition changed because a turn now has three states, not to
flatter the numbers — the user insisted both be kept visible.

**`vix1_structure` may only say NO.** Direction comes solely from `vix1_trend`; this module refuses
only when the faster (8-bar) structure is trending the OPPOSITE way — "the candle is in a pullback".
An unclear or mixed faster reading does NOT block a trade. Requiring positive confirmation was tried
and rejected: it permitted trading only 15-18% of the time a trend existed.

**The 4HR fallback is MUTED, not deleted** (`vix1_bias._ALLOW_H4 = False`) — kept on his explicit
instruction, with the dead-code rule waived in the comment. It was already dead (0 of 622 samples),
and the two-stage turn would have revived it into the reversal window (18% / 11% of momentum candles).

**Measured over 2 years, both pairs:** 11.4 setups/month GBP/USD, 14.4 EUR/USD; the pullback refusal
removes 26% of all momentum candles on BOTH pairs.

### THE CHANGE-OF-CHARACTER ROUTE — the exemption from the pullback rule (added 2026-08-15)

**There are now TWO ways into a trade.** The normal one needs an established trend and passes the
pullback refusal. The second exists because that refusal blocked the trade he actually takes.

**Replayed on his own chart — EUR/USD 28 Jul 2026, real cTrader bars.** Low 1.13527, his marked level
1.13722 (the 11:00 high), then the 17:00 candle: 13.6 pips, 89% body, closing through it.

| chart time | before this change |
|---|---|
| 17:00 (his candle) | refused — "trend is changing, waiting for confirmation" |
| 18:00, 19:00 | refused — same |
| 20:00 → 05:00 | trend UP, candle recognised — refused, **"the leg says pullback"**, ten hours |
| 06:00 | candle older than `LOOKBACK`, gone |

**Two independent refusals**, so removing either alone changes nothing — hence a route, not a patch.

**The four conditions** (`vix1_choch.choch_entry`), all of which must hold:

1. a turn is **proposed but not yet confirmed** (`TrendState.pending`)
2. **no pullback has begun since the break** — no confirmed swing against the new direction after it
3. a **momentum candle going the new way** — the break alone is never a trade
4. that candle sits **at or after the break** — one from before it belongs to the reversed move
5. the market **before the break** read **TREND**, not CHOP or RANGE

Then the pullback refusal and the two-stage wait are **both skipped**.

**WHERE THE WINDOW ENDS, WITH NO TUNED NUMBER.** Two of his rules set the edges:
*"a pullback ends when CHOCH begins"* opens it, and *"the exemption ends when we have the first
pullback after CHOCH so that we dont trade in pullbacks again"* closes it. Measured: median **4h**
(EUR/USD) / **5h** (GBP/USD), 97% inside 24h. His chart was 3h.

**CONDITION 2 IS DELIBERATELY REDUNDANT TODAY** — measured over 12 months on both pairs it closes the
window on the same bar as waiting for confirmation, so 0 setups and 0 open-hours differ. It is
written out anyway because the equivalence is an accident of the current confirm rule: after an
up-turn price has just closed above the old lower high, so the first confirmed high is almost always
a HIGHER high, and a higher high is what confirms. **Change `vix1_trend`'s confirm rule and the two
come apart silently, with this route trading pullbacks again.** Tested by injecting the swing, since
the market does not currently produce the case.

| | EUR/USD | GBP/USD |
|---|---|---|
| changes of character in 12 months | 98 | 93 |
| **setups produced** | **30 (2.5/month)** | **16 (1.3/month)** |
| existing route: bias-hours before → after | **1005 → 1005** | **971 → 971** |
| lost / altered | **0 / 0** | **0 / 0** |

That last row is the proof it only ADDS: the real `detect_bias` run twice over 12 months with the new
route stubbed out for the before-run.

**THIS IS THE ONLY REVERSAL ENTRY IN THE STRATEGY**, and it re-opens "pro-trend only"
(2026-07-25/26) knowingly, on his instruction, with the frequency shown before he approved. The
2026-07-26 `choch4` origin stays deleted; this is not that rule — that one fired on a bare structure
break, this one requires momentum out of a trending market.

**KNOWN TAIL:** 2% of EUR/USD episodes stay unconfirmed past 72h (worst 104h) and the exemption stays
open throughout. **He was offered a cap and declined one.** Do not add one without him.

### PHASE A — the retracement is COUNTED, and a range is DETECTED (added 2026-08-11)

His rule: *"A pullback can be from 1 candle or more so it should count candles... After a rally we
start counting retracement candles and if a momentum candle comes after them we trade."* And:
*"length never disqualifies — the retracement, the reversal detector and the range detector work hand
in hand."*

**Why the 8-bar structure read could not answer it** — measured over 12 months, both pairs:

| | |
|---|---|
| it fires on the wrong SIZE of move | refuses at a median **58 pips / 43 bars**, allows at **19 pips / 14 bars** |
| it says nothing about a live pullback | counter candles just before: **0** when it allows, **1** when it refuses |
| it is 8 hours late by construction | a pivot needs 8 bars *after* it before it can be confirmed |
| it is blind to short retracements | **99%** of retracements run under 8 candles (48% are one candle, 26% two) |
| its most common answer is "cannot tell" | **40%** of momentum candles read "mixed" — which passes |
| nothing detected a range, ever | the trend reader **never once** said "no trend" in 12 months |
| so we trade chop routinely | our trades sit at efficiency **0.25** vs the market's **0.21** — the same market |

**Three layers now, one question each.** `vix1_trend` (48-bar structure) owns direction and the
reversal — **unchanged**. `vix1_retracement` owns the pullback. `vix1_regime` owns "is this still a
trend at all".

**`vix1_retracement` carries TWO numbers, and conflating them was a real defect** caught by measuring
after the plan was approved. `bars` is the retracement the latest candle **came after** — the candle
itself is stepped over, because a momentum candle goes the trend's way and a walk-back straight from
the end reported **0 at 100% of setups on both pairs**. `stall_bars` is candles since the trend last
made a new extreme — a different fact, median **156**, which is a true statement about the trend and
a useless answer to "how long is this pullback". Depth is given in pips **and** in ATR.

**`vix1_regime`** is directional efficiency: net distance ÷ path walked, over 20 closed bars. No
pivots, so no delay. **There is deliberately no threshold constant in the file** — the measured
distribution is perfectly smooth with no natural break, and cutting at 0.20 would call ~47% of all
time "ranging" and remove ~41% of current trades.

**THE MEASUREMENTS DECIDE NOTHING — with ONE exception, added the same day at his instruction.**
Both numbers are computed, printed on the card, on the heads-up DM, and on **every** log line
including the refusals (the refused setups are the comparison group). **Proven, not asserted:** the
12-month replay of the measurement-only step produced identical setups before and after (GBP/USD
377/377, EUR/USD 422/422, zero disagreements). Efficiency thresholds are still Phase B, set by the
user from real signals — picking them from one year of two pairs is how the n=12 swing width (55%
agreement) and the daily timeframe (65%) each looked right on the day and were worse over four years.

### THE DEVELOPING-TREND RULE WAS BUILT AND REVERTED THE SAME DAY — read this before rebuilding it

Built 2026-08-11 on his instruction, reverted 2026-08-12 on his own correction. **Do not re-add it
without reading why it was wrong**, because it looked entirely reasonable and it measured cleanly.

**What was built:** a `developing` trend could only be traded off a momentum candle that came AFTER a
retracement. It removed 28.1% of GBP/USD and 15.1% of EUR/USD setups — half of every developing
setup — and refused 0 developed ones. Mechanically flawless, and answering the wrong question.

**WHY IT WAS WRONG — two separate errors, and the second is the one to remember.**

1. *His stated rule was already guaranteed.* "The momentum candle comes after the first HH and HL" is
   structural, not a filter: a 48-bar swing cannot be confirmed until 48 bars after it prints, and
   the momentum candle is only ever sought in the last `LOOKBACK=12` bars. Measured over 12 months,
   the gap between the establishing swing and the momentum candle was **never** negative — min 41
   bars, median 209, on both pairs. The rule as he described it can never fail, so anything that DOES
   fail is a different rule wearing its name.

2. *The `developing` label does not mean what it sounds like.* A trend stays `developing` until its
   NEXT swing high is confirmed at the 48-bar scale, which takes a median of **209 bars — over eight
   trading days**. His "we start looking once the second high begins printing after the first low" is
   a REAL-TIME observation, made as the second high forms. The label is a CONFIRMED-STRUCTURE
   reading, made a week later. They are not the same event, and gating on the label was therefore
   gating on something he had never described.

**His rule, corrected 2026-08-12 and stated plainly:**

> "It is not a rule that the momentum candle must only come in the high after the first retracement —
> it can come anywhere along the trend so long as we are in trend, and that candle must not be in a
> retracement, because retracements can sometimes turn into a reversal."

So there is **no separate developing rule**. There is one condition on the candle — *it must not be
in a retracement* — and it applies at every maturity. That is the same job `vix1_structure.leg_state`
is doing today, badly (see the table above); replacing it is open work, not a settled design.

### THE MARKET-STATE GATE — his "not in a retracement", built 2026-08-12, SHIPS INERT

`vix1_structure.market_permits(retracement, efficiency)`. His settled design, in his words:

> *"The retracement should work with reversal or CHOCH detector and range detector hand in hand to
> determine if what is going on is still a trend or a range or the CHOCH is developing again."*
> *"...that candle must not be in a retracement, because retracements can sometimes turn into a
> reversal."*

**IT DOES NOT INTERROGATE THE CANDLE.** He settled that separately and it is not re-openable:
*"Momentum candle is a proof of the continuation of the trend."* The candle IS the evidence the
retracement ended, so the only question left is whether the MARKET is in a safe state.

| the three readings | where it lives | status |
|---|---|---|
| a reversal is forming | `vix1_trend` — a pending CHoCH gives direction 0 | **already refusing** |
| the market is ranging | `market_permits`, from directional efficiency | built, **threshold unset** |
| the pullback has gone too deep | `market_permits`, from depth ÷ ATR | built, **threshold unset** |

**THE TWO NUMBERS ARE HIS AND SHIP AS `None`** — "not set", not zero. He reserved them: they are to
come from real signals, because the measured distributions have no natural break and anything picked
from one year of two pairs is fitted. **Proven inert:** with both unset, a 12-month replay produces
the identical setup list whether the gate runs or is forced open (GBP/USD 158 = 158).

Why depth belongs here at all: the level protecting the trend sits far away by construction (48-bar
swings, median 57-candle leg), so "price has not closed through it yet" is weak on an hourly chart.
Between an ordinary pullback and a confirmed reversal is a zone neither other reading covers.
**Measured against ATR, never against the leg** — the leg needs the far-away pivot and drags that
delay back in.

**What the data says, so the choice is informed rather than invented (12 months, both pairs):**

| efficiency cut | of ALL time called "ranging" | current trades removed |
|---|---|---|
| 0.15 | ~37% | ~26% |
| 0.20 | ~47% | ~41% |
| 0.25 | ~58% | ~50% |

Depth at the candles currently traded: median **5.2× ATR** (GBP/USD) / **6.8×** (EUR/USD), upper
quartile **12.3× / 13.2×**.

**STILL OPEN after this:** the real-time *"second high after the first low"* trigger. Nothing
implements it — the code waits for a 48-bar swing to confirm, a median 209 bars later.

### THE REGIME ENGINE — TREND / RANGE / CHOP (2026-08-12), SWITCHED ON

He challenged the previous approach head-on: *"Why have you switched them off? If they were to be
switched off then why are we building"*. He was right, and the underlying reason was worse than the
symptom: the range test had been built on EFFICIENCY, no defensible cut existed in the distribution,
and it shipped inert instead of me concluding **the instrument was wrong**.

**His locked numbers:** material HH/LL progress **0.50 x ATR** · same-boundary tolerance
**0.75 x ATR** · minimum swing-size filter **none** · efficiency **removed from the decision**.

```
confirmed swings -> did BOTH sides progress by > 0.50 ATR ?
                      yes -> TREND
                      no  -> two highs within 0.75 ATR of each other, AND two lows ?
                               yes -> RANGE   (bounded, orderly - his clean-range chart)
                               no  -> CHOP    (reversals without stable boundaries)
```

**THE ORDER IS LOAD-BEARING** and is pinned by a test. The thresholds overlap on purpose: a high
clearing the previous one by 0.6 ATR is BOTH progress (>0.50) and the same boundary (<=0.75).
Progression is asked first. Swap them and a shallow uptrend reads as a range.

**MEASURED over 3 years:**

| | GBP/USD | EUR/USD |
|---|---|---|
| how the time splits | 44.4% trend · 12.9% range · **42.8% chop** | 43.4% · 12.2% · **44.4%** |
| setups it would refuse | **90 of 198 (45%)** | **93 of 191 (49%)** |

**That refusal rate is corroborated, not a surprise.** A separate measurement from a different angle
found our momentum candles sitting at a median efficiency of 0.25 against a market median of 0.21 —
the strategy was trading chop at the market's own background rate. Two independent instruments
agreeing that roughly half of what we take is not in a trend is the finding.

**TWO THRESHOLDS WERE DELETED, and the tests assert they are GONE rather than unset:** the
retracement DEPTH test (his argument — a retracement deep enough to matter breaks the protected low
and the CHoCH detector has it) and the EFFICIENCY cut.

### THE DECISION WAS FROZEN AT THE MOMENTUM CANDLE (root cause, fixed 2026-08-19)

**This is the actual cause of the gold incident.** The pullback-gate repair below is real and stays,
but it is not why he got that signal.

**What happened:** one momentum candle (18 Aug 14:00) produced a SELL on **every scan for 13 straight
hours**, ageing 0h → 11h, while price fell $33 and bounced $23 back. He read the alert and said
*"there is no momentum candle that has CLOSED there"* — correct, it was eleven hours behind him.

**Why:** the leg gate, the regime and the retracement are all computed on a window truncated to the
momentum candle (`_upto`). As the candle ages, the whole judgement ages with it. The same call, two
ways, over those twelve hours:

| | as the code read it (frozen at the candle) | the same call at the latest bar |
|---|---|---|
| hour 0 | 1 bar · $3.00 · 0.19 ATR | 1 bar · $3.00 · **0.19 ATR** |
| hour 8 | 1 bar · $3.00 · 0.19 ATR | 0 bars |
| **hour 10** | 1 bar · $3.00 · 0.19 ATR | 2 bars · $31.92 · **1.72 ATR** |

The left column does not move for twelve hours. `vix1_retracement` **already computed** the right
column — it was read at the frozen point and was not a gate.

The freezing was deliberate: *"reading the structure as it is NOW would let a pullback that formed
AFTER the candle decide the candle's fate."* That is correct for *"was this good evidence when it
formed"* and **backwards for *"should an order go out right now"*.** Only the first was ever asked.

**A — `core/instrument_debut.py`, the backfill guard (threshold-free).** A candle that closed before
the instrument was first scanned is history the platform never watched. Gold was switched on
mid-session and its first scan reached straight into `LOOKBACK = 12` hours of it. Measured over 600
possible cold starts per instrument:

| | first scan fires | **of those, on backfill** | with the guard |
|---|---|---|---|
| XAU/USD | 124 | **107 (86%)** | **0** |
| EUR/USD | 95 | 78 | 0 |
| GBP/USD | 111 | 93 | 0 |

Debut is recorded in **bar time, not wall clock** — a wall-clock debut would make every replay and
test refuse everything. Persisted in its own `strategy_state` row (`<id>:debut`), because
`FiredRegistry._persist` replaces the whole blob and would silently wipe a shared one. In continuous
running it changes **nothing** (0 of 120 bars differ) — it is a guard, not a filter.

**The CHoCH route needed the same guard and was missed on the first pass** — it returns from
`detect_bias` before the main path's check, leaving 24 of 107 still firing. The test caught it, not
a reading of the code. Any route that emits a `Bias` needs the guard.

**B — the live re-check.** Every causal read stays; the leg gate and regime are now ALSO asked about
the present, and a setup that was valid when the candle formed but is not valid now is refused with
that stated reason. Measured cost on its own: 2 / 1 / 1 setups over 1500 bars.

**C — THE PULLBACK IS HELD AS STATE AND A MOMENTUM CANDLE ENDS IT. NO THRESHOLD. His rule, and he
corrected me twice to get here.**

First: *"why do we need a number? I thought we were tracing pullback in real time. I thought the
challenge would only be complex pullback not a simple swing."* Then, decisively: *"if the first candle
that goes against the pullback is a momentum candle we take a trade. But if it is not we wait until we
get one."*

**That second correction is the whole design.** A momentum candle does not merely survive a pullback —
it is what ENDS one, which is his settled *"momentum candle is a proof of the continuation of the
trend"*. So the question is **not** "is a pullback running" (that refuses every continuation entry —
measured, ~40% of setups) but **"did this candle come BEFORE the pullback that is running now"**. A
candle from before it cannot be the candle that ended it.

**That is precisely the gold defect:** the signal's momentum candle was 18 Aug 14:00 and the bounce
began 19 Aug 00:00, eleven hours later.

`vix1_retracement.pullback_since()` — **stateless**, derived from the window each scan so a restart
cannot lose a running pullback and a replay behaves like production. Cost of the whole rule:
**1 / 2 / 0 setups** over 1500 bars.

**MEASURED ON CLOSES, NOT WICKS — and that decided the case it was built for.** The 19 Aug 01:00 gold
bar wicked to a NEW LOW at 4324.54 and closed at 4356.46, **$32 higher**. Read by the wick the
downtrend "resumed" and the pullback ended; read by the close it plainly did not. His framework is
body-based wherever it matters — a CHoCH needs *"the body of a candle"*, a momentum candle is a body
test — so a wick through an extreme is not the trend carrying on.

**HIS MODEL TILES THE SPACE — no complex-pullback detector is needed.** He asked: *"past the pullback
we have CHOCH, so it's either a pullback or a CHOCH."* Measured over 1500 bars, every pullback ended
in exactly one of his ways and nothing else:

| | episodes | ended in CHoCH | ended with the trend resuming | third case |
|---|---|---|---|---|
| XAU/USD | 102 | 22% | 77% | **none** |
| EUR/USD | 63 | 33% | 65% | **none** |
| GBP/USD | 69 | 19% | 80% | **none** |

**An earlier run of mine reported 0% ending in a CHoCH and was WRONG** — a CHoCH sets `direction = 0`,
and that script treated `direction == 0` as "no data" and discarded exactly those episodes. It briefly
made his model look broken when the fault was the measurement.

**CHoCH vs reversal, since it came up:** the code splits one event in two. A **CHoCH** is the body
close through the protected level ([vix1_trend.py:266](../../signal_platform/strategies/vix1_trend.py#L266)) — it sets
the trend to NONE at once, so nothing trades that direction. A **reversal** is the new direction then
proving itself with its own break. They are the same event at two moments; the gap exists only because
a break can fail. **That two-stage design is his own** (2026-08-11: *"a temporary break should not
automatically become a new trend"*).

**A DEPTH THRESHOLD IS NO LONGER NEEDED and was never the right instrument.** Four alternatives were
measured and rejected on the way here — a shortened real-time window, a causal 8-bar detector (right
window 6/4/3/2/1), the live leg gate (reads *allow* during the bounce), and "a counter-turn confirmed
since the candle" (never confirms). A trailing counter-candle count was built and then **deleted** once
this replaced it, rather than left as dead code.

---

### ⚠ THE SECTION BELOW WAS REVERSED ON 2026-08-19 — read this first

**Giving the pullback gate the trend's real-time turning points was wrong, and it cost a live
misfire.** The trend needed real-time eyes; the GATE did not. Both readings became the same source,
so `leg_state` was asking the trend to contradict itself and the "faster structure" left the decision
entirely. Gold sold into a visible bounce on **18 Aug 14:00** because of it — he spotted it by eye.

**Root cause:** `vix1_swings` marks a turn only when price **closes decisively through** the candle
that made the extreme. That is a change-of-character test, and his settled rule is *a pullback ends
when CHoCH begins* — so that source cannot see a pullback until the pullback is finished.

**Measured over 900 bars — counter-trend bounces the real-time source NEVER flagged, start to end:**

| | XAU/USD | EUR/USD | GBP/USD |
|---|---|---|---|
| bounces missed entirely | **71%** | **82%** | **50%** |

**The lag it was swapped out for is not real.** An n-bar pivot needs n bars on its right, but the
VERDICT compares the last two highs and lows and flips on pivots already confirmed — it calls a
bounce a median **1-4 bars** after the turn, not 8.

**A causal variant was built and measured before this was settled** (left window 8, right window
swept 6/4/3/2/1; right=8 reproduces the current detector as a control). It fixes nothing extra, and at
right ≤ 4 it **allows MORE** on gold — early pivots un-turn, the verdict falls to "mixed", and "mixed"
does not refuse. The symmetric 8 stays; no new detector was added.

**THE ONE MEASUREMENT THAT STILL ARGUES THE OTHER WAY, kept rather than buried.** The separation
table below was re-taken through the production path (`market_state`, both sources, same momentum
candles). The bar counts in the original were an artefact — `direction_since` indexes the full window
while the gate reads a truncated one — but the DEPTH column reproduces, and it still favours the old
wiring:

| | setups | refused | ALLOWED at | REFUSED at | "cannot tell" |
|---|---|---|---|---|---|
| EUR/USD real-time | 280 | 70 | 5.5p | 6.2p | 0% |
| EUR/USD **8-bar** | 280 | 62 | 4.0p | 6.1p | 32% |
| GBP/USD real-time | 301 | 68 | 18.9p | **48.6p** | 0% |
| GBP/USD **8-bar** | 301 | 45 | 21.4p | 2.2p | 47% |
| XAU/USD real-time | 404 | 65 | 602p | **3543p** | 0% |
| XAU/USD **8-bar** | 404 | **124** | 637p | 572p | 38% |

**Why it was not treated as decisive:** refusing at 48 pips / $35 into a counter-move is refusing when
the move is long over — that is a reversal detector, not a pullback filter. The gold misfire had
bounced **$31** and the real-time source still allowed it. The 8-bar source refuses shallow because it
is catching the bounce as it starts, which is the job. **The metric rewards lateness.** That reading
is an interpretation, and it is flagged as one. The two hard facts it rests on are not: his own eye on
the gold chart, and the missed-bounce percentages above.

**Honest cost:** the 8-bar source answers "cannot tell" 32-47% of the time (the real-time source
always gave a verdict), and mixed/unclear ALLOWS. It is more often silent AND more often refusing —
on gold it refuses 124 setups against 65.

**SIGNAL IMPACT, through the real `detect_bias`** (old wiring patched back in for the before-run, so
both routes are included — the CHoCH route deliberately skips this gate and a trend-route-only
replication misses it):

| | before | after | trend route alone |
|---|---|---|---|
| XAU/USD | 45 (15.0/mo) | **38 (12.6/mo)** −16% | 36 → 31 |
| EUR/USD | 37 (13.0/mo) | 37 (13.0/mo) 0% | 22 → 24 |
| GBP/USD | 33 (11.4/mo) | 34 (11.7/mo) +3% | 28 → 30 |

Gold loses the pullback trades; the FX pairs are flat-to-up, because the gate releases setups the old
wiring wrongly blocked.

#### "CANNOT TELL" — measured, because a review argued it is the next bug (2026-08-19)

The argument: mixed/unclear ALLOWS, and "the detector has no clean evidence" is not the same as
"this is not a pullback", so uncertainty is being silently converted into permission.

**FIRST, THE PREMISE IS NOT NEW.** This is not something the 08-19 change introduced — it is the
8-bar detector's behaviour for the strategy's whole life. Recorded above for the pre-08-12 detector:
*"its most common answer is 'cannot tell' — 40% of momentum candles read mixed, which passes"*,
GBP/USD 41% / EUR/USD 34%. Today's 32-47% is that same number restored, not a regression.

**SECOND, MIXED IS THE SAFEST BUCKET, not the most dangerous one.** Momentum candles grouped by
verdict, scored against counter-trend legs from symmetric ±8 pivots (lookahead allowed — it scores a
detector, it never trades):

| | WITH trend | AGAINST (refuses) | **MIXED (allows)** |
|---|---|---|---|
| XAU/USD | 32% of candles · 65% in a leg | 31% · 63% | **38% · 26%** |
| EUR/USD | 46% · 52% | 22% · 53% | **32% · 51%** |
| GBP/USD | 38% · 57% | 15% · 78% | **47% · 38%** |

On every instrument MIXED is **less** likely to sit inside a real counter-trend leg than a WITH-trend
verdict is. Allowing it is supported by the measurement, not contradicted by it. (EUR/USD's flat
52/53/51 says the ±8 leg definition has a ~50% base rate and simply cannot discriminate there — a
limit of the yardstick, stated rather than hidden. GBP/USD and XAU/USD do separate.)

**UNCLEAR is 0% everywhere** — the ambiguity is always MIXED (a non-monotonic structure), never "too
few pivots to compare". The two were worth separating and now need not be.

**THIRD, A "WAIT" POLICY WAS MEASURED AND IS WORSE.** The proposal: hold an ambiguous setup instead
of allowing it, and let the next bars resolve it. A momentum candle stays live for `LOOKBACK = 12`
bars and the gate re-asks every scan, so this is measurable exactly. What an ambiguous verdict BECOMES
(the detector's own later readings — no outcome scoring of any kind):

| | resolves WITH (allowed, later) | resolves AGAINST (**WAIT refuses**) | never resolves (**WAIT drops**) |
|---|---|---|---|
| XAU/USD | 41% | **0%** | **59%** |
| EUR/USD | 63% | 22% | 15% |
| GBP/USD | 55% | 14% | 30% |

**On gold — the instrument that motivated this entire fix — WAIT refuses ZERO extra pullbacks and
drops 59% of ambiguous setups.** Pure cost, no benefit, on the exact case it was proposed to solve.
On the FX pairs it catches 14-22% at a cost of dropping 15-30%. Not built.

**AND "MIXED → REFUSE" IS A SETTLED, ALREADY-REJECTED DECISION.** It is the "must CONFIRM" rule
described at the top of `vix1_structure.py`: built, measured at **15-18% of trend-time tradeable**,
and rejected against his *"we are always in trend"* — it also refused two candles he had named as
good. Re-opening it is his call and nobody else's.

---

### THE PULLBACK GATE GOT REAL-TIME EYES TOO (2026-08-12) - four defects, one cause — ⚠ REVERSED, see above

He asked how many of the catalogued problems were actually solved, then pointed out that some I had
marked "unsolved" already had an agreed solution. Checking found `fast_pattern` - the gate that
decides *"this is a pullback, not a continuation"*, the module whose defects started the whole
conversation - **still calling the 8-bar lookback detector, completely untouched.**

So VIX.1 had **two eyesights inside one decision**: the trend read in real time, the pullback gate
8 hours late and blind to any retracement under 8 candles (99% of them). I had fixed the lag in the
reader I was looking at and left the identical lag in the one catalogued first.

Four of the five defects against this module were the SAME cause - a turning point it could not see
until n bars later - so one change addresses them together. `fast_pattern`/`leg_state` now take
`turns=`; the RULE is untouched.

**MEASURED, 12 months, both pairs, like-for-like (same trend source, only these eyes differ):**

| | before (8-bar) | after (real-time) |
|---|---|---|
| "cannot tell" - and it PASSES - GBP/USD | **41%** | **26%** |
| "cannot tell" EUR/USD | 34% | 23% |
| GBP/USD allowed vs refused | 12.2p / 9 bars vs 19.5p / **5** bars | 11.9p / 7 vs 19.4p / **17** |
| EUR/USD allowed vs refused | 8.4p / 7 vs 18.0p / 36 | 7.7p / 5 vs 19.0p / 21 |
| refusals | 49 of 264 · 39 of 256 | 61 of 264 · 57 of 256 |

**GBP/USD's separation was BACKWARDS before** - it refused setups FEWER bars into a counter-move than
the ones it allowed. Right way round on both pairs now.

**NOT fixed by this, and it would not be:** the counter-candle count immediately before the momentum
candle still fails to separate allowed from refused (median 1 vs 1). `leg_state` reads STRUCTURE, not
candle runs. The live pullback count already exists in `vix1_retracement`, is reported everywhere, and
is not a gate because that needs his threshold.

### HIGHS AND LOWS ARE READ IN REAL TIME (2026-08-12) - the change that mattered

His question, and it had no good answer: *"Why cant we detect Highs and lows in real time by
monitoring the candles in real time?"*

**The old detector could not, by construction.** `find_swing_points(candles, n)` defines a peak as
"the highest bar with nothing higher for n bars EITHER SIDE" - it needs the future. At the trend's
n=48 that put the trend read a **median 2.2 days behind the chart** (min 49 bars, both pairs), so his
rule - *"when it STARTS printing the second high... we start looking"* - could not be expressed at
all. Three separate times I reported that lag as a fact about the system instead of treating it as
the defect. It was the defect.

**`vix1_swings.turning_points`** marks a turn the moment price **closes through the candle that made
the extreme**. No tuned number in it.

| | 48-bar lookback | real-time |
|---|---|---|
| how late a turn is known | **always >= 48 bars** | median **1 bar**, 75th pct 2, max 54 |
| turns known sooner than 48 bars allows | - | **100%** (1418/1419, 1353/1353) |
| turns found in 3 years | 121, 120 | 1,419, 1,353 (~11x) |

**`trend_state(candles, n, turns=...)` takes either source** and runs every rule unchanged - establish,
BOS, CHoCH, the two-stage confirm. Only the eyesight changes.

**MEASURED LIKE-FOR-LIKE over 4 years, same rules, same bars:**

| | 48-bar | real-time |
|---|---|---|
| GBP/USD | 43 phases, median +168p, 1 dud | **265** phases, median **+58p**, **19** dud |
| EUR/USD | 37 phases, median +134p, 1 dud | **263** phases, median **+46p**, **26** dud |
| phases under two days (noise flips) | **0** | **61 / 61** |
| in a trend at all (3yr sample) | 86% / 90% | **90% / 91%** |

It turns about **6x more often**, each phase is much shorter, and roughly **23% of phases last under
two days**. No trading time is lost.

### THE NOISE GUARD WAS BLIND — the row above used to read "0" (fixed 2026-08-15)

This table previously claimed **0 phases under two days for the real-time source, on both pairs**.
That was false, and the reason is a defect in `tests/vix1/test_trend.py`, not in the strategy:

```python
idx  = list(range(window + 40, len(bars), step))   # step = 96
short = sum(1 for d, a, b in phases if (b - a) < 48)
```

Phase boundaries are only ever observed **at sampling points**, so every measured phase length was a
multiple of **96** bars — and `short`, which counts phases under **48**, was **arithmetically
incapable of being anything but 0**. The check had passed since the day it was written without ever
testing anything. Same function, same 3 years of data, only the sampling changed:

| step | GBP/USD real-time | EUR/USD real-time |
|---|---|---|
| 96 (the blind setting) | 105 phases, **0** under two days | 97 phases, **0** under two days |
| 48 | 185 phases, 0 | 191 phases, 1 |
| **24 (now)** | 265 phases, **61** | 263 phases, **61** |

**The 48-bar source's stability was real** — it still reads 0 under honest sampling, so only the
real-time row was ever wrong.

Fixes: `_STEP = 24` (half the threshold, so a short phase is always straddled; costs 3 seconds), and
a new check — *"the phase sampling is finer than the two-day threshold it tests"* — that fails if
anyone raises it back. The real-time bars were **set for the first time, not lowered**: the values
they replaced were the output of a measurement that could not fail.

**This is reported, not endorsed.** Whether ~23% of phases lasting under two days is acceptable is
his call; a minimum swing size is the obvious lever and *"no minimum swing"* is currently locked.

`_REALTIME_STRUCTURE = True` in `vix1_bias` switches it; the n-bar path stays as the fallback, and
`test_trend.py` now measures BOTH so the calibrated guard watches what production runs.

**NOT PROVEN: whether it trades better.** That needs outcomes scored on history - a backtest, his call.

### A TREND STARTS ON THREE TURNING POINTS, NOT FOUR (fixed 2026-08-12)

His rule, verbatim:

> *"When a trend starts, it has a high then a low, and if it is a real trend it will print another
> high after the first low. So when it starts printing the second high after the first low, we start
> looking for a momentum candle."*

An uptrend starts on **high -> low -> HIGHER high**, and the low between them protects it. Mirrored
for a downtrend. `vix1_trend._establish`.

**It used to need four pivots** - the last two highs AND the last two lows all rising - so it began
looking one whole swing later than he does. I had measured that difference, written it into this
document, and left the code alone. He caught it: *"Did you fix this or you have my rule and still
kept the old code?"* Documenting a gap is not closing it.

**An expanding range now establishes nothing.** Higher highs and lower lows can both hold at once;
the four-point test could never see that case because it demanded both sides move together.

**MEASURED COST over 4 years, reported before it was accepted:**

| | before (4 pivots) | after (3 pivots) |
|---|---|---|
| GBP/USD | 37 phases, median +227 pips, **0** dud | **identical** |
| EUR/USD | 33 phases, median +177 pips, **1** dud | 35 phases, median **+142** pips, **2** dud |

The single phase his rule adds: **DOWN, 21 Feb -> 08 Mar 2024, 288 bars, best move +8.8 pips** - a
downtrend that never went down. One bad call in four years, on one pair, against starting when he
actually starts. `test_trend.py`'s bar moved 1 -> 2 for that reason and names both phases, so a third
would still fail it.

**`last_ext` was deliberately NOT changed** at the same time. Fixing the establishment rule and the
BOS reference together would make any measured difference unattributable.

### The trend window is PINNED (`vix1_bias._H1_TREND_BARS = 1500`)

`vix1.candle_counts[TF.H1]` was raised 1500 → 3000 on 2026-08-10 to feed the long size test. The
trend read does **not** widen with it — it slices the last 1,500 explicitly, because that is the
window its 2026-07-29 calibration was measured on. **Measured: unpinned, 18% of GBP/USD and 11% of
EUR/USD trend verdicts change.** Pinned, 260/260 and 154/154 identical.

---

## THE 2026-08-12 AUDIT — six findings, all fixed

He asked for an end-to-end audit before anything went live. Every one was proved on real data, not
asserted.

| # | finding | proof |
|---|---|---|
| 1 🔴 | `vix1_watch` judged a resting order with a trend reader **nothing else used** — the old lookback, while the setup was created from the real-time one. **Disagreed on 56% / 60% of momentum candles.** Same class of defect caught in this same file on 11 Aug. | **0%** disagreement now, measured through `check_invalidation` itself |
| 2 🔴 | The "fallback" flag was a **kill switch**: `_turns()` returned None, a downstream `or []` emptied it, no turns meant UNCERTAIN, UNCERTAIN is refused. **24 setups → 0.** | root-fixed in `structure_turns`; `REALTIME=False` now gives **17** setups |
| 3 🟠 | The regime was read as of NOW while everything else about the candle is read AT the candle. **Differed on 30% / 33%.** | the `Bias` carries the at-the-candle regime on **103 of 103** setups |
| 4 🟠 | The card did not carry the regime, against his explicit requirement. | rendered real TREND and CHOP cards and read it off both |
| 5 🟠 | The 10-Aug regression test asserted the **old** path and guarded nothing. | rewritten on production's path — and it pins that the real-time trend reads **UP**, which was correct: price rose +85 pips that week |
| 6 🟡 | `Regime.direction` and `as_sequence` — 0 uses each. An orphaned `Retracement` import. | deleted; the three test files repaired |

**Also:** `turning_points` was recomputed 5× per `detect_bias`, now twice. Cost was already trivial
(20 ms per instrument, 0.08 s per 60-second scan for four) — this was for readability.

**A TEST BUG THE FIX EXPOSED.** `test_structure` computed its own "wrong way" fixture with the OLD
reader and asserted against code using the new one, so it labelled setups wrong-way that the code
correctly saw as right-way. **A test that derives its expectation differently from the code under
test proves nothing** — the same trap as the tautological first draft of the fix-1 proof, which
computed both sides identically and could never fail.

## KNOWN OPEN DEFECTS / GAPS — not fixed, do not assume otherwise

**Four items were DELETED from this list on 2026-08-12 because they were actually done** — a stale
open-defect list is worse than none, and the reasoning for each lives in the `vix1.md` fix log:
`clear_trend` window-dependence (fixed 07-29), the unused `ARM_R` import (fixed 07-27), "ranges are
measured but still traded" (the regime engine went live 08-12), and "nothing implements *not in a
retracement*" (the same change, plus real-time turning points feeding `leg_state`).

0. ~~The T-5 pre-close notification cannot fire — the feed serves no forming bar~~ **CLOSED 2026-08-21,
   the same day it was found.** `ProtoOAGetTrendbarsReq` does serve closed bars only (14 live polls
   across 3 minute boundaries, never the minute in progress), and the notification had fired **0 times in
   30 days**. The forming 1HR bar is now **rebuilt from the M1 bars this strategy already fetches**
   (`candle_aggregator.forming_bar`, appended by the runner for any TF in `wants_forming`), at
   **zero extra broker requests** — proved 48/48 exact against the broker's own closed H1 bars across
   five instruments. `forming()` returns a real bar again. **Do not "fix" this by subscribing to live
   trendbars**: subscription updates arrive unannounced on the socket the candle fetch reads with
   `send -> await recv`, which is the failure that took the feed down on 2026-08-21, and it would need
   a demultiplexing reader before it is safe. **The cost that remains:** bars are published 10-70s
   after they close, so it judges the candle as it stood ~46s earlier — a T-5 notification is
   effectively T-6, **77.7%/74.6%** against T-5's 80.3%/76.0%.
1. **THE BIGGEST ONE, AND IT IS BLOCKED ON HIM.** The code reproduced only **16% of his real trades**.
   Detection was too strict (an earlier 4× threshold rejected 80% of his candles; now 2.5×). Blocked
   on him supplying ~20 trades with entry/SL/TP. Then: recalibrate detection, and add *selection* —
   which setup to take when several qualify. ~~move the trend read 1HR → 4HR~~ — **that instruction is
   WRONG and superseded (2026-07-29): H4 at 120 bars still reported UP during the two-month decline.
   The problem was the swing SCALE, not the timeframe.** **Do not "fix" this by guessing at
   thresholds.**
2. **NOTHING BUILT SINCE 2026-08-11 HAS BEEN VALIDATED AGAINST A CHART HE MARKED.** Every figure in
   this document is the code measured against its own past behaviour — trend stability, swing lag,
   regime split, refusal rates. Whether the regime engine calls the same trends, ranges and chop that
   HE would call has never been tested, because no marked chart has ever been supplied. This is the
   cheapest open item to close and probably the most valuable.
3. **NONE OF IT IS DEPLOYED.** Eight commits sit on `main` as of 2026-08-12. The regime engine is the
   first change that would materially alter what fires (it refuses 45%/49% of setups), so it has
   never run against a live market.
4. **NOT PROVEN TO TRADE BETTER.** Everything measured is about the READING — how fast, how stable,
   what it refuses. Whether any of it improves results needs outcomes scored on history, which is a
   backtest and therefore his decision, never taken unilaterally.
5. **The R ratchet is ADVICE ONLY.** `vix1_manage` decides what to TELL him ("+3R reached — move your
   stop to +2R"); `vix1_alerts` DMs it. **Nothing moves a broker stop.** Whether VIX.1 should manage
   the stop programmatically is his call, not an oversight to silently fix.
6. **THE 4HR FALLBACK IS DEAD CODE IN PRACTICE — found 2026-08-10, muted not removed.** `detect_bias`
   reaches for the H4 trend only when the 1HR trend is UNREADABLE (`t1 == 0`), and over 12 months on
   both pairs **0 of 622 reads were unreadable**. `vix1.py` still fetches 120 H4 bars every scan.
   Kept on his explicit instruction ("just mute it so that we can turn it on when we ever need it").
7. **No exhaustion / "price ran too far" rule exists.** All 9 `vix1_entry` rejection reasons are about
   the pullback's shape and position; none asks how extended the move is, so a late entry at the tail
   of a finished move is accepted. Deferred by him 2026-07-27 — the spacing rule already refuses the
   specific case, and stacking two new filters at once would make any frequency change
   unattributable.
8. **The number of swings the regime engine needs (2 highs + 2 lows) is NOT tuned.** His call:
   *"I would not hard-code yet the number of swings required... test the detector against actual
   chart data before changing that."* It follows item 2.

*(The "no test suite" gap was closed 2026-07-27 — see below.)*

## What is NOT a defect — checked 2026-07-27

- **VIX.1 cannot fire on a stale pullback.** `find_pullback` scans **backwards from the newest bar**
  and takes the most recent counter candle, and the M1 window is sized to `LOOKBACK + 2` hours — so a
  pullback from hours or days ago can never become an entry. Verified 2026-07-27.
- **No unused imports** across the strategy files (AST-verified, not grep-guessed; re-checked
  2026-08-11 after the retracement/regime work).
- **No dead functions**, no TODO/FIXME/HACK markers. A `max(0.0, …)` clamp in `vix1_retracement`
  was deleted on 2026-08-11 when breaking it on purpose left every test green — the signature of a
  branch that cannot run.

## The test suite — `signal_platform/tests/vix1/`

```
python signal_platform/tests/vix1/run_all.py     # 20 files, exit non-zero on failure
```

No framework, no network, no DB. **Run it before writing the doc entry for a change, not after.**
Every file bootstraps through `_harness.py` — it puts the platform on the path AND sets a dummy
`DATABASE_URL`, which anything importing `strategies/` needs. Skip it and the file passes from the
platform root and fails under `run_all.py`, which runs from the test directory.

| file | covers |
|---|---|
| `test_atr.py` | the volatility yardstick: true range vs plain high-minus-low (the gap case), the window, the edges |
| `test_retracement.py` | the pullback counted by hand (1/2/3/7/12 candles), a doji continuing it, the retracement a candle CAME AFTER vs a rally, the two counts differing, real-time (no 8-bar wait), the closed-candle rule |
| `test_regime.py` | efficiency: 1.0 on a straight line, 0 on a zigzag, ordered in between, "too little history" ≠ "a range" |
| `test_momentum.py` | every gate BOTH ways (accepts and rejects): size vs median, body fraction, bigger-than-previous, counter-wick cap; grading incl. the A boundary; the run; `baseline_body` |
| `test_line_pullback.py` | the line is the BODY CLOSE; **past-the-line accepted / refused / straddling refused / exactly ON accepted**, both directions; `traded_past`; the shape filters |
| `test_manage.py` | ratchet 2R→1R, 3R→2R, whole-R steps, **forward-only**; the structure exit by body close, wicks never counting |
| `test_invariants_real_data.py` | drives `m1_signals` over 4,000 real M1 bars per pair: entry is a **STOP**, SL on the losing side, **TP exactly 2R**, crash-freedom — plus the governing invariant, by **mutating the forming bar and asserting no level moves** |
| `test_cross.py` | the rebuilt entry's core: a CLOSE is a cross and a wick is not, the one-candle wait, the level is one tick beyond the reach, assumed vs seen, a whipsaw counts as no-pullback — and **his own 5 Aug 2019 bars, asserting the order price 1.11734** |
| `test_entry_real_events.py` | the REAL `m1_signals` on three real events: **his trade must come out at 1.11734**, XAU/USD 20 Aug must fire earlier than the old 12:09, and EUR/USD 20 Aug (which the audit found correct) must still fire |
| `test_auto_breakeven.py` | every guard on the account-changing path: the amend carries BOTH legs, the ratchet refuses a backwards move (both directions), no-stop and live-account refusals, a vanished take profit raising the ALARM, a success that moved nothing reported as not moved, and an unverifiable amend saying so |
| `test_position_tracker.py` | R from a real position both directions and on gold (no conversion), the **net-zero breakeven with commission DOUBLED for the round trip**, the alert sequence at 1R and 2R, a position with no stop, and **a failed broker read sending nothing** (None != []) |
| `test_preclose.py` | the pre-close notification: the window (too early / at the edge / one second past / already closed), the shape, **that it fires exactly when `is_momentum_candle` would pass**, the dedup key, the card carrying no levels, and 400 real bars on which it never once fires on a closed bar. Plus the STAND-DOWN: `closed_outcome` on a qualifying and a non-qualifying close, the non-direction-keyed stand-down key and that it cannot collide with the notification's, the card carrying no levels and no chart mark, and **that the word 'warning' appears nowhere in any card's headline, label, reasons or context** |
| `test_forming_bar.py` | **the bar rebuilt from finer bars**: the grid read off a real bar and the measured 21:00 broker day for timeframes that have none; the bar's OHLC, its volume, the previous period excluded, a still-forming base bar excluded; None when no minutes have printed; which series is chosen; **and the safety property — `closed_only` drops it, so the level list is unchanged** |
| `test_live_quote.py` | **the 1M's trigger reads**: the cross seen a minute earlier now the closed window stops losing a bar (proved through `vix1_cross.decide`), alignment on the BID, stop-vs-market on the ASK for a buy and the BID for a sell, `quote=None` identical to the old behaviour, and a quote never leaking into the order level the way a spread does |
| `test_headsup_untied.py` | drives the REAL `analyze`: with no entry it emits the heads-up; **with an entry on the same tick it emits BOTH, heads-up first** — the case that used to emit nothing. Bias and entry are stubbed on purpose; what is under test is the wiring between them |

**Every invariant has a TEETH case** — the assertion is deliberately broken and shown to fail. A suite
that cannot fail proves nothing; that is not a slogan here, it is the reason this exists.

**When a test fails, that is a FINDING to report.** It is not a licence to re-tune a threshold — the
momentum gates were calibrated against the user's real candles, and the pending redesign is blocked on
his trade data.

## Verification without a backtest

**Never run a backtest without explicit approval** (see `CLAUDE.md`). What needs no approval and
should be used instead: unit tests on the real functions, invariant checks over historical data (e.g.
"every signal's pullback candle is past the line", "no level is ever read from the forming bar"),
regression suites, module-import checks, and production log inspection.
