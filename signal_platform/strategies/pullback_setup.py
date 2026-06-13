"""
EURUSD Pullback: volume cluster detection and pullback validation.
Fractal detection lives in pullback_fractal.py.
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
    - 1 to 6 candles against direction
    - depth 25–80% of full cluster range (from cluster_start to vol_idx)
    """
    pb_candles: list[Candle] = []

    for c in candles[vol_idx + 1:]:
        against = is_bearish(c) if bullish else is_bullish(c)
        if against:
            pb_candles.append(c)
        else:
            break

    if len(pb_candles) < 1 or len(pb_candles) > 6:
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

    # Structure change guard: reject only when a pullback candle CLOSES beyond the
    # cluster boundary (body breaks structure). Wicks through cluster_low / cluster_high
    # are allowed — price sometimes sweeps liquidity then recovers.
    for c in pb_candles:
        if bullish     and c.close < cluster_low:
            return None
        if not bullish and c.close > cluster_high:
            return None

    return (pb_high, pb_low, len(pb_candles), pb_candles[-1].time + 3600)


