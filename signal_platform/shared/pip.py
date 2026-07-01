"""
Pip size per instrument — single source of truth so all pip-based math (risk gates, entry/SL
buffers, position sizing) scales correctly for any pair. A shared platform resource: any strategy
imports `pip_size(symbol)` instead of hardcoding 0.0001.

5-digit FX (EUR/USD, GBP/USD, …) → 0.0001;  3-digit JPY pairs (USD/JPY, GBP/JPY, …) → 0.01.
"""


def pip_size(symbol: str) -> float:
    return 0.01 if "JPY" in symbol.upper() else 0.0001


def price_digits(symbol: str) -> int:
    """Decimal places for rounding a price of this instrument (5 for FX, 3 for JPY)."""
    return 3 if "JPY" in symbol.upper() else 5
