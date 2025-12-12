"""
Signal Scanner - Python implementation of the trading signal scanner.
Provides modular, optimized signal detection with parallel processing and caching.
"""

from .scanner import SignalScanner
from .instruments import TRADEABLE_INSTRUMENTS, get_instrument_by_symbol
from .market_hours import filter_tradeable_instruments, get_active_session

__version__ = "1.0.0"
__all__ = [
    "SignalScanner",
    "TRADEABLE_INSTRUMENTS",
    "get_instrument_by_symbol",
    "filter_tradeable_instruments",
    "get_active_session",
]
