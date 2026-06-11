"""
EURUSD Pullback strategy helpers: volume candle, pullback measurement, fractal entry.
4H obstruction logic lives in pullback_obstruction.py.
"""
from core.types import Candle
from shared.candle_math import body_size, body_ratio, is_bullish


def find_volume_candle(
    candles: list[Candle],
    bullish: bool,
    lookback: int = 15,
    min_run: int = 3,
) -> int | None:
    """
    Find the most recent H1 volume candle that is the FINAL bar of a momentum run.

    Valid when:
    1. At least min_run consecutive same-direction candles ending at this bar.
    2. This last candle has a large clean body (body > prev AND body_ratio >= 0.60).
    Returns index into the original candles list, or None.
    """
    end   = len(candles) - 1
    start = max(min_run, end - lookback)

    for i in range(end - 1, start - 1, -1):
        c, prev = candles[i], candles[i - 1]
        if is_bullish(c) != bullish:
            continue
        if not (body_size(c) > body_size(prev) and body_ratio(c) >= 0.60):
            continue
        consecutive = 1
        for j in range(i - 1, max(-1, i - min_run), -1):
            if is_bullish(candles[j]) == bullish:
                consecutive += 1
            else:
                break
        if consecutive >= min_run:
            return i
    return None


def measure_pullback(
    candles: list[Candle],
    vol_idx: int,
    bullish: bool,
) -> tuple[float, float, int] | None:
    """
    Expect 1-2 against-direction H1 candles immediately after the volume candle.
    Returns (pb_high, pb_low, count) or None if pullback is absent or too wide.
    """
    pb_candles: list[Candle] = []

    for c in candles[vol_idx + 1:]:
        going_against = (not is_bullish(c)) if bullish else is_bullish(c)
        if going_against:
            pb_candles.append(c)
        else:
            break

    if len(pb_candles) < 1 or len(pb_candles) > 2:
        return None

    return (
        max(c.high for c in pb_candles),
        min(c.low  for c in pb_candles),
        len(pb_candles),
    )


def fractal_broken(
    m1: list[Candle],
    pb_high: float,
    pb_low: float,
    bullish: bool,
    lookback: int = 100,
) -> bool:
    """
    True when the FIRST 1M fractal after the pullback extreme has been broken.

    1. Find the pullback extreme (lowest M1 close for BUY / highest for SELL)
       within the pb_low..pb_high zone — the point where price turned.
    2. Scan forward for the first Williams fractal: 5-candle pattern where the
       middle bar has the highest high (BUY) or lowest low (SELL).
    3. Return True when a subsequent M1 candle closes past that fractal level.

    Entry is INSIDE the pullback zone, not after the full H1 range is cleared.
    SL stays below pb_low (BUY) or above pb_high (SELL).
    """
    _pip   = 0.00010
    window = m1[-lookback:] if len(m1) > lookback else m1
    if len(window) < 7:
        return False

    zone_lo = pb_low  - 3 * _pip
    zone_hi = pb_high + 3 * _pip
    extreme_pos: int | None = None

    for i, c in enumerate(window):
        if not (zone_lo <= c.close <= zone_hi):
            continue
        if bullish:
            if extreme_pos is None or c.close < window[extreme_pos].close:
                extreme_pos = i
        else:
            if extreme_pos is None or c.close > window[extreme_pos].close:
                extreme_pos = i

    if extreme_pos is None or extreme_pos >= len(window) - 5:
        return False

    fractal_level: float | None = None
    fractal_pos:   int   | None = None

    for i in range(extreme_pos + 2, len(window) - 2):
        c      = window[i]
        p1, p2 = window[i - 1], window[i - 2]
        n1, n2 = window[i + 1], window[i + 2]

        if bullish:
            if c.high > p1.high and c.high > p2.high and c.high > n1.high and c.high > n2.high:
                fractal_level = c.high
                fractal_pos   = i
                break
        else:
            if c.low < p1.low and c.low < p2.low and c.low < n1.low and c.low < n2.low:
                fractal_level = c.low
                fractal_pos   = i
                break

    if fractal_level is None or fractal_pos is None:
        return False

    for c in window[fractal_pos + 1:]:
        if bullish  and c.close > fractal_level:
            return True
        if not bullish and c.close < fractal_level:
            return True

    return False
