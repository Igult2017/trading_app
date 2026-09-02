"""
VIX.1 — TRADE MANAGEMENT: the R ratchet and the 1M structure exit.

HIS LADDER, 2026-09-02 — and it SUPERSEDES the 2026-07-25 trailing reading described below:

    price reaches 0.4R -> stop to BREAKEVEN
    price reaches 2.0R -> stop to +1R      (1R locked)
    price reaches 2.5R -> stop to +2R      (2R locked)

His words: *"Breakeven at 0.4R, Lock 1R at 2R and lock 2R at 2.5R and get out of trade when price
has started turning against us."* **The 2.5R rung had been explicitly WITHDRAWN on 2026-08-21 and he
has reinstated it** — recorded so it is not "corrected" back.

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
from shared.swing_points import find_swing_points

# ARM_R / TRAIL_R ARE GONE — the rungs now come from `monitor/rungs.py`, which both this advice
# path and the code that moves the real stop read. They described a TRAIL (arm at 2R, sit 1R behind);
# his ladder of 2026-09-02 is fixed rungs instead: breakeven 0.4R, +1R at 2.0R, +2R at 2.5R.
_SWING_N = 3     # 1M pivot half-width, same as everywhere else in the platform


@dataclass
class ManageState:
    """Everything the monitor must remember about a live trade between polls."""
    peak_r:    float = 0.0     # best R reached so far (the ratchet's high-water mark)
    locked_r:  float = 0.0     # R currently protected by the stop (0 = original stop still stands)
    be_done:   bool  = False   # breakeven rung taken (locks 0R, so locked_r cannot show it)
    stop:      float = 0.0     # where the stop is NOW
    exited:    bool  = False
    exit_r:    float = 0.0
    exit_why:  str   = ""      # "stop" | "structure" | ""
    events:    list  = field(default_factory=list)   # ratchet steps to announce, e.g. [(3.0, 2.0)]


def _locked_for(peak_r: float) -> float:
    """R to protect at a given peak — READ FROM THE SHARED LADDER, `monitor/rungs.py`.

    THIS USED TO BE A TRAILING FORMULA (`int(peak_r) - 1`, armed at 2R) and it was the SECOND ladder
    in the codebase: the code that moves his stop broke even at 1R while this advised nothing below
    2R, so the DM and the amend could disagree about one trade. He asked for them merged.

    HIS LADDER, 2026-09-02 (revised the same day): breakeven at 0.4R, lock +1R at 2.0R, then TRAIL —
    the stop keeps 0.1R behind in 0.1R steps until it is hit.

    **THE TRAIL MUST BE PASSED HERE TOO.** This is the THIRD reader of the shared table, after
    `position_tracker` and `trade_watcher`, and it was the one missed when the trail was added: it
    called `reached()` without the trail, so the advice DM stopped at +1R while the code moving the
    real stop had already trailed it to +2.4R. That is precisely the two-ladders disagreement this
    table exists to prevent, reappearing in a third place — caught by `test_manage`.

    Breakeven is NOT a locked R — it protects zero — so it returns 0.0 here and is handled as its
    own step by `_be_reached`.
    """
    locked = 0.0
    for rung in rungs.reached(rungs.ladder(), peak_r, rungs.trail()):
        if rung.lock_r is not None:
            locked = max(locked, rung.lock_r)
    return locked


def _be_reached(peak_r: float) -> bool:
    """Has the breakeven rung been reached? Its own question, because breakeven locks 0R and so
    cannot be told apart from 'nothing locked yet' by the number alone."""
    return any(r.lock_r is None
               for r in rungs.reached(rungs.ladder(), peak_r, rungs.trail()))


def structure_broken(bars: list[Candle], bullish: bool) -> bool:
    """Has 1M structure turned against the trade? A BODY CLOSE beyond the most recent swing made
    since entry (swing LOW for a long, swing HIGH for a short). Wicks never count."""
    pts = find_swing_points(bars, _SWING_N)
    lv = [p.price for p in pts if p.is_high != bullish]     # lows for a long, highs for a short
    if not lv:
        return False
    last = lv[-1]
    return any((c.close < last) if bullish else (c.close > last) for c in bars[-3:])


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
            if not st.be_done and _be_reached(r):
                st.be_done = True
                if (entry > st.stop) if bullish else (entry < st.stop):
                    st.stop = entry                     # ratchet only — never widen the risk
                st.events.append((round(r, 2), 0.0))
            want = _locked_for(r)
            if want > st.locked_r:                      # ratchet forward — never backward
                st.locked_r = want
                st.stop = entry + want * risk if bullish else entry - want * risk
                st.events.append((round(r, 2), want))

        # 2) stop hit? (checked on the SAME bar as the advance: within one bar the order is unknown,
        #    so we take the conservative side and let the stop win)
        hit = (c.low <= st.stop) if bullish else (c.high >= st.stop)
        if hit:
            st.exited, st.exit_why = True, "stop"
            st.exit_r = (st.stop - entry) / risk if bullish else (entry - st.stop) / risk
            return st

        # 3) structure change — only once armed. Before 2R the original stop is the only exit;
        #    reading structure on the first few bars would eject us from every normal retrace.
        if st.locked_r > 0 and structure_broken(bars[:i + 1], bullish):
            st.exited, st.exit_why = True, "structure"
            st.exit_r = ((c.close - entry) if bullish else (entry - c.close)) / risk
            return st

    return st
