from core.base_pattern import BasePattern
from core.types import Candle, Direction
from core.pattern_types import CandlePattern, PatternMatch
from shared.candle_math import body_ratio, upper_wick, lower_wick, full_range, is_doji


class DojiPattern(BasePattern):
    """Open ≈ close — pure indecision."""
    name                = "Doji"
    id                  = CandlePattern.DOJI.value
    required_timeframes = []
    lookback            = 1

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i, c in enumerate(candles):
            br = body_ratio(c)
            if br < 0.10:
                strength = 1.0 - (br / 0.10)
                results.append(PatternMatch(
                    pattern=CandlePattern.DOJI,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.NEUTRAL, strength=round(strength, 3),
                    notes=f"body_ratio={br:.2%}",
                ))
        return results


class GravestoneDoji(BasePattern):
    """Open = close = low, long upper wick — bearish reversal signal."""
    name                = "Gravestone Doji"
    id                  = CandlePattern.GRAVESTONE_DOJI.value
    required_timeframes = []
    lookback            = 1

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i, c in enumerate(candles):
            fr = full_range(c)
            if fr == 0:
                continue
            uw = upper_wick(c)
            lw = lower_wick(c)
            br = body_ratio(c)
            if br < 0.10 and uw / fr >= 0.70 and lw / fr < 0.10:
                strength = min(1.0, uw / fr)
                results.append(PatternMatch(
                    pattern=CandlePattern.GRAVESTONE_DOJI,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.SELL, strength=round(strength, 3),
                    notes=f"upper_wick={uw/fr:.0%} of range",
                ))
        return results


class DragonflyDoji(BasePattern):
    """Open = close = high, long lower wick — bullish reversal signal."""
    name                = "Dragonfly Doji"
    id                  = CandlePattern.DRAGONFLY_DOJI.value
    required_timeframes = []
    lookback            = 1

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i, c in enumerate(candles):
            fr = full_range(c)
            if fr == 0:
                continue
            uw = upper_wick(c)
            lw = lower_wick(c)
            br = body_ratio(c)
            if br < 0.10 and lw / fr >= 0.70 and uw / fr < 0.10:
                strength = min(1.0, lw / fr)
                results.append(PatternMatch(
                    pattern=CandlePattern.DRAGONFLY_DOJI,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.BUY, strength=round(strength, 3),
                    notes=f"lower_wick={lw/fr:.0%} of range",
                ))
        return results


class LongLeggedDoji(BasePattern):
    """Equal wicks both sides — extreme indecision."""
    name                = "Long-Legged Doji"
    id                  = CandlePattern.LONG_LEGGED_DOJI.value
    required_timeframes = []
    lookback            = 1

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i, c in enumerate(candles):
            fr = full_range(c)
            if fr == 0:
                continue
            uw = upper_wick(c)
            lw = lower_wick(c)
            br = body_ratio(c)
            # Both wicks at least 30% of range, body tiny
            if br < 0.10 and uw / fr >= 0.30 and lw / fr >= 0.30:
                balance  = 1.0 - abs(uw - lw) / fr
                strength = min(1.0, balance)
                results.append(PatternMatch(
                    pattern=CandlePattern.LONG_LEGGED_DOJI,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.NEUTRAL, strength=round(strength, 3),
                    notes=f"upper={uw/fr:.0%} lower={lw/fr:.0%}",
                ))
        return results
