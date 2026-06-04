"""
Liquidity sweep detection.
A sweep occurs when price takes out a prior swing high/low and then closes back
inside — indicating stop hunts / smart money accumulation.
"""

from core.types import Candle, Direction, LiquiditySweep
from shared.swing_points import find_swing_points


def detect_sweeps(candles: list[Candle],
                  n_swing: int = 3) -> list[LiquiditySweep]:
    """
    Detect liquidity sweeps in the candle list.
    Returns a sweep for each candle that wicks past a prior swing level
    but closes back inside.
    """
    sweeps: list[LiquiditySweep] = []
    swings = find_swing_points(candles, n=n_swing)
    if not swings:
        return []

    swing_highs = [s for s in swings if s.is_high]
    swing_lows  = [s for s in swings if not s.is_high]

    for i in range(n_swing + 1, len(candles)):
        c = candles[i]

        # Check if this candle wicks above a prior swing high then closes below it
        for sh in swing_highs:
            if sh.index >= i:
                continue
            if c.high > sh.price and c.close < sh.price:
                sweeps.append(LiquiditySweep(
                    direction=Direction.SELL,   # took buy-stops, expect reversal down
                    level=sh.price,
                    candle_idx=i,
                ))
                break

        # Check if this candle wicks below a prior swing low then closes above it
        for sl in swing_lows:
            if sl.index >= i:
                continue
            if c.low < sl.price and c.close > sl.price:
                sweeps.append(LiquiditySweep(
                    direction=Direction.BUY,    # took sell-stops, expect reversal up
                    level=sl.price,
                    candle_idx=i,
                ))
                break

    return sweeps
