"""
MetaTrader 5 adapter — direct OHLCV fetch from the running MT5 terminal.

Pepperstone supports MT5 with no regional restrictions.
Requires: MT5 terminal open + logged in on the same Windows machine.
  pip install metatrader5

All standard timeframes are native in MT5 — no aggregation needed for any
of H2, H3, H6, H8, M6, M10, M12, M20 (unlike yfinance / cTrader).
This module is synchronous; candle_fetcher calls it via run_in_executor.
"""

import logging
import threading

import MetaTrader5 as mt5

log = logging.getLogger(__name__)

_initialized   = False
_init_lock     = threading.Lock()

_TF: dict[str, int] = {
    "M1":  mt5.TIMEFRAME_M1,  "M2":  mt5.TIMEFRAME_M2,
    "M3":  mt5.TIMEFRAME_M3,  "M4":  mt5.TIMEFRAME_M4,
    "M5":  mt5.TIMEFRAME_M5,  "M6":  mt5.TIMEFRAME_M6,
    "M10": mt5.TIMEFRAME_M10, "M12": mt5.TIMEFRAME_M12,
    "M15": mt5.TIMEFRAME_M15, "M20": mt5.TIMEFRAME_M20,
    "M30": mt5.TIMEFRAME_M30,
    "H1":  mt5.TIMEFRAME_H1,  "H2":  mt5.TIMEFRAME_H2,
    "H3":  mt5.TIMEFRAME_H3,  "H4":  mt5.TIMEFRAME_H4,
    "H6":  mt5.TIMEFRAME_H6,  "H8":  mt5.TIMEFRAME_H8,
    "H12": mt5.TIMEFRAME_H12,
    "D1":  mt5.TIMEFRAME_D1,  "W1":  mt5.TIMEFRAME_W1,
    "MN":  mt5.TIMEFRAME_MN1,
}


def _ensure_init() -> bool:
    global _initialized
    if _initialized:
        return True
    with _init_lock:
        if _initialized:
            return True
        if not mt5.initialize():
            log.error(f"[mt5] initialize() failed: {mt5.last_error()}")
            return False
        info = mt5.terminal_info()
        log.info(f"[mt5] connected to MT5 terminal '{info.name}' build={info.build}")
        _initialized = True
        return True


def fetch_bars(symbol: str, tf: str, count: int = 100) -> list[dict]:
    """
    Fetch OHLCV bars from the MT5 terminal — synchronous, call via executor.

    symbol — MT5 symbol name, e.g. 'EURUSD' (no slash)
    tf     — any supported TF string: M1–MN (all are native in MT5)
    Returns [{time (unix s), open, high, low, close, volume}] oldest→newest.
    Returns [] on error (MT5 not running, symbol not found, etc.).
    """
    if not _ensure_init():
        return []

    tf_const = _TF.get(tf.upper())
    if tf_const is None:
        log.error(f"[mt5] unknown timeframe '{tf}'")
        return []

    rates = mt5.copy_rates_from_pos(symbol, tf_const, 0, count)
    if rates is None or len(rates) == 0:
        log.warning(f"[mt5] {symbol} {tf}: no data — {mt5.last_error()}")
        return []

    return [
        {
            "time":   int(r["time"]),
            "open":   float(r["open"]),
            "high":   float(r["high"]),
            "low":    float(r["low"]),
            "close":  float(r["close"]),
            "volume": float(r["tick_volume"]),
        }
        for r in rates
    ]
