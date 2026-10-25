# FIX carries the candles on from where the broker stopped

## Context

He corrected me, and he was right: *"You claimed FIX data cant be used for signal and thats not
true. FIX data can pick from where the main signal source went down and build from there and i
think we already have that logic here. You can check."*

I checked. **The logic exists and is already wired in.** What I said was wrong.

## WHAT I MEASURED

| fact | where |
|---|---|
| `extend_with_ticks(symbol, tf, broker_bars)` takes the broker's bars and appends the minutes FIX watched being made, refusing on an untrusted symbol or a gap at the join | `data/tick_serving.py` |
| It already runs on EVERY fetch | `data/candle_fetcher.py:206-207` |
| FIX keeps **240 minutes (4 hours)** of candles per symbol | `data/tick_bars.py:35` `_KEEP = 240` |
| Hourly bars are rebuilt from those minutes, proved exact 48/48 | `data/candle_aggregator.py` |

**THE ONE LINE THAT DEFEATS IT — `data/candle_fetcher.py:201`:**

    return _serve(symbol, tf, candles[-count:]) if candles else []

`_serve` IS the FIX extension. When the broker fetch fails, `candles` is empty, so it returns `[]`
and never calls it — the extension is skipped at exactly the moment it is needed. The cache
compounds it: `candle_cache.get()` **deletes** the last good bars when they expire
(`candle_cache.py:147-148`), so there is nothing left for FIX to build on.

So it was never "FIX cannot carry the series". It is that we throw the history away the moment the
broker stops answering, and then hand FIX nothing to extend.

**AND THE FINDING THAT MAKES THIS WORTH DOING — VIX.1 NEEDS ONLY M1 AND H1.** Its guard is
`if len(m1) < 12 or len(h1) < 20` (`vix1.py:150`), and the comment above it says so outright:
*"H4 IS NOT REQUIRED WHILE THE FALLBACK IS MUTED ... The 1HR trend and the 1M entry do not touch H4
at all."* M1 and H1 are **exactly** the two timeframes tick-serving can rebuild
(`tick_serving._SERVABLE`). So VIX.1 can keep producing signals through an outage.

BX-S/D cannot: it asks for H4, M30, M15 and M5 (`bx_sd.py:52`), none of which FIX rebuilds. That
is stated plainly rather than hidden.

## The change

| file | change |
|---|---|
| `signal_platform/data/candle_cache.py` | keep the last good series after it expires (a second store, same lock) and expose `get_last_good()`. Closed bars never change, so reusing them is correct, not a guess |
| `signal_platform/data/candle_fetcher.py` | when a fetch returns nothing, fall back to the last good series and **still call `_serve`**, so FIX extends it — the fix for line 201 |
| `signal_platform/data/tick_serving.py` | unchanged. Its per-symbol trust and unbroken-join checks are what police this |
| `signal_platform/orchestrator/scanner.py` | my blunt "skip everything while the feed is down" gate becomes "skip only what has no usable series", so FIX-carried scanning proceeds |
| `signal_platform/core/ctrader_probe.py` | the degraded message says what is actually still running, now including carried scanning |

## ⚠ THE SAFETY RULE THE WHOLE THING RESTS ON

**A carried series is served only while its newest bar is the CURRENT bar for that timeframe** —
`shared/mtf_utils.bar_open_at(now, tf)` already computes exactly that, on the broker's real grid
(the trading day starts 21:00 UTC, not midnight). The instant FIX can no longer bring a series up
to now — a dropped stream, a gap, or an outage past FIX's 4-hour memory — the fetch returns `[]`
exactly as it does today.

Feeding a strategy an out-of-date bar as though it were current is far worse than pausing: every
level, every momentum test and every entry would be computed against a market that has moved on.

## What this buys, stated honestly

| | during an outage |
|---|---|
| VIX.1 signals | **keep running**, for as long as FIX can carry M1 and H1 — up to ~4 hours |
| BX-S/D | pauses; it needs H4/M30/M15/M5, which FIX cannot rebuild |
| Live prices + journal ticker | keep running (already true after the last change) |
| Trade monitoring | **also recovers**: it reads M1 through the same fetcher, so a carried M1 series feeds it too |
| After a restart | nothing is carried — FIX memory starts empty, so the platform waits, as it does now |

## Verification

1. **Unit, the blocker itself:** a failed fetch with a last-good series and a FIX tail returns a
   CURRENT series; today it returns `[]`. The test fails before the change and passes after.
2. **Unit, the safety rule:** a gap at the join, an untrusted symbol, or a tail that cannot reach
   the current bar must all return `[]` — never a stale series.
3. **Unit, the 4-hour edge:** past FIX's retention the series cannot be brought current, so it
   stops being served rather than going quietly stale.
4. **Unit, the monitor:** a carried M1 series is enough for `signal_monitor` to judge a signal.
5. **Live drill:** break the token in a copy, confirm VIX.1 still scans and the log says it is
   running on carried candles; confirm BX-S/D reports paused; confirm recovery is announced.
6. All 16 signal-platform suites plus the VIX.1 and BX-S/D suites, then build and deploy.

## Risks

| risk | handling |
|---|---|
| Serving a stale series as current | the `bar_open_at` currency test, applied per timeframe, before anything is returned |
| Tick bars disagreeing with the broker | the existing per-symbol trust check (`tick_bar_audit`) is untouched and still gates everything |
| A hole in the middle of the series | the existing unbroken-join check refuses it |
| Memory growth from keeping old series | one copy per (symbol, timeframe), replaced each time a real fetch succeeds |
| Carrying on for too long and drifting | bounded by FIX's own 240-minute memory, and by the currency test before that |
