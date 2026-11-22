"""WHAT THE COPIER HOLDS AT cTRADER — limited, and written where the other two programs can see it (22 Nov 2026).

The website, the signal engine and the copier share ONE cTrader app, and cTrader counts connections per app. The
copier's share is 9: the pool's long-lived connections (at most `pool.POOL_MAX_CONNS`, 6) plus at most `OWN_CONNS` (3)
one-off connections for accounts not yet on the pool (`executors/ctrader._run_own_connection`). Master accounts that
are not on the pool hold one each; they are counted and reported, never refused (a master must be heard).
Every 30 s one row of `ctrader_usage` says how many are open, so the admin capacity page can add all three up.
"""
import asyncio
import contextlib
import json
import logging
import os

log = logging.getLogger("copy.usage")

OWN_CONNS = max(1, int(os.environ.get("COPY_OWN_CONNS", "3")))
_EVERY_S = 30.0
_open_own = 0
_sem: asyncio.Semaphore | None = None


@contextlib.asynccontextmanager
async def own_slot():
    """Hold one of the OWN_CONNS one-off connection places while such a connection is open."""
    global _sem, _open_own
    if _sem is None:
        _sem = asyncio.Semaphore(OWN_CONNS)
    async with _sem:
        _open_own += 1
        try:
            yield
        finally:
            _open_own -= 1


def snapshot(engine) -> dict:
    import pool
    masters_own = sum(1 for p in getattr(engine, "_providers", {}).values()
                      if not getattr(p, "_pooled", False) and getattr(p, "_connected", False))
    pooled = pool.POOL.count()
    return {"held": pooled + _open_own + masters_own, "max": pool.POOL_MAX_CONNS + OWN_CONNS,
            "accounts": pool.POOL.accounts(),
            "detail": {"pool": pooled, "one_off": _open_own, "masters_own": masters_own}}


def _write(snap: dict) -> None:
    from sqlalchemy import text
    from db import engine
    with engine.begin() as c:
        c.execute(text(
            "INSERT INTO ctrader_usage (process, held, max_held, accounts, detail, updated_at) "
            "VALUES ('copier', :h, :m, :a, CAST(:d AS JSONB), NOW()) "
            "ON CONFLICT (process) DO UPDATE SET held = :h, max_held = :m, accounts = :a, detail = CAST(:d AS JSONB), "
            "updated_at = NOW()"),
            {"h": snap["held"], "m": snap["max"], "a": snap["accounts"], "d": json.dumps(snap["detail"])})


async def report_forever(engine) -> None:
    while True:
        try:
            await asyncio.to_thread(_write, snapshot(engine))
        except Exception as exc:
            log.warning("[usage] could not record usage: %s: %s", type(exc).__name__, exc)
        await asyncio.sleep(_EVERY_S)
