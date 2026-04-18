"""
Shared mt5linux MetaTrader5 instance.

A single instance is reused across all workers and the monitor.
The mt5_lock module ensures only one caller uses it at a time.

NOTE: Do NOT import MT5_AVAILABLE as a value — import is_mt5_available()
instead.  Python copies the boolean at import time, so the caller would
always see False even after a successful initialisation.
"""
from .config import MT5_BRIDGE_HOST, MT5_BRIDGE_PORT

_mt5 = None
_mt5_available = False


def get_mt5():
    """Return the shared MetaTrader5 proxy (lazy-initialised)."""
    global _mt5, _mt5_available
    if _mt5 is not None:
        return _mt5
    try:
        from mt5linux import MetaTrader5
        _mt5 = MetaTrader5(host=MT5_BRIDGE_HOST, port=MT5_BRIDGE_PORT)
        _mt5_available = True
    except ImportError:
        try:
            import MetaTrader5 as _native
            _mt5 = _native
            _mt5_available = True
        except ImportError:
            _mt5_available = False
    return _mt5


def is_mt5_available() -> bool:
    """Return True if the MT5 library loaded successfully.
    Always call this at runtime — never import _mt5_available directly."""
    if _mt5 is None:
        get_mt5()
    return _mt5_available
