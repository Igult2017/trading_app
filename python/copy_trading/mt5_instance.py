"""
Shared mt5linux MetaTrader5 instance.

A single instance is reused across all workers and the monitor.
The mt5_lock module ensures only one caller uses it at a time.
"""
from .config import MT5_BRIDGE_HOST, MT5_BRIDGE_PORT

_mt5 = None
MT5_AVAILABLE = False


def get_mt5():
    """Return the shared MetaTrader5 proxy (lazy-initialised)."""
    global _mt5, MT5_AVAILABLE
    if _mt5 is not None:
        return _mt5
    try:
        from mt5linux import MetaTrader5
        _mt5 = MetaTrader5(host=MT5_BRIDGE_HOST, port=MT5_BRIDGE_PORT)
        MT5_AVAILABLE = True
    except ImportError:
        try:
            import MetaTrader5 as _native
            _mt5 = _native
            MT5_AVAILABLE = True
        except ImportError:
            MT5_AVAILABLE = False
    return _mt5
