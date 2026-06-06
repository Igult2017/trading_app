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
