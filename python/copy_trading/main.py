"""
Copy trading bridge entry point.
Starts all services based on DB configuration:
  - MT5 monitors for all active mt5-type masters
  - Telegram listeners for all active telegram-type masters
  - Worker consumers

Run with:
  python -m python.copy_trading.main
or:
  uvicorn python.copy_trading.api_service.main:app --host 0.0.0.0 --port 8001
"""
import asyncio
import logging
import os
import sys

# ── Logging setup ─────────────────────────────────────────────────────────────
from .config import LOG_LEVEL
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)


async def main() -> None:
    from . import database as db

    pool = await db.get_pool()

    # ── Fetch active masters ──────────────────────────────────────────────────
    rows = await pool.fetch(
        """
        SELECT cm.id, cm.source_type, ca.login_id, ca.broker_server,
               ca.password_enc, ca.platform
        FROM   copy_masters  cm
        JOIN   copy_accounts ca ON ca.id = cm.account_id
        WHERE  cm.is_active = TRUE
        """
    )

    mt5_masters  = [dict(r) for r in rows if r["source_type"] == "mt5"]
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
    from .mt5_service.monitor import MT5Monitor
    for m in mt5_masters:
        monitor = MT5Monitor(m, m["id"])
        tasks.append(asyncio.create_task(monitor.run(), name=f"mt5_{m['id']}"))

    # ── Telegram listeners ────────────────────────────────────────────────────
    from .telegram_service.listener import TelegramListener
    for src in tg_sources:
        listener = TelegramListener(src)
        tasks.append(asyncio.create_task(listener.start(), name=f"tg_{src['id']}"))

    # ── Worker ────────────────────────────────────────────────────────────────
    from .worker_service.consumer import run_worker
    from .config import WORKER_CONCURRENCY
    for i in range(max(1, WORKER_CONCURRENCY // 2)):
        tasks.append(asyncio.create_task(run_worker(), name=f"worker_{i}"))

    log.info("All services launched. Running…")
    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    except KeyboardInterrupt:
        log.info("Shutdown requested")
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
