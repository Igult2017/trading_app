"""
Stop-loss reasonableness check — runs only when strategy.requires_volatility = True.
A SL tighter than 0.5× ATR(14) is almost always noise-stopped before the move develops.
"""
import logging
from core.types import Signal, Candle
from shared.candle_math import full_range

log = logging.getLogger(__name__)

_MIN_SL_ATR_MULTIPLE = 0.5


def _atr(candles: list[Candle], period: int = 14) -> float:
    sample = candles[-period:] if len(candles) >= period else candles
    return sum(full_range(c) for c in sample) / len(sample) if sample else 0.0


def check(signal: Signal, candles: list[Candle],
          min_multiple: float = _MIN_SL_ATR_MULTIPLE) -> bool:
    """
    Return True → SL distance is wide enough to survive normal noise.
    Return False → SL too tight relative to ATR, signal rejected.
    """
    if not candles or signal.entry_price == 0 or signal.stop_loss == 0:
        return True
    atr = _atr(candles)
    if atr == 0:
        return True
    sl_distance = abs(signal.entry_price - signal.stop_loss)
    multiple = sl_distance / atr
    if multiple < min_multiple:
        log.debug(
            f"[sl_validator] {signal.symbol}: SL {sl_distance:.5f} = {multiple:.2f}× ATR "
            f"(min {min_multiple}×) — too tight, rejected"
        )
        return False
    return True
