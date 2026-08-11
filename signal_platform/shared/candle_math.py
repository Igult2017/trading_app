"""
Pure candle math — no imports from other platform modules.
Pattern plugins and shared utilities import from here.
"""

from core.types import Candle


def body_size(c: Candle) -> float:
    return abs(c.close - c.open)


def upper_wick(c: Candle) -> float:
    return max(0.0, c.high - max(c.open, c.close))


def lower_wick(c: Candle) -> float:
    return max(0.0, min(c.open, c.close) - c.low)


def full_range(c: Candle) -> float:
    return c.high - c.low


def body_ratio(c: Candle) -> float:
    rng = full_range(c)
    return body_size(c) / rng if rng else 0.0


def is_bullish(c: Candle) -> bool:
    return c.close > c.open


def is_bearish(c: Candle) -> bool:
    return c.close < c.open


def avg_body(candles: list[Candle], n: int = 14) -> float:
    sample = candles[-n:] if len(candles) >= n else candles
    if not sample:
        return 0.0
    return sum(body_size(c) for c in sample) / len(sample)


def atr(candles: list[Candle], n: int = 14) -> float:
    """Average True Range — the typical size of a bar right now, in price.

    TRUE range, not just high-minus-low: a bar that opens away from the previous close covers that
    gap too, and ignoring it understates volatility exactly when volatility is what moved. So each
    bar's range is the widest of
        high - low  |  |high - previous close|  |previous close - low|

    Used to say what a distance MEANS. Twenty pips is a big retracement in a quiet week and a
    shrug in a wild one; dividing by this makes the two comparable, and makes a threshold set on one
    pair carry over to another without being re-tuned.

    The first bar of the list has no previous close, so it contributes plain high-minus-low.
    Returns 0.0 on an empty list — callers must guard before dividing.
    """
    sample = candles[-(n + 1):] if len(candles) > n else candles
    if not sample:
        return 0.0
    ranges = [full_range(sample[0])]
    for prev, c in zip(sample, sample[1:]):
        ranges.append(max(c.high - c.low, abs(c.high - prev.close), abs(prev.close - c.low)))
    if len(ranges) > 1:
        ranges = ranges[1:]            # drop the seed bar once a real true range exists
    return sum(ranges) / len(ranges)


def wick_to_body_ratio(c: Candle, which: str = "upper") -> float:
    if which not in ("upper", "lower"):
        raise ValueError(f"which must be 'upper' or 'lower', got {which!r}")
    b = body_size(c)
    if b == 0:
        return 0.0
    wick = upper_wick(c) if which == "upper" else lower_wick(c)
    return wick / b


def is_doji(c: Candle, threshold: float = 0.1) -> bool:
    return body_ratio(c) < threshold


def is_marubozu(c: Candle, threshold: float = 0.95) -> bool:
    return body_ratio(c) >= threshold
