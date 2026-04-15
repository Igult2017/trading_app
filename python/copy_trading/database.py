"""
Async PostgreSQL connection pool shared by all Python services.
Uses asyncpg directly — same DB as the Node.js backend.
"""
import asyncpg
import asyncio
import logging
from typing import Optional
from .config import DATABASE_URL

log = logging.getLogger(__name__)
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        log.info("[DB] Connection pool created")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        log.info("[DB] Connection pool closed")


# ── Helpers used by multiple services ────────────────────────────────────────

async def fetch_active_followers(master_id: str) -> list[dict]:
    """Return all active followers subscribed to a given master."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT cf.*, ca.login_id, ca.broker_server, ca.platform,
               ca.password_enc, ca.symbol_prefix, ca.symbol_suffix
        FROM   copy_followers cf
        JOIN   copy_accounts  ca ON ca.id = cf.account_id
        WHERE  cf.master_id = $1 AND cf.is_active = TRUE AND cf.risk_accepted = TRUE
        """,
        master_id,
    )
    return [dict(r) for r in rows]


async def fetch_master_by_id(master_id: str) -> Optional[dict]:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT cm.*, ca.login_id, ca.broker_server, ca.platform, ca.password_enc
        FROM   copy_masters  cm
        JOIN   copy_accounts ca ON ca.id = cm.account_id
        WHERE  cm.id = $1
        """,
        master_id,
    )
    return dict(row) if row else None


async def insert_master_trade(signal) -> str:
    """Insert a normalised signal into copy_trades_master. Returns new row id."""
    pool = await get_pool()
    import uuid
    new_id = str(uuid.uuid4())
    await pool.execute(
        """
        INSERT INTO copy_trades_master
            (id, master_id, external_id, source, symbol, action, event_type,
             volume, entry_price, stop_loss, take_profit, closed_price, raw_payload, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
        ON CONFLICT DO NOTHING
        """,
        new_id, signal.master_id, signal.trade_id, signal.source,
        signal.symbol, signal.action, signal.event_type,
        signal.volume, signal.entry_price, signal.stop_loss,
        signal.take_profit, signal.closed_price,
        signal.raw_payload if isinstance(signal.raw_payload, str) else str(signal.raw_payload),
    )
    return new_id


async def insert_follower_trade(master_trade_id: str, follower_id: str, signal, volume: float) -> str:
    pool = await get_pool()
    import uuid
    new_id = str(uuid.uuid4())
    await pool.execute(
        """
        INSERT INTO copy_trades_follower
            (id, master_trade_id, follower_id, symbol, action, event_type,
             volume, entry_price, stop_loss, take_profit, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
        """,
        new_id, master_trade_id, follower_id,
        signal.symbol, signal.action, signal.event_type,
        volume, signal.entry_price, signal.stop_loss, signal.take_profit,
    )
    return new_id


async def update_follower_trade(trade_id: str, status: str, external_id: str = None,
                                 closed_price: float = None, error: str = None,
                                 retry_count: int = None):
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE copy_trades_follower
        SET    status=$2,
               external_id=COALESCE($3, external_id),
               closed_price=COALESCE($4, closed_price),
               error_message=COALESCE($5, error_message),
               retry_count=COALESCE($6, retry_count),
               executed_at=CASE WHEN $2='executed' THEN NOW() ELSE executed_at END
        WHERE  id=$1
        """,
        trade_id, status, external_id, closed_price, error, retry_count,
    )


async def insert_execution_log(follower_id: str, level: str, event: str,
                                message: str, trade_id: str = None, metadata: dict = None):
    pool = await get_pool()
    import uuid, json
    await pool.execute(
        """
        INSERT INTO copy_execution_logs (id, follower_id, trade_id, level, event, message, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        """,
        str(uuid.uuid4()), follower_id, trade_id, level, event, message,
        json.dumps(metadata or {}),
    )
