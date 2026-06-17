"""
ORM model — column names match the trading_signals PostgreSQL table
(all snake_case, matching the Drizzle schema in shared/schema.ts).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, Numeric, String, Text, ARRAY
from sqlalchemy.dialects.postgresql import JSONB

from storage.db import Base


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
    expires_at     = Column("expires_at",     DateTime)
    executed_at    = Column("executed_at",    DateTime)
    invalidated_at = Column("invalidated_at", DateTime)
    created_at     = Column("created_at",     DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at     = Column("updated_at",     DateTime, default=lambda: datetime.now(timezone.utc),
                            onupdate=lambda: datetime.now(timezone.utc))


class StrategyStateModel(Base):
    """Persistent per-strategy dedup/alert memory — survives restarts so a
    redeploy doesn't wipe state and re-fire already-alerted setups. Matches the
    `strategy_state` table in shared/schema.ts."""
    __tablename__ = "strategy_state"

    strategy_id = Column("strategy_id", String, primary_key=True)
    state       = Column("state",       JSONB, nullable=False, default=dict)
    updated_at  = Column("updated_at",  DateTime, default=lambda: datetime.now(timezone.utc),
                         onupdate=lambda: datetime.now(timezone.utc))
