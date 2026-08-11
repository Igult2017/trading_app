"""
VIX.1 — the bias: WHICH WAY, and on what grounds. MOMENTUM-LED, then confirmed by trend or by a
change of character.

This module is the ROUTER. The momentum candle lives in vix1_momentum (always 1HR); the trend rule
(the leg's slope) and the CHoCH rule (structure reversal) live in vix1_trend. We trade TRENDS ONLY —
never a bare breakout with no confirmed direction. The freshest 1HR MOMENTUM candle leads (p1: the
trend must be the thing CARRYING the momentum, so the freshest momentum is the truth). We then ask, in
order, on what grounds we may take it:

  'trend'  — the momentum runs WITH a clear 1HR trend.
  'trend4' — the 1HR trend is UNCLEAR, but the momentum runs WITH a clear 4HR trend (the fallback).

  ('choch' and 'choch4' were REMOVED 2026-07-26 — pro-trend only. A reversal is now expressed by the
   TREND ITSELF turning, so a trade after one is a plain `trend` continuation in the new direction.)

MEASURED 2026-08-10: 'trend4' NEVER FIRES. It is reached only when the 1HR trend is unreadable, and
across the last year on both pairs the 1HR trend was unreadable in 0 of 622 samples (GBP/USD 25% up /
75% down, EUR/USD 41% / 59%). The h4 argument, and the 120 H4 bars vix1.py fetches every scan to
build it, are therefore dead weight in practice. Recorded as an open defect, not removed — the
user's call.

If none hold — momentum with no confirmed trend and no structure break — we DO NOT TRADE. Logs the exact
reason at INFO when it returns None. Structure is read from CLOSED candles only; the 1M uses none of
this (there the LINE says whether price is with us — vix1_entry — because swing structure cannot read a
spike-and-return inside a single hour).
"""
import logging

from core.types import Candle
from strategies.vix1_momentum import momentum_run, veto_reason
from strategies import vix1_log
from strategies.vix1_structure import leg_state
from strategies.vix1_trend import trend_state

log = logging.getLogger(__name__)

# THE 1HR SWING HALF-WIDTH. 48 bars either side = a swing spanning ~2 DAYS, read over a 1,500-bar
# (~62-day) window. That window is now PINNED here (_H1_TREND_BARS) rather than being whatever
# candle_counts happens to supply — see the note below.
#
# WHY IT IS NOT 3 (fixed 2026-07-29). At n=3 a "swing" is a 7-hour wiggle, and with only 120 bars the
# detector could see nothing older than two days. On 29 Jul it reported the 1HR trend as UP in the
# middle of a two-month decline — correct about the last two days, blind to every lower high in the
# move — and because VIX.1 is pro-trend only, a valid SELL that day would have been discarded as
# counter-trend while price fell 24 pips.
#
# MEASURED over 4.18 years of real H1, both pairs: agreement across window sizes 79%->84% (EUR/USD)
# and 76%->80% (GBP/USD), and trend changes 183->37 and 166->36. One flip every ~6 weeks is a main
# trend; one every ~6 days is not.
#
# TWO SIMPLER FIXES WERE TESTED AND REJECTED — do not retry them:
#   n=12 on the existing 120-bar window: 55% agreement (worse than the 82% it replaced) and flat 24%
#       of the time. It only looked right because it was first checked on a single day.
#   the DAILY timeframe: 65% agreement, and on 29 Jul it read flat/DOWN/UP/DOWN at 40/60/90/120 days.
#       It contradicts itself too.
_H1_SWING_N = 48

# THE TREND WINDOW IS PINNED, NOT "whatever we were handed".
# The 2026-07-29 fix calibrated the trend on exactly 1,500 H1 bars (~62 days) — agreement across
# window sizes 79%->84% EUR/USD, 76%->80% GBP/USD. On 2026-08-10 the H1 request was raised to 3,000
# bars so the momentum test could measure a long-window median body; had this read stayed "all the bars
# we were given" it would silently have started judging trend over twice the history, changing
# verdicts with nothing to catch it. Two candidate trend fixes have already looked right on the day
# they were tried and been worse over four years, so the window is stated here and asserted in
# tests/vix1/test_trend.py.
_H1_TREND_BARS = 1500

# THE 4HR FALLBACK — MUTED 2026-08-11, KEPT ON PURPOSE. Flip to True to bring it back.
#
# DO NOT DELETE THIS AS DEAD CODE. The standing rule is that unused code is removed; this is the
# exception, on his explicit instruction: "Dont remove it. Just mute it so that we can turn it on
# when we ever need it in future." The H4 candles are still fetched (vix1.candle_counts[TF.H4]) so
# switching this back on needs nothing else.
#
# WHAT IT DID: when the 1HR trend was UNCLEAR but the 4HR trend agreed with the momentum candle,
# take the trade anyway — "the 1HR is catching up to the 4HR, not reversing".
#
# WHY IT IS OFF. It was already dead: measured over 12 months on both pairs, the 1HR trend was never
# unclear (0 of 622 samples), so the branch never ran. Then the two-stage turn (2026-08-11) gave
# `t1 == 0` a SECOND meaning — "a reversal is proposed but not yet confirmed" — and that state now
# occurs on 18% of GBP/USD momentum candles and 11% of EUR/USD. So a branch that had never executed
# would suddenly start trading in the single worst window: while the 1HR trend is mid-reversal. That
# is the opposite of "I want the system to be cautious about calling a reversal", and of "we don't
# trade ranging markets". It also printed nonsense on the card ("4HR-backed (none)"), because there
# is no maturity to report when there is no 1HR trend.
#
# IF IT IS EVER TURNED BACK ON: `t1 == 0` must first be split into its two meanings — "no trend has
# ever formed" and "a reversal is pending" — because only the first is arguably safe here.
_ALLOW_H4 = False


def detect_bias(h1: list[Candle], h4: list[Candle],
                symbol: str = "") -> tuple[bool, int, str, int, str] | None:
    """
    Returns (bullish, mc_idx, origin, run_len, reason) or None.

    `mc_idx` indexes into H1 — the FIRST candle of the freshest momentum run; VIX.1 operates from it
    and its close opens the 1M watch. `reason` names the BOS/CHoCH and the leg that justify the
    trade, so the card and the log can show VIX.1's own working instead of asserting a direction.

    The freshest 1HR momentum candle decides which way we are reasoning; trend/CHoCH then decide whether
    there are grounds to take it. `origin` is `trend` or `trend4` — the reversal origins were
    removed 2026-07-26 (pro-trend only).
    """
    up = momentum_run(h1, True, symbol)
    dn = momentum_run(h1, False, symbol)
    up_last = (up[0] + up[1] - 1) if up else -1
    dn_last = (dn[0] + dn[1] - 1) if dn else -1
    if up_last < 0 and dn_last < 0:
        vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: no 1HR momentum candle either way — {veto_reason(h1, True, symbol)}")
        return None

    # The FRESHEST momentum candle is the truth — never reach past it for an older, aligned one.
    bullish, run = (True, up) if up_last > dn_last else (False, dn)
    mc_idx  = run[0]
    close   = h1[run[0] + run[1] - 1].close          # the breaking/leading candle's CLOSED price
    want    = 1 if bullish else -1
    # THE 1HR TREND IS READ FROM WIDE SWINGS OVER A LONG WINDOW — see _H1_SWING_N.
    # The H4 read keeps the default: measured at its current settings it already agrees with itself
    # 89%/77% across window sizes, and widening its swing width made it markedly WORSE (56%/47%).
    window = h1[-_H1_TREND_BARS:]
    tstate = trend_state(window, n=_H1_SWING_N)
    t1 = tstate.direction
    t4 = trend_state(h4).direction

    # 1) momentum WITH a clear 1HR trend.
    if t1 == want:
        # THE PULLBACK REFUSAL (user 2026-08-11). The trend agreeing is not quite enough: if the
        # FASTER structure is trending the other way we are in a retrace, not a continuation. That is
        # the whole of 10 Aug — 2-day trend DOWN, 8-hour structure UP, and it sold the rally.
        leg = leg_state(window, t1)
        if not leg.ready:
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {'up' if bullish else 'down'} momentum WITH the "
                                 f"trend, but the leg does not permit it — {leg.why}")
            return None
        return (bullish, mc_idx, "trend", run[1],
                f"{tstate.maturity} {tstate.reason()}; {leg.why}")

    # 2) 1HR trend UNCLEAR, momentum WITH a clear 4HR trend (the fallback) — MUTED, see _ALLOW_H4.
    if _ALLOW_H4 and t1 == 0 and t4 == want:
        leg = leg_state(window, want)
        if not leg.ready:
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: 4HR-backed direction but the leg does not "
                                 f"permit it — {leg.why}")
            return None
        vix1_log.say(symbol, f"[vix1] {symbol} 4HR-BACKED TREND: 1HR trend unclear, 1HR momentum aligns with a clear "
                 f"4HR {'up' if bullish else 'down'} trend")
        return (bullish, mc_idx, "trend4", run[1],
                f"4HR-backed ({tstate.maturity}); {leg.why}")

    # PRO-TREND ONLY (user 2026-07-25/26: "Only trade pro trend"). The `choch` and `choch4` origins are
    # REMOVED — they took a reversal against the prevailing trend, which is by definition not
    # pro-trend. They are also redundant now: since 2026-07-26 the trend is STRUCTURE THAT PERSISTS
    # and flips on exactly the event `is_choch` was testing for (a body close through the protected
    # swing), so the moment a genuine change of character completes, clear_trend has ALREADY turned
    # and the next momentum candle that way qualifies as plain `trend`. Taking the reversal candle
    # itself was the strategy front-running its own trend rule.
    vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {'up' if bullish else 'down'} momentum but it is NOT with the "
             f"trend (1HR={t1}, 4HR={t4}) — pro-trend only, standing aside")
    return None
