from core.base_pattern import BasePattern
from core.types import Candle, Direction
from core.pattern_types import CandlePattern, PatternMatch
from shared.candle_math import body_size, body_ratio, avg_body, is_bullish


class VolumeCandlePattern(BasePattern):
    name                = "Volume Candle"
    id                  = CandlePattern.VOLUME_CANDLE.value
    required_timeframes = []   # strategy declares which TFs to scan
    lookback            = 15   # need enough history to compute avg_body

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(14, len(candles)):
            c   = candles[i]
            avg = avg_body(candles[:i], n=14)
            if avg == 0:
                continue
            ratio = body_size(c) / avg
            if ratio >= 1.5:
                strength  = min(1.0, (ratio - 1.5) / 1.5)   # 0 at 1.5×, 1.0 at 3×
                direction = Direction.BUY if is_bullish(c) else Direction.SELL
                results.append(PatternMatch(
                    pattern=CandlePattern.VOLUME_CANDLE,
                    timeframe=timeframe, candle_idx=i,
                    direction=direction, strength=round(strength, 3),
                    notes=f"body={ratio:.2f}x avg",
                ))
        return results


class MarubozuPattern(BasePattern):
    name                = "Marubozu"
    id                  = CandlePattern.MARUBOZU.value
    required_timeframes = []
    lookback            = 1

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i, c in enumerate(candles):
            br = body_ratio(c)
            if br >= 0.90:
                strength  = min(1.0, (br - 0.90) / 0.10)
                direction = Direction.BUY if is_bullish(c) else Direction.SELL
                results.append(PatternMatch(
                    pattern=CandlePattern.MARUBOZU,
                    timeframe=timeframe, candle_idx=i,
                    direction=direction, strength=round(strength, 3),
                    notes=f"body_ratio={br:.2%}",
                ))
        return results
