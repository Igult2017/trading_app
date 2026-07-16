"""
VOCANT.1 — 1M entry. The 1HR sets the bias and the lines; the 1M decides WHEN.

Playbook p2: "if the 1M is still not aligned with the 1HR, wait — do nothing until the 1M lines up."
That wait is OPEN-ENDED — the 1HR can be ready for hours while the 1M is not. A bias flip
(vocant1_watch) ends a setup; a timer never does.

THE ENTRY IS ALWAYS THE PULLBACK (vocant1_pullback) — 1M only, past the line, stop just beyond it:
continue and it fills us along the way, reverse and we are never in ("no trade, no risk", p6).
Setups differ ONLY in how the 1M's ALIGNMENT is established:

  price OUR side of the line -> the 1M is running with the 1HR. Wait for the pullback, enter.
  price the WRONG side       -> the 1M is running against us. The LAST fractal of that counter-move
                     must break first (vocant1_fractal) — that CONFIRMS the turn, it is NOT the
                     entry. Then the pullback, exactly as above.

The line is what answers "is the 1M with us?" — not swing structure. A spike-and-return inside one
hour never prints the two highs and two lows a trend read needs, so structure said "not aligned" in
every long-wick case and real entries were thrown away.

Two lines come off candle 1 (vocant1_lines) and they have separate jobs. LINE 1 is THE line: it gates
the entry (vocant1_pullback). LINE 2 only adjusts the STOP — it marks where an opposite move is
expected to reverse, so the SL sits just beyond it and cannot be wicked out; with a no-wick candle it
IS line 1, the ordinary case. Unreachable or on the wrong side of the entry -> the instrument's
standard. TP = 2R.

Nothing here is a knife-edge: the fractal tolerates equal highs/lows, and the pullback's own
thresholds come off the 1M's recent candles and the volume candle's wick (vocant1_pullback).
"""
import logging

from core.types import Candle
from shared.mtf_utils import seconds
from strategies.vocant1_lines import draw_lines
from strategies.vocant1_pullback import find_pullback
from strategies.vocant1_fractal import fractal_broken

log = logging.getLogger(__name__)

# The standard stop, per instrument — GBP/USD ranges ~1.3-1.5x EUR/USD, so one flat number for both
# would stop GBP inside its own noise. A stop must be reasonable and 2R has to stay reachable.
_MAX_SL_PIPS     = {"EUR/USD": 15.0, "GBP/USD": 20.0}
_MAX_SL_FALLBACK = 15.0
_MIN_SL_PIPS     = 5.0   # never stop tighter than this, however close the line sits
_ENTRY_BUFFER    = 1     # pips — the stop sits JUST beyond the pullback, never resting on it
_SL_BUFFER       = 2     # pips — the stop sits slightly BEYOND the line, not on it


def _max_sl(symbol: str) -> float:
    return _MAX_SL_PIPS.get(symbol, _MAX_SL_FALLBACK)


def _dynamic_sl(entry: float, wick_line: float, bullish: bool,
                pip: float, max_sl: float) -> tuple[float, float, bool]:
    """Stop slightly beyond LINE 2 — past where an opposite move ends, so its wick cannot take us out
    (no wick on candle 1 -> line 2 IS line 1). Line unreachably far, or on the wrong side of the
    entry -> the instrument's standard instead. Returns (sl, risk, standard)."""
    ideal  = (wick_line - _SL_BUFFER * pip) if bullish else (wick_line + _SL_BUFFER * pip)
    beyond = (ideal < entry) if bullish else (ideal > entry)
    risk   = abs(entry - ideal)
    # A line level with the entry yields ~0 risk; floor-rescuing that would hand back a tight stop
    # that is NOT actually beyond the line. It must be protective AND a real distance away.
    if beyond and _MIN_SL_PIPS * pip <= risk <= max_sl * pip:
        return (entry - risk if bullish else entry + risk), risk, False
    risk = max_sl * pip
    return (entry - risk if bullish else entry + risk), risk, True


def m1_signals(m1: list[Candle], bullish: bool, vc: Candle,
               pip: float = 0.0001, symbol: str = "") -> list[dict]:
    """
    The 1M entry — [{"kind", "entry", "sl"}] or [] (logs why). `vc` is the FIRST volume candle of the
    1HR run: its close is THE LINE.
    """
    if not m1:
        return []
    digits = 5 if pip < 0.005 else 3
    hr     = seconds(vc.timeframe)
    line, wick_line = draw_lines(vc)   # 1: body close = THE line;  2: wick = the stop's anchor
    win    = [c for c in m1 if c.time >= vc.time + hr]     # only price action since the line was set

    if len(win) < 2:
        log.info(f"[vocant1] {symbol} 1M: only {len(win)} bars since the 1st volume candle closed — waiting")
        return []

    # ALIGNMENT (playbook p2) — THE LINE decides which side we are on, and that is the whole reason it
    # is drawn. Price on our side of it = the 1M is running with the 1HR, so the pullback alone is the
    # entry. Price the WRONG side = the 1M is running against us, and the LAST fractal of that
    # counter-move has to break before anything means a thing.
    # LINE 2 is the boundary, not line 1: an opposite move is allowed to push past line 1 and reverse
    # at line 2, so that band is the tolerance and no fifth decimal decides which side we are on. Past
    # line 2 the counter-move is real. (No wick on candle 1 -> line 2 IS line 1, the ordinary case.)
    last = win[-1].close
    if (last > wick_line) if bullish else (last < wick_line):
        kind = "pullback"
    else:
        broke, lvl = fractal_broken(win, bullish)
        if not broke:
            seen = "none formed yet" if lvl is None else f"{lvl:.{digits}f}"
            log.info(f"[vocant1] {symbol} 1M: price {last:.{digits}f} is the wrong side of the lines "
                     f"({line:.{digits}f}/{wick_line:.{digits}f}) and the counter-move's last fractal ({seen}) has not "
                     f"broken — waiting (playbook: do nothing until the 1M lines up)")
            return []
        kind = "fractal"

    # THE ENTRY — the first pullback candle PAST the line, in both cases.
    lvl, why = find_pullback(win, bullish, line, wick_line)
    if lvl is None:
        log.info(f"[vocant1] {symbol} 1M: aligned ({kind}) but {why} — waiting")
        return []

    entry = lvl + _ENTRY_BUFFER * pip if bullish else lvl - _ENTRY_BUFFER * pip
    sl, risk, standard = _dynamic_sl(entry, wick_line, bullish, pip, _max_sl(symbol))

    # The stop must still be UNFILLED — strictly beyond price in the trend direction. If the pullback
    # is already taken out, an order there is a LIMIT filling INTO the move: the inverse of this entry.
    last = win[-1].close
    if (entry <= last) if bullish else (entry >= last):
        log.info(f"[vocant1] {symbol} 1M: the pullback is already taken out (price {last:.{digits}f} "
                 f"vs stop {entry:.{digits}f}) — a stop there would fill into the move; entry gone")
        return []

    log.info(f"[vocant1] {symbol} 1M PULLBACK entry ({kind} path) — {'BUY' if bullish else 'SELL'} "
             f"stop {entry:.{digits}f} SL {sl:.{digits}f} ({risk / pip:.1f}p, "
             f"{'standard' if standard else 'beyond the line'}; line {line:.{digits}f}"
             f"{'' if wick_line == line else f' wick-line {wick_line:.{digits}f}'})")
    return [{"kind": kind, "entry": round(entry, digits), "sl": round(sl, digits)}]
