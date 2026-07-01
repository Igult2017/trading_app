"""
VOCANT.1 — 1HR bias.

The strategy's OWN trend + volume rules, straight from the Volume Strategy playbook — NO indicators
(no EMA, no ADX; those belong to a different strategy and are NOT in this playbook). Trend = HH+HL
(up) / LH+LL (down) structure. Volume = a "volume candle": a candle in the trend direction whose
body is bigger than the previous candle's, with no/small wicks. Reads the candles only through the
platform's GENERIC candle-math + swing-point helpers (a shared toolbox, not another strategy's code).
"""
from core.types import Candle
from shared.candle_math import body_size, body_ratio, is_bullish
from shared.swing_points import find_swing_points

_MIN_BODY_RATIO = 0.65   # "no wick or only small wicks" — the body must dominate the candle's range
_VOL_LOOKBACK   = 6      # how many recent 1HR bars to scan for a volume candle
_SWING_N        = 3      # generic swing-pivot half-width


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
    """A VOCANT.1 volume candle: in the trend direction, a bigger body than the previous candle,
    with small/no wicks (the body dominates the range)."""
    return (is_bullish(c) == bullish
            and body_size(c) > body_size(prev)
            and body_ratio(c) >= _MIN_BODY_RATIO)


def latest_volume_candle(h1: list[Candle], bullish: bool) -> Candle | None:
    """
    The most recent volume candle in the trend direction among the last few 1HR bars, or None.
    ("Bodies grow, wicks stay small — momentum building in one direction.") Its close anchors the
    1M entry window. Direction can come from news aftermath OR a range breaking into a trend — this
    only asks "is there a volume candle carrying the trend right now", exactly as the playbook says.
    """
    start = max(1, len(h1) - _VOL_LOOKBACK)
    for i in range(len(h1) - 1, start - 1, -1):
        if _is_volume_candle(h1[i], h1[i - 1], bullish):
            return h1[i]
    return None
