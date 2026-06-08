"""
Volatility filter — runs only when strategy.requires_volatility = True.
Uses ATR(14) to reject signals when the market is too quiet or too erratic.
"""
import logging
from core.types import Signal, Candle
from shared.candle_math import full_range

log = logging.getLogger(__name__)


def _atr(candles: list[Candle], period: int = 14) -> float:
    sample = candles[-period:] if len(candles) >= period else candles
    return sum(full_range(c) for c in sample) / len(sample) if sample else 0.0


def check(signal: Signal, candles: list[Candle],
          min_atr_pct: float = 0.0002,
          max_atr_pct: float = 0.005) -> bool:
    """
    Return True → volatility within acceptable range.
    Return False → too quiet (noise entries) or too erratic (SL hunts).
    min_atr_pct: ATR as % of price below which market is too flat.
    max_atr_pct: ATR as % of price above which market is too chaotic.
    """
    if not candles or signal.entry_price == 0:
        return True
    atr_pct = _atr(candles) / signal.entry_price
    if atr_pct < min_atr_pct:
        log.debug(f"[volatility_filter] {signal.symbol}: ATR {atr_pct:.4%} too low — rejected")
        return False
    if atr_pct > max_atr_pct:
        log.debug(f"[volatility_filter] {signal.symbol}: ATR {atr_pct:.4%} too high — rejected")
        return False
    return True
