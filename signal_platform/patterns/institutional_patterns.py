"""
Institutional / smart money candle patterns.
These identify footprints of large participants: strong directional closes,
aggressive structure breaks, and zone rejection candles.
"""

from core.base_pattern import BasePattern
from core.types import Candle, Direction
from core.pattern_types import CandlePattern, PatternMatch
from shared.candle_math import (
    body_size, upper_wick, lower_wick, full_range,
    avg_body, is_bullish, is_bearish,
)


class InstitutionalPattern(BasePattern):
    """
    Large body closing near its extreme (top 20% for bullish, bottom 20% for bearish).
    Signals institutional conviction — no hesitation at close.
    """
    name                = "Institutional"
    id                  = CandlePattern.INSTITUTIONAL.value
    required_timeframes = []
    lookback            = 14

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(14, len(candles)):
            c   = candles[i]
            avg = avg_body(candles[:i], n=14)
            if avg == 0:
                continue
            b  = body_size(c)
            fr = full_range(c)
            if fr == 0 or b / avg < 1.2:
                continue
            if is_bullish(c):
                # Close must be in top 20% of range
                close_pos = (c.close - c.low) / fr
                if close_pos >= 0.80:
                    strength = min(1.0, close_pos * (b / avg - 1.2) / 1.0)
                    results.append(PatternMatch(
                        pattern=CandlePattern.INSTITUTIONAL,
                        timeframe=timeframe, candle_idx=i,
                        direction=Direction.BUY, strength=round(strength, 3),
                        notes=f"close at {close_pos:.0%} of range, body={b/avg:.1f}x avg",
                    ))
            elif is_bearish(c):
                close_pos = (c.high - c.close) / fr
                if close_pos >= 0.80:
                    strength = min(1.0, close_pos * (b / avg - 1.2) / 1.0)
                    results.append(PatternMatch(
                        pattern=CandlePattern.INSTITUTIONAL,
                        timeframe=timeframe, candle_idx=i,
                        direction=Direction.SELL, strength=round(strength, 3),
                        notes=f"close at {close_pos:.0%} from high, body={b/avg:.1f}x avg",
                    ))
        return results


class ImpulsePattern(BasePattern):
    """
    Aggressive directional candle that breaks structure.
    Large body (> 2× avg) with small wick against direction.
    """
    name                = "Impulse"
    id                  = CandlePattern.IMPULSE.value
    required_timeframes = []
    lookback            = 14

    def detect(self, candles: list[Candle], timeframe: str) -> list[PatternMatch]:
        results = []
        for i in range(14, len(candles)):
            c   = candles[i]
            avg = avg_body(candles[:i], n=14)
            if avg == 0:
                continue
            b  = body_size(c)
            if b / avg < 2.0:
                continue
            uw = upper_wick(c)
            lw = lower_wick(c)
            if is_bullish(c) and lw / b <= 0.20:   # tiny wick against bullish direction
                strength = min(1.0, (b / avg - 2.0) / 2.0)
                results.append(PatternMatch(
                    pattern=CandlePattern.IMPULSE,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.BUY, strength=round(strength, 3),
                    notes=f"body={b/avg:.1f}x avg, lower_wick={lw/b:.0%}",
                ))
            elif is_bearish(c) and uw / b <= 0.20:
                strength = min(1.0, (b / avg - 2.0) / 2.0)
                results.append(PatternMatch(
                    pattern=CandlePattern.IMPULSE,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.SELL, strength=round(strength, 3),
                    notes=f"body={b/avg:.1f}x avg, upper_wick={uw/b:.0%}",
                ))
        return results


class RejectionPattern(BasePattern):
    """
    Candle that enters a zone then closes back out of it — a wick
    that tests a level with the body closing on the other side.
    Detected as: wick > 60% of range, body on opposite side.
    """
    name                = "Rejection"
    id                  = CandlePattern.REJECTION.value
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

            # Bullish rejection: wick tested lows, body closed high
            if lw / fr >= 0.60 and is_bullish(c):
                strength = min(1.0, lw / fr)
                results.append(PatternMatch(
                    pattern=CandlePattern.REJECTION,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.BUY, strength=round(strength, 3),
                    notes=f"lower wick={lw/fr:.0%} of range",
                ))
            # Bearish rejection: wick tested highs, body closed low
            elif uw / fr >= 0.60 and is_bearish(c):
                strength = min(1.0, uw / fr)
                results.append(PatternMatch(
                    pattern=CandlePattern.REJECTION,
                    timeframe=timeframe, candle_idx=i,
                    direction=Direction.SELL, strength=round(strength, 3),
                    notes=f"upper wick={uw/fr:.0%} of range",
                ))
        return results
