"""
VIX.1 — the 1HR MOMENTUM candle.

The strategy's OWN rule, from the playbook — NO indicators. A MOMENTUM CANDLE is the market moving
decisively one way and HOLDING it. It has to answer three questions:

  BIG        — its body is large FOR THIS PAIR RIGHT NOW. The yardstick is the MEDIAN body of the
               last 100 closed bars, never the single candle before it. Measured over 2y of H1, the
               old "bigger than the previous candle" test threw away 21-23% of genuinely strong
               candles (the bar before them simply happened to be bigger) and admitted 24-27% that
               were BELOW normal size — the smallest was 0.79 pips, less than the spread. MEDIAN, not
               mean: on 11-21% of bars a single spike drags the mean past 1.6x the median and then
               blocks every real candle behind it for hours.
  CLEAN      — the body is most of the candle. Real vertical legs run ~57% body; 75% isolates the
               near-wickless look the playbook draws.
  UNREJECTED — the wick AGAINST the move is tiny. The two wicks are NOT the same thing: on a bull
               candle an upper wick is price being SOLD back (momentum failing), while a lower wick
               is a dip being BOUGHT (strength). Only the counter-wick is capped — the old rule
               capped both at 33% and so rejected candles that sold off and were bought back hard.

A RUN is consecutive momentum candles and VIX.1 operates from the FIRST — its close opens the 1M
watch. _MIN_RUN STAYS 1 ON PURPOSE: measured on 1,433 real momentum candles, a second one follows
only 2-5% of the time and 2-3 in a row happen 0-2% of the time. The market gives runs of one, so
waiting for confirmation forfeits the setup. The MOVE does continue — 65% reach 2 more bars of
extension, 47% reach 3, 23% reach 5 — but it continues THROUGH A PULLBACK (a clean unbroken run
reaches 5 bars 0% of the time). That pullback is exactly what the 1M entry is built to buy.
"""
import logging
from statistics import median

from core.types import Candle
from shared.candle_math import body_size, full_range, upper_wick, lower_wick, is_bullish

log = logging.getLogger(__name__)

_BASELINE_BARS  = 100   # bars whose MEDIAN body defines "normal size" for this pair right now
_MIN_BASELINE   = 20    # fewer than this and we cannot say what normal is — never qualify
_MIN_BODY_MULT  = 4.0   # body >= this x the baseline (4.0 -> ~4-5 candidates/pair/month)
_MIN_BODY_FRAC  = 0.75  # body >= this share of the candle's OWN range (the wickless look)
_MAX_CWICK_FRAC = 0.15  # wick AGAINST the move, as a share of range
_MIN_RUN        = 1     # see the docstring — the market gives runs of one
LOOKBACK       = 12    # recent 1HR bars scanned for the candle (an established trend's impulse can
                        # be several bars old while the fresh 1M entry is still forming).
                        # PUBLIC on purpose: vix1.candle_counts DERIVES the M1 request size from it,
                        # so the 1M window always spans the oldest candle this can return. Those two
                        # numbers drifted apart twice (see fix log ef6ff8b) and the entry then judged
                        # a setup on a window that started hours after its own line was drawn.


def baseline_body(h1: list[Candle], i: int) -> float:
    """The MEDIAN body of the closed bars before `i` — what a normal candle is for this pair now."""
    window = h1[max(0, i - _BASELINE_BARS):i]
    if len(window) < _MIN_BASELINE:
        return 0.0
    return median([body_size(c) for c in window])


def counter_wick(c: Candle, bullish: bool) -> float:
    """The wick AGAINST the move — the rejection one. Upper on a bull candle, lower on a bear."""
    return upper_wick(c) if bullish else lower_wick(c)


def is_momentum_candle(h1: list[Candle], i: int, bullish: bool) -> bool:
    """BIG for this pair right now + CLEAN + UNREJECTED. The wick WITH the move is not capped."""
    c = h1[i]
    if is_bullish(c) != bullish:
        return False
    rng  = full_range(c)
    base = baseline_body(h1, i)
    if rng <= 0 or base <= 0:
        return False
    return (body_size(c) >= _MIN_BODY_MULT * base
            and body_size(c) >= _MIN_BODY_FRAC * rng
            and counter_wick(c, bullish) <= _MAX_CWICK_FRAC * rng)


def momentum_run(h1: list[Candle], bullish: bool) -> tuple[int, int] | None:
    """
    Most recent run of consecutive momentum candles. Returns (first_idx, run_len) or None.
    Each candle qualifies ON ITS OWN MERIT against the baseline — NOT against the one before it. The
    old rule required every candle in a run to beat its predecessor, i.e. continuously GROWING
    bodies; inside real vertical legs that holds only ~50% of the time (median ratio 1.00x), so a
    4-candle leg needed four coin-flips in a row and 91% of runs came out length 1 by construction.
    """
    start = max(1, len(h1) - LOOKBACK)
    for i in range(len(h1) - 1, start - 1, -1):
        if not is_momentum_candle(h1, i, bullish):
            continue
        run, first = 1, i
        j = i - 1
        while j >= 1 and is_momentum_candle(h1, j, bullish):
            run  += 1
            first = j
            j    -= 1
        if run >= _MIN_RUN:
            return first, run
    return None


def veto_reason(h1: list[Candle], bullish: bool) -> str:
    """Why the recent bars produced no momentum candle — for diagnostics only."""
    start = max(1, len(h1) - LOOKBACK)
    in_dir = too_small = wrong_shape = 0
    for i in range(len(h1) - 1, start - 1, -1):
        c = h1[i]
        if is_bullish(c) != bullish:
            continue
        in_dir += 1
        rng, base = full_range(c), baseline_body(h1, i)
        if base > 0 and body_size(c) < _MIN_BODY_MULT * base:
            too_small += 1
        elif rng > 0 and (body_size(c) < _MIN_BODY_FRAC * rng
                          or counter_wick(c, bullish) > _MAX_CWICK_FRAC * rng):
            wrong_shape += 1
    if in_dir == 0:
        return f"no in-direction ({'up' if bullish else 'down'}) H1 candle in the last {LOOKBACK} bars"
    return (f"{in_dir} in-direction bars but none was a momentum candle "
            f"(too small x{too_small}, wicky/shape x{wrong_shape} — needs body >= "
            f"{_MIN_BODY_MULT:.1f}x the {_BASELINE_BARS}-bar median body, >= {_MIN_BODY_FRAC:.0%} of "
            f"its own range, counter-wick <= {_MAX_CWICK_FRAC:.0%})")
