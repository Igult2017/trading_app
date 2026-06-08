"""
Spread filter — runs only when strategy.requires_spread = True.
Rejects signals when the live spread is too wide to trade profitably.
"""
import logging
from core.types import Signal

log = logging.getLogger(__name__)

# Max spread as fraction of entry price  (0.05% ≈ 5 pips on EURUSD at 1.10)
_DEFAULT_MAX_SPREAD_PCT = 0.0005


def check(signal: Signal, spread: float,
          max_spread_pct: float = _DEFAULT_MAX_SPREAD_PCT) -> bool:
    """
    Return True → spread acceptable.
    Return False → spread too wide, signal rejected.
    spread: absolute spread in price units (e.g. 0.0003 = 3 pips).
    """
    if signal.entry_price == 0:
        return True
    ratio = spread / signal.entry_price
    if ratio > max_spread_pct:
        log.debug(
            f"[spread_filter] {signal.symbol}: spread={spread:.5f} "
            f"({ratio:.4%}) > max {max_spread_pct:.4%} — rejected"
        )
        return False
    return True
