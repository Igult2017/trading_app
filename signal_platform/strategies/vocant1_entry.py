"""
VOCANT.1 — 1M entry signals (fractal break, then pull-back).

Per the Volume Strategy playbook (STEP 2): after the 1HR volume+trend bias, drop to the 1M and enter
on a FRACTAL BREAK via a stop just beyond the fractal. VOCANT.1 emits TWO signals per setup:
  1) BREAK     — fire the moment a 1M fractal is broken in the trend direction (momentum). SL beyond
                 the base of the breakout (the dip that set it up).
  2) PULL-BACK — if price then retraces back beyond the broken level, a safe stop RE-ENTRY (SL beyond
                 the retrace, tighter). "if there will be any" — a runaway break emits only signal 1.
Both share the entry (a stop just beyond the fractal: buy stop above a high / sell stop below a low),
so a reversal never fills you. TP = 2R (set by the caller). We never chase — if price has already run
a full 1R past the entry, that continuation is gone. `pip` scales the buffers, the 5-60 pip risk gate
and the price rounding (see shared.pip). Reads only raw candles.
"""
import logging

from core.types import Candle

log = logging.getLogger(__name__)

_MAX_STALE = 20    # M1 bars — the pull-back must be this fresh (fire before continuation runs)
_M1_WINDOW = 120   # only look at the recent ~2h of M1 (after the volume candle) for the setup


def m1_signals(m1: list[Candle], bullish: bool, cluster_end_time: int,
               pip: float = 0.0001, symbol: str = "") -> list[dict]:
    """
    Return the 1M entry signals for the setup — a list of {"kind", "entry", "sl"}:
      'break'    — a 1M fractal was just broken in the trend direction (momentum; fire immediately).
      'pullback' — after that break, price retraced back beyond the level (safe stop re-entry) — if any.
    Empty list = no signal (logs why). Never chases a move already run >1R past the entry.
    """
    sl_buffer    = 2 * pip
    entry_buffer = 1 * pip
    min_risk     = 5  * pip
    max_risk     = 60 * pip
    digits       = 5 if pip < 0.005 else 3

    window = [c for c in m1[-_M1_WINDOW:] if c.time >= cluster_end_time]
    n = len(window)
    if n < 12:
        log.info(f"[vocant1] {symbol} 1M: only {n} bars since the 1st volume candle closed — waiting")
        return []
    last_close = window[-1].close

    def _resolve(entry, sl):
        """Round + gate (risk bounds, anti-chase). Return (entry, sl) or None."""
        risk = abs(entry - sl)
        if not (min_risk <= risk <= max_risk):
            return None
        if (last_close > entry + risk) if bullish else (last_close < entry - risk):
            return None    # already ran >1R past the entry — don't chase
        return round(entry, digits), round(sl, digits)

    best_miss = "no 1M fractal formed yet"
    # Scan fractals from most-recent (needs 2 bars each side for the Williams shape) back to oldest.
    for i in range(n - 3, 1, -1):
        c = window[i]
        p1, p2, n1, n2 = window[i - 1], window[i - 2], window[i + 1], window[i + 2]
        is_frac = ((c.high > p1.high and c.high > p2.high and c.high > n1.high and c.high > n2.high)
                   if bullish else
                   (c.low < p1.low and c.low < p2.low and c.low < n1.low and c.low < n2.low))
        if not is_frac:
            continue
        f_level = c.high if bullish else c.low
        entry   = f_level + entry_buffer if bullish else f_level - entry_buffer

        # BREAK — the first bar after the fractal that pierces the level in the trend direction.
        brk = next((j for j in range(i + 3, n)
                    if (window[j].high > f_level if bullish else window[j].low < f_level)), None)
        if brk is None:
            best_miss = "fractal formed but not broken in the trend direction yet"
            continue
        if (n - 1 - brk) > _MAX_STALE:
            best_miss = f"fractal break too old ({n - 1 - brk} bars > {_MAX_STALE} max)"
            continue

        out: list[dict] = []
        # 1) BREAK signal — SL beyond the base of the breakout (the dip between the fractal and the break).
        base     = window[i + 1: brk + 1]
        base_ext = min(x.low for x in base) if bullish else max(x.high for x in base)
        r = _resolve(entry, base_ext - sl_buffer if bullish else base_ext + sl_buffer)
        if r:
            out.append({"kind": "break", "entry": r[0], "sl": r[1]})

        # 2) PULL-BACK signal — a retrace back BEYOND the broken level after the break (if any).
        after = window[brk + 1:]
        if after:
            pb_ext = min(x.low for x in after) if bullish else max(x.high for x in after)
            retest = pb_ext < f_level if bullish else pb_ext > f_level
            if retest:
                r = _resolve(entry, pb_ext - sl_buffer if bullish else pb_ext + sl_buffer)
                if r:
                    out.append({"kind": "pullback", "entry": r[0], "sl": r[1]})

        if out:
            return out
        best_miss = "fractal break found but risk out of bounds or already ran >1R"

    log.info(f"[vocant1] {symbol} 1M: no signal — {best_miss}")
    return []
