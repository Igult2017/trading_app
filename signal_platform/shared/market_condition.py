"""
Market condition checks — detect volatile and choppy conditions.
Strategy only runs in clean trending conditions. Both checks must pass.
"""
from core.types import Candle
from shared.candle_math import body_size, upper_wick, lower_wick, avg_body, full_range, is_bullish


def is_volatile(
    candles: list[Candle],
    lookback: int = 5,
    spike_mult: float = 3.0,
) -> bool:
    """
    True when recent candles contain explosive/erratic bodies.
    Detects news spikes and sudden liquidity voids.
    spike_mult: body must exceed this multiple of the baseline average to flag.
    """
    if len(candles) < lookback + 10:
        return False
    baseline = avg_body(candles[-(lookback + 20):-lookback]) or 1e-8
    return any(body_size(c) > spike_mult * baseline for c in candles[-lookback:])


def is_choppy(
    candles: list[Candle],
    lookback: int = 10,
) -> bool:
    """
    True when price shows indecision: long wicks on both sides and
    frequent direction reversals — no clean momentum either way.
    """
    if len(candles) < lookback:
        return False
    recent = candles[-lookback:]

    # Double-wick candles: both upper AND lower wick > 35% of full range (body < 30%)
    # 25% was too sensitive — healthy candles with small wicks were being flagged
    double_wick = 0
    for c in recent:
        rng = full_range(c)
        if rng > 0 and upper_wick(c) / rng > 0.35 and lower_wick(c) / rng > 0.35:
            double_wick += 1

    # Direction flip count: how many consecutive candles reverse colour
    flips = sum(
        1 for i in range(1, len(recent))
        if is_bullish(recent[i]) != is_bullish(recent[i - 1])
    )

    return double_wick >= lookback // 2 or flips >= int(lookback * 0.70)


def is_tradeable(candles: list[Candle]) -> bool:
    """Combined gate — True only when market is clean (not volatile and not choppy)."""
    return not is_volatile(candles) and not is_choppy(candles)
