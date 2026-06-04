from core.base_pattern import BasePattern
from core.types import Candle, Direction
from core.pattern_types import CandlePattern, PatternMatch
from shared.candle_math import is_bullish, is_bearish


class BullishEngulfingPattern(BasePattern):
    """Current green body fully engulfs prior red body — bullish reversal."""
    name                = "Bullish Engulfing"
    id                  = CandlePattern.BULLISH_ENGULFING.value
    required_timeframes = []
    lookback            = 2

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(1, len(candles)):
            prev = candles[i - 1]
            curr = candles[i]
            if not (is_bearish(prev) and is_bullish(curr)):
                continue
            # Current body fully engulfs prior body
            if curr.open <= min(prev.open, prev.close) and \
               curr.close >= max(prev.open, prev.close):
                # Strength: how much bigger is the current body relative to prior
                curr_body = curr.close - curr.open
                prev_body = max(prev.open, prev.close) - min(prev.open, prev.close)
                ratio    = curr_body / prev_body if prev_body else 1.0
                strength = min(1.0, (ratio - 1.0) / 1.0)
                results.append(PatternMatch(
                    pattern=CandlePattern.BULLISH_ENGULFING,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.BUY, strength=round(strength, 3),
                    notes=f"engulfs {ratio:.1f}x prior body",
                ))
        return results


class BearishEngulfingPattern(BasePattern):
    """Current red body fully engulfs prior green body — bearish reversal."""
    name                = "Bearish Engulfing"
    id                  = CandlePattern.BEARISH_ENGULFING.value
    required_timeframes = []
    lookback            = 2

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(1, len(candles)):
            prev = candles[i - 1]
            curr = candles[i]
            if not (is_bullish(prev) and is_bearish(curr)):
                continue
            if curr.open >= max(prev.open, prev.close) and \
               curr.close <= min(prev.open, prev.close):
                curr_body = max(curr.open, curr.close) - min(curr.open, curr.close)
                prev_body = max(prev.open, prev.close) - min(prev.open, prev.close)
                ratio    = curr_body / prev_body if prev_body else 1.0
                strength = min(1.0, (ratio - 1.0) / 1.0)
                results.append(PatternMatch(
                    pattern=CandlePattern.BEARISH_ENGULFING,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.SELL, strength=round(strength, 3),
                    notes=f"engulfs {ratio:.1f}x prior body",
                ))
        return results
