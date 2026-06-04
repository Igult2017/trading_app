from core.base_pattern import BasePattern
from core.types import Candle, Direction
from core.pattern_types import CandlePattern, PatternMatch
from shared.candle_math import body_ratio, upper_wick, lower_wick, full_range


class InsideBarPattern(BasePattern):
    """
    Entire range contained within prior candle's range.
    Signals consolidation / coiling before a directional move.
    """
    name                = "Inside Bar"
    id                  = CandlePattern.INSIDE_BAR.value
    required_timeframes = []
    lookback            = 2

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(1, len(candles)):
            prev = candles[i - 1]
            curr = candles[i]
            if curr.high <= prev.high and curr.low >= prev.low:
                # Strength: how small the inside bar is relative to the mother bar
                mother_range = prev.high - prev.low
                inside_range = curr.high - curr.low
                if mother_range == 0:
                    continue
                compression = 1.0 - (inside_range / mother_range)
                results.append(PatternMatch(
                    pattern=CandlePattern.INSIDE_BAR,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.NEUTRAL,
                    strength=round(min(1.0, compression), 3),
                    notes=f"compression={compression:.0%}",
                ))
        return results


class OutsideBarPattern(BasePattern):
    """
    Engulfs prior candle's high AND low — full range expansion.
    Direction determined by where it closes relative to midpoint.
    """
    name                = "Outside Bar"
    id                  = CandlePattern.OUTSIDE_BAR.value
    required_timeframes = []
    lookback            = 2

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(1, len(candles)):
            prev = candles[i - 1]
            curr = candles[i]
            if curr.high > prev.high and curr.low < prev.low:
                fr  = curr.high - curr.low
                mid = (curr.high + curr.low) / 2
                if fr == 0:
                    continue
                if curr.close > mid:
                    direction = Direction.BUY
                    strength  = (curr.close - mid) / (curr.high - mid)
                else:
                    direction = Direction.SELL
                    strength  = (mid - curr.close) / (mid - curr.low)
                results.append(PatternMatch(
                    pattern=CandlePattern.OUTSIDE_BAR,
                    timeframe=timeframe, candle_idx=i,
                    direction=direction, strength=round(min(1.0, strength), 3),
                    notes=f"close {'above' if curr.close > mid else 'below'} midpoint",
                ))
        return results


class SpinningTopPattern(BasePattern):
    """
    Small body, moderate equal wicks on both sides — indecision in trend.
    Different from Doji: body exists but is small; wicks are balanced.
    """
    name                = "Spinning Top"
    id                  = CandlePattern.SPINNING_TOP.value
    required_timeframes = []
    lookback            = 1

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i, c in enumerate(candles):
            fr = full_range(c)
            if fr == 0:
                continue
            br = body_ratio(c)
            uw = upper_wick(c)
            lw = lower_wick(c)
            # Body is small (10–33%), both wicks present and roughly equal
            if 0.10 <= br <= 0.33 and uw / fr >= 0.20 and lw / fr >= 0.20:
                balance  = 1.0 - abs(uw - lw) / fr
                strength = balance * (1.0 - br)
                results.append(PatternMatch(
                    pattern=CandlePattern.SPINNING_TOP,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.NEUTRAL,
                    strength=round(min(1.0, strength), 3),
                    notes=f"body={br:.0%}, upper={uw/fr:.0%}, lower={lw/fr:.0%}",
                ))
        return results
