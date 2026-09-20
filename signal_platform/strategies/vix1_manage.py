"""
VIX.1 — TRADE MANAGEMENT: the R ratchet and the 1M structure exit.

HIS LADDER — and it SUPERSEDES the 2026-07-25 trailing reading described below:

    price reaches 0.4R  -> stop to BREAKEVEN
    price reaches 1.5R  -> stop to +1R      (1R locked)
    price reaches 2.2R+ -> TRAIL, the stop kept 0.2R behind in 0.1R steps

His words, 2026-09-20: *"At 2.2R move to 2R and keep moving 0.2R behind the move until your trailing
stop is hit"* — replacing the 0.1R gap from 2.1R he set on 2026-09-03, which was smaller than the
spread on every sell and so was refused by the broker instead of moving the stop.

The fixed 2.5R -> lock 2R rung is gone: the trail protects +2R from 2.2R, which is both earlier and
higher, so keeping it would have told him to move the stop DOWN from 2.4R to 2.0R.

WHAT THIS REPLACED, kept because the reasoning still explains the shape. His rule of 2026-07-25 was
*"We target 2R however, if the price is still moving, we lock 2R and still stay. So in each movement
we shall lock 1R until we see structure change."* Taken literally the first tick back ends the trade,
so it was implemented as a stop TRAILING 1R behind, armed at 2R (2R->+1R, 3R->+2R, 4R->+3R). His new
instruction replaces that trail with the fixed rungs above.

THE RUNGS THEMSELVES LIVE IN `monitor/rungs.py`, not here. There used to be two ladders for one
trade — this file advised nothing below 2R while the code that MOVES his stop broke even at 1R — so
the DM and the amend could disagree. One table, read by both, is the merge he asked for.

The stop RATCHETS: it only ever moves forward. Below the first rung nothing moves and the original
stop stands, so a trade that never works behaves exactly as it did.

WHY 1M IS THE EXIT TIMEFRAME (his call, and his trades agree): median hold is 69 minutes and 17 of
21 finish inside 2 hours, so a 1HR structure read would resolve about twice per trade — far too
coarse to manage one. On 1M a median trade is ~69 candles, which is enough structure to read.

STRUCTURE CHANGE IS A BODY CLOSE, never a wick — the platform-wide rule ([[feedback-levels-vs-triggers]]
and both strategies). For a long: a close BELOW the most recent 1M swing low formed since entry. A
wick through it is a liquidity grab, and ejecting on wicks would undo the whole point of trailing.

PHASE 1 REALITY: VIX.1 only SIGNALS — the user places and manages the trade himself, so this module
does not move any broker stop. It decides WHAT TO TELL HIM ("+3R reached, move your stop to +2R",
"1M structure changed, close it"). When Phase 2 executes via cTrader, the same decisions drive
amend_position instead of a message. The brain is identical; only the last step differs.
"""
from dataclasses import dataclass, field

from core.types import Candle
from monitor import rungs
# `shared.swing_points.find_swing_points` is no longer imported (2026-09-13): the only thing that
# used it here was the deleted 1M structure exit. This module now reads nothing but the shared ladder.

# ARM_R / TRAIL_R ARE GONE — the rungs now come from `monitor/rungs.py`, which both this advice
# path and the code that moves the real stop read. They described a TRAIL armed at 2R sitting 1R
# behind; his ladder is two fixed rungs (breakeven 0.4R, +1R at 1.5R) and then a much tighter trail
# from 2.2R that keeps the stop 0.2R behind.
# `_SWING_N` is gone too — it was the 1M pivot half-width for the deleted structure exit and nothing
# else read it.


@dataclass
class ManageState:
    """Everything the monitor must remember about a live trade between polls."""
    peak_r:    float = 0.0     # best R reached so far (the ratchet's high-water mark)
    locked_r:  float = 0.0     # R currently protected by the stop (0 = original stop still stands)
    be_done:   bool  = False   # breakeven rung taken (locks 0R, so locked_r cannot show it)
    stop:      float = 0.0     # where the stop is NOW
    exited:    bool  = False
    exit_r:    float = 0.0
    exit_why:  str   = ""      # "stop" | "" — "structure" was retired 2026-09-13, see the note below
    events:    list  = field(default_factory=list)   # ratchet steps to announce, e.g. [(3.0, 2.0)]


def _locked_for(peak_r: float) -> tuple[float, bool]:
    """R to protect at a given peak, and whether that rung SPEAKS — READ FROM THE SHARED LADDER,
    `monitor/rungs.py`.

    THIS USED TO BE A TRAILING FORMULA (`int(peak_r) - 1`, armed at 2R) and it was the SECOND ladder
    in the codebase: the code that moves his stop broke even at 1R while this advised nothing below
    2R, so the DM and the amend could disagree about one trade. He asked for them merged.

    HIS LADDER, 2026-09-03: breakeven at 0.4R, lock +1R at 1.5R, then TRAIL from 2.1R — the stop
    keeps 0.1R behind in 0.1R steps until it is hit.

    **THE TRAIL MUST BE PASSED HERE TOO.** This is the THIRD reader of the shared table, after
    `position_tracker` and `trade_watcher`, and it was the one missed when the trail was added: it
    called `reached()` without the trail, so the advice DM stopped at +1R while the code moving the
    real stop had already trailed it to +2.4R. That is precisely the two-ladders disagreement this
    table exists to prevent, reappearing in a third place — caught by `test_manage`.

    Breakeven is NOT a locked R — it protects zero — so it returns 0.0 here and is handled as its
    own step by `_be_rung`.

    RETURNS THE QUIET FLAG TOO, added 2026-09-13 — and that is the point of the change. The ladder
    already records which rungs SPEAK (`Rung.quiet`), carrying his 2026-09-02 rule: *"Locking Rs
    should only be announced when we move to breakeven and when we are out of the market... We dont
    need to get all the messages like 1R locked in the DM."* Every locking rung is marked quiet
    there. But this function returned a bare number, so `vix1_alerts` had no way to ask and
    announced EVERY rung — sending him the exact "1R locked" messages he had asked to stop. The
    instruction was applied to the table and never reached the messenger.
    """
    locked, quiet = 0.0, True
    for rung in rungs.reached(rungs.ladder(), peak_r, rungs.trail()):
        if rung.lock_r is not None and rung.lock_r >= locked:
            locked, quiet = rung.lock_r, rung.quiet
    return locked, quiet


def _be_rung(peak_r: float):
    """The breakeven rung if it has been reached, else None. Its own question, because breakeven
    locks 0R and so cannot be told apart from 'nothing locked yet' by the number alone.

    Returns the RUNG rather than a bool so its `quiet` flag travels with it — see `_locked_for`.
    """
    return next((r for r in rungs.reached(rungs.ladder(), peak_r, rungs.trail())
                 if r.lock_r is None), None)


# `structure_broken` WAS DELETED 2026-09-13 ON HIS INSTRUCTION: *"I has no use now so delete it."*
#
# WHAT IT WAS. A SECOND exit, separate from the stop: once the stop had moved past breakeven it read
# 1-minute swings and, on a close through the last swing against the trade, DM'd him "close it".
#
# WHY IT WENT — it was half of a rule he had already replaced. It came from his 2026-07-25 wording
# *"in each movement we shall lock 1R until we see structure change"*. On 2026-09-03 he replaced that
# with the ladder — breakeven 0.4R, +1R at 1.5R, then trail 0.1R behind from 2.1R — ending *"until we
# get knocked out"*, i.e. the STOP is the exit and there is no structure clause in it. The trailing
# half was duly swapped for the ladder; this half was left running and kept messaging him about an
# exit rule he no longer had. He did not know it existed: *"what you are talking about i dont know."*
#
# IT ALSO CARRIED A REAL DEFECT, recorded so it is not rebuilt the same way: it took the swing level
# from the candle's WICK while triggering on a body CLOSE, which contradicted its own docstring
# ("Wicks never count") and defended a level below where price had actually settled.
def run(entry: float, sl0: float, bullish: bool, bars: list[Candle],
        state: ManageState | None = None) -> ManageState:
    """Advance the ratchet over `bars` (1M, entry onward). Pure: no I/O, no broker calls.

    Used two ways with the same code — replayed over a whole trade in a backtest, or called each
    poll with the bars since the last one, carrying `state` forward."""
    risk = abs(entry - sl0)
    st = state or ManageState(stop=sl0)
    if risk <= 0 or st.exited:
        return st

    for i, c in enumerate(bars):
        # 1) how far has this bar run in our favour, in R?
        best = (c.high - entry) if bullish else (entry - c.low)
        r    = best / risk
        if r > st.peak_r:
            st.peak_r = r
            # BREAKEVEN FIRST, and only once. It protects 0R, so it moves the stop to the entry
            # without changing `locked_r` — the two are different facts and conflating them is how
            # the structure exit below would arm a rung early.
            be = _be_rung(r)
            if not st.be_done and be is not None:
                st.be_done = True
                if (entry > st.stop) if bullish else (entry < st.stop):
                    st.stop = entry                     # ratchet only — never widen the risk
                st.events.append((round(r, 2), 0.0, be.quiet))
            want, want_quiet = _locked_for(r)
            if want > st.locked_r:                      # ratchet forward — never backward
                st.locked_r = want
                st.stop = entry + want * risk if bullish else entry - want * risk
                # THE THIRD ITEM IS THE LADDER'S OWN `quiet` FLAG, so the messenger can obey his
                # "don't DM me every locked R" rule without knowing anything about the rungs.
                st.events.append((round(r, 2), want, want_quiet))

        # 2) stop hit? (checked on the SAME bar as the advance: within one bar the order is unknown,
        #    so we take the conservative side and let the stop win)
        hit = (c.low <= st.stop) if bullish else (c.high >= st.stop)
        if hit:
            st.exited, st.exit_why = True, "stop"
            st.exit_r = (st.stop - entry) / risk if bullish else (entry - st.stop) / risk
            return st

        # THE STOP IS NOW THE ONLY EXIT — his ladder ends "until we get knocked out". The 1M
        # structure exit that used to sit here was deleted 2026-09-13; see the note above.

    return st
