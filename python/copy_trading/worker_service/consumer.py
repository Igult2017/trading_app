"""
Redis queue consumer (worker).
Pops NormalisedSignal messages from the queue, persists them to the DB,
retrieves all active followers for the master, and dispatches execution
to each follower concurrently via TradeExecutor.

Workers are stateless — you can run N processes pointing at the same Redis.

Fixes applied:
  - brpop is run in a thread-pool executor to avoid blocking the event loop
  - max_open_trades limit is enforced before dispatching to a follower
  - Shared redis_client used so producer/consumer share the same instance
"""
import asyncio
import logging
from ..models import NormalisedSignal
from ..config import (
    TRADE_QUEUE_KEY, TRADE_QUEUE_DLQ, WORKER_CONCURRENCY,
)
from .. import database as db
from ..redis_client import get_client
from ..execution_service.executor import TradeExecutor
from ..notification_service import get_notifier

log = logging.getLogger(__name__)


async def _count_open_follower_trades(follower_id: str) -> int:
    """Count positions currently open for a follower (OPEN executed, no matching CLOSE)."""
    pool = await db.get_pool()
    row = await pool.fetchrow(
        """
        SELECT COUNT(DISTINCT ctf.master_trade_id) AS cnt
        FROM   copy_trades_follower ctf
        JOIN   copy_trades_master   ctm ON ctm.id = ctf.master_trade_id
        WHERE  ctf.follower_id  = $1
          AND  ctf.event_type   = 'OPEN'
          AND  ctf.status       = 'executed'
          AND  NOT EXISTS (
                 SELECT 1
                 FROM   copy_trades_follower cf2
                 JOIN   copy_trades_master   ctm2 ON ctm2.id = cf2.master_trade_id
                 WHERE  cf2.follower_id = $1
                   AND  cf2.event_type  = 'CLOSE'
                   AND  cf2.status      = 'executed'
                   AND  ctm2.external_id = ctm.external_id
               )
        """,
        follower_id,
    )
    return int(row["cnt"]) if row else 0


async def _process_signal(raw: str) -> None:
    """Full pipeline for a single dequeued signal."""
    r = get_client()

    try:
        signal = NormalisedSignal.from_json(raw)
    except Exception as e:
        log.error("[Worker] Failed to parse signal JSON: %s | raw=%s", e, raw[:200])
        r.lpush(TRADE_QUEUE_DLQ, raw)
        return

    log.info(
        "[Worker] Processing %s %s %s (master=%s)",
        signal.event_type, signal.action, signal.symbol, signal.master_id,
    )

    try:
        master_trade_db_id = await db.insert_master_trade(signal)
        signal.master_trade_db_id = master_trade_db_id
    except Exception as e:
        log.error("[Worker] DB insert master trade failed: %s", e)
        r.lpush(TRADE_QUEUE_DLQ, raw)
        return

    followers = await db.fetch_active_followers(signal.master_id)
    if not followers:
        log.info("[Worker] No active followers for master=%s — skipping", signal.master_id)
        return

    log.info("[Worker] Dispatching to %d follower(s)", len(followers))

    tasks = []
    for follower in followers:
        whitelist = follower.get("symbol_whitelist") or []
        blacklist = follower.get("symbol_blacklist") or []
        if whitelist and signal.symbol not in whitelist:
            log.debug("[Worker] %s not in whitelist for follower=%s — skip", signal.symbol, follower["id"])
            continue
        if signal.symbol in blacklist:
            log.debug("[Worker] %s in blacklist for follower=%s — skip", signal.symbol, follower["id"])
            continue

        # ── Max open trades enforcement ──────────────────────────────────────
        if signal.event_type == "OPEN":
            max_trades = int(follower.get("max_open_trades") or 10)
            open_count = await _count_open_follower_trades(follower["id"])
            if open_count >= max_trades:
                log.info(
                    "[Worker] Follower=%s already has %d/%d open trades — skipping OPEN for %s",
                    follower["id"], open_count, max_trades, signal.symbol,
                )
                await db.insert_execution_log(
                    follower["id"], "INFO", "SKIP",
                    f"Max open trades reached ({open_count}/{max_trades}) — {signal.symbol} skipped",
                )
                await get_notifier().notify_skipped(signal, follower, open_count, max_trades)
                continue

        tasks.append(_dispatch_to_follower(signal, follower, master_trade_db_id))

    sem = asyncio.Semaphore(WORKER_CONCURRENCY)

    async def bounded(coro):
        async with sem:
            await coro

    await asyncio.gather(*[bounded(t) for t in tasks], return_exceptions=True)


async def _dispatch_to_follower(signal: NormalisedSignal, follower: dict,
                                  master_trade_db_id: str) -> None:
    follower_id = follower["id"]
    try:
        from ..execution_service.executor import calculate_lot
        # Pre-calculate an estimated lot for the initial pending DB record.
        # For risk-% mode this uses a placeholder equity; the executor
        # recalculates with real account equity once the MT5 lock is held.
        mode = follower.get("lot_mode", "mult")
        estimated_lot = calculate_lot(mode, follower, signal, {"equity": 1000.0})
        lot = estimated_lot
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
    """Main worker loop — blocks and processes signals from Redis indefinitely.

    brpop is offloaded to a thread-pool executor so it never blocks the
    asyncio event loop (which would starve MT5 monitors and Telegram listeners
    running in the same process).
    """
    r = get_client()
    loop = asyncio.get_event_loop()
    log.info("[Worker] Started. Waiting for signals on queue: %s", TRADE_QUEUE_KEY)

    while True:
        try:
            # Run the blocking brpop in a thread so the event loop stays free
            item = await loop.run_in_executor(
                None,
                lambda: r.brpop(TRADE_QUEUE_KEY, timeout=5),
            )
            if item:
                _, raw = item
                await _process_signal(raw)
        except Exception as e:
            log.error("[Worker] Unexpected error: %s", e, exc_info=True)
            await asyncio.sleep(1)
