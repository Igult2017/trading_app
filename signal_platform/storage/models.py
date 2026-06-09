"""
ORM model — column names match the existing tradingSignals PostgreSQL table
so the Node.js API and AssetPage work without any schema changes.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, Numeric, String, Text

from storage.db import Base


class SignalModel(Base):
    __tablename__ = "trading_signals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Core
    symbol         = Column(String, nullable=False)
    asset_class    = Column("assetClass", String, default="forex")
    type           = Column(String, nullable=False)           # buy | sell
    strategy       = Column(String, default="")

    # Price levels
    entry_price    = Column("entryPrice",       Numeric(12, 5))
    stop_loss      = Column("stopLoss",         Numeric(12, 5))
    take_profit    = Column("takeProfit",       Numeric(12, 5))
    risk_reward    = Column("riskRewardRatio",  Numeric(5, 2))

    # Timeframes
    primary_tf     = Column("primaryTimeframe",      String)
    confirm_tf     = Column("confirmationTimeframe", String)
    execution_tf   = Column("executionTimeframe",    String)

    # Scores
    confidence     = Column("overallConfidence", Integer)      # 0–100

    # SMC fields
    smc_score      = Column("smcScore",       Numeric(5, 2))
    smc_factors    = Column("smcFactors",     JSON, default=list)
    liquidity_sweep= Column("liquiditySweep", Boolean, default=False)

    # Context
    trend_direction = Column("trendDirection", String)
    technical_reasons = Column("technicalReasons", JSON, default=list)
    market_context  = Column("marketContext",  Text)

    # Status
    status         = Column(String, default="active")

    # Lifecycle
    expires_at     = Column("expiresAt",     DateTime)
    executed_at    = Column("executedAt",    DateTime)
    invalidated_at = Column("invalidatedAt", DateTime)
    created_at     = Column("createdAt",     DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at     = Column("updatedAt",     DateTime, default=lambda: datetime.now(timezone.utc),
                            onupdate=lambda: datetime.now(timezone.utc))
