"""
ejtraderCT live price feed — real-time Pepperstone bid/ask overlay.

What this does:
  Subscribes to the broker's FIX tick stream. Each tick updates the
  current mid-price for a symbol: mid = (bid + ask) / 2.
  candle_fetcher uses this to patch the CURRENT (last) candle's
  close/high/low with live Pepperstone pricing on top of yfinance history.

What this does NOT do:
  Provide historical bars — that is yfinance_client's job.

No desktop terminal required. Connects directly to broker FIX server.
pip install ejtraderCT

Setup (signal_platform/.env):
  CTRADER_FIX_SERVER   = h21.p.ctrader.com:5211   ← cTrader → Settings → FIX API
  CTRADER_FIX_LOGIN    = 12345678                  ← your account number
  CTRADER_FIX_PASSWORD = 12345678                  ← numeric PIN set in FIX API settings
  CTRADER_FIX_BROKER   = pepperstone
  CTRADER_FIX_CURRENCY = USD
"""

import logging
import threading

from config.settings import settings

log = logging.getLogger(__name__)

_client:      object | None  = None
_lock         = threading.Lock()
_init_failed  = False
_subscribed:  set[str]       = set()   # cTrader symbol names e.g. "EURUSD"
_prices:      dict[str, float] = {}    # latest mid-price per symbol


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
    with _lock:
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
            log.info(f"[ejtrader] connected → {settings.ctrader_fix_server}")
            return True
        except Exception as exc:
            log.error(f"[ejtrader] init failed: {exc}")
            _init_failed = True
            return False


def subscribe(symbols: list[str]) -> None:
    """Subscribe to live tick stream for all given symbols."""
    if not _ensure_init():
        return
    ct_syms = [s.replace("/", "") for s in symbols]
    try:
        _client.subscribe(*ct_syms)
        _subscribed.update(ct_syms)
        log.info(f"[ejtrader] subscribed {len(ct_syms)} symbols")
    except Exception as exc:
        log.error(f"[ejtrader] subscribe failed: {exc}")


def _refresh(symbol: str) -> None:
    """Pull the latest quote from ejtraderCT and update _prices cache."""
    if _client is None or symbol not in _subscribed:
        return
    try:
        q = _client.quote(symbol)
        if isinstance(q, dict) and "bid" in q and "ask" in q:
            _prices[symbol] = (float(q["bid"]) + float(q["ask"])) / 2
    except Exception:
        pass


def get_price(symbol: str) -> float | None:
    """Return live Pepperstone mid-price, or None if unavailable."""
    ct_sym = symbol.replace("/", "")
    _refresh(ct_sym)
    return _prices.get(ct_sym)


def is_subscribed(symbol: str) -> bool:
    return symbol.replace("/", "") in _subscribed
