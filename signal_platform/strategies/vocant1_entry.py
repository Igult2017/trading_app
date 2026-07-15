"""
VOCANT.1 — 1M entry. The 1HR sets the bias and THE LINE; the 1M decides WHEN.

Playbook p2: "if the 1M is still not aligned with the 1HR, wait — do nothing until the 1M lines up."
That wait is OPEN-ENDED. The 1HR is context ONLY: it sets the bias and the line and never puts a clock
on the entry — it can be ready for hours while the 1M is not. A bias flip (vocant1_watch) ends a
setup; a timer never does.

THE LINE = the 1st volume candle's body end (its close == the 2nd candle's open). Marked on the 1HR,
read on the 1M. Where price sits against it picks the trigger — the entry is DYNAMIC:

  PAST the line   -> the move is already proven, so a PULLBACK is enough: ONE candle against the
                     trend, then a stop beyond the level it pulled back from.
  NOT past it yet -> realignment is unproven, so we need the FRACTAL BREAK. A fractal only exists
                     because price went the OTHER way, so breaking it IS the 1M re-aligning. The stop
                     is pre-placed beyond it and the break fills it (p5) — we never require a break
                     that already happened (that was the old "break too old" trap).

Either way it is a STOP order — a reversal never fills us: "no trade, no risk" (p6). The SL is
dynamic too: slightly beyond THE LINE, clear of the wick band the next candle prints off it
(candle 1's open-side wick sizes that band), so a routine wick cannot take us out. When the line is
unreachably far or on the wrong side of the entry, it caps at the instrument's standard. TP = 2R.
"""
import logging

from core.types import Candle
from shared.candle_math import is_bullish, upper_wick, lower_wick
from shared.mtf_utils import seconds
from strategies.vocant1_bias import clear_trend

log = logging.getLogger(__name__)

# The standard stop, per instrument — GBP/USD ranges ~1.3-1.5x EUR/USD, so one flat number for both
# would stop GBP inside its own noise. A stop must be reasonable and 2R has to stay reachable.
_MAX_SL_PIPS     = {"EUR/USD": 15.0, "GBP/USD": 20.0}
_MAX_SL_FALLBACK = 15.0
_MIN_SL_PIPS     = 5.0   # never stop tighter than this, however close the line sits
_ENTRY_BUFFER    = 1     # pips — the stop sits JUST beyond the level, never resting on it
_SL_BUFFER       = 2     # pips — clear of the line and of the wick band printed off it
_PB_ORIGIN       = 3     # candles ending at the pullback that define the level it came from
_FRACTAL_N       = 2     # Williams shape — bars required either side of the fractal


def open_side_wick(vc: Candle, bullish: bool) -> float:
    """Candle 1's wick on its OPEN side: a bull candle opens at the body's bottom (so, its lower
    wick), a bear candle at the top (its upper wick). This sizes the pullback the next candle prints
    as it opens off the line — the band the stop must clear to survive a routine wick."""
    return lower_wick(vc) if bullish else upper_wick(vc)


def _max_sl(symbol: str) -> float:
    return _MAX_SL_PIPS.get(symbol, _MAX_SL_FALLBACK)


def _dynamic_sl(entry: float, line: float, band: float, bullish: bool,
                pip: float, max_sl: float) -> tuple[float, float, bool]:
    """
    The stop is DYNAMIC:
      - pullback NEAR the line -> stop slightly beyond THE LINE and clear of its wick band, so the
        wick that line routinely prints cannot take us out;
      - price ran first and the pullback came LATE, or the line sits on the wrong side of the entry
        (the fractal case) -> that stop is unreasonable, so cap it at the standard.
    Returns (sl, risk, capped).
    """
    ideal  = (line - band - _SL_BUFFER * pip) if bullish else (line + band + _SL_BUFFER * pip)
    beyond = (ideal < entry) if bullish else (ideal > entry)
    risk   = abs(entry - ideal)
    # The line is the stop ONLY when it sits on the protective side of the entry AND far enough to be
    # a real stop. A line level with the entry (the fractal case) yields ~0 risk — floor-rescuing that
    # would hand back a tight stop that is NOT actually beyond the line. Fall back to the standard.
    if beyond and _MIN_SL_PIPS * pip <= risk <= max_sl * pip:
        return (entry - risk if bullish else entry + risk), risk, False
    risk = max_sl * pip
    return (entry - risk if bullish else entry + risk), risk, True


def _pullback_level(win: list[Candle], bullish: bool) -> float | None:
    """PAST-THE-LINE trigger: the line already proved the move, so ONE candle against the trend is
    all the pullback we need. The level is what it pulled back FROM — the stop sits beyond it."""
    p = next((i for i in range(len(win) - 1, -1, -1) if is_bullish(win[i]) != bullish), None)
    if p is None:
        return None
    seg = win[max(0, p - _PB_ORIGIN + 1): p + 1]
    return max(c.high for c in seg) if bullish else min(c.low for c in seg)


def _fractal_level(win: list[Candle], bullish: bool, n: int = _FRACTAL_N) -> float | None:
    """NOT-PAST-THE-LINE trigger: a fractal only exists because price went the OTHER way, so breaking
    it is the 1M re-aligning with the 1HR. Most recent confirmed one — the stop is pre-placed beyond
    it and the break fills it. We never require a break that already happened."""
    for i in range(len(win) - 1 - n, n - 1, -1):
        c  = win[i]
        nb = win[i - n:i] + win[i + 1:i + 1 + n]
        if all((c.high > x.high) if bullish else (c.low < x.low) for x in nb):
            return c.high if bullish else c.low
    return None


def m1_signals(m1: list[Candle], bullish: bool, vc: Candle,
               pip: float = 0.0001, symbol: str = "") -> list[dict]:
    """
    The 1M entry — [{"kind", "entry", "sl"}] or [] (logs why). `vc` is the FIRST volume candle of the
    1HR run: its close is THE LINE, its open-side wick the band the stop must clear.
    """
    if not m1:
        return []
    digits = 5 if pip < 0.005 else 3
    bar    = max(1, seconds(m1[0].timeframe))   # never 0 — an unknown TF must not divide-by-zero
    hr     = seconds(vc.timeframe)
    line   = vc.close
    band   = open_side_wick(vc, bullish)
    win    = [c for c in m1 if c.time >= vc.time + hr]     # only price action since the line was set

    # A pullback needs only ONE candle, so this floor stays at 2 — the fractal path needs the full
    # Williams shape and simply finds nothing until enough bars exist, which is the correct wait.
    if len(win) < 2:
        log.info(f"[vocant1] {symbol} 1M: only {len(win)} bars since the 1st volume candle closed — waiting")
        return []

    # PLAYBOOK p2 ALIGNMENT — "do nothing until the 1M lines up with the 1HR". The 1HR being ready
    # means nothing here: we wait as long as the 1M needs, and a bias flip (not a clock) ends it.
    if clear_trend(m1[-(hr // bar):]) != (1 if bullish else -1):
        log.info(f"[vocant1] {symbol} 1M: not yet aligned with the 1HR {'up' if bullish else 'down'} "
                 f"bias — waiting (playbook: do nothing until the 1M lines up)")
        return []

    last = win[-1].close
    past = (last > line) if bullish else (last < line)
    lvl  = _pullback_level(win, bullish) if past else _fractal_level(win, bullish)
    kind = "pullback" if past else "fractal"
    if lvl is None:
        log.info(f"[vocant1] {symbol} 1M: aligned, {'past' if past else 'not past'} the line "
                 f"({line:.{digits}f}) — but no {kind} yet to place the stop behind; waiting")
        return []

    entry = lvl + _ENTRY_BUFFER * pip if bullish else lvl - _ENTRY_BUFFER * pip
    sl, risk, capped = _dynamic_sl(entry, line, band, bullish, pip, _max_sl(symbol))

    # The stop must still be UNFILLED — strictly beyond price in the trend direction. If the level is
    # already taken, an order there is a LIMIT filling INTO the move: the inverse of this entry.
    if (entry <= last) if bullish else (entry >= last):
        log.info(f"[vocant1] {symbol} 1M: the {kind} level is already broken (price {last:.{digits}f} "
                 f"vs stop {entry:.{digits}f}) — a stop there would fill into the move; entry gone")
        return []

    log.info(f"[vocant1] {symbol} 1M {kind.upper()} entry — {'BUY' if bullish else 'SELL'} stop "
             f"{entry:.{digits}f} SL {sl:.{digits}f} ({risk / pip:.1f}p, "
             f"{'capped at the standard' if capped else 'beyond the line'}; line {line:.{digits}f}, "
             f"band {band / pip:.1f}p)")
    return [{"kind": kind, "entry": round(entry, digits), "sl": round(sl, digits)}]
