"""
VIX.1 — TRADE MANAGEMENT: the R ratchet and the 1M structure exit.

The user's rule (2026-07-25): "We target 2R however, if the price is still moving, we lock 2R and
still stay. So in each movement we shall lock 1R until we see structure change."

Taken literally ("stop AT 2R the moment price touches 2R") the first tick back ends the trade, so
staying in would be impossible. The working reading, confirmed by him, is a stop that TRAILS 1R
BEHIND price, switched on at 2R:

    price reaches 2R -> stop to +1R      (1R locked)
    price reaches 3R -> stop to +2R      (2R locked)
    price reaches 4R -> stop to +3R      ... and so on

The stop RATCHETS: it only ever moves forward. Below 2R nothing moves and the original stop stands,
so a trade that never works behaves exactly as it does today.

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
from shared.swing_points import find_swing_points

ARM_R    = 2.0   # trailing switches on here — the original target
TRAIL_R  = 1.0   # how far behind the peak the stop sits once armed
_SWING_N = 3     # 1M pivot half-width, same as everywhere else in the platform


@dataclass
class ManageState:
    """Everything the monitor must remember about a live trade between polls."""
    peak_r:    float = 0.0     # best R reached so far (the ratchet's high-water mark)
    locked_r:  float = 0.0     # R currently protected by the stop (0 = original stop still stands)
    stop:      float = 0.0     # where the stop is NOW
    exited:    bool  = False
    exit_r:    float = 0.0
    exit_why:  str   = ""      # "stop" | "structure" | ""
    events:    list  = field(default_factory=list)   # ratchet steps to announce, e.g. [(3.0, 2.0)]


def _locked_for(peak_r: float) -> float:
    """R to protect at a given peak. Below ARM_R nothing is locked; above it the stop sits TRAIL_R
    behind, stepping in whole R so the trader gets a small number of clear instructions rather than
    a stop that inches on every tick."""
    if peak_r < ARM_R:
        return 0.0
    return max(0.0, float(int(peak_r)) - TRAIL_R)


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
