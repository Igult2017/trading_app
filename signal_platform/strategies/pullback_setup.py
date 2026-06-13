"""
EURUSD Pullback: volume cluster detection, pullback validation, 1M fractal entry.
4H zone check lives in pullback_obstruction.py.
"""
from core.types import Candle
from shared.candle_math import body_size, body_ratio, full_range, is_bullish, is_bearish

_PIP = 0.00010


def find_volume_cluster(
    candles: list[Candle],
    bullish: bool,
    lookback: int = 20,
) -> tuple[int, int] | None:
    """
    Find the most recent H1 volume cluster: 2-4 consecutive directional candles.

    Conditions (all required):
    - 2+ consecutive candles all moving in trade direction (no maximum)
    - Each candle: body_ratio >= 0.55 (long body, small wicks)
    - Cluster avg body > preceding candle body (growing vs pre-cluster activity)

    Returns (start_idx, end_idx) of the cluster or None.
    """
    end   = len(candles) - 1
    start = max(2, end - lookback)

    for i in range(end, start - 1, -1):
        c = candles[i]
        if is_bullish(c) != bullish or body_ratio(c) < 0.55:
            continue

        length = 1
        j = i - 1
        while j >= 1:
            cj = candles[j]
            if is_bullish(cj) == bullish and body_ratio(cj) >= 0.55:
                length += 1
                j -= 1
            else:
                break

        if length < 2:
            continue

        cluster_start = i - length + 1
        if cluster_start < 1:
            continue
        preceding_body = body_size(candles[cluster_start - 1])
        avg_body = sum(body_size(candles[k]) for k in range(cluster_start, i + 1)) / length
        if avg_body > preceding_body:
            return (cluster_start, i)

    return None


def measure_pullback(
    candles: list[Candle],
    vol_idx: int,
    bullish: bool,
    cluster_start: int | None = None,
) -> tuple[float, float, int, int] | None:
    """
    Validate the H1 pullback immediately after the volume cluster end.
    Returns (pb_high, pb_low, count, pb_end_time) or None.

    Rules:
    - 1 to 3 candles against direction
    - depth 25–80% of full cluster range (from cluster_start to vol_idx)
    """
    pb_candles: list[Candle] = []

    for c in candles[vol_idx + 1:]:
        against = is_bearish(c) if bullish else is_bullish(c)
        if against:
            pb_candles.append(c)
        else:
            break

    if len(pb_candles) < 1 or len(pb_candles) > 3:
        return None

    pb_high = max(c.high for c in pb_candles)
    pb_low  = min(c.low  for c in pb_candles)
    depth   = pb_high - pb_low

    # Use full cluster range so the pullback ratio is meaningful
    start = cluster_start if cluster_start is not None else vol_idx
    cluster_slice = candles[start:vol_idx + 1]
    cluster_high  = max(c.high for c in cluster_slice)
    cluster_low   = min(c.low  for c in cluster_slice)
    vol_range     = cluster_high - cluster_low
    if vol_range > 0 and (depth < vol_range * 0.25 or depth > vol_range * 0.80):
        return None

    return (pb_high, pb_low, len(pb_candles), pb_candles[-1].time + 3600)


def fractal_entry(
    m1: list[Candle],
    pb_high: float,
    pb_low: float,
    bullish: bool,
    pb_end_time: int,
    max_stale: int = 5,
) -> float | None:
    """
    Return the fractal break level as entry price, or None.

    Invalidation: M1 closes through the wrong zone boundary before fractal
    forms → setup dead (counter-momentum violated pullback structure).

    Entry: first Williams 5-bar fractal after pullback extreme, broken
    within max_stale M1 bars. Returns the fractal LEVEL, not the break close.
    """
    window = [c for c in m1 if c.time >= pb_end_time]
    if len(window) < 7:
        return None

    for c in window:
        if bullish     and c.close < pb_low:
            return None
        if not bullish and c.close > pb_high:
            return None

    zone_lo = pb_low  - 3 * _PIP
    zone_hi = pb_high + 3 * _PIP

    extreme_pos: int | None = None
    for i, c in enumerate(window):
        in_zone = (zone_lo <= c.low  <= zone_hi) if bullish else (zone_lo <= c.high <= zone_hi)
        if not in_zone:
            continue
        if bullish:
            if extreme_pos is None or c.low < window[extreme_pos].low:
                extreme_pos = i
        else:
            if extreme_pos is None or c.high > window[extreme_pos].high:
                extreme_pos = i

    if extreme_pos is None or extreme_pos >= len(window) - 5:
        return None

    fractal_level: float | None = None
    fractal_pos:   int   | None = None

    for i in range(extreme_pos + 2, len(window) - 2):
        c      = window[i]
        p1, p2 = window[i - 1], window[i - 2]
        n1, n2 = window[i + 1], window[i + 2]
        if bullish:
            if c.high > p1.high and c.high > p2.high and c.high > n1.high and c.high > n2.high:
                fractal_level, fractal_pos = c.high, i
                break
        else:
            if c.low < p1.low and c.low < p2.low and c.low < n1.low and c.low < n2.low:
                fractal_level, fractal_pos = c.low, i
                break

    if fractal_level is None or fractal_pos is None:
        return None

    post = window[fractal_pos + 1:]
    for j, c in enumerate(post):
        if bullish     and c.close > fractal_level:
            return fractal_level if j <= max_stale else None
        if not bullish and c.close < fractal_level:
            return fractal_level if j <= max_stale else None

    return None
