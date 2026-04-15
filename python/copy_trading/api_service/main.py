"""
FastAPI bridge service (port 8001).
Provides internal REST endpoints consumed by the Node.js backend and the
copy trading Python services.

Endpoints:
  GET  /health                         — liveness probe
  GET  /queue/depth                    — Redis queue depth
  POST /signals/ingest                 — manually inject a normalised signal
  POST /master/{id}/start              — start MT5 monitor for a master
  POST /master/{id}/stop               — stop MT5 monitor
  POST /telegram/{id}/start            — start Telegram listener
  POST /telegram/{id}/stop             — stop Telegram listener
  POST /worker/start                   — start N worker processes
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

from ..config import API_SECRET, API_HOST, API_PORT
from ..models import NormalisedSignal
from ..ingestion_service.producer import enqueue, queue_depth
from .. import database as db

log = logging.getLogger(__name__)

# ── In-memory service registry ────────────────────────────────────────────────
_mt5_monitors: dict = {}       # master_id → MT5Monitor task
_tg_listeners: dict = {}       # source_id → TelegramListener task
_worker_task:  Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.get_pool()
    log.info("[API] Copy trading bridge started")
    yield
    await db.close_pool()
    log.info("[API] Copy trading bridge stopped")


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

    from ..mt5_service.monitor import MT5Monitor
    monitor = MT5Monitor(master, master_id)
    task = asyncio.create_task(monitor.run(), name=f"mt5_{master_id}")
    _mt5_monitors[master_id] = {"monitor": monitor, "task": task}
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


# ── Worker controls ───────────────────────────────────────────────────────────
@app.post("/worker/start", dependencies=[Depends(verify_secret)])
async def start_worker():
    global _worker_task
    if _worker_task and not _worker_task.done():
        return {"status": "already_running"}

    from ..worker_service.consumer import run_worker
    _worker_task = asyncio.create_task(run_worker(), name="worker")
    return {"status": "started"}


# ── Logs tail ─────────────────────────────────────────────────────────────────
@app.get("/followers/{follower_id}/logs", dependencies=[Depends(verify_secret)])
async def get_logs(follower_id: str, limit: int = 50):
    logs = await db.getCopyExecutionLogs_raw(follower_id, limit) if hasattr(db, "getCopyExecutionLogs_raw") else []
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
        "mt5_monitors": list(_mt5_monitors.keys()),
        "tg_listeners": list(_tg_listeners.keys()),
        "worker_running": bool(_worker_task and not _worker_task.done()),
        "queue_depth": queue_depth(),
    }


# ── Entrypoint ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run("python.copy_trading.api_service.main:app", host=API_HOST, port=API_PORT, reload=False)
