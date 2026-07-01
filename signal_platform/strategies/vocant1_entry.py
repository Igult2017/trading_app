"""
VOCANT.1 — 1M entry.

After the 1HR volume+trend bias is set, find the ALIGNED M1 pullback + fractal and return the
stop-order entry level plus a TIGHT M1 stop-loss (just beyond the M1 pullback extreme — NOT the
wide 1HR cluster range). Buy stop above a fractal high (uptrend) / sell stop below a fractal low
(downtrend). This is the strategy's real edge, so it lives in its own file.
"""
from core.types import Candle

_PIP       = 0.00010
_SL_BUFFER = 2 * _PIP
_MAX_STALE = 20    # M1 bars — the fractal must be freshly approached, not stale
_M1_WINDOW = 120   # only look at the recent ~2h of M1 (after the cluster) for the setup


def _fractal_after(window: list[Candle], start: int, bullish: bool) -> tuple[float, int] | None:
    """First Williams 5-bar fractal after index `start`: a fractal HIGH (buy) / LOW (sell)."""
    for i in range(start + 2, len(window) - 2):
        c = window[i]
        p1, p2, n1, n2 = window[i - 1], window[i - 2], window[i + 1], window[i + 2]
        if bullish:
            if c.high > p1.high and c.high > p2.high and c.high > n1.high and c.high > n2.high:
                return c.high, i
        else:
            if c.low < p1.low and c.low < p2.low and c.low < n1.low and c.low < n2.low:
                return c.low, i
    return None


def m1_entry(m1: list[Candle], bullish: bool, cluster_end_time: int) -> tuple[float, float] | None:
    """
    Return (entry_level, sl_level) for a VOCANT.1 stop-order entry, or None.
      entry_level = the M1 fractal — buy stop above a fractal high / sell stop below a fractal low.
      sl_level    = just beyond the M1 pullback extreme (a TIGHT stop, not the 1HR range).

    Flow: after the volume cluster, price first PUSHES in the trend direction (alignment), then
    PULLS BACK; the fractal after that pullback is the entry, and the pullback extreme is the SL.
    Fires only while price is freshly approaching the fractal so the stop can be placed now.
    """
    window = [c for c in m1[-_M1_WINDOW:] if c.time >= cluster_end_time]
    if len(window) < 9:
        return None

    # 1) Alignment — the furthest point price reached IN the trend direction after the cluster.
    if bullish:
        push = max(range(len(window)), key=lambda i: window[i].high)
    else:
        push = min(range(len(window)), key=lambda i: window[i].low)
    if push < 2 or push > len(window) - 6:
        return None    # nothing pushed with the trend yet, or no room left for a pullback + fractal

    # 2) Pullback extreme — the counter-trend swing AFTER the push (the SL anchor).
    after = window[push + 1:]
    if bullish:
        ext = push + 1 + min(range(len(after)), key=lambda i: after[i].low)   # pullback low
    else:
        ext = push + 1 + max(range(len(after)), key=lambda i: after[i].high)  # pullback high
    if ext >= len(window) - 4:
        return None    # pullback still forming — no room for a fractal
    extreme = window[ext]

    # 3) Fractal after the pullback extreme, in the trend direction = the entry level.
    fr = _fractal_after(window, ext, bullish)
    if fr is None:
        return None
    fractal_level, fractal_pos = fr

    # 4) Only fire while the fractal is FRESHLY approached (touched within _MAX_STALE bars).
    touched = None
    for j, c in enumerate(window[fractal_pos + 1:]):
        if (c.high >= fractal_level) if bullish else (c.low <= fractal_level):
            touched = j
            break
    if touched is None or touched > _MAX_STALE:
        return None

    sl = (extreme.low - _SL_BUFFER) if bullish else (extreme.high + _SL_BUFFER)
    return round(fractal_level, 5), round(sl, 5)
