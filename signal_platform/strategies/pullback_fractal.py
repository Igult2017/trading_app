"""
M1 fractal detection for EURUSD Pullback strategy.

fractal_entry()      — fires when M1 CLOSES through fractal level (backtest use)
fractal_identified() — fires when M1 HIGH/LOW TOUCHES fractal level (live Stage 2 alert)
"""
from core.types import Candle

_PIP = 0.00010


def _find_window_and_extreme(
    m1: list[Candle], pb_high: float, pb_low: float,
    bullish: bool, pb_end_time: int,
) -> tuple[list[Candle], int] | tuple[None, None]:
    """Shared setup: window slice + pullback extreme position."""
    window = [c for c in m1 if c.time >= pb_end_time]
    if len(window) < 7:
        return None, None

    zone_lo = pb_low  - 3 * _PIP
    zone_hi = pb_high + 3 * _PIP

    extreme_pos: int | None = None
    for i, c in enumerate(window):
        if bullish     and c.close < pb_low:  return None, None
        if not bullish and c.close > pb_high: return None, None
        in_zone = (zone_lo <= c.low <= zone_hi) if bullish else (zone_lo <= c.high <= zone_hi)
        if not in_zone:
            continue
        if bullish:
            if extreme_pos is None or c.low < window[extreme_pos].low:
                extreme_pos = i
        else:
            if extreme_pos is None or c.high > window[extreme_pos].high:
                extreme_pos = i

    if extreme_pos is None or extreme_pos >= len(window) - 5:
        return None, None
    return window, extreme_pos


def _find_fractal(
    window: list[Candle], extreme_pos: int, bullish: bool,
) -> tuple[float, int] | tuple[None, None]:
    """Find the first Williams 5-bar fractal after the pullback extreme."""
    for i in range(extreme_pos + 2, len(window) - 2):
        c      = window[i]
        p1, p2 = window[i - 1], window[i - 2]
        n1, n2 = window[i + 1], window[i + 2]
        if bullish:
            if c.high > p1.high and c.high > p2.high and c.high > n1.high and c.high > n2.high:
                return c.high, i
        else:
            if c.low < p1.low and c.low < p2.low and c.low < n1.low and c.low < n2.low:
                return c.low, i
    return None, None


def fractal_entry(
    m1: list[Candle],
    pb_high: float,
    pb_low: float,
    bullish: bool,
    pb_end_time: int,
    max_stale: int = 5,
) -> float | None:
    """
    Return fractal level when M1 CLOSES through it (backtest use).
    Fires AFTER the fractal is already broken — too late for live stop placement.
    """
    window, extreme_pos = _find_window_and_extreme(m1, pb_high, pb_low, bullish, pb_end_time)
    if window is None:
        return None

    fractal_level, fractal_pos = _find_fractal(window, extreme_pos, bullish)
    if fractal_level is None:
        return None

    for j, c in enumerate(window[fractal_pos + 1:]):
        if bullish     and c.close > fractal_level:
            return fractal_level if j <= max_stale else None
        if not bullish and c.close < fractal_level:
            return fractal_level if j <= max_stale else None
    return None


def fractal_identified(
    m1: list[Candle],
    pb_high: float,
    pb_low: float,
    bullish: bool,
    pb_end_time: int,
    max_stale: int = 20,
) -> float | None:
    """
    Return fractal level when M1 HIGH (BUY) or LOW (SELL) TOUCHES the fractal level.
    Fires BEFORE the fractal is broken — place buy/sell stop at this level NOW.
    The stop order fills naturally when price reaches it.

    Staleness guard: if price only touches the fractal more than `max_stale` M1
    bars after it formed, the setup is stale → return None (no alert).
    """
    window, extreme_pos = _find_window_and_extreme(m1, pb_high, pb_low, bullish, pb_end_time)
    if window is None:
        return None

    fractal_level, fractal_pos = _find_fractal(window, extreme_pos, bullish)
    if fractal_level is None:
        return None

    for j, c in enumerate(window[fractal_pos + 1:]):
        if bullish     and c.high >= fractal_level: return fractal_level if j <= max_stale else None
        if not bullish and c.low  <= fractal_level: return fractal_level if j <= max_stale else None
    return None
