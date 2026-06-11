"""
EURUSD Pullback: volume candle detection, pullback validation, 1M fractal entry.
4H obstruction lives in pullback_obstruction.py.
"""
from core.types import Candle
from shared.candle_math import body_size, body_ratio, full_range, is_bullish, is_bearish, avg_body

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

    for i in range(end, start - 1, -1):
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

    pb_end_time = unix timestamp when the last pullback candle CLOSED,
    used to anchor the 1M fractal search to this specific setup.

    Rejection rules:
    - Not exactly 1-2 candles against direction  (doji ignored — close == open is not a pullback)
    - depth < 25% of volume candle full range    (too shallow — noise/spread, not retracement)
    - depth > 80% of volume candle full range    (too deep — original momentum likely broken)
    """
    pb_candles: list[Candle] = []

    for c in candles[vol_idx + 1:]:
        # Bug 8 fix: use explicit is_bearish/is_bullish — doji (close==open)
        # is neither bullish nor bearish and must not count as a pullback candle.
        against = is_bearish(c) if bullish else is_bullish(c)
        if against:
            pb_candles.append(c)
        else:
            break

    if len(pb_candles) < 1 or len(pb_candles) > 2:
        return None

    pb_high = max(c.high for c in pb_candles)
    pb_low  = min(c.low  for c in pb_candles)
    depth   = pb_high - pb_low

    # Bug 1 + 2 fix: compare pullback depth against volume candle FULL RANGE
    # (not body-only), and use 25% floor not 15%.
    # Full range includes wicks — the actual price excursion, not just the close.
    # A 28-pip pullback vs a 35-pip (full-range) volume candle is 80% — valid.
    # The same pullback vs a 20-pip (body-only) is 140% — wrongly rejected.
    vol_range = full_range(candles[vol_idx])
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
    Return the fractal break LEVEL as entry price, or None if no valid recent break.

    Steps:
    1. Only consider M1 bars that opened AFTER pb_end_time — anchors to this pullback.
    2. Find the pullback extreme: lowest LOW (BUY) or highest HIGH (SELL) inside the
       pullback zone — the actual price reversal point, not the close.
    3. First Williams 5-candle fractal after the extreme: middle bar's high (BUY) or
       low (SELL) is the highest/lowest among 2 bars on each side.
    4. Entry = the fractal level itself (the break point), not the closing price
       of the break candle. This matches the actual execution price at the break.
    5. Break must be recent (within max_stale M1 bars) — older breaks are stale.
    """
    window = [c for c in m1 if c.time >= pb_end_time]
    if len(window) < 7:
        return None

    zone_lo = pb_low  - 3 * _PIP
    zone_hi = pb_high + 3 * _PIP

    # Bug 3 fix: use low (BUY) / high (SELL) for extreme — where price actually
    # reversed, not where the candle closed.
    extreme_pos: int | None = None
    for i, c in enumerate(window):
        if not (zone_lo <= c.low <= zone_hi) if bullish else not (zone_lo <= c.high <= zone_hi):
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

    # Bug 4 fix: return fractal_level (the break point) not c.close.
    # The execution engine should enter at the fractal level — the price at
    # which the structure is broken — not at a candle close that already moved past it.
    post = window[fractal_pos + 1:]
    for j, c in enumerate(post):
        bars_since = len(post) - 1 - j
        if bullish and c.close > fractal_level:
            return fractal_level if bars_since <= max_stale else None
        if not bullish and c.close < fractal_level:
            return fractal_level if bars_since <= max_stale else None

    return None
