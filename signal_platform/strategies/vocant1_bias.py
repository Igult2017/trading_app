"""
VOCANT.1 — 1HR bias.

The strategy's OWN trend + volume rules, straight from the Volume Strategy playbook — NO indicators
(no EMA, no ADX). Trend = HH+HL (up) / LH+LL (down) structure.

A VOLUME CANDLE is a candle in the trend direction with a bigger body than the previous candle and
NO / very short wicks — a long wick on either side is volatility, not momentum, so it's a no-go.
The move is CONFIRMED by TWO CONSECUTIVE volume candles: the first starts it, the second confirms —
and it is the SECOND candle's close that sends us down to the 1M timeframe. Reads the candles only
through the platform's GENERIC candle-math + swing-point helpers (a shared toolbox).
"""
from core.types import Candle
from shared.candle_math import body_size, upper_wick, lower_wick, full_range, is_bullish
from shared.swing_points import find_swing_points

_MAX_WICK_FRAC = 0.15   # each wick must be <= 15% of the candle's range — a long wick = volatility, no-go
_VOL_LOOKBACK  = 6      # how many recent 1HR bars to scan for the confirming (2nd) volume candle
_SWING_N       = 3      # generic swing-pivot half-width


def clear_trend(h1: list[Candle]) -> int:
    """
    VOCANT.1's trend rule (playbook, no indicators):
      +1 uptrend   = higher high AND higher low  (HH + HL)
      -1 downtrend = lower high  AND lower low   (LH + LL)
       0           = no clear trend  -> no trade
    """
    pts   = find_swing_points(h1, n=_SWING_N)
    highs = [p.price for p in pts if p.is_high]
    lows  = [p.price for p in pts if not p.is_high]
    if len(highs) < 2 or len(lows) < 2:
        return 0
    if highs[-1] > highs[-2] and lows[-1] > lows[-2]:
        return 1
    if highs[-1] < highs[-2] and lows[-1] < lows[-2]:
        return -1
    return 0


def _is_volume_candle(c: Candle, prev: Candle, bullish: bool) -> bool:
    """
    A VOCANT.1 volume candle: in the trend direction, a bigger body than the previous candle, and
    NO / very short wicks. BOTH the upper and lower wick must each be small relative to the candle's
    range — a long wick on either side is volatility and disqualifies the candle.
    """
    if is_bullish(c) != bullish:
        return False
    if body_size(c) <= body_size(prev):              # must be bigger than the previous candle
        return False
    rng = full_range(c)
    if rng <= 0:
        return False
    return (upper_wick(c) <= _MAX_WICK_FRAC * rng     # short upper wick — no long wick
            and lower_wick(c) <= _MAX_WICK_FRAC * rng)  # short lower wick — no long wick


def confirmed_volume_move(h1: list[Candle], bullish: bool) -> Candle | None:
    """
    TWO CONSECUTIVE volume candles in the trend direction CONFIRM the move — the first starts it, the
    second confirms. Returns the SECOND (confirming) candle, whose close anchors the 1M entry, or None.
    Scans the recent bars for the most recent such pair. The direction can come from a news aftermath
    OR a range breaking into a trend — either way, two clean volume candles one way = confirmation.
    """
    start = max(2, len(h1) - _VOL_LOOKBACK)
    for i in range(len(h1) - 1, start - 1, -1):       # i = confirming (2nd) candle; i-1 = the first
        if (_is_volume_candle(h1[i], h1[i - 1], bullish)
                and _is_volume_candle(h1[i - 1], h1[i - 2], bullish)):
            return h1[i]
    return None
