"""VIX.1 — THE ANNOUNCEMENT THAT IS NOT GATED ON A SETUP.

HIS INSTRUCTION, 2026-10-12: *"I want momentum candles to be announced whether the setup qualifies or
not. That is not a signal, it is just announcement of momentum candles."*

BUILT FROM THE REAL EVENT, NOT A LOOKALIKE — his standing rule after a lookalike was once fixed
instead of the actual event. `EURUSD_H1_oct12_event.csv` is the broker's own H1 series ending at the
bar he screenshotted, and the two candles he marked in yellow are in it:

    08:00 UTC  1.12031 -> 1.11930   10.10 pip body   (clears 2.3x = 10.01, NOT 2.5x = 10.88)
    09:00 UTC  1.11931 -> 1.11811   12.00 pip body   (clears both)

THE TEST THAT MATTERS IS #3. EUR/USD was RANGING all morning, and that one gate silenced all four
existing momentum messages. If this suite ever goes green while #3 is red, the feature is gone.

Runs the REAL `vix1_momentum_watch` functions and the REAL `qualifies_for_trade` — not a
re-implementation of either.
"""
from _harness import Suite, load
from notifications import titles
from strategies import vix1_momentum_watch as mw
from strategies.vix1_momentum import is_momentum_candle, qualifies_for_trade
from shared.candle_math import is_bullish

s = Suite("VIX.1 — MOMENTUM CANDLE ANNOUNCEMENT (real functions, the real 12 Oct bars)")

SYM = "EUR/USD"
PIP = 0.0001
BARS = load("EURUSD_H1_oct12_event.csv", "H1")


def upto(utc_stamp):
    """The series as it stood the moment that bar CLOSED — i.e. ending with it.

    ⚠ MATCHED WITH THE YEAR. An earlier version of this helper matched "%d %b %H:%M", and against a
    multi-year series that silently selected 12 Oct 2022 — a different candle, in a noisier market,
    with a 8.0 pip median instead of 4.35. Every number downstream was wrong and every assertion
    still ran. The year is not optional.
    """
    import datetime as dt
    for i, c in enumerate(BARS):
        if dt.datetime.utcfromtimestamp(c.time).strftime("%Y-%m-%d %H:%M") == utc_stamp:
            return BARS[: i + 1]
    raise AssertionError(f"bar {utc_stamp} not in the fixture")


if not BARS:
    s.check("fixture EURUSD_H1_oct12_event.csv is present", False, True)
else:
    s.check("the fixture is the real series", len(BARS) >= 400, True)

    # ⚠ DEEP ENOUGH THAT THE 4-MONTH FLOOR ACTUALLY RUNS. Production asks for 3,000 H1 bars
    # (`vix1.py:92`) and the long-window floor needs 1,800 (`vix1_momentum._LONG_MIN_BARS`); the
    # first version of this fixture held 495, so that floor was SKIPPED and these tests passed under
    # conditions production never sees. Checked against the real window: the floor is active and
    # demands 7.00 pips, which both of his candles clear.
    from strategies.vix1_momentum import long_requirement, _LONG_MIN_BARS
    s.check("the fixture clears _LONG_MIN_BARS, so the 4-month floor is live",
            len(BARS) >= _LONG_MIN_BARS, True)
    _w = upto("2026-10-12 09:00")
    s.check("the 4-month floor really is being applied (not skipped)",
            long_requirement(_w, len(_w) - 1, SYM) > 0, True)

    # ── 1. HIS TWO CANDLES ARE ANNOUNCED ────────────────────────────────────────────────────
    for when, want_body in (("2026-10-12 08:00", 10.1), ("2026-10-12 09:00", 12.0)):
        win = upto(when)
        got = mw.check(win, SYM)
        s.check(f"{when} UTC — announced", got is not None, True)
        if got:
            bar, bullish, _how = got
            s.check(f"{when} UTC — body is the real {want_body} pips",
                    round(abs(bar.close - bar.open) / PIP, 1), want_body)
            s.check(f"{when} UTC — direction is the candle's own colour", bullish, is_bullish(bar))
            s.check(f"{when} UTC — it is the NEWEST bar, not an older one", bar.time, win[-1].time)

    # THE FIRST ONE IS THE WHOLE REASON `qualifies_for_trade` WAS CHOSEN over `is_momentum_candle`.
    # He pointed at BOTH candles; the strict 2.5x test sees only the second.
    w8 = upto("2026-10-12 08:00")
    s.check("08:00 — the strict 2.5x test would have MISSED it (why the trade test is used)",
            is_momentum_candle(w8, len(w8) - 1, is_bullish(w8[-1]), SYM), False)
    s.check("08:00 — the trade test catches it", qualifies_for_trade(w8, len(w8) - 1, is_bullish(w8[-1]), SYM), True)

    # ── 2. QUIET CANDLES STAY QUIET ─────────────────────────────────────────────────────────
    for when in ("2026-10-12 10:00", "2026-10-12 11:00"):          # 0.9 and 3.6 pip bodies
        s.check(f"{when} UTC — NOT announced (too small)", mw.check(upto(when), SYM), None)

    # ── 3. ⚠ IT FIRES WHILE THE MARKET IS RANGING ───────────────────────────────────────────
    # The exact condition that silenced all four existing messages on the morning he complained.
    # This is the assertion the whole feature exists to satisfy.
    from strategies import vix1_chop
    from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
    from strategies.vix1_swings import structure_turns
    from strategies.vix1_trend import trend_state
    w9 = upto("2026-10-12 09:00")
    closed_before = w9[:-1]
    tw = closed_before[-_H1_TREND_BARS:]
    st = trend_state(tw, n=_H1_SWING_N, turns=structure_turns(tw, _H1_SWING_N))
    ranging = vix1_chop.not_tradeable(w9, st, False, SYM)
    s.check("09:00 — the market really WAS ranging (the gate that silenced everything)",
            bool(ranging), True)
    s.check("09:00 — and it is announced ANYWAY", mw.check(w9, SYM) is not None, True)

    # ── 4. IT IS NOT A SIGNAL ───────────────────────────────────────────────────────────────
    bar, bullish, how = mw.check(w9, SYM)
    n = mw.note(SYM, bullish, bar, PIP, "VIX.1", how)
    s.check("the card is alert-only", n.alert_only, True)
    s.check("it takes no watching row", n.persist_watch, False)
    # UNSET, NOT None — `Signal` defaults these to 0.0 and "" (core/types.py:199-201, :252), so
    # "no trade attached" means they were never written, which is what these four assert.
    s.check("no entry price", n.entry_price, 0.0)
    s.check("no stop loss", n.stop_loss, 0.0)
    s.check("no take profit", n.take_profit, 0.0)
    s.check("no order type", n.order_type, "")
    s.check("confidence is zero", n.confidence, 0.0)
    s.check("the headline says ANNOUNCEMENT ONLY", n.headline, titles.MOMENTUM_ANNOUNCEMENT)
    s.check("the headline is NOT the setup-building one", n.headline != titles.MOMENTUM_CLOSED, True)
    s.check("the card says in words that it is not a signal",
            any("NOT A SIGNAL" in r.upper() for r in n.technical_reasons), True)
    s.check("the candle is marked on the chart", n.chart_marks, [(bar.time, "MOMENTUM")])

    # ── 5. ONE PER CANDLE ───────────────────────────────────────────────────────────────────
    k1 = mw.dedup_key(SYM, bar)
    s.check("the key is the same for the same bar", mw.dedup_key(SYM, bar), k1)
    s.check("a different bar gets a different key", mw.dedup_key(SYM, w9[-2]) != k1, True)
    s.check("a different symbol gets a different key", mw.dedup_key("GBP/USD", bar) != k1, True)

    # ── 6. IT REACHES THE DM, NOT THE CHANNEL ───────────────────────────────────────────────
    from config.settings import settings
    s.check("the id routes to the DM (_watch suffix)", n.strategy_id.endswith("_watch"), True)
    base = n.strategy_id[: -len("_watch")]
    s.check("stripped, the id is one the settings know", base, "vix1")
    s.check("it is NOT in channel_all, so it cannot reach the public channel",
            base in {x.strip() for x in settings.channel_all.split(",") if x.strip()}, False)

    # ── TEETH — prove these assertions can fail ─────────────────────────────────────────────
    s.teeth("the quiet-candle check",
            mw.check(upto("2026-10-12 10:00"), SYM) is None and mw.check(upto("2026-10-12 09:00"), SYM) is not None)
    s.teeth("too little history is refused", mw.check(BARS[:5], SYM) is None)

s.done()
