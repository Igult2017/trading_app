"""
FastAPI bridge service (port 8001).
Provides internal REST endpoints consumed by the Node.js backend and runs
all copy trading background services in the same process.

Runs as a SINGLE process — no separate worker container needed.
Lifespan starts MT5 monitors, Telegram listeners, queue workers, and the
provider reload loop.  HTTP endpoints control and inspect those tasks.

Endpoints:
  GET  /health                         — liveness probe
  GET  /queue/depth                    — Redis queue depth
  POST /signals/ingest                 — manually inject a normalised signal
  POST /master/{id}/start              — start MT5 monitor for a master
  POST /master/{id}/stop               — stop MT5 monitor
  POST /telegram/{id}/start            — start Telegram listener
  POST /telegram/{id}/stop             — stop Telegram listener
  GET  /followers/{id}/logs            — tail execution logs
  GET  /status                         — full system status
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ..config import API_SECRET, API_HOST, API_PORT, WORKER_CONCURRENCY
from ..models import NormalisedSignal
from ..ingestion_service.producer import enqueue, queue_depth
from .. import database as db

log = logging.getLogger(__name__)

# ── In-memory service registry (same process as HTTP server) ──────────────────
_mt5_monitors:      dict[str, dict] = {}   # master_id → {monitor, task}
_tg_listeners:      dict[str, dict] = {}   # source_id → {listener, task}
_worker_tasks:      list[asyncio.Task] = []
_reload_task:       Optional[asyncio.Task] = None
_active_monitor_ids: set[str] = set()


# ── Background startup helpers ────────────────────────────────────────────────

async def _start_mt5_monitor_task(master: dict) -> None:
    from ..mt5_service.monitor import MT5Monitor
    mid = master["id"]
    monitor = MT5Monitor(master, mid)
    task = asyncio.current_task()
    _mt5_monitors[mid] = {"monitor": monitor, "task": task}
    _active_monitor_ids.add(mid)
    try:
        await monitor.run()
    finally:
        _active_monitor_ids.discard(mid)
        _mt5_monitors.pop(mid, None)


async def _provider_reload_loop(pool) -> None:
    """Every 60 s, start monitors for newly added active MT5 masters."""
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
                    log.info("[Reload] New active master — starting monitor for %s", mid)
                    asyncio.create_task(
                        _start_mt5_monitor_task(dict(row)),
                        name=f"mt5_{mid}",
                    )
        except Exception as e:
            log.error("[Reload] Provider reload check failed: %s", e)


# ── Lifespan — starts all services when uvicorn boots ─────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _reload_task
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    )

    pool = await db.get_pool()
    log.info("[Bridge] Starting all copy trading services…")

    # ── Load active masters at startup ────────────────────────────────────────
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

    tg_sources: list[dict] = []
    if tg_master_ids:
        tg_rows = await pool.fetch(
            "SELECT * FROM telegram_signal_sources WHERE master_id = ANY($1) AND is_active = TRUE",
            tg_master_ids,
        )
        tg_sources = [dict(r) for r in tg_rows]

    log.info("[Bridge] %d MT5 master(s), %d Telegram source(s)", len(mt5_masters), len(tg_sources))

    # ── Start MT5 monitors ────────────────────────────────────────────────────
    for m in mt5_masters:
        asyncio.create_task(_start_mt5_monitor_task(m), name=f"mt5_{m['id']}")

    # ── Start Telegram listeners ──────────────────────────────────────────────
    from ..telegram_service.listener import TelegramListener
    for src in tg_sources:
        listener = TelegramListener(src)
        task = asyncio.create_task(listener.start(), name=f"tg_{src['id']}")
        _tg_listeners[src["id"]] = {"listener": listener, "task": task}

    # ── Start queue workers ───────────────────────────────────────────────────
    from ..worker_service.consumer import run_worker
    for i in range(max(1, WORKER_CONCURRENCY // 2)):
        t = asyncio.create_task(run_worker(), name=f"worker_{i}")
        _worker_tasks.append(t)

    # ── Provider reload loop ──────────────────────────────────────────────────
    _reload_task = asyncio.create_task(_provider_reload_loop(pool), name="provider_reload")

    log.info("[Bridge] All services launched — HTTP control plane ready")
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    log.info("[Bridge] Shutting down…")
    if _reload_task:
        _reload_task.cancel()
    for entry in list(_mt5_monitors.values()):
        entry["task"].cancel()
    for entry in list(_tg_listeners.values()):
        await entry["listener"].stop()
        entry["task"].cancel()
    for t in _worker_tasks:
        t.cancel()
    await db.close_pool()
    log.info("[Bridge] Stopped")


app = FastAPI(title="TradeSync Bridge", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth dependency ───────────────────────────────────────────────────────────
def verify_secret(x_api_secret: str = Header(...)):
    if x_api_secret != API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid API secret")


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Queue ─────────────────────────────────────────────────────────────────────
@app.get("/queue/depth", dependencies=[Depends(verify_secret)])
async def get_queue_depth():
    return {"depth": queue_depth()}


# ── Manual signal injection ───────────────────────────────────────────────────
class IngestPayload(BaseModel):
    source:      str
    symbol:      str
    action:      str
    event_type:  str
    trade_id:    str
    master_id:   str
    volume:      Optional[float] = None
    entry_price: Optional[float] = None
    stop_loss:   Optional[float] = None
    take_profit: Optional[float] = None


@app.post("/signals/ingest", dependencies=[Depends(verify_secret)])
async def ingest_signal(payload: IngestPayload):
    signal = NormalisedSignal(**payload.dict())
    enqueue(signal)
    return {"queued": True, "trade_id": signal.trade_id}


# ── MT5 monitor controls ──────────────────────────────────────────────────────
@app.post("/master/{master_id}/start", dependencies=[Depends(verify_secret)])
async def start_master(master_id: str):
    if master_id in _mt5_monitors:
        return {"status": "already_running"}

    master = await db.fetch_master_by_id(master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    if master["source_type"] != "mt5":
        raise HTTPException(status_code=400, detail="Master source type is not mt5")

    asyncio.create_task(_start_mt5_monitor_task(master), name=f"mt5_{master_id}")
    log.info("[API] MT5 monitor started for master=%s", master_id)
    return {"status": "started", "master_id": master_id}


@app.post("/master/{master_id}/stop", dependencies=[Depends(verify_secret)])
async def stop_master(master_id: str):
    if master_id not in _mt5_monitors:
        return {"status": "not_running"}
    entry = _mt5_monitors.pop(master_id)
    entry["monitor"].stop()
    entry["task"].cancel()
    return {"status": "stopped", "master_id": master_id}


# ── Telegram listener controls ────────────────────────────────────────────────
@app.post("/telegram/{source_id}/start", dependencies=[Depends(verify_secret)])
async def start_telegram(source_id: str):
    if source_id in _tg_listeners:
        return {"status": "already_running"}

    pool = await db.get_pool()
    row = await pool.fetchrow(
        """
        SELECT tss.*, cm.id AS master_id
        FROM   telegram_signal_sources tss
        JOIN   copy_masters cm ON cm.id = tss.master_id
        WHERE  tss.id = $1
        """,
        source_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Telegram source not found")

    from ..telegram_service.listener import TelegramListener
    listener = TelegramListener(dict(row))
    task = asyncio.create_task(listener.start(), name=f"tg_{source_id}")
    _tg_listeners[source_id] = {"listener": listener, "task": task}
    log.info("[API] Telegram listener started for source=%s", source_id)
    return {"status": "started", "source_id": source_id}


@app.post("/telegram/{source_id}/stop", dependencies=[Depends(verify_secret)])
async def stop_telegram(source_id: str):
    if source_id not in _tg_listeners:
        return {"status": "not_running"}
    entry = _tg_listeners.pop(source_id)
    await entry["listener"].stop()
    entry["task"].cancel()
    return {"status": "stopped", "source_id": source_id}


# ── Logs tail ─────────────────────────────────────────────────────────────────
@app.get("/followers/{follower_id}/logs", dependencies=[Depends(verify_secret)])
async def get_logs(follower_id: str, limit: int = 50):
    pool = await db.get_pool()
    rows = await pool.fetch(
        """
        SELECT id, level, event, message, trade_id, created_at
        FROM   copy_execution_logs
        WHERE  follower_id = $1
        ORDER  BY created_at DESC
        LIMIT  $2
        """,
        follower_id, limit,
    )
    return [dict(r) for r in rows]


# ── Full status ───────────────────────────────────────────────────────────────
@app.get("/status", dependencies=[Depends(verify_secret)])
async def status():
    return {
        "mt5_monitors":  list(_mt5_monitors.keys()),
        "tg_listeners":  list(_tg_listeners.keys()),
        "workers_running": sum(1 for t in _worker_tasks if not t.done()),
        "queue_depth":   queue_depth(),
    }


# ── Entrypoint ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "python.copy_trading.api_service.main:app",
        host=API_HOST,
        port=API_PORT,
        reload=False,
    )
