"""
Lot sizing for copy followers.
  mult  → follower_lots = master_lots × multiplier
  fixed → follower_lots = fixed_lot (ignores master size)
  risk  → follower_lots = (equity × risk%) / (sl_pips × pip_value)
"""
from decimal import Decimal


def calc_lots(
    follower,
    master_lots: float,
    sl_pips: float | None = None,
    follower_equity: float | None = None,
    pip_value: float = 10.0,   # USD per pip per standard lot (default for majors)
) -> float:
    mode = (follower.lot_mode or "mult").lower()

    if mode == "fixed" and follower.fixed_lot:
        lots = float(follower.fixed_lot)

    elif mode == "risk" and follower.risk_percent and sl_pips and follower_equity:
        risk_amount = follower_equity * float(follower.risk_percent) / 100
        lots = risk_amount / (sl_pips * pip_value)

    else:  # mult (default)
        multiplier = float(follower.lot_multiplier or 1.0)
        lots = master_lots * multiplier

    # Enforce cTrader minimum (0.01 lot) and round to 2 dp
    return max(0.01, round(lots, 2))


def apply_direction(action: str, direction: str) -> str:
    """Apply follower direction setting to master's trade action."""
    if direction == "reverse":
        return "SELL" if action == "BUY" else "BUY"
    return action  # same | hedge — hedge is handled at execution level


def is_symbol_allowed(symbol: str, follower) -> bool:
    wl = follower.symbol_whitelist or []
    bl = follower.symbol_blacklist or []
    if wl and symbol not in wl:
        return False
    if symbol in bl:
        return False
    return True
