"""
VIX.1 — regions of interest on the 1M: where price could go against us after entry.

The rule, in the user's words:
  "put our SL at a region of interest where price might pullback to in the worst case scenario...
   we don't need 1HR line to be SL but we can put our SL in any zone where the price might revisit
   in 1M... think of all the zones that can reverse the price or act as a road block."
  "15 pips is not hardcoded, we can adjust it based on where we need SL. If the price is in our
   favor, we can even use 8 or 5 pips as SL."

A region of interest is any level price has ALREADY respected and could respect again. "Reverse the
price" and "act as a road block" are the same side of the trade: both mean *where the pullback would
end in the worst case, after we are in*. There is no TP-side region — the TP is 2R (see below).

The SL sits just beyond the NEAREST region on the protective side. Near enough to be cheap; far
enough that the worst case has to actually break a level price cares about, not just breathe.

NOTHING HERE IS A PIP COUNT. `_MAX_SL_PIPS` (15/20) and `_MIN_SL_PIPS` (5) were invented numbers and
are gone. The market draws these levels itself:
  * the FLOOR is structural — the SL must clear the pullback candle's own extreme. If price merely
    retraces to the candle we entered off, that cannot be the thing that stops us out.
  * the CEILING comes from the user's own backtesting: "2 candles of 1HR TF gives me 2R or more".
    2 candles ~= 2R, so 1 candle ~= 1R, so the risk must not exceed ONE 1HR candle's range. Wider
    than that and the 2R we are targeting is not a two-candle move any more.

Sources of a region, all of them levels the market drew:
  * LINE 2 — the 1HR wick line (vix1_lines): where an opposite move is expected to reverse
  * the last 1M FRACTALS (vix1_fractal): by definition places price pulled back to and turned from
  * recent 1M SWINGS (shared/swing_points — a generic platform resource)
  * unmitigated 1M SUPPLY/DEMAND zones (shared/zone_detection — a generic platform resource)

Independence: `shared/zone_detection` is a PLATFORM resource (lives in shared/, imports only
core.types + candle_math, owned by no strategy) — the same category as shared/swing_points, which
this strategy already uses. BX's `bx_sd_zones` is BX's OWN book-specific logic and is never touched
from here. Two strategies, two zone concepts, no shared trading logic.
"""
from core.types import Candle
from shared.swing_points import find_swing_points
from shared.zone_detection import find_zones, unmitigated
from strategies.vix1_fractal import fractals

_SWING_N   = 3   # generic pivot half-width
_SL_BUFFER = 2   # pips — the SL sits slightly BEYOND the region, never resting on it
                 # (unchanged from the previous SL; the user never asked to move it)


def regions(win: list[Candle], bullish: bool, wick_line: float) -> list[float]:
    """Every 1M level that could reverse price or block it. Unsorted, duplicates harmless."""
    out: list[float] = [wick_line]
    out += [lvl for _, lvl in fractals(win, bullish)]
    out += [p.price for p in find_swing_points(win, _SWING_N)]
    for z in unmitigated(find_zones(win, "M1")):
        out += [z.top, z.bottom]
    return out


def sl_from_regions(entry: float, pb_protective: float, bullish: bool,
                    rois: list[float], pip: float, max_risk: float) -> tuple[float, float, str] | None:
    """
    The SL: just beyond the NEAREST region of interest on the protective side.

    `pb_protective` is the pullback candle's extreme on the side we are protecting (its low for a
    BUY, its high for a SELL) — the region must be beyond THAT, not merely beyond the entry, or the
    very candle we entered off would stop us out.

    `max_risk` is one 1HR candle's range ("2 candles = 2R" -> 1 candle = 1R). Returns
    (sl, risk, what-it-is) or None when no region qualifies — in which case there is no honest place
    to put the stop and the setup is skipped rather than given an invented one.
    """
    buf   = _SL_BUFFER * pip
    cands = [r for r in rois if ((r < pb_protective) if bullish else (r > pb_protective))]
    # a region so far away that the risk is wider than a 1HR candle cannot deliver a 2-candle 2R
    cands = [r for r in cands if abs(entry - r) + buf <= max_risk]
    if not cands:
        return None
    lvl  = max(cands) if bullish else min(cands)     # NEAREST to the entry
    sl   = lvl - buf if bullish else lvl + buf
    risk = abs(entry - sl)
    return sl, risk, f"{risk / pip:.1f}p to a 1M region at {lvl:.5f}"
