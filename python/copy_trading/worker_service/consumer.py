"""
Redis queue consumer (worker).
Pops NormalisedSignal messages from the queue, persists them to the DB,
retrieves all active followers for the master, and dispatches execution
to each follower concurrently via TradeExecutor.

Workers are stateless — you can run N processes pointing at the same Redis.
"""
import asyncio
import logging
import redis
from ..models import NormalisedSignal
from ..config import (
    REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD,
    TRADE_QUEUE_KEY, TRADE_QUEUE_DLQ, WORKER_CONCURRENCY,
)
from .. import database as db
from ..execution_service.executor import TradeExecutor

log = logging.getLogger(__name__)

_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.Redis(
            host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB,
            password=REDIS_PASSWORD, decode_responses=True,
        )
    return _redis


async def _process_signal(raw: str) -> None:
    """Full pipeline for a single dequeued signal."""
    try:
        signal = NormalisedSignal.from_json(raw)
    except Exception as e:
        log.error("[Worker] Failed to parse signal JSON: %s | raw=%s", e, raw[:200])
        get_redis().lpush(TRADE_QUEUE_DLQ, raw)
        return

    log.info(
        "[Worker] Processing %s %s %s (master=%s)",
        signal.event_type, signal.action, signal.symbol, signal.master_id,
    )

    # 1. Persist master trade record (deduplication: ON CONFLICT DO NOTHING)
    try:
        master_trade_db_id = await db.insert_master_trade(signal)
        signal.master_trade_db_id = master_trade_db_id
    except Exception as e:
        log.error("[Worker] DB insert master trade failed: %s", e)
        get_redis().lpush(TRADE_QUEUE_DLQ, raw)
        return

    # 2. Fetch all active followers for this master
    followers = await db.fetch_active_followers(signal.master_id)
    if not followers:
        log.info("[Worker] No active followers for master=%s — skipping", signal.master_id)
        return

    log.info("[Worker] Dispatching to %d follower(s)", len(followers))

    # 3. For each follower — filter check, lot calculation, execute
    tasks = []
    for follower in followers:
        # Whitelist / blacklist check
        whitelist = follower.get("symbol_whitelist") or []
        blacklist = follower.get("symbol_blacklist") or []
        if whitelist and signal.symbol not in whitelist:
            log.debug("[Worker] %s not in whitelist for follower=%s — skip", signal.symbol, follower["id"])
            continue
        if signal.symbol in blacklist:
            log.debug("[Worker] %s in blacklist for follower=%s — skip", signal.symbol, follower["id"])
            continue

        # Max open trades check (approximate — count via DB)
        tasks.append(_dispatch_to_follower(signal, follower, master_trade_db_id))

    # Run all follower executions concurrently (bounded by WORKER_CONCURRENCY)
    sem = asyncio.Semaphore(WORKER_CONCURRENCY)

    async def bounded(coro):
        async with sem:
            await coro

    await asyncio.gather(*[bounded(t) for t in tasks], return_exceptions=True)


async def _dispatch_to_follower(signal: NormalisedSignal, follower: dict,
                                  master_trade_db_id: str) -> None:
    follower_id = follower["id"]
    try:
        # Insert a pending follower trade record
        from ..execution_service.executor import calculate_lot
        lot = calculate_lot(
            follower.get("lot_mode", "mult"),
            follower, signal,
            {"equity": 1000.0},  # placeholder — executor will re-calculate with real equity
        )
        follower_trade_db_id = await db.insert_follower_trade(
            master_trade_db_id, follower_id, signal, lot,
        )

        executor = TradeExecutor(follower)
        await executor.execute(signal, master_trade_db_id, follower_trade_db_id)

    except Exception as e:
        log.error("[Worker] dispatch failed for follower=%s: %s", follower_id, e, exc_info=True)
        await db.insert_execution_log(
            follower_id, "ERROR", "FAIL",
            f"Dispatch error: {e}",
        )


async def run_worker() -> None:
    """Main worker loop. Blocks and processes signals from Redis indefinitely."""
    r = get_redis()
    log.info("[Worker] Started. Waiting for signals on queue: %s", TRADE_QUEUE_KEY)
    while True:
        try:
            # BRPOP blocks up to 5 seconds then returns None — keeps the loop alive
            item = r.brpop(TRADE_QUEUE_KEY, timeout=5)
            if item:
                _, raw = item
                await _process_signal(raw)
        except redis.ConnectionError as e:
            log.error("[Worker] Redis connection error: %s — retrying in 5s", e)
            await asyncio.sleep(5)
        except Exception as e:
            log.error("[Worker] Unexpected error: %s", e, exc_info=True)
            await asyncio.sleep(1)
