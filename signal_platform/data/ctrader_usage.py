"""WHAT THE SIGNAL ENGINE HOLDS AT cTRADER, written where the other two programs can see it (22 Nov 2026).

The website, this engine and the copier share ONE cTrader app, and cTrader counts connections per app. This engine
holds exactly two: the price-reading connection (`data/ctrader_session.py`) and ONE order connection that stays open
(`execution/order_line.py` — until 22 Nov every order command opened its own). Every 30 s one row of `ctrader_usage`
says how many are open, so the admin capacity page can add all three programs up (website 8, this engine 2, copier 9).
"""
import asyncio
import json
import logging

log = logging.getLogger(__name__)

MAX_HELD = 2                               # the price-reading connection + the order connection
_EVERY_S = 30.0


def held() -> int:
    """Connections this engine has open at cTrader right now: the price-reading one and the order one."""
    from data import ctrader_session as sess
    from execution.order_line import LINE
    scanner = 1 if (sess._writer is not None and not sess._writer.is_closing()) else 0
    return scanner + (1 if LINE.is_open() else 0)


def _write() -> None:
    from sqlalchemy import text
    from storage.db import engine
    from execution.order_line import LINE
    with engine.begin() as c:
        c.execute(text(
            "INSERT INTO ctrader_usage (process, held, max_held, accounts, detail, updated_at) "
            "VALUES ('signal', :h, :m, 1, CAST(:d AS JSONB), NOW()) "
            "ON CONFLICT (process) DO UPDATE SET held = :h, max_held = :m, accounts = 1, detail = CAST(:d AS JSONB), "
            "updated_at = NOW()"),
            {"h": held(), "m": MAX_HELD, "d": json.dumps({"order_connection_open": LINE.is_open()})})


async def report_forever() -> None:
    while True:
        try:
            await asyncio.to_thread(_write)
        except Exception as exc:
            log.warning(f"[ctrader_usage] could not record usage: {type(exc).__name__}: {exc}")
        await asyncio.sleep(_EVERY_S)
