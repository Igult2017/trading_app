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
from shared.candle_math import atr
from strategies import vix1_choch
from strategies import vix1_regime
from strategies import vix1_retracement
from strategies.vix1_state import Bias, market_state
from strategies.vix1_swings import structure_turns
from strategies.vix1_structure import _FAST_N, leg_state, market_permits
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

# WHERE TURNING POINTS COME FROM: `vix1_swings.structure_turns`, which owns both the reading and the
# REALTIME flag. The full reasoning lives in that module's docstring and is deliberately NOT repeated
# here — it was, and the copy immediately started drifting.
#
# Two defects came from this being a private helper in this file: `vix1_watch` never got the memo and
# judged resting orders on the OLD reader (disagreeing 56%/60% of the time), and the None it returned
# for the fallback became an empty list downstream, muting the strategy whenever the flag was off.
#
# `_H1_SWING_N` above still earns its place: it is the FALLBACK pivot width, used when `REALTIME` is
# off, and `trend_state` keeps that path alive.

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


def _upto(window: list[Candle], h1: list[Candle], mc_idx: int) -> list[Candle]:
    """`window` truncated to end AT the momentum candle.

    `mc_idx` indexes into the FULL h1; `window` is its tail. Falls back to the whole window if the
    candle sits outside it, which cannot happen while LOOKBACK << _H1_TREND_BARS but must not
    silently produce a wrong slice if either ever changes.
    """
    pos = mc_idx - (len(h1) - len(window))
    return window[:pos + 1] if 0 <= pos < len(window) else window


def detect_bias(h1: list[Candle], h4: list[Candle], symbol: str = "", debut=None) -> Bias | None:
    """
    Returns a `Bias`, or None when no trade may be taken.

    `debut` — an optional `core.instrument_debut.InstrumentDebut`. When given, a momentum candle
    that closed BEFORE this instrument was first scanned is refused as backfill. Left None (tests,
    ad-hoc replays) nothing is refused, so this can never silently mute an existing measurement.

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
    turns = structure_turns(window, _H1_SWING_N)      # computed ONCE per window
    tstate = trend_state(window, n=_H1_SWING_N, turns=turns)
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
        # HIS CHANGE-OF-CHARACTER ROUTE (2026-08-15). THIS IS THE EXACT LINE THAT REFUSED HIS TRADE.
        #
        # A pending turn reads direction 0, so everything below used to give up here — and on his own
        # chart (EUR/USD 28 Jul 2026 17:00) that threw away the setup at the moment he takes it.
        # `vix1_choch` grants ONE exemption, and only while the turn is proposed but unconfirmed:
        # momentum the new way, out of a trending market, with no pullback required. The instant the
        # new direction confirms, `pending` clears, that route stops answering and the normal path
        # below owns the decision again — pullback rule and all. See vix1_choch for his wording.
        bias, why = vix1_choch.choch_entry(window, h1, tstate, turns, _H1_SWING_N, symbol)
        if bias is not None:
            # THE BACKFILL GUARD APPLIES HERE TOO. This route returns before the main path's check,
            # so guarding only that one left 24 of 107 cold-start signals still firing on history —
            # found by the test, not by reading. Any route that emits a Bias needs the guard.
            if debut is not None and debut.is_backfill(symbol, h1[bias.mc_idx].time):
                vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: the change-of-character momentum "
                                     f"candle closed before this instrument was first scanned — "
                                     f"backfill, not a live setup | {state}")
                return None
            vix1_log.say(symbol, f"[vix1] {symbol} CHoCH ENTRY: {why} | {state}")
            return bias
        vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: no established 1HR trend "
                             f"({tstate.reason()}) — {why} | {state}")
        return None

    bullish = want == 1
    run = momentum_run(h1, bullish, symbol)
    if run is None:
        vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {'up' if bullish else 'down'} trend but no "
                             f"momentum candle that way — {veto_reason(h1, bullish, symbol)} | {state}")
        return None
    mc_idx = run[0]

    # BACKFILL GUARD (2026-08-19). A candle that closed before this instrument was first scanned is
    # history the platform never watched, and trading it is what produced the gold incident: XAU/USD
    # was switched on mid-session, its first scan reached 11 hours back to the 18 Aug 14:00 candle
    # still inside LOOKBACK, and sold it. His words on seeing the alert — "there is no momentum
    # candle that has CLOSED there" — were exactly right; it was eleven hours behind him.
    #
    # This is not a staleness threshold. In continuous running the momentum candle is a median 0
    # bars old (p90 also 0, all three instruments), so this refuses nothing in normal operation —
    # it only stops a cold start mining the past. See core/instrument_debut.py.
    if debut is not None and debut.is_backfill(symbol, h1[mc_idx].time):
        vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: the {'up' if bullish else 'down'} momentum "
                             f"candle closed before this instrument was first scanned — backfill, "
                             f"not a live setup | {state}")
        return None

    # EVERYTHING ABOUT THE MOMENTUM CANDLE IS READ AT THE MOMENTUM CANDLE, for the same causal
    # reason the leg gate is (see below). SINCE 31 AUG THE CANDLE IS ALWAYS THE NEWEST CLOSED BAR
    # (`momentum_run`), so `at_mc` is now the full window except during a run of 2+ (2-5% of the
    # time), where it is 1-2 bars short. It used to be up to LOOKBACK=12 bars old (median 5),
    # so the trend read is replayed on the truncated window too: measured, its MATURITY differs from
    # the latest-bar read on 0.9% of GBP/USD and 1.8% of EUR/USD setups, because a swing's
    # confirmation can land inside that gap. Small, but "had this trend already continued when the
    # candle formed?" is a question about the candle.
    at_mc = _upto(window, h1, mc_idx)
    turns_mc = structure_turns(at_mc, _H1_SWING_N)    # ...and ONCE per truncated window
    t_mc = trend_state(at_mc, n=_H1_SWING_N, turns=turns_mc)
    # If the candle formed mid-reversal (no direction yet at that point), fall back to the current
    # read rather than refusing — that would be a second, unasked-for rule.
    mstate = t_mc if t_mc.direction else tstate
    ret, eff, state_mc = market_state(at_mc, mstate, symbol)
    # THE REGIME IS READ AT THE MOMENTUM CANDLE, for the same causal reason as everything else about
    # it. Read as of NOW instead, it differed on 30% of GBP/USD and 33% of EUR/USD momentum candles
    # — a third of setups judged on a market state that arrived AFTER the candle they rest on.
    regime = vix1_regime.classify(turns_mc, atr(at_mc, 14))

    # 1) momentum WITH a clear 1HR trend.
    if t1 == want:
        # THE PULLBACK REFUSAL (user 2026-08-11). The trend agreeing is not quite enough: if the
        # FASTER structure is trending the other way we are in a retrace, not a continuation. That is
        # the whole of 10 Aug — 2-day trend DOWN, 8-hour structure UP, and it sold the rally.
        #
        # JUDGED AT THE MOMENTUM CANDLE, not at the latest bar. The question is causal — "had the
        # pullback finished when this candle formed?" — and the candle used to be up to LOOKBACK hours
        # old. Reading the structure as it is NOW would let a pullback that formed AFTER the candle
        # decide the candle's fate. Measured: this changes the verdict on 6% of GBP/USD setups and
        # 4% of EUR/USD.
        #
        # ON ITS OWN 8-BAR STRUCTURE — *NOT* `turns_mc`. Restored 2026-08-19; between 08-12 and then
        # this passed `turns=turns_mc`, the TREND's own real-time turning points, and so had no
        # faster structure in it at all. Those turns mark a turn only when price CLOSES DECISIVELY
        # THROUGH the candle that made the extreme — a change-of-character test. His settled rule is
        # "a pullback ends when CHoCH begins", so that read cannot see a pullback until it is over.
        # Measured over 900 bars it NEVER flagged 71% / 82% / 50% of the counter-trend bounces on
        # XAU/USD / EUR/USD / GBP/USD, and it is why gold sold into a visible bounce on 18 Aug.
        #
        # The feared 8-hour lag does not materialise: the verdict compares the LAST TWO highs and
        # lows and flips on pivots already confirmed, so it calls a bounce a median 1-4 bars after
        # the turn. A causal variant (right-hand window swept 6/4/3/2/1) was built and measured —
        # it fixes nothing extra and at right<=4 it ALLOWS MORE on gold, because early pivots un-turn,
        # the verdict falls to "mixed", and "mixed" does not refuse. So the symmetric 8 stays.
        # THE TURN'S POSITION COMES FROM `t_mc`, NOT `tstate` — `t_mc` is the state computed on
        # `at_mc`, and an index from the full window would point at the wrong bar here.
        leg = leg_state(at_mc, t1, n=_FAST_N, choch_index=t_mc.choch_index)
        if not leg.ready:
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {'up' if bullish else 'down'} momentum WITH the "
                                 f"trend, but the leg does not permit it — {leg.why} | {state_mc}")
            return None

        # IS THE MARKET WORTH TRADING AT ALL — his "not in a retracement", answered by the market
        # state rather than by interrogating the candle (the candle is the proof the retracement
        # ended; that is settled). The reversal half of the same rule is enforced by `t1 == 0` above.
        #
        # ⚠ THIS IS LIVE AND IT REFUSES. The line here used to read "Inert until he sets the two
        # thresholds, so this changes nothing today" — and that was FALSE, corrected 2026-08-29.
        # The thresholds ARE set (`vix1_regime._PROGRESS_ATR = 0.50`, `_BOUNDARY_ATR = 0.75`) and
        # `market_permits` refuses anything that is not a TREND: verified by calling it directly on a
        # RANGE (refused) and a TREND (allowed), and measured live on all three instruments, where it
        # was refusing at the time of reading. A comment claiming a working gate is switched off is
        # how a working gate gets deleted by whoever reads it next, so it is asserted in
        # `test_structure.py` rather than described here.
        refusal = market_permits(regime)
        if refusal:
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {refusal} | {state_mc}")
            return None

        # ── AND IS THE MARKET STILL IN THAT STATE *NOW*? (2026-08-19) ───────────────────────────
        # THE DEFECT THIS CLOSES. Every check above reads a window truncated to the momentum candle.
        # That is right for "was this good evidence when it formed" and useless for "should an order
        # go out right now" — and only the second question places a trade. Because the candle can be
        # up to LOOKBACK hours old, the ENTIRE judgement aged with it: on the gold incident the live
        # (that ageing is now bounded at 0-2 bars by the newest-bar rule, but this check STAYS —
        #  it is what caught the Friday candle at 19:00 on 28 Aug, and a run of 2+ still ages.)
        # pullback reading sat frozen at "1 bar, $3.00, 0.19x ATR" for twelve hours while the real
        # one went to 2 bars / $31.92 / 1.72x ATR. Nothing in the decision could see that.
        #
        # So the causal checks stay exactly as they are, and the same two are asked a second time
        # about the present. Measured cost of this on its own: 2 / 1 / 1 setups over 1500 bars on
        # XAU/USD / EUR/USD / GBP/USD — it is a guard, not a filter.
        # HIS COMPLETE RULE, and it needs NO threshold (2026-08-19). He gave it in two corrections:
        #     "why do we need a number? I thought we were tracing pullback in real time."
        #     "if the first candle that goes against the pullback is a momentum candle we take a
        #      trade. But if it is not we wait until we get one."
        #
        # So a momentum candle does not merely survive a pullback — it is what ENDS one, which is his
        # settled "momentum candle is a proof of the continuation of the trend". The question is
        # therefore NOT "is a pullback running" (that would refuse every continuation entry, ~40% of
        # setups) but "did this candle come BEFORE the pullback that is running now". A candle from
        # before it cannot be the candle that ended it.
        #
        # THAT IS EXACTLY THE GOLD DEFECT: the signal's momentum candle was 18 Aug 14:00 and the
        # bounce began 19 Aug 00:00, eleven hours later. Measured cost of the whole rule: 1 / 2 / 0
        # setups over 1500 bars on XAU/USD / EUR/USD / GBP/USD.
        pb_since = vix1_retracement.pullback_since(window, t1, since=mstate.direction_since)
        stale_evidence = pb_since is not None and h1[mc_idx].time < pb_since
        # ...and here the window IS the full one, so the index comes from `tstate`.
        live_leg = leg_state(window, t1, n=_FAST_N, choch_index=tstate.choch_index)
        live_regime = vix1_regime.classify(turns, atr(window, 14))
        live_refusal = market_permits(live_regime)
        if stale_evidence or not live_leg.ready or live_refusal:
            why = (live_refusal or (live_leg.why if not live_leg.ready else
                   "a pullback has begun since this momentum candle closed, so the candle is not "
                   "the one that ended it — waiting for a momentum candle out of THIS pullback"))
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: the setup was valid when the candle "
                                 f"formed {len(h1) - 1 - mc_idx}h ago, but the market has moved on "
                                 f"— {why} | {state}")
            return None

        return Bias(bullish, mc_idx, "trend", run[1],
                    f"{mstate.maturity} {mstate.reason()}; {leg.why}", ret, eff, regime)

    # 2) 1HR trend UNCLEAR, momentum WITH a clear 4HR trend (the fallback) — MUTED, see _ALLOW_H4.
    if _ALLOW_H4 and t1 == 0 and t4 == want:
        # Same 8-bar source as branch 1 — changed together so the two can never drift apart. This
        # branch is muted, and a muted branch holding the OLD wiring is exactly how a defect comes
        # back the day someone flips `_ALLOW_H4`.
        leg = leg_state(at_mc, want, n=_FAST_N, choch_index=t_mc.choch_index)
        if not leg.ready:
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: 4HR-backed direction but the leg does not "
                                 f"permit it — {leg.why} | {state_mc}")
            return None
        vix1_log.say(symbol, f"[vix1] {symbol} 4HR-BACKED TREND: 1HR trend unclear, 1HR momentum aligns with a clear "
                 f"4HR {'up' if bullish else 'down'} trend | {state_mc}")
        return Bias(bullish, mc_idx, "trend4", run[1],
                    f"4HR-backed ({mstate.maturity}); {leg.why}", ret, eff, regime)

    # UNREACHABLE BY CONSTRUCTION, and deliberately left as an assertion rather than a silent path.
    # PRO-TREND ONLY (user 2026-07-25/26: "Only trade pro trend"). Since the trend now chooses the
    # direction, `want` is either t1 (branch 1 fires) or, when muted-H4 is on, t4 (branch 2 fires);
    # a zero `want` already returned above. The old "momentum but NOT with the trend" rejection this
    # replaced can no longer happen — a counter-trend candle is never even looked for.
    raise AssertionError(f"vix1 detect_bias reached an impossible state: t1={t1} t4={t4} want={want}")
