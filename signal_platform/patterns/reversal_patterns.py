"""
Single-candle reversal patterns: Hammer, ShootingStar, InvertedHammer, HangingMan.

Context matters: a hammer at the bottom of a swing means something different from
the same shape at the top. We use a simple lookback to classify location.
"""

from core.base_pattern import BasePattern
from core.types import Candle, Direction
from core.pattern_types import CandlePattern, PatternMatch
from shared.candle_math import body_size, upper_wick, lower_wick, full_range, is_bullish


def _is_hammer_shape(c: Candle, wick_side: str = "lower") -> tuple[bool, float]:
    """
    Returns (is_pattern, strength).
    wick_side: 'lower' for hammer/inverted-hammer shapes,
               'upper' for shooting-star/hanging-man shapes.
    """
    fr = full_range(c)
    if fr == 0:
        return False, 0.0
    b  = body_size(c)
    uw = upper_wick(c)
    lw = lower_wick(c)
    br = b / fr

    if wick_side == "lower":
        # Small body in upper portion, long lower wick
        dominant = lw
        other    = uw
    else:
        # Small body in lower portion, long upper wick
        dominant = uw
        other    = lw

    if dominant == 0:
        return False, 0.0

    wick_ratio = dominant / fr
    other_ratio = other / fr
    if br <= 0.33 and wick_ratio >= 0.55 and other_ratio <= 0.15:
        strength = min(1.0, (wick_ratio - 0.55) / 0.30)
        return True, round(strength, 3)
    return False, 0.0


def _at_swing_low(candles: list[Candle], i: int, lookback: int = 5) -> bool:
    """True if candle[i] is near a recent low."""
    window = candles[max(0, i - lookback): i]
    if not window:
        return True
    recent_low = min(c.low for c in window)
    return candles[i].low <= recent_low * 1.002


def _at_swing_high(candles: list[Candle], i: int, lookback: int = 5) -> bool:
    """True if candle[i] is near a recent high."""
    window = candles[max(0, i - lookback): i]
    if not window:
        return True
    recent_high = max(c.high for c in window)
    return candles[i].high >= recent_high * 0.998


class HammerPattern(BasePattern):
    """Small body, long lower wick at swing low — bullish reversal."""
    name                = "Hammer"
    id                  = CandlePattern.HAMMER.value
    required_timeframes = []
    lookback            = 6

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(5, len(candles)):
            ok, strength = _is_hammer_shape(candles[i], "lower")
            if ok and _at_swing_low(candles, i):
                results.append(PatternMatch(
                    pattern=CandlePattern.HAMMER,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.BUY, strength=strength,
                ))
        return results


class ShootingStarPattern(BasePattern):
    """Small body, long upper wick at swing high — bearish reversal."""
    name                = "Shooting Star"
    id                  = CandlePattern.SHOOTING_STAR.value
    required_timeframes = []
    lookback            = 6

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(5, len(candles)):
            ok, strength = _is_hammer_shape(candles[i], "upper")
            if ok and _at_swing_high(candles, i):
                results.append(PatternMatch(
                    pattern=CandlePattern.SHOOTING_STAR,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.SELL, strength=strength,
                ))
        return results


class InvertedHammerPattern(BasePattern):
    """Small body, long upper wick at swing LOW — bullish (buyer absorption)."""
    name                = "Inverted Hammer"
    id                  = CandlePattern.INVERTED_HAMMER.value
    required_timeframes = []
    lookback            = 6

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(5, len(candles)):
            ok, strength = _is_hammer_shape(candles[i], "upper")
            if ok and _at_swing_low(candles, i):
                results.append(PatternMatch(
                    pattern=CandlePattern.INVERTED_HAMMER,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.BUY, strength=strength,
                ))
        return results


class HangingManPattern(BasePattern):
    """Hammer shape at swing HIGH — bearish warning."""
    name                = "Hanging Man"
    id                  = CandlePattern.HANGING_MAN.value
    required_timeframes = []
    lookback            = 6

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(5, len(candles)):
            ok, strength = _is_hammer_shape(candles[i], "lower")
            if ok and _at_swing_high(candles, i):
                results.append(PatternMatch(
                    pattern=CandlePattern.HANGING_MAN,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.SELL, strength=strength,
                ))
        return results
