# 1H CVD divergence alerts — his cTrader indicator, live, to the PIX-bot DM (built 23 Nov 2026)

**Not a strategy.** His words: *"Its not yet a strategy, it is just notification that can be traded."* It places
nothing, computes no stop or target (*"This should not worry you … I just need the signal when divergence starts"*),
and shares no code with any strategy (PIX keeps its own, different CVD — `strategies/pix_flow.py`).

**OFF until he has matched it against his chart** — admin switch `cvd_divergence_alerts` (Settings → switches).

## What he asked
*"I need notification whenever there is a 1HR divergence EURUSD, GBPJPY, GBPUSD and XAUUSD … so that i can even see the
exact price level where there is a divergence between CVD and the price."* … *"I will use 1HR for divergence and 1M for
entry and targeting 3R. I think it can spot divergence in real time because when the price and CVD are moving the
opposite direction that can be spotted in real time and so we wait and when reversal starts we are in. First spot
divergence and then send notification when reversal has started in 1M."* Indicator: `C:\Users\FSD\Desktop\CVD
Divergence.cs`, used **as it is** (default settings). Delivery: **PIX bot DM** (`notifications/copy_dm.send`).

## The indicator, copied line for line (`signal_platform/alerts/cvd_divergence/cvd.py`)
- **Delta of an hour** = its tick count split by where it closed in its range: `volume × (close−low)/(high−low)` is
  buying, the rest selling; a candle with no range = 0. It is an ESTIMATE built from the candle — forex has no central
  record of trades.
- **CVD** = the sum of the last **20** hours' deltas; nothing for the first 39 hours of a series (his holds NaN there).
- **Swing high** = a candle above the **5** candles each side (an equal high before it disqualifies it, one after does
  not). Swing low mirrored.
- **D** = a new swing high above the previous one with CVD lower there (bearish); a new swing low below the previous one
  with CVD higher (bullish). His chart shows it **5 hours late** — once the 5 candles after it have closed.

## What the alerts add (`watch.py`, run every minute by `job.py`)
1. **Divergence started** — real time, his idea: an hour after the last CONFIRMED swing (closed, or the one in progress
   rebuilt from closed 1M candles) goes beyond that swing while CVD there disagrees. The same comparison his indicator
   makes 5 hours later, made now.
2. **Cancelled** — his rule *"when the predicted divergence fails and the price and CVD converge"*: CVD reaches its value
   at the swing again. A divergence found late and already over is not announced at all.
3. **1M reversal started** — his words *"1m candles have changed direction"*, as approved in the plan: bearish — the 1M
   candle that made the highest high since the diverging hour opened; the turn is a LATER closed 1M candle closing below
   that candle's low (a candle making a new high is never its own turn). Bullish mirrored.

**Every message says SELL or BUY, and why** (his rule, 23 Nov 2026: *"When sending a CVD signal explain whether it
is a sell or a buy and why"*): a bearish divergence is a **SELL idea** (higher high, lower CVD — less buying behind
this high, the rise is losing strength), a bullish one a **BUY idea** (lower low, higher CVD). The first line carries
the action; a "Why:" line gives the reason with both prices and both CVDs. `messages.py`; checked in `test_watch.py`.

One watch per market per side; each swing is watched once; remembered in `strategy_state` (row `cvd_divergence`), so a
deploy never re-sends. A market whose last closed hour the broker has not yet published is skipped that minute.

## Proof
- `signal_platform/tests/cvd_divergence/test_cvd.py` 19 checks (hand-worked: swing A CVD +1,600, swing B −600 → one
  bearish D on B, only after 5 closed hours); `test_watch.py` 18 (started once, cancelled, the turn, late+over silent,
  restart, missing hour vs weekend). Four rules broken on purpose — each caught.
- `pg_restart.py` 3 checks on a real Postgres (PGlite): nothing re-sent after a restart.
- **V3, 23 Nov:** the copy run over 482 closed 1H candles (25 Oct – 22 Nov) of Pepperstone demo data (account 5347048,
  read-only) on all four markets: data clean (no duplicates, no >10% jumps, every hour has a tick count; gaps =
  weekends + gold's daily break). It draws 9 D on EURUSD, 6 GBPJPY, 11 GBPUSD, 6 XAUUSD. Five re-checked by hand with
  separate arithmetic — all agree. **Waiting for him to compare that list with his chart** before the switch goes on.
- Thin cases exist (EURUSD 11 Nov: CVD −21,789 vs −21,793): a one-hour tick-count difference between his chart's feed
  and this one could flip such a D. Same broker expected; confirmed only by his comparison.

## Not done here
Stop, target, entry price, autotrade, win rates, any backtest.
