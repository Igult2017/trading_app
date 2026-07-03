"""
VOCANT.1 — 1M entry (fractal-break stop entry).

Per the Volume Strategy playbook (STEP 2): after the 1HR volume+trend bias, drop to the 1M and enter
on a FRACTAL BREAK via a stop order just beyond the fractal —
  Uptrend:   buy  stop just ABOVE a fractal high; fills as price breaks up   (continuation).
  Downtrend: sell stop just BELOW a fractal low;  fills as price breaks down (continuation).

Supports BOTH break styles (user choice — "support both"):
  * FIRST break (the playbook): price pulls back, forms the fractal, then breaks it — fire on that
    break, even a strong runaway that never retests (entry = a pending stop just beyond the fractal).
  * RETEST break: the fractal is broken, price pulls back to it, then continues — also valid.
The stop-loss sits just beyond the PULL-BACK extreme (the retrace after the fractal, whether it
precedes OR follows the break) = "one unit" of risk; TP = 2R (set by the caller). We never chase — if
price has already run a full 1R past the entry, that continuation is gone. `pip` scales the buffers,
the 5-60 pip risk gate and the price rounding (see shared.pip). Reads only raw candles.
"""
import logging

from core.types import Candle

log = logging.getLogger(__name__)

_MAX_STALE = 20    # M1 bars — the pull-back must be this fresh (fire before continuation runs)
_M1_WINDOW = 120   # only look at the recent ~2h of M1 (after the volume candle) for the setup


def m1_entry(m1: list[Candle], bullish: bool, cluster_end_time: int,
             pip: float = 0.0001, symbol: str = "") -> tuple[float, float] | None:
    """
    Return (entry_level, sl_level) for a VOCANT.1 fractal-break stop entry, or None.

    Finds the most recent 1M fractal (high if uptrend / low if downtrend) whose break is fresh or
    imminent, with a genuine pull-back beyond it for the stop:
      entry_level = a stop JUST BEYOND the fractal (buy stop above the high / sell stop below the low).
      sl_level    = just beyond the pull-back extreme (the retrace after the fractal) — tight, "one unit".
    Fires on the FIRST break OR a later retest, but never once price has already run a full 1R past.
    """
    sl_buffer    = 2 * pip     # SL just beyond the pull-back extreme
    entry_buffer = 1 * pip     # entry just beyond the fractal (a genuine break in the trend direction)
    min_risk     = 5  * pip
    max_risk     = 60 * pip
    digits       = 5 if pip < 0.005 else 3

    window = [c for c in m1[-_M1_WINDOW:] if c.time >= cluster_end_time]
    n = len(window)
    if n < 12:
        log.info(f"[vocant1] {symbol} 1M entry=NONE: only {n} M1 bars since the volume candle closed — waiting")
        return None
    last_close = window[-1].close

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

        # PULL-BACK = the retrace after the fractal — serves the pre-break shoulder OR a post-break retest.
        tail = window[i + 1:]
        if bullish:
            rel = min(range(len(tail)), key=lambda k: tail[k].low)
            pb_ext = tail[rel].low
        else:
            rel = max(range(len(tail)), key=lambda k: tail[k].high)
            pb_ext = tail[rel].high
        pb_idx = i + 1 + rel

        # A valid stop needs the pull-back to sit BEYOND the fractal (below a high / above a low).
        if bullish:
            entry, sl = f_level + entry_buffer, pb_ext - sl_buffer
            if pb_ext >= f_level:
                best_miss = "fractal high formed but no pull-back below it yet (setup still forming)"
                continue
        else:
            entry, sl = f_level - entry_buffer, pb_ext + sl_buffer
            if pb_ext <= f_level:
                best_miss = "fractal low formed but no pull-back above it yet (setup still forming)"
                continue

        risk = abs(entry - sl)
        if risk < min_risk:
            best_miss = f"valid setup but risk {risk / pip:.1f} pips < {min_risk / pip:.0f}p min (stop too tight)"
            continue
        if risk > max_risk:
            best_miss = f"valid setup but risk {risk / pip:.1f} pips > {max_risk / pip:.0f}p max (stop too wide)"
            continue

        # Don't chase: if price already ran a full 1R past the entry, that continuation is gone.
        if (last_close > entry + risk) if bullish else (last_close < entry - risk):
            best_miss = "break already ran >1R past the entry (too late to enter)"
            continue

        # The setup must be current — the pull-back can't be ancient.
        if (n - 1 - pb_idx) > _MAX_STALE:
            best_miss = f"break+pull-back found but stale ({n - 1 - pb_idx} bars old > {_MAX_STALE} max)"
            continue

        return round(entry, digits), round(sl, digits)

    log.info(f"[vocant1] {symbol} 1M entry=NONE: {best_miss}")
    return None
