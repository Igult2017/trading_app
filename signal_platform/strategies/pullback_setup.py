"""
Helper functions for EURUSD Pullback strategy.
Handles: volume candle detection, pullback measurement,
4H obstruction check, and 1M fractal break confirmation.
"""
from core.types import Candle
from shared.candle_math import body_size, body_ratio, is_bullish
from shared.swing_points import find_swing_points


def find_volume_candle(candles: list[Candle], bullish: bool, lookback: int = 15) -> int | None:
    """
    Scan the last `lookback` confirmed 1H bars (newest-first) for a volume candle
    aligned with `bullish` direction.
    Criteria: body > previous candle body AND body_ratio >= 0.60 (small wicks).
    Returns index in the original list, or None.
    """
    end   = len(candles) - 1       # exclude the currently-forming bar
    start = max(1, end - lookback)
    for i in range(end - 1, start - 1, -1):
        c, prev = candles[i], candles[i - 1]
        if is_bullish(c) != bullish:
            continue
        if body_size(c) > body_size(prev) and body_ratio(c) >= 0.60:
            return i
    return None


def measure_pullback(
    candles: list[Candle],
    vol_idx: int,
    bullish: bool,
) -> tuple[float, float, int] | None:
    """
    Count consecutive against-direction candles immediately after the volume candle.
    Bullish impulse → count bearish pullback candles. Bearish → count bullish.
    Returns (pullback_high, pullback_low, count) if 1 ≤ count ≤ 3, else None.
    """
    pb_candles: list[Candle] = []

    for c in candles[vol_idx + 1:]:
        going_against = (not is_bullish(c)) if bullish else is_bullish(c)
        if going_against:
            pb_candles.append(c)
        else:
            break   # impulse resuming — pullback ends here

    count = len(pb_candles)
    if count < 1 or count > 3:
        return None

    return (
        max(c.high for c in pb_candles),
        min(c.low  for c in pb_candles),
        count,
    )


def _is_mitigated(h4: list[Candle], swing: "SwingPoint") -> bool:
    """
    A swing HIGH is mitigated when a later candle closed above it.
    A swing LOW  is mitigated when a later candle closed below it.
    Wick-only touches do not count — full close required.
    """
    for c in h4[swing.index + 1:]:
        if swing.is_high and c.close >= swing.price:
            return True
        if not swing.is_high and c.close <= swing.price:
            return True
    return False


def has_4h_obstruction(
    h4: list[Candle],
    entry: float,
    bullish: bool,
    risk: float,
    min_rr: float = 2.0,
) -> bool:
    """
    True if an UNMITIGATED 4H swing level is near current price or sits
    between entry and the 2R target.  Mitigated levels are skipped —
    their orders have already been filled and they no longer defend price.
    Proximity threshold = 0.5× risk to catch "price at key level" case.
    """
    target    = entry + risk * min_rr if bullish else entry - risk * min_rr
    proximity = risk * 0.50

    for s in find_swing_points(h4):
        if _is_mitigated(h4, s):
            continue   # orders consumed — no longer a live level

        if abs(entry - s.price) < proximity:
            return True
        if bullish     and s.is_high     and entry < s.price < target:
            return True
        if not bullish and not s.is_high and target < s.price < entry:
            return True
    return False


def fractal_broken(
    m1: list[Candle],
    pb_high: float,
    pb_low: float,
    bullish: bool,
    lookback: int = 5,
) -> bool:
    """
    True when the 1M pullback structure is broken by a close.
    BUY : any of the last `lookback` 1M candles closed ABOVE pb_high.
    SELL: any of the last `lookback` 1M candles closed BELOW pb_low.
    """
    recent = m1[-lookback:]
    if bullish:
        return any(c.close > pb_high for c in recent)
    return any(c.close < pb_low for c in recent)
