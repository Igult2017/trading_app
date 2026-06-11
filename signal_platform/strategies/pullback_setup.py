"""
EURUSD Pullback: volume candle detection, pullback validation, 1M fractal entry.
4H obstruction lives in pullback_obstruction.py.
"""
from core.types import Candle
from shared.candle_math import body_size, body_ratio, is_bullish, avg_body

_PIP = 0.00010


def find_volume_candle(
    candles: list[Candle],
    bullish: bool,
    lookback: int = 15,
    min_run: int = 3,
) -> int | None:
    """
    Find the most recent H1 volume candle — the final bar of a 3+ candle run.

    All four conditions must hold:
    1. body >= 1.5× 20-bar average body  (institutionally significant move)
    2. body > previous candle body       (expanding momentum into this bar)
    3. body_ratio >= 0.60                (clean close, wicks < 40% of range)
    4. >= min_run consecutive same-direction bars ending at this candle
    """
    end   = len(candles) - 1
    start = max(min_run, end - lookback)

    for i in range(end, start - 1, -1):       # include the most recent bar
        c = candles[i]
        if is_bullish(c) != bullish or i == 0:
            continue
        baseline = avg_body(candles[max(0, i - 20):i]) or 1e-8
        if body_size(c) < 1.5 * baseline:
            continue
        if not (body_size(c) > body_size(candles[i - 1]) and body_ratio(c) >= 0.60):
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
) -> tuple[float, float, int, int] | None:
    """
    Validate the H1 pullback immediately after the volume candle.

    Returns (pb_high, pb_low, count, pb_end_time) or None.

    pb_end_time is the unix timestamp when the last pullback candle CLOSED
    (used to anchor 1M fractal search — only M1 bars after this count).

    Rejection rules:
    - Not 1 or 2 candles        → momentum reversal, not a pullback
    - depth < 15% of vol body   → doji/flat, not a real retracement
    - depth > 80% of vol body   → too deep, original momentum likely broken
    """
    vol_body   = body_size(candles[vol_idx])
    pb_candles: list[Candle] = []

    for c in candles[vol_idx + 1:]:
        against = (not is_bullish(c)) if bullish else is_bullish(c)
        if against:
            pb_candles.append(c)
        else:
            break

    if len(pb_candles) < 1 or len(pb_candles) > 2:
        return None

    pb_high = max(c.high for c in pb_candles)
    pb_low  = min(c.low  for c in pb_candles)
    depth   = pb_high - pb_low

    # Depth 15–80% of volume candle body:
    # - < 15%: doji/flat candle — not a real retracement, likely a pause not a pullback
    # - > 80%: deep reversal — the original momentum is likely broken
    if vol_body > 0 and (depth < vol_body * 0.15 or depth > vol_body * 0.80):
        return None

    # pb_end_time: when the last pullback H1 candle closed.
    # fractal_entry() uses this to exclude M1 bars from before the pullback.
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
    Return the M1 entry price when the first post-pullback fractal is broken,
    or None if no valid recent break exists.

    Steps:
    1. Consider ONLY M1 candles that opened after pb_end_time (the H1 pullback
       close) — this anchors the fractal to THIS specific pullback, not a
       random move from the past 100 bars.
    2. Find the pullback extreme (lowest M1 close for BUY, highest for SELL)
       within the pb_low..pb_high zone — the turnaround point.
    3. Scan forward for the first Williams 5-candle fractal: the bar whose
       high (BUY) or low (SELL) is higher/lower than the 2 bars on each side.
    4. Return the close of the bar that breaks the fractal ONLY if that break
       happened within max_stale M1 bars of now. Older breaks are stale —
       entering at current price would be chasing, not executing.
    """
    window = [c for c in m1 if c.time >= pb_end_time]
    if len(window) < 7:
        return None

    zone_lo = pb_low  - 3 * _PIP
    zone_hi = pb_high + 3 * _PIP

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
        if bullish and c.close > fractal_level:
            return c.close if (len(post) - 1 - j) <= max_stale else None
        if not bullish and c.close < fractal_level:
            return c.close if (len(post) - 1 - j) <= max_stale else None

    return None
