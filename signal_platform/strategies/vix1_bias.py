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
from strategies.vix1_momentum import momentum_run, size_note, veto_reason
from strategies import vix1_log
from shared.candle_math import atr
from strategies import vix1_choch
from strategies import vix1_regime
from strategies import vix1_retracement
from strategies import vix1_void
from strategies.vix1_state import Bias, market_state
from strategies.vix1_swings import structure_turns
# `vix1_structure` (the 8-bar pullback gate) was DELETED 2026-09-13 on his ruling that
# there may be only ONE pullback logic on the 1-hour chart. That one is
# `vix1_retracement`, which counts a pullback from a single candle.
from strategies.vix1_tradeable import market_awake, trend_reproven
from strategies.vix1_trend import trend_state, remember

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

# HOW FAR BACK "has this market gone quiet?" LOOKS. 24 = one trading day, a natural unit rather
# than a tuned one, and the boundary within it is HIS: *"a market that has gone quiet is one that has
# NO momentum candles"* — zero-versus-any, not a level someone picked.
#
# `_QUIET_NEED` IS GONE. It counted momentum candles and refused when there were none, which is the
# counting half of his rule with the WAITING half missing — and the waiting half is the rule. See
# `vix1_tradeable.market_awake`, which now requires the market to RUN and then PULL BACK after it
# woke, with his pullback exception in front of it.
_QUIET_LOOK = 24

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
    # THE 4HR READ GETS ITS TURNING POINTS TOO — fixed 2026-09-13 after a review.
    # This was `trend_state(h4)`, passing neither `turns` nor `n`. It never executes while
    # `_ALLOW_H4` is False, but the flag is kept expressly SO IT CAN BE SWITCHED BACK ON — and on
    # the day someone did, the 4HR trend would have been read by the old look-ahead detector at the
    # module default of n=3: a 3-bar swing on FOUR-HOUR candles, which is a different instrument,
    # not a slower one. A trap that only springs when a feature is re-enabled is the worst kind.
    t4 = trend_state(h4, n=_H1_SWING_N, turns=structure_turns(h4, _H1_SWING_N)).direction if _ALLOW_H4 else 0

    # HOW LONG HAS THIS BEEN THE ANSWER (2026-09-08). Recomputing above is still the source of truth;
    # this only records what replaying cannot tell you — the AGE of the current reading, counted in
    # 1HR bars off the same chart the trend is read on. It decides nothing. Its value is that a
    # refusal repeating for hours now says so, instead of looking like a fresh event every scan:
    # his two EUR/USD setups of 6-7 Sep were refused nine times for the identical reason and nothing
    # in the log made that visible.
    age = remember(symbol, tstate, window[-1].time) if window else {}

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
        # HIS ONE EXCEPTION, 2026-09-20: the shortcut he switched off on 14 Sep stays off, EXCEPT
        # where the turn is the break of a void price was filling — *"you switch it on only for the
        # liquidity void case not all."* `vix1_void.break_of_a_fill` is the only thing that opens it,
        # and `vix1_preclose` asks the same function so the card and the trade agree.
        void_break = vix1_void.break_of_a_fill(window, tstate.pending == 1, tstate.protected, symbol)
        bias, why = vix1_choch.choch_entry(window, h1, tstate, turns, _H1_SWING_N, symbol,
                                           void_break=void_break)
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
    # A candle admitted by the size test's 24-HOUR MEMORY rather than its own 100-bar median says so, so
    # a signal built on it can be traced to the requirement it cleared. A NOTE, not a reason: it must
    # never become what a stand-down message quotes as the refusal.
    for k in range(run[0], run[0] + run[1]):
        remembered = size_note(h1, k, bullish, symbol)
        if remembered:
            vix1_log.note(symbol, f"[vix1] {symbol} {'up' if bullish else 'down'} momentum candle {remembered}")

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
        # THE 8-BAR LEG GATE WAS REMOVED HERE 2026-09-13 — HIS RULING:
        #
        #   *"we cant have 2 pullback logics in 1 HR TF. Lets use the retracement logic that counts a
        #    pullback from one candle. We have CHOCH logic and we also have protected area which
        #    protects us and prevents us from trading complex pullbacks that occur inside a pullback
        #    as a move. So we should only use one matured pullback logic as the only pullback logic.
        #    The one that is blind to 1 one candle pullback is costing us."*
        #
        # HE IS RIGHT ON THE FACTS, MEASURED. That gate asked the pullback question from 8-bar swing
        # pivots. On 3,000 real bars per instrument, **82-86% of one-candle pullbacks never became a
        # swing at all** (EUR/USD 663 of 767, GBP/USD 666 of 783, XAU/USD 593 of 723) — a single
        # candle had to reach back a median 1.05-1.19x ATR before the detector noticed it, while the
        # ones it missed reached 0.67-0.87x. Meanwhile `vix1_retracement` counts CANDLES, which is
        # his own rule (*"A pullback can be from 1 candle or more so it should count candles"*) and
        # sees every one of them. Two readings of one question, and the coarser one held the veto.
        #
        # HIS REBUTTAL OF ITS DEFENCE IS THE PART THAT MATTERS. The gate justified itself on complex
        # pullbacks — a pullback printing its own lower highs and lows inside an intact uptrend. He
        # answers that the CHoCH rule and the protected level already cover it, which is true:
        # `vix1_trend` sets direction to 0 the moment a body closes through the protecting swing, so
        # a real reversal stops the trade regardless.
        #
        # ALSO MEASURED BEFORE REMOVING, so this is not being taken on faith: over ~4 months it
        # refused 6/74 (EUR/USD), 8/85 (GBP/USD) and 1/19 (XAU/USD) setups, of which only 4, 2 and 0
        # were refusals no other gate would have made — and in 100%/62%/100% of them price had
        # ALREADY moved more than half an ATR the trend's way in the bars the gate could not see.
        # Its founding case (GBP/USD 10 Aug, the 85-pip loss) can no longer occur: the trend there
        # now reads UP, so a sell is never sought.

        # IS THE TREND STILL IN SHAPE — his "Uptrend -> HH + HL. Downtrend -> LL + LH", asked of the
        # trend we are about to trade.
        #
        # THIS USED TO BE A SECOND MODULE WITH A VETO (`vix1_regime.market_permits`), and his ruling
        # on 2026-09-08 was that everything about the trend belongs to one module that coordinates
        # instead of conflicting: *"we can't have 2 trend logics, what for."*
        #
        # The answer now comes off the trend state itself, computed against ITS OWN direction, so the
        # old failure — a shape check that worked out its own direction and could point the opposite
        # way — cannot be expressed any more. `mstate` is the trend AT THE MOMENTUM CANDLE, which is
        # the same causal choice every other check on this path makes.
        # ── THE SHAPE VETO WAS REMOVED HERE 2026-09-13, ON HIS RULING ───────────────────────────
        #
        # HIS SETTLED RULE, `docs/strategies/vix1.md` (2026-08-15), in his own words:
        #
        #     *"a pullback ends when CHOCH begins. So until a move is considered CHOCH it is still a
        #      pullback no matter how deep."*   ...and the doc's own conclusion:
        #     **"There is no third state and no depth threshold."**
        #
        # The shape test invented that third state: *trending, but out of shape* — a market this
        # engine calls a downtrend, whose protected level has NOT broken, and which the pullback rule
        # is happy with, refused anyway. His model has two states, trending and ranging, and a
        # counter-move stays a pullback until the protected level goes.
        #
        # HE FOUND IT, NOT ME: *"that second swing is not mine and i dont know where you got it...
        # Tell me how we can have 2 pullback logics for one strategies. For what?"*
        #
        # MEASURED, AND IT IS WHY HE IS RIGHT: of the setups this refused, `trend_reproven` — the
        # pullback rule — refused **0 of 34 (EUR/USD), 0 of 39 (GBP/USD), 0 of 9 (XAU/USD)**. Not a
        # second opinion: the ONLY opinion, overruling the pullback logic every single time.
        #
        # ⚠ WHAT STILL REFUSES A MARKET THAT IS NOT TRENDING, so this is not a hole:
        #   * `trend_state` itself — no established trend means direction 0 and nothing is sought.
        #     That IS his ranging test: *"a ranging market does not make HH and HL or LL and LH."*
        #   * the change of character — a body close through the protected level sets direction to 0.
        #   * `trend_reproven` — the trend must have run AND pulled back.
        #   * `market_awake` — a market that went quiet must prove itself.
        #   * on the reversal route, `vix1_choch` still refuses a turn out of a RANGE or CHOP
        #     (`vix1_choch.py:167-170`).
        #
        # AND WHAT IS NOW HONESTLY MISSING, recorded rather than hidden: on THIS route the regime
        # reader (`vix1_regime.classify`) only DESCRIBES — its veto was deleted on 2026-09-08 and the
        # shape test took its place. So the main route's "is this ranging" answer is now the trend
        # engine alone. By his rule that is correct; it is stated here so nobody thinks a veto was
        # silently lost.
        #
        # `mstate.in_shape` and `shape_why` are still COMPUTED and still printed on the card and in
        # the log — they describe, they no longer decide.

        # ── IS THIS MARKET WORTH TRADING AT ALL? (2026-09-04) ───────────────────────────────────
        # His three charts of markets we cannot trade produced **12 signals**, every one through
        # THIS route. The cause was not the trend test — measured at those moments the markets
        # really were making higher highs and higher lows. It was that a trend, once established,
        # was never re-examined: every momentum candle traded on a credential the market had earned
        # long before and no longer deserved.
        #
        # ONLY ON THIS ROUTE. `vix1_choch` keeps its own rules — his one marked TRADEABLE example
        # comes through it with the weakest structure of any window measured, so a liveness test
        # there would refuse the setup this whole change exists to protect.
        #
        # THE NUMBERS SIT HERE, beside everything else that gates a trade. `_QUIET_NEED = 1` is HIS
        # DEFINITION, not a tuned level: *"a market that has gone quiet is one that has NO momentum
        # candles"* — zero is the boundary he named. A cut of 4-in-48h separated his charts more
        # cleanly and was REJECTED as fitted to three examples.
        # `ret` is the retracement THIS PATH ALREADY MEASURED at the momentum candle (line 235), so
        # his pullback exception costs nothing extra and cannot disagree with the number on the card.
        # `market_awake` GETS THE MOMENTUM WINDOW, NOT THE TREND WINDOW (fixed 2026-09-08).
        #
        # It asks a MOMENTUM question — "has this market produced any momentum candle lately" — using
        # `is_momentum_candle` unchanged, so that what counts as momentum can never drift between
        # this test and the entry. The function was indeed unchanged; the WINDOW was not.
        #
        # `at_mc` is cut from `window`, which is 1,500 bars because that is the pinned TREND window.
        # The momentum test needs `_LONG_MIN_BARS` = 1,800 for its four-month yardstick and SILENTLY
        # SKIPS that second size floor below it — the state `vix1_momentum` itself warns about as
        # "what admitted the 10-Aug 7.5-pip candle". Measured: the entry (3,000 bars) required a body
        # of 3.3 pips on top of the 100-bar test where this saw no such requirement at all, and the
        # SAME candle was judged differently 8 times in 400 bars.
        #
        # So it now gets the same causal truncation — ending AT the momentum candle, which is the
        # whole point of `at_mc` — taken from the full `h1` instead. `market_awake` only ever COUNTS
        # over the last `2 * look` bars, so the count is identical; only the yardstick is restored.
        # Nothing else moves: `market_state`, `trend_state` and the ATR keep `at_mc`,
        # because 1,500 is correct for all of them and lengthening it would change the trend read.
        awake_window = h1[:mc_idx + 1]
        # `ret` is the retracement measured AT the momentum candle (line 246), which is the same
        # causal moment every other check on this path uses. Passing it here is the 2026-09-13 fix:
        # the pullback question now has exactly one owner (`vix1_retracement`) instead of two
        # answers that could disagree — and did, on his 11 Sep EUR/USD sell.
        # HIS RULE, 2026-09-16: the first momentum candle off a pullback LONGER than three candles is
        # not traded — the trade comes from the third candle after it. Asked of `at_mc`, the window
        # truncated at the momentum candle, so it is the same causal moment as every other check here.
        # THE LIQUIDITY VOID (2026-09-20). His rule: do not trade in the direction of the long candle
        # while price is coming BACK into it; wait for the fill to finish and then two momentum
        # candles. *"The purpose of this module is to avoid trading when the price is filling the
        # void and start trading when the price starts coming back after 2 momentum candles."*
        #
        # It reads `at_mc` — the window truncated at the momentum candle — like every other check
        # here, so it judges the same causal moment, and `mstate.protected` is the protected level
        # that already exists rather than a second one. It can only refuse: `vix1_void` never opens a
        # trade and never touches an entry, a stop or the 1-minute trigger.
        #
        # MEASURED before it shipped, on 190 real fills with the entry and stop unchanged: it allows
        # 45 trades worth -0.6R and refuses 145 worth -30.3R. The win rate either side is the same —
        # it does not find better trades, it halves the LOSS rate. It stops the bleeding; it does
        # not make VIX.1 profitable.
        for veto in (trend_reproven(mstate, turns_mc, ret),
                     vix1_retracement.wait_after_pullback(at_mc, 1 if bullish else -1),
                     market_awake(awake_window, mstate, ret, symbol, _QUIET_LOOK)):
                     # vix1_void.not_filling(...) BELONGS HERE and is deliberately NOT wired yet -
                     # see the note above: branches A and B collide with his 14 Sep proof rule by
                     # exactly one momentum candle, and that is his ruling to make, not mine.
            if veto:
                vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: {veto} | {state_mc}")
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
        # THIS IS THE ONE PULLBACK LOGIC, and it is his: `pullback_since` counts from ONE candle.
        # The 8-bar leg gate that used to sit beside it here was removed 2026-09-13 — see the note
        # in branch 1 for his ruling and the measurements behind it.
        # THE SHAPE HALF OF THIS CHECK WENT TOO (2026-09-13) — the same removal as branch 1, in the
        # same change, so the two can never disagree about whether the third state exists.
        pb_since = vix1_retracement.pullback_since(window, t1, since=mstate.direction_since)
        stale_evidence = pb_since is not None and h1[mc_idx].time < pb_since
        if stale_evidence:
            why = ("a pullback has begun since this momentum candle closed, so the candle is not "
                   "the one that ended it — waiting for a momentum candle out of THIS pullback")
            vix1_log.say(symbol, f"[vix1] {symbol} bias=NONE: the setup was valid when the candle "
                                 f"formed {len(h1) - 1 - mc_idx}h ago, but the market has moved on "
                                 f"— {why} | {state}")
            return None

        # The reason no longer carries the 8-bar gate's verdict — that gate is gone. It now names the
        # trend's own maturity and grounds, which is what the card and the log were really showing.
        return Bias(bullish, mc_idx, "trend", run[1],
                    f"{mstate.maturity} {mstate.reason()}", ret, eff, regime)

    # 2) 1HR trend UNCLEAR, momentum WITH a clear 4HR trend (the fallback) — MUTED, see _ALLOW_H4.
    if _ALLOW_H4 and t1 == 0 and t4 == want:
        # The 8-bar leg gate was removed from this branch too (2026-09-13), for the same reason and
        # in the same change as branch 1 — a muted branch left holding the OLD wiring is exactly how
        # a defect comes back the day someone flips `_ALLOW_H4`.
        vix1_log.say(symbol, f"[vix1] {symbol} 4HR-BACKED TREND: 1HR trend unclear, 1HR momentum aligns with a clear "
                 f"4HR {'up' if bullish else 'down'} trend | {state_mc}")
        return Bias(bullish, mc_idx, "trend4", run[1],
                    f"4HR-backed ({mstate.maturity})", ret, eff, regime)

    # UNREACHABLE BY CONSTRUCTION, and deliberately left as an assertion rather than a silent path.
    # PRO-TREND ONLY (user 2026-07-25/26: "Only trade pro trend"). Since the trend now chooses the
    # direction, `want` is either t1 (branch 1 fires) or, when muted-H4 is on, t4 (branch 2 fires);
    # a zero `want` already returned above. The old "momentum but NOT with the trend" rejection this
    # replaced can no longer happen — a counter-trend candle is never even looked for.
    raise AssertionError(f"vix1 detect_bias reached an impossible state: t1={t1} t4={t4} want={want}")
