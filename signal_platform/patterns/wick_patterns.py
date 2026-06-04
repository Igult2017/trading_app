from core.base_pattern import BasePattern
from core.types import Candle, Direction
from core.pattern_types import CandlePattern, PatternMatch
from shared.candle_math import (
    body_size, upper_wick, lower_wick, full_range,
    is_bullish, is_bearish,
)


class LongUpperWickPattern(BasePattern):
    """Wick > 2× body — rejection of highs (bearish pressure)."""
    name                = "Long Upper Wick"
    id                  = CandlePattern.LONG_UPPER_WICK.value
    required_timeframes = []
    lookback            = 1

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i, c in enumerate(candles):
            b = body_size(c)
            uw = upper_wick(c)
            if b == 0:
                continue
            ratio = uw / b
            if ratio >= 2.0:
                strength = min(1.0, (ratio - 2.0) / 3.0)
                results.append(PatternMatch(
                    pattern=CandlePattern.LONG_UPPER_WICK,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.SELL, strength=round(strength, 3),
                    notes=f"upper_wick={ratio:.1f}x body",
                ))
        return results


class LongLowerWickPattern(BasePattern):
    """Wick > 2× body — rejection of lows (bullish pressure)."""
    name                = "Long Lower Wick"
    id                  = CandlePattern.LONG_LOWER_WICK.value
    required_timeframes = []
    lookback            = 1

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i, c in enumerate(candles):
            b = body_size(c)
            lw = lower_wick(c)
            if b == 0:
                continue
            ratio = lw / b
            if ratio >= 2.0:
                strength = min(1.0, (ratio - 2.0) / 3.0)
                results.append(PatternMatch(
                    pattern=CandlePattern.LONG_LOWER_WICK,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.BUY, strength=round(strength, 3),
                    notes=f"lower_wick={ratio:.1f}x body",
                ))
        return results


class ViolentCandlePattern(BasePattern):
    """Large body AND long wick — high volatility, directional conviction."""
    name                = "Violent Candle"
    id                  = CandlePattern.VIOLENT_CANDLE.value
    required_timeframes = []
    lookback            = 14

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        from shared.candle_math import avg_body
        results = []
        for i in range(14, len(candles)):
            c   = candles[i]
            avg = avg_body(candles[:i], n=14)
            if avg == 0:
                continue
            b  = body_size(c)
            fr = full_range(c)
            if b / avg >= 1.5 and fr / avg >= 2.5:
                strength  = min(1.0, (b / avg - 1.5) / 1.5)
                direction = Direction.BUY if is_bullish(c) else Direction.SELL
                results.append(PatternMatch(
                    pattern=CandlePattern.VIOLENT_CANDLE,
                    timeframe=timeframe, candle_idx=i,
                    direction=direction, strength=round(strength, 3),
                    notes=f"body={b/avg:.1f}x avg, range={fr/avg:.1f}x avg",
                ))
        return results
