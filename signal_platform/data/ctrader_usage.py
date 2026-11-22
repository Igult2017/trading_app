"""WHAT THE SIGNAL ENGINE HOLDS AT cTRADER — limited, and written where the other two programs can see it (22 Nov 2026).

The website, this engine and the copier share ONE cTrader app, and cTrader counts connections per app. Until now this
engine opened a NEW connection for every order command with no limit (`execution/broker.py`), so a burst of stop
moves could open a dozen at once on top of the other two programs. Now:
  * at most ORDER_CONNS order connections at a time (`order_slot`) — the rest wait their turn;
  * every 30 s one row of `ctrader_usage` says how many are open (the price-reading connection + order connections),
    so the admin capacity page can add all three programs up. Limits across the three add to 20.
"""
import asyncio
import contextlib
import json
import logging
import os

log = logging.getLogger(__name__)

ORDER_CONNS = max(1, int(os.environ.get("CTRADER_SIGNAL_ORDER_CONNS", "2")))
MAX_HELD = 1 + ORDER_CONNS                 # the scanner's connection + the order connections
_EVERY_S = 30.0

_open_orders = 0
_sem: asyncio.Semaphore | None = None


@contextlib.asynccontextmanager
async def order_slot():
    """Hold one of the ORDER_CONNS order-connection places for as long as the connection is open."""
    global _sem, _open_orders
    if _sem is None:
        _sem = asyncio.Semaphore(ORDER_CONNS)
    async with _sem:
        _open_orders += 1
        try:
            yield
        finally:
            _open_orders -= 1


def held() -> int:
    """Connections this engine has open at cTrader right now."""
    from data import ctrader_session as sess
    scanner = 1 if (sess._writer is not None and not sess._writer.is_closing()) else 0
    return scanner + _open_orders


def _write() -> None:
    from sqlalchemy import text
    from storage.db import engine
    with engine.begin() as c:
        c.execute(text(
            "INSERT INTO ctrader_usage (process, held, max_held, accounts, detail, updated_at) "
            "VALUES ('signal', :h, :m, 1, CAST(:d AS JSONB), NOW()) "
            "ON CONFLICT (process) DO UPDATE SET held = :h, max_held = :m, accounts = 1, detail = CAST(:d AS JSONB), "
            "updated_at = NOW()"),
            {"h": held(), "m": MAX_HELD, "d": json.dumps({"order_connections": _open_orders, "order_limit": ORDER_CONNS})})


async def report_forever() -> None:
    while True:
        try:
            await asyncio.to_thread(_write)
        except Exception as exc:
            log.warning(f"[ctrader_usage] could not record usage: {type(exc).__name__}: {exc}")
        await asyncio.sleep(_EVERY_S)
