"""
Copy trading bridge entry point.
Starts all services based on DB configuration:
  - MT5 monitors for all active mt5-type masters
  - Telegram listeners for all active telegram-type masters
  - Worker consumers
  - Provider reload loop (checks every 60 s for newly added masters)

Run with:
  python -m python.copy_trading.main
or:
  uvicorn python.copy_trading.api_service.main:app --host 0.0.0.0 --port 8001
"""
import asyncio
import logging
import sys

from .config import LOG_LEVEL
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# Tracks master IDs that currently have a running monitor task.
_active_monitor_ids: set[str] = set()


async def _start_mt5_monitor(master: dict) -> None:
    """Create and run a MT5Monitor task, registering it in _active_monitor_ids."""
    from .mt5_service.monitor import MT5Monitor
    monitor = MT5Monitor(master, master["id"])
    _active_monitor_ids.add(master["id"])
    try:
        await monitor.run()
    finally:
        # Deregister so the reload loop can restart it if the master is still active.
        _active_monitor_ids.discard(master["id"])


async def _provider_reload_loop(pool) -> None:
    """Every 60 s, query the DB for newly added active MT5 masters and start
    monitors for any that are not already running.  This means a provider
    added via the wizard is picked up automatically — no bridge restart needed."""
    while True:
        await asyncio.sleep(60)
        try:
            rows = await pool.fetch(
                """
                SELECT cm.id, cm.source_type, ca.login_id, ca.broker_server,
                       ca.password_enc, ca.platform
                FROM   copy_masters  cm
                JOIN   copy_accounts ca ON ca.id = cm.account_id
                WHERE  cm.is_active = TRUE AND cm.source_type = 'mt5'
                """
            )
            for row in rows:
                mid = row["id"]
                if mid not in _active_monitor_ids:
                    log.info("[Reload] New active master detected — starting monitor for %s", mid)
                    asyncio.create_task(
                        _start_mt5_monitor(dict(row)),
                        name=f"mt5_{mid}",
                    )
        except Exception as e:
            log.error("[Reload] Provider reload check failed: %s", e)


async def main() -> None:
    from . import database as db

    pool = await db.get_pool()

    # ── Fetch active masters at startup ───────────────────────────────────────
    rows = await pool.fetch(
        """
        SELECT cm.id, cm.source_type, ca.login_id, ca.broker_server,
               ca.password_enc, ca.platform
        FROM   copy_masters  cm
        JOIN   copy_accounts ca ON ca.id = cm.account_id
        WHERE  cm.is_active = TRUE
        """
    )

    mt5_masters   = [dict(r) for r in rows if r["source_type"] == "mt5"]
    tg_master_ids = [r["id"] for r in rows if r["source_type"] == "telegram"]

    tg_sources = []
    if tg_master_ids:
        tg_rows = await pool.fetch(
            "SELECT * FROM telegram_signal_sources WHERE master_id = ANY($1) AND is_active = TRUE",
            tg_master_ids,
        )
        tg_sources = [dict(r) for r in tg_rows]

    log.info(
        "Starting bridge: %d MT5 master(s), %d Telegram source(s)",
        len(mt5_masters), len(tg_sources),
    )

    tasks = []

    # ── MT5 monitors ──────────────────────────────────────────────────────────
    for m in mt5_masters:
        tasks.append(asyncio.create_task(
            _start_mt5_monitor(m), name=f"mt5_{m['id']}"
        ))

    # ── Telegram listeners ────────────────────────────────────────────────────
    from .telegram_service.listener import TelegramListener
    for src in tg_sources:
        listener = TelegramListener(src)
        tasks.append(asyncio.create_task(listener.start(), name=f"tg_{src['id']}"))

    # ── Worker(s) ─────────────────────────────────────────────────────────────
    from .worker_service.consumer import run_worker
    from .config import WORKER_CONCURRENCY
    for i in range(max(1, WORKER_CONCURRENCY // 2)):
        tasks.append(asyncio.create_task(run_worker(), name=f"worker_{i}"))

    # ── Provider reload loop — picks up newly added masters every 60 s ────────
    tasks.append(asyncio.create_task(_provider_reload_loop(pool), name="provider_reload"))

    log.info("All services launched. Running…")
    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    except KeyboardInterrupt:
        log.info("Shutdown requested")
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
