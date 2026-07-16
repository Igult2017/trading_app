"""
VOCANT.1 — 1M entry. The 1HR sets the bias and THE LINE; the 1M decides WHEN.

Playbook p2: "if the 1M is still not aligned with the 1HR, wait — do nothing until the 1M lines up."
That wait is OPEN-ENDED. The 1HR is context ONLY: it can be ready for hours while the 1M is not. A
bias flip (vocant1_watch) ends a setup; a timer never does.

THE ENTRY IS ALWAYS THE PULLBACK — a proper candle the other way, with a stop just beyond it:
continue and it fills us along the way, reverse and we are never in ("no trade, no risk", p6). A
pullback may run several candles; only its FIRST one matters. What differs between setups is only
how the 1M's ALIGNMENT gets established:

  already aligned  -> the 1M structure already runs with the 1HR (and price is at the line). Nothing
                      to confirm: wait for the pullback and enter.
  FRACTAL BREAK    -> the 1M was moving OPPOSITE the 1HR, then turned and took out the last fractal
                      it formed on the way. That break is CONFIRMATION the 1M trend has changed and
                      is now aligning — it is NOT the entry. We then wait for the pullback and enter
                      there, exactly as above.

The fractal-break move runs an unknown number of candles, so it is never bar-counted — bar-counting
it would hardcode away the setups it has to cover.

Two lines are drawn off candle 1 (vocant1_lines). The SL sits slightly beyond LINE 2 — past where
an opposite move ends — so it cannot wick us out; with a no-wick candle line 2 IS line 1, which is
the ordinary case. Unreachable or on the wrong side of the entry -> the instrument's standard. TP = 2R.
"""
import logging

from core.types import Candle
from shared.candle_math import is_bullish
from shared.mtf_utils import seconds
from strategies.vocant1_bias import clear_trend
from strategies.vocant1_lines import draw_lines

log = logging.getLogger(__name__)

# The standard stop, per instrument — GBP/USD ranges ~1.3-1.5x EUR/USD, so one flat number for both
# would stop GBP inside its own noise. A stop must be reasonable and 2R has to stay reachable.
_MAX_SL_PIPS     = {"EUR/USD": 15.0, "GBP/USD": 20.0}
_MAX_SL_FALLBACK = 15.0
_MIN_SL_PIPS     = 5.0   # never stop tighter than this, however close the line sits
_ENTRY_BUFFER    = 1     # pips — the stop sits JUST beyond the pullback, never resting on it
_SL_BUFFER       = 2     # pips — the stop sits slightly BEYOND the line, not on it
_FRACTAL_N       = 2     # Williams shape — bars required either side of the fractal


def _max_sl(symbol: str) -> float:
    return _MAX_SL_PIPS.get(symbol, _MAX_SL_FALLBACK)


def _dynamic_sl(entry: float, wick_line: float, bullish: bool,
                pip: float, max_sl: float) -> tuple[float, float, bool]:
    """Pullback NEAR the line -> stop slightly beyond LINE 2, i.e. past where an opposite move ends,
    so the wick it prints cannot take us out. (No wick on candle 1 -> line 2 IS line 1, the usual
    case.) Line unreachably far or on the wrong side of the entry -> use the instrument's standard
    instead. Returns (sl, risk, standard)."""
    ideal  = (wick_line - _SL_BUFFER * pip) if bullish else (wick_line + _SL_BUFFER * pip)
    beyond = (ideal < entry) if bullish else (ideal > entry)
    risk   = abs(entry - ideal)
    # A line level with the entry yields ~0 risk; floor-rescuing that would hand back a tight stop
    # that is NOT actually beyond the line. It must be protective AND a real distance away.
    if beyond and _MIN_SL_PIPS * pip <= risk <= max_sl * pip:
        return (entry - risk if bullish else entry + risk), risk, False
    risk = max_sl * pip
    return (entry - risk if bullish else entry + risk), risk, True


def _fractal_broken(win: list[Candle], bullish: bool, n: int = _FRACTAL_N) -> bool:
    """CONFIRMATION, never an entry. The 1M was moving opposite the 1HR and formed fractals on the
    way; price turning and closing through one of them means the 1M trend has CHANGED and is now
    aligning with the 1HR. The move from fractal to break is any number of candles — so we scan the
    whole window since the line and never bar-count it."""
    for i in range(len(win) - 1 - n, n - 1, -1):
        c  = win[i]
        nb = win[i - n:i] + win[i + 1:i + 1 + n]
        if not all((c.high > x.high) if bullish else (c.low < x.low) for x in nb):
            continue
        lvl = c.high if bullish else c.low
        if any((x.close > lvl) if bullish else (x.close < lvl) for x in win[i + n + 1:]):
            return True
    return False


def _pullback(win: list[Candle], bullish: bool) -> float | None:
    """THE ENTRY LEVEL. A pullback may run several candles, but only its FIRST candle matters — that
    is the one nearest the resumption, so a stop just beyond it fills us along the way if price
    continues. Taking the latest candle instead would drag the stop deeper into the retrace with
    every candle. Returns the first pullback candle's extreme, or None if none yet."""
    p = next((i for i in range(len(win) - 1, -1, -1) if is_bullish(win[i]) != bullish), None)
    if p is None:
        return None
    while p > 0 and is_bullish(win[p - 1]) != bullish:   # walk back to the FIRST of this run
        p -= 1
    return win[p].high if bullish else win[p].low


def m1_signals(m1: list[Candle], bullish: bool, vc: Candle,
               pip: float = 0.0001, symbol: str = "") -> list[dict]:
    """
    The 1M entry — [{"kind", "entry", "sl"}] or [] (logs why). `vc` is the FIRST volume candle of the
    1HR run: its close is THE LINE.
    """
    if not m1:
        return []
    digits = 5 if pip < 0.005 else 3
    bar    = max(1, seconds(m1[0].timeframe))   # never 0 — an unknown TF must not divide-by-zero
    hr     = seconds(vc.timeframe)
    line, wick_line = draw_lines(vc, bullish)   # 1: body close  2: wick (usually == 1)
    win    = [c for c in m1 if c.time >= vc.time + hr]     # only price action since the line was set
    want   = 1 if bullish else -1

    if len(win) < 2:
        log.info(f"[vocant1] {symbol} 1M: only {len(win)} bars since the 1st volume candle closed — waiting")
        return []

    # ALIGNMENT (playbook p2) — already running with the 1HR, or a fractal break says it just turned.
    if clear_trend(m1[-(hr // bar):]) == want:
        kind = "pullback"
    elif _fractal_broken(win, bullish):
        kind = "fractal"
    else:
        log.info(f"[vocant1] {symbol} 1M: not aligned with the 1HR {'up' if bullish else 'down'} bias "
                 f"and no fractal break yet — waiting (playbook: do nothing until the 1M lines up)")
        return []

    # THE ENTRY — the one-candle pullback, in both cases.
    lvl = _pullback(win, bullish)
    if lvl is None:
        log.info(f"[vocant1] {symbol} 1M: aligned ({kind}) but no pullback candle yet — price is "
                 f"running; the stop needs one candle back to sit behind")
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
