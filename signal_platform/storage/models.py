"""
ORM model — column names match the trading_signals PostgreSQL table
(all snake_case, matching the Drizzle schema in shared/schema.ts).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, Numeric, String, Text, ARRAY
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import TypeDecorator

from storage.db import Base


class UtcDateTime(TypeDecorator):
    """A DateTime that is ALWAYS timezone-aware UTC in Python, whatever the column type is.

    THE BUG THIS EXISTS TO KILL (2026-07-26). These columns are `timestamp WITHOUT time zone` in
    Postgres — that is what Drizzle declares in shared/schema.ts and what production runs — so
    SQLAlchemy handed back NAIVE datetimes even though every writer stored UTC. A naive datetime is
    a loaded gun in both directions:

      READING   `naive.timestamp()` makes Python interpret the value as LOCAL time, silently
                shifting it by the host's UTC offset. `naive.astimezone()` does the same. Both are
                invisible on a UTC host and wrong the instant one isn't — a container with TZ set,
                a laptop, a CI runner. It had already produced two live defects: the monitor's
                replay window and vix1_alerts' ratchet window, each patched at its own call site.
      WRITING   an aware non-UTC datetime (or a naive LOCAL one from `datetime.now()`) was stored
                with whatever wall-clock it carried, so the row said 16:13 for a 14:13 event.

    Patching each read site does not scale — the next one added gets it wrong again. This fixes it
    at the ORM boundary instead: aware UTC comes out, aware-anything goes in and is converted.

    DELIBERATELY NOT a schema migration. Changing the columns to `timestamptz` would mean an
    ALTER on a live table AND a matching change in shared/schema.ts, or drizzle-kit would push it
    straight back. The column type is untouched, so the Node side sees exactly what it always has.
    """
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value                                    # already naive — taken as UTC, stored as-is
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)       # the DB stores UTC; say so explicitly
        return value.astimezone(timezone.utc)


class SignalModel(Base):
    __tablename__ = "trading_signals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Core
    symbol          = Column("symbol",      String, nullable=False)
    asset_class     = Column("asset_class", String, default="forex")
    type            = Column("type",        String, nullable=False)
    strategy        = Column("strategy",    String, default="")

    # Price levels
    entry_price     = Column("entry_price",       Numeric(12, 5))
    stop_loss       = Column("stop_loss",         Numeric(12, 5))
    take_profit     = Column("take_profit",       Numeric(12, 5))
    risk_reward     = Column("risk_reward_ratio", Numeric(5, 2))

    # Timeframes
    primary_tf      = Column("primary_timeframe",      String)
    confirm_tf      = Column("confirmation_timeframe", String)
    execution_tf    = Column("execution_timeframe",    String)

    # Scores
    confidence      = Column("overall_confidence", Integer)

    # SMC fields
    smc_score       = Column("smc_score",      Numeric(5, 2))
    smc_factors     = Column("smc_factors",    ARRAY(Text), default=list)
    liquidity_sweep = Column("liquidity_sweep", Boolean, default=False)

    # Context
    trend_direction   = Column("trend_direction",   String)
    technical_reasons = Column("technical_reasons", ARRAY(Text), default=list)
    market_context    = Column("market_context",    Text)

    # Status
    status = Column("status", String, default="active")

    # Lifecycle
    expires_at     = Column("expires_at",     UtcDateTime)
    triggered_at   = Column("triggered_at",   UtcDateTime)   # entry filled; NULL = stop order pending
    executed_at    = Column("executed_at",    UtcDateTime)
    invalidated_at = Column("invalidated_at", UtcDateTime)
    created_at     = Column("created_at",     UtcDateTime, default=lambda: datetime.now(timezone.utc))
    updated_at     = Column("updated_at",     UtcDateTime, default=lambda: datetime.now(timezone.utc),
                            onupdate=lambda: datetime.now(timezone.utc))


class StrategyStateModel(Base):
    """Persistent per-strategy dedup/alert memory — survives restarts so a
    redeploy doesn't wipe state and re-fire already-alerted setups. Matches the
    `strategy_state` table in shared/schema.ts."""
    __tablename__ = "strategy_state"

    strategy_id = Column("strategy_id", String, primary_key=True)
    state       = Column("state",       JSONB, nullable=False, default=dict)
    updated_at  = Column("updated_at",  UtcDateTime, default=lambda: datetime.now(timezone.utc),
                         onupdate=lambda: datetime.now(timezone.utc))
