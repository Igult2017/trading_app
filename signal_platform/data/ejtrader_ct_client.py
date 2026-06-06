"""
ejtraderCT FIX adapter — OHLCV bars via cTrader FIX API.

Fallback data source when cTrader Open API keys are pending Spotware approval.
Connects directly to the broker's FIX server — no desktop terminal required.

Setup (one-time, in signal_platform/.env):
  CTRADER_FIX_SERVER   = h21.p.ctrader.com:5211
  CTRADER_FIX_LOGIN    = 12345678          (your account number)
  CTRADER_FIX_PASSWORD = 12345678          (numeric PIN set in cTrader → Settings → FIX API)
  CTRADER_FIX_BROKER   = pepperstone
  CTRADER_FIX_CURRENCY = USD

Find your FIX server: open cTrader → Settings → FIX API → Connection Details.
pip install ejtraderCT
"""

import logging
import threading
import time

from config.settings import settings
from shared.mtf_utils import to_minutes

log = logging.getLogger(__name__)

_client      = None
_client_lock = threading.Lock()
_init_failed = False


def is_configured() -> bool:
    return bool(
        settings.ctrader_fix_server
        and settings.ctrader_fix_login
        and settings.ctrader_fix_password
    )


def _ensure_init() -> bool:
    global _client, _init_failed
    if _client is not None:
        return True
    if _init_failed:
        return False
    with _client_lock:
        if _client is not None:
            return True
        if _init_failed:
            return False
        try:
            from ejtraderCT import Ctrader
            _client = Ctrader(
                server=settings.ctrader_fix_server,
                broker=settings.ctrader_fix_broker or "pepperstone",
                login=settings.ctrader_fix_login,
                password=settings.ctrader_fix_password,
                currency=settings.ctrader_fix_currency or "USD",
            )
            log.info(f"[ejtrader] connected to {settings.ctrader_fix_server}")
            return True
        except Exception as exc:
            log.error(f"[ejtrader] init failed: {exc}")
            _init_failed = True
            return False


def fetch_bars(symbol: str, tf: str, count: int = 100) -> list[dict]:
    """
    Fetch OHLCV bars via cTrader FIX API — synchronous, call via executor.

    symbol — cTrader symbol name without slash, e.g. 'EURUSD'
    tf     — timeframe string: M1 M5 M15 M30 H1 H4 D1 W1 MN
    Returns [{time (unix s), open, high, low, close, volume}] oldest→newest.
    """
    if not _ensure_init():
        return []

    from_ts = int(time.time()) - (count + 10) * to_minutes(tf) * 60

    try:
        df = _client.history(symbol, tf, from_ts)
    except Exception as exc:
        log.error(f"[ejtrader] history({symbol}, {tf}): {exc}")
        return []

    if df is None or len(df) == 0:
        log.warning(f"[ejtrader] {symbol} {tf}: empty response")
        return []

    try:
        df.columns = [c.lower() for c in df.columns]
    except Exception:
        pass

    rows: list[dict] = []
    for _, row in df.iterrows():
        ts = row.get("time") or row.get("date") or row.get("timestamp")
        if ts is None:
            continue
        if hasattr(ts, "timestamp"):
            ts = int(ts.timestamp())
        rows.append({
            "time":   int(ts),
            "open":   float(row.get("open", 0)),
            "high":   float(row.get("high", 0)),
            "low":    float(row.get("low", 0)),
            "close":  float(row.get("close", 0)),
            "volume": float(row.get("volume", 0)),
        })

    return rows[-count:]
