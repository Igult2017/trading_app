"""
yfinance historical bar fetcher.

Provides the historical OHLCV backbone for the fallback data pipeline.
Non-yfinance-native TFs (H4, H2, H6 etc.) are built via pandas resample
from the nearest native interval — same math, no extra network call.

Symbol format: pass our notation (EUR/USD) — converted to EURUSD=X internally.
pip install yfinance pandas  (already in Dockerfile.base)
"""

import logging
from functools import lru_cache

import pandas as pd
import yfinance as yf

from shared.mtf_utils import to_minutes

log = logging.getLogger(__name__)

# yfinance interval string → minutes per bar
_NATIVE: dict[str, int] = {
    "1m": 1, "2m": 2, "5m": 5, "15m": 15, "30m": 30,
    "1h": 60, "1d": 1440, "1wk": 10080, "1mo": 43200,
}
# Maximum lookback days yfinance allows per interval
_MAX_DAYS: dict[str, int] = {
    "1m": 7, "2m": 60, "5m": 60, "15m": 60, "30m": 60,
    "1h": 730, "1d": 36500, "1wk": 36500, "1mo": 36500,
}
# Best native fetch interval for each non-native TF (minutes)
_BASE_INTERVAL: dict[int, str] = {
    6: "5m", 10: "5m", 12: "15m", 20: "30m",     # sub-hour non-native
    120: "1h", 180: "1h", 240: "1h",              # H2 H3 H4
    360: "1h", 480: "1h", 720: "1h",              # H6 H8 H12
}
# Pandas resample rule for each non-native TF (minutes)
_RESAMPLE: dict[int, str] = {
    6: "6min", 10: "10min", 12: "12min", 20: "20min",
    120: "2h", 180: "3h", 240: "4h",
    360: "6h", 480: "8h", 720: "12h",
}


def _to_yf(symbol: str) -> str:
    """EUR/USD → EURUSD=X"""
    return symbol.replace("/", "") + "=X"


def _period(interval: str, bar_count: int) -> str:
    mins   = _NATIVE[interval]
    needed = max(1, (bar_count * mins + 1439) // 1440) + 3
    return f"{min(needed, _MAX_DAYS[interval])}d"


def fetch_bars(symbol: str, tf: str, count: int = 100) -> list[dict]:
    """
    Fetch OHLCV bars — synchronous, call via executor.

    symbol — our notation, e.g. 'EUR/USD'
    tf     — any supported TF; non-native TFs are aggregated via resample.
    Returns [{time (unix s), open, high, low, close, volume}] oldest→newest.
    """
    mins     = to_minutes(tf)
    yf_sym   = _to_yf(symbol)
    resample = _RESAMPLE.get(mins)

    if resample:
        interval    = _BASE_INTERVAL[mins]
        fetch_count = count * (mins // _NATIVE[interval]) + 20
    else:
        # Pick the closest native interval
        interval    = next(
            (i for i, m in sorted(_NATIVE.items(), key=lambda x: x[1], reverse=True) if m <= mins),
            "1h"
        )
        fetch_count = count + 10
        resample    = None

    period = _period(interval, fetch_count)

    try:
        df = yf.Ticker(yf_sym).history(period=period, interval=interval,
                                        auto_adjust=True, progress=False)
        if df.empty:
            log.warning(f"[yfinance] {symbol} {tf}: empty response")
            return []

        if resample:
            df = df.resample(resample).agg({
                "Open": "first", "High": "max",
                "Low": "min",   "Close": "last",
                "Volume": "sum",
            }).dropna()

        rows = []
        for ts, row in df.iterrows():
            unix = int(ts.timestamp()) if hasattr(ts, "timestamp") else int(ts) // 10**9
            rows.append({
                "time":   unix,
                "open":   float(row["Open"]),
                "high":   float(row["High"]),
                "low":    float(row["Low"]),
                "close":  float(row["Close"]),
                "volume": float(row.get("Volume", 0)),
            })
        return rows[-count:]

    except Exception as exc:
        log.error(f"[yfinance] {symbol} {tf}: {exc}")
        return []
