"""
Data source router — selects the active provider and fetches raw OHLCV bars.

Priority chain (first configured wins):
  1. cTrader Open API   — primary. Full live OHLCV from Pepperstone.
                          Active when .ctrader_token.json exists.
                          Run: python auth_setup.py (after Spotware approves app).

  2. MT5 via Wine/Docker — Pepperstone-accurate. All TFs native.
                          Connects to the gmag11/metatrader5_vnc container
                          on MT5_HOST:MT5_PORT via mt5linux (RPyC).
                          Set MT5_LOGIN + MT5_PASSWORD + MT5_SERVER in .env.

  3. yfinance + ejtraderCT — always-available fallback.
                          yfinance supplies historical OHLCV bars.
                          ejtraderCT overlays the live Pepperstone mid-price
                          (bid+ask)/2 on the current open bar's close/H/L.
                          Set CTRADER_FIX_* in .env for the live overlay;
                          yfinance works alone without it.
"""

import asyncio
import logging
from functools import partial

from data import ctrader_client, ctrader_session
from data import ejtrader_ct_client, mt5_client, yfinance_client

log = logging.getLogger(__name__)
_TIMEOUT = 20  # seconds per fetch


async def fetch_raw(symbol: str, tf: str, count: int) -> list[dict]:
    """
    Fetch raw [{time,open,high,low,close,volume}] from whichever source is active.
    symbol — slash notation, e.g. 'EUR/USD'  (each client converts internally)
    """
    broker_sym = symbol.replace("/", "")

    # ── 1. cTrader Open API ───────────────────────────────────────────────────
    if ctrader_session.is_configured():
        return await asyncio.wait_for(
            ctrader_client.fetch_bars(broker_sym, tf, count), _TIMEOUT)

    # ── 2. MT5 via Wine/Docker ────────────────────────────────────────────────
    if mt5_client.is_configured():
        loop = asyncio.get_event_loop()
        return await asyncio.wait_for(
            loop.run_in_executor(
                None, partial(mt5_client.fetch_bars, broker_sym, tf, count)),
            _TIMEOUT)

    # ── 3. yfinance history + ejtraderCT live overlay ────────────────────────
    loop = asyncio.get_event_loop()
    raw: list[dict] = await asyncio.wait_for(
        loop.run_in_executor(
            None, partial(yfinance_client.fetch_bars, symbol, tf, count)),
        _TIMEOUT)

    if raw and ejtrader_ct_client.is_subscribed(symbol):
        live = ejtrader_ct_client.get_price(symbol)
        if live and live > 0:
            last = raw[-1]
            raw[-1] = {**last, "close": live,
                       "high": max(last["high"], live),
                       "low":  min(last["low"],  live)}
    return raw


def active_source() -> str:
    if ctrader_session.is_configured():
        return "cTrader Open API"
    if mt5_client.is_configured():
        return "MT5 via Wine/Docker"
    if ejtrader_ct_client.is_configured():
        return "yfinance + ejtraderCT live overlay"
    return "yfinance only"
