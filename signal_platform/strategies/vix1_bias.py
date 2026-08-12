"""
VIX.1 — the bias: WHICH WAY, and on what grounds. MOMENTUM-LED, then confirmed by trend or by a
change of character.

This module is the ROUTER. The momentum candle lives in vix1_momentum (always 1HR); the trend rule
(the leg's slope) and the CHoCH rule (structure reversal) live in vix1_trend. We trade TRENDS ONLY —
never a bare breakout with no confirmed direction. THE TREND LEADS: it is established first and it
decides which direction is even worth looking for, then momentum is sought only that way. (Until
2026-08-11 the freshest momentum candle in EITHER direction led, which discarded a valid pro-trend
setup in 15%/13% of windows — see the note in detect_bias.) The grounds we may take it on:

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
from strategies.vix1_state import Bias, market_state
from strategies.vix1_swings import turning_points
from strategies.vix1_structure import leg_state, market_permits
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

# HIGHS AND LOWS ARE READ IN REAL TIME (2026-08-12). His question, and it had no good answer:
# "Why cant we detect Highs and lows in real time by monitoring the candles in real time?"
#
# The n-bar detector defines a peak as "nothing higher for n bars EITHER SIDE", which cannot be
# answered until n bars AFTER the peak — so at n=48 the trend read sat a median 2.2 days behind the
# chart, and his rule ("when it STARTS printing the second high... we start looking") could not be
# expressed at all. `vix1_swings` marks a turn the bar price closes through the candle that made it:
# median 1 bar, and 100% of turns known sooner than 48 bars could ever allow.
#
# MEASURED like-for-like (same bars, same rules, only the eyesight changed), 3 years both pairs:
#     in a trend      86% -> 90% (GBP/USD) · 90% -> 91% (EUR/USD)   — no trading time lost
#     phases          12 -> 37 · 12 -> 31                            — it turns ~3x more often
#     under two days  0 -> 0 · 0 -> 0                                — none of them are noise flips
#     typical move    +148p -> +114p · +70p -> +84p
#     dud phases      0 -> 0 · 3 -> 3                                — no worse
#
# `_H1_SWING_N` still exists: it is the fallback pivot width when `turns` is not supplied, and
# `trend_state` keeps that path for anything that wants the old eyesight.
_REALTIME_STRUCTURE = True

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


def _turns(window: list[Candle]):
    """The turning points the trend is read from — real-time, or None for the n-bar fallback."""
    return turning_points(window) if _REALTIME_STRUCTURE else None


def _upto(window: list[Candle], h1: list[Candle], mc_idx: int) -> list[Candle]:
    """`window` truncated to end AT the momentum candle.

    `mc_idx` indexes into the FULL h1; `window` is its tail. Falls back to the whole window if the
    candle sits outside it, which cannot happen while LOOKBACK << _H1_TREND_BARS but must not
    silently produce a wrong slice if either ever changes.
    """
    pos = mc_idx - (len(h1) - len(window))
    return window[:pos + 1] if 0 <= pos < len(window) else window


def detect_bias(h1: list[Candle], h4: list[Candle], symbol: str = "") -> Bias | None:
    """
    Returns a `Bias`, or None when no trade may be taken.

    `Bias.mc_idx` indexes into H1 — the FIRST candle of the freshest momentum run; VIX.1 operates
    from it and its close opens the 1M watch. `Bias.reason` names the BOS/CHoCH and the leg that
    justify the trade, so the card and the log can show VIX.1's own working instead of asserting a
    direction.

    THE TREND DECIDES THE DIRECTION, then momentum is sought only that way — see the note in the
    body for the "freshest candle wins" defect this replaced. `origin` is `trend` or `trend4`; the
    reversal origins were removed 2026-07-26 (pro-trend only).
    """
    # THE TREND IS ESTABLISHED FIRST, AND IT DECIDES WHICH DIRECTION IS EVEN WORTH LOOKING FOR.
    #
    # THE DEFECT THIS REPLACED (found in review 2026-08-11, measured before fixing). The old code
    # found the freshest momentum candle in EITHER direction and tested only that one:
    #     bullish, run = (True, up) if up_last > dn_last else (False, dn)
    # So a perfectly valid pro-trend candle was DISCARDED whenever a newer counter-trend candle
    # existed — not rejected on merit, never looked at. Measured over 2 years: this threw away a
    # valid pro-trend setup in **15% of GBP/USD windows and 13% of EUR/USD**, about one in seven.
    #
    # VIX.1 is pro-trend only, so a counter-trend momentum candle can never be traded. Asking the
    # trend first and then looking for momentum ONLY that way is both correct and simpler.
    window = h1[-_H1_TREND_BARS:]
    tstate = trend_state(window, n=_H1_SWING_N, turns=_turns(window))
    t1 = tstate.direction
    t4 = trend_state(h4).direction if _ALLOW_H4 else 0

    # MEASURED, NOT ENFORCED (Phase A). The 8-bar leg gate is still the only thing that can refuse;
    # see vix1_state for why these decide nothing yet. Printed on EVERY path below — the refusals
    # are the comparison group, and leaving them out would show half the picture.
    #
    # THIS ONE IS "AS OF NOW", for the two paths that have no momentum candle to speak of. The one
    # that reaches the CARD is measured AT the momentum candle instead — see below.
    _, _, state = market_state(window, tstate, symbol)

    want = t1 if t1 != 0 else (t4 if _ALLOW_H4 else 0)
    if want == 0:
        vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: no established 1HR trend "
                             f"({tstate.reason()}) — pro-trend only, standing aside | {state}")
        return None

    bullish = want == 1
    run = momentum_run(h1, bullish, symbol)
    if run is None:
        vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {'up' if bullish else 'down'} trend but no "
                             f"momentum candle that way — {veto_reason(h1, bullish, symbol)} | {state}")
        return None
    mc_idx = run[0]

    # EVERYTHING ABOUT THE MOMENTUM CANDLE IS READ AT THE MOMENTUM CANDLE, for the same causal
    # reason the leg gate is (see below). The candle can be up to LOOKBACK=12 bars old (median 5),
    # so the trend read is replayed on the truncated window too: measured, its MATURITY differs from
    # the latest-bar read on 0.9% of GBP/USD and 1.8% of EUR/USD setups, because a swing's
    # confirmation can land inside that gap. Small, but "had this trend already continued when the
    # candle formed?" is a question about the candle.
    at_mc = _upto(window, h1, mc_idx)
    t_mc = trend_state(at_mc, n=_H1_SWING_N, turns=_turns(at_mc))
    # If the candle formed mid-reversal (no direction yet at that point), fall back to the current
    # read rather than refusing — that would be a second, unasked-for rule.
    mstate = t_mc if t_mc.direction else tstate
    ret, eff, state_mc = market_state(at_mc, mstate, symbol)

    # 1) momentum WITH a clear 1HR trend.
    if t1 == want:
        # THE PULLBACK REFUSAL (user 2026-08-11). The trend agreeing is not quite enough: if the
        # FASTER structure is trending the other way we are in a retrace, not a continuation. That is
        # the whole of 10 Aug — 2-day trend DOWN, 8-hour structure UP, and it sold the rally.
        #
        # JUDGED AT THE MOMENTUM CANDLE, not at the latest bar. The question is causal — "had the
        # pullback finished when this candle formed?" — and the candle can be up to LOOKBACK hours
        # old. Reading the structure as it is NOW would let a pullback that formed AFTER the candle
        # decide the candle's fate. Measured: this changes the verdict on 6% of GBP/USD setups and
        # 4% of EUR/USD.
        leg = leg_state(at_mc, t1)
        if not leg.ready:
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {'up' if bullish else 'down'} momentum WITH the "
                                 f"trend, but the leg does not permit it — {leg.why} | {state_mc}")
            return None

        # IS THE MARKET WORTH TRADING AT ALL — his "not in a retracement", answered by the market
        # state rather than by interrogating the candle (the candle is the proof the retracement
        # ended; that is settled). Inert until he sets the two thresholds, so this changes nothing
        # today; the reversal half of the same rule is already enforced by `t1 == 0` above.
        refusal = market_permits(ret, eff)
        if refusal:
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {refusal} | {state_mc}")
            return None

        return Bias(bullish, mc_idx, "trend", run[1],
                    f"{mstate.maturity} {mstate.reason()}; {leg.why}", ret, eff)

    # 2) 1HR trend UNCLEAR, momentum WITH a clear 4HR trend (the fallback) — MUTED, see _ALLOW_H4.
    if _ALLOW_H4 and t1 == 0 and t4 == want:
        leg = leg_state(at_mc, want)
        if not leg.ready:
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: 4HR-backed direction but the leg does not "
                                 f"permit it — {leg.why} | {state_mc}")
            return None
        vix1_log.say(symbol, f"[vix1] {symbol} 4HR-BACKED TREND: 1HR trend unclear, 1HR momentum aligns with a clear "
                 f"4HR {'up' if bullish else 'down'} trend | {state_mc}")
        return Bias(bullish, mc_idx, "trend4", run[1],
                    f"4HR-backed ({mstate.maturity}); {leg.why}", ret, eff)

    # UNREACHABLE BY CONSTRUCTION, and deliberately left as an assertion rather than a silent path.
    # PRO-TREND ONLY (user 2026-07-25/26: "Only trade pro trend"). Since the trend now chooses the
    # direction, `want` is either t1 (branch 1 fires) or, when muted-H4 is on, t4 (branch 2 fires);
    # a zero `want` already returned above. The old "momentum but NOT with the trend" rejection this
    # replaced can no longer happen — a counter-trend candle is never even looked for.
    raise AssertionError(f"vix1 detect_bias reached an impossible state: t1={t1} t4={t4} want={want}")
