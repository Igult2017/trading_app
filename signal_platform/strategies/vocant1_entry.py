"""
VOCANT.1 — 1M entry. The 1HR sets the bias and the lines; the 1M decides WHEN.

Playbook p2: "if the 1M is still not aligned with the 1HR, wait — do nothing until the 1M lines up."
That wait is OPEN-ENDED — the 1HR can be ready for hours while the 1M is not. A bias flip
(vocant1_watch) ends a setup; a timer never does.

THE ENTRY IS ALWAYS THE PULLBACK (vocant1_pullback) — 1M only, past the line, stop just beyond it:
continue and it fills us along the way, reverse and we are never in ("no trade, no risk", p6).
Setups differ ONLY in how the 1M's ALIGNMENT is established:

  already aligned -> the 1M already runs with the 1HR at the line. Wait for the pullback, enter.
  FRACTAL BREAK   -> the 1M was moving OPPOSITE the 1HR, turned, and took out the last fractal it
                     formed. That break CONFIRMS the turn — it is NOT the entry. Then the pullback,
                     exactly as above. It runs an unknown number of candles, so it is never
                     bar-counted; bar-counting would hardcode away the setups it must cover.

Two lines come off candle 1 (vocant1_lines). The SL sits slightly beyond LINE 2 — past where an
opposite move ends — so it cannot wick us out; with a no-wick candle line 2 IS line 1, the ordinary
case. Unreachable or on the wrong side of the entry -> the instrument's standard. TP = 2R.
"""
import logging

from core.types import Candle
from shared.mtf_utils import seconds
from strategies.vocant1_bias import clear_trend
from strategies.vocant1_lines import draw_lines
from strategies.vocant1_pullback import find_pullback

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


def _fractal_broken(win: list[Candle], bullish: bool, n: int = _FRACTAL_N) -> bool:
    """CONFIRMATION, never an entry. The 1M was moving opposite the 1HR and formed fractals on the
    way; price turning and closing through one of them means the 1M trend has CHANGED and is now
    aligning with the 1HR. Only the LAST fractal it formed counts. The move from that fractal to the
    break is any number of candles, so nothing here is bar-counted."""
    for i in range(len(win) - 1 - n, n - 1, -1):
        c  = win[i]
        nb = win[i - n:i] + win[i + 1:i + 1 + n]
        if not all((c.high > x.high) if bullish else (c.low < x.low) for x in nb):
            continue
        lvl = c.high if bullish else c.low
        # ONLY the most recent fractal decides — return, not continue. Scanning back finds some
        # long-dead broken level in any sizeable window and calls a plainly-counter 1M "aligned";
        # once it truly trends with the 1HR the caller's clear_trend branch carries it anyway.
        return any((x.close > lvl) if bullish else (x.close < lvl) for x in win[i + n + 1:])
    return False


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

    # THE ENTRY — the first pullback candle PAST the line, in both cases.
    lvl, why = find_pullback(win, bullish, line)
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
