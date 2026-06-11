"""
Swing high / swing low detection using a simple n-bar pivot method.
"""

from core.types import Candle, SwingPoint


def find_swing_points(candles: list[Candle], n: int = 3) -> list[SwingPoint]:
    """
    Returns swing highs and lows.
    A swing high: candle[i].high is the highest within n bars on each side.
    A swing low:  candle[i].low  is the lowest  within n bars on each side.
    """
    points: list[SwingPoint] = []
    length = len(candles)

    for i in range(n, length - n):
        window_highs = [candles[j].high for j in range(i - n, i + n + 1)]
        window_lows  = [candles[j].low  for j in range(i - n, i + n + 1)]

        if candles[i].high == max(window_highs):
            points.append(SwingPoint(price=candles[i].high, index=i, is_high=True))

        if candles[i].low == min(window_lows):
            points.append(SwingPoint(price=candles[i].low, index=i, is_high=False))

    return points


def classify_structure(points: list[SwingPoint]) -> list[tuple[str, SwingPoint]]:
    """
    Label each swing point as HH, HL, LH, or LL relative to the prior same-type point.
    Returns list of (label, SwingPoint).
    """
    highs = [p for p in points if p.is_high]
    lows  = [p for p in points if not p.is_high]
    result: list[tuple[str, SwingPoint]] = []

    for i, h in enumerate(highs):
        # Bug 7 fix: skip the first swing — no prior reference point means no valid label.
        # The old code always assigned "HH" to the first high and "HL" to the first low,
        # which added +2 to the bullish score on every call and caused ranging markets
        # with a random first swing to be misclassified as UPTREND.
        if i == 0:
            continue
        label = "HH" if h.price > highs[i - 1].price else "LH"
        result.append((label, h))

    for i, l in enumerate(lows):
        if i == 0:
            continue
        label = "HL" if l.price > lows[i - 1].price else "LL"
        result.append((label, l))

    return sorted(result, key=lambda x: x[1].index)
