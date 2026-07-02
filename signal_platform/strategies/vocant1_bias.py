"""
VOCANT.1 — 1HR bias.

The strategy's OWN trend + volume rules, from the Volume Strategy playbook — NO indicators. The
direction can come from EITHER:
  - an ESTABLISHED trend — HH+HL (up) / LH+LL (down) 1HR structure, or
  - a RANGE BREAKING INTO A TREND — volume candles closing beyond the recent range.
A VOLUME CANDLE is a candle in the trend direction with a bigger body than the previous candle and
NO / very short wicks (each wick <= 15% of range; a long wick = volatility = no-go). The move is
confirmed by a RUN of 1-3 consecutive volume candles (a single strong momentum candle can qualify);
the last candle's close sends us to the 1M. detect_bias() reports (bullish, vc_idx, origin, count).
Reads only the shared GENERIC candle-math + swing-point helpers.
"""
from core.types import Candle
from shared.candle_math import body_size, upper_wick, lower_wick, full_range, is_bullish
from shared.swing_points import find_swing_points

_MAX_WICK_FRAC  = 0.15   # each wick <= 15% of the candle's range — a long wick = volatility, no-go
_MIN_RUN        = 1      # min consecutive volume candles to confirm (a single momentum candle counts)
_VOL_LOOKBACK   = 6      # recent 1HR bars scanned for the confirming volume candle
_SWING_N        = 3      # generic swing-pivot half-width
_RANGE_LOOKBACK = 8      # bars before the breakout that define the range being broken


def clear_trend(h1: list[Candle]) -> int:
    """+1 uptrend (HH+HL) / -1 downtrend (LH+LL) / 0 no clear trend — pure structure, no indicators."""
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
    """In the trend direction, a bigger body than the previous candle, and NO / very short wicks
    (both wicks small vs the range) — a long wick on either side disqualifies it."""
    if is_bullish(c) != bullish:
        return False
    if body_size(c) <= body_size(prev):
        return False
    rng = full_range(c)
    if rng <= 0:
        return False
    return upper_wick(c) <= _MAX_WICK_FRAC * rng and lower_wick(c) <= _MAX_WICK_FRAC * rng


def volume_run(h1: list[Candle], bullish: bool) -> tuple[int, int] | None:
    """
    Most recent run of consecutive volume candles (>= _MIN_RUN) in the trend direction.
    Returns (last_idx, run_len) or None — last_idx is the confirming candle whose close anchors the
    1M entry; run_len is how many candles the run has (1, 2, 3, …). A single momentum candle qualifies.
    """
    start = max(1, len(h1) - _VOL_LOOKBACK)
    for i in range(len(h1) - 1, start - 1, -1):
        if not _is_volume_candle(h1[i], h1[i - 1], bullish):
            continue
        run = 1
        j = i - 1
        while j >= 1 and _is_volume_candle(h1[j], h1[j - 1], bullish):
            run += 1
            j -= 1
        if run >= _MIN_RUN:
            return i, run
    return None


def _breaks_range(h1: list[Candle], vc_idx: int, bullish: bool) -> bool:
    """True if the confirming volume candle CLOSES beyond the range set by the bars before the run —
    a genuine break out of a range, not a wiggle inside it."""
    prior = h1[max(0, vc_idx - 1 - _RANGE_LOOKBACK): vc_idx - 1]
    if len(prior) < 3:
        return False
    if bullish:
        return h1[vc_idx].close > max(c.high for c in prior)
    return h1[vc_idx].close < min(c.low for c in prior)


def detect_bias(h1: list[Candle]) -> tuple[bool, int, str, int] | None:
    """
    VOCANT.1's 1HR bias. Returns (bullish, vc_idx, origin, vol_count) or None.
      origin 'trend' — established HH+HL / LH+LL structure, confirmed by 1-3 volume candles.
      origin 'range' — a ranging market breaking into a trend: volume candles closed beyond the range.
    """
    trend = clear_trend(h1)
    if trend != 0:
        bullish = trend > 0
        vr = volume_run(h1, bullish)
        return (bullish, vr[0], "trend", vr[1]) if vr is not None else None

    # No established trend — accept a RANGE breaking into a trend (volume-led, playbook-valid).
    for bullish in (True, False):
        vr = volume_run(h1, bullish)
        if vr is not None and _breaks_range(h1, vr[0], bullish):
            return (bullish, vr[0], "range", vr[1])
    return None
