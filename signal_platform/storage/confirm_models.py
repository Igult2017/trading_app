"""
ORM models for the trading MODE and the DM confirmations (16 Nov 2026).

His ask: a switch in the admin panel for autotrade and one for "DM confirmation" — each signal
autotrade would take is sent to his DM with Confirm / Reject. Only one can be on at a time, so it is
ONE value, `trade_mode`: off | auto | confirm. Both tables are also declared in `shared/schema.ts` and
`docker-migrate.sql` (prod builds its schema from that file).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, Numeric, String, Text

from storage.db import Base
from storage.models import UtcDateTime

PENDING, CONFIRMED, REJECTED = "pending", "confirmed", "rejected"
PLACING = "placing"          # claimed by the engine: acted on ONCE, never retried after a crash
PLACED, REFUSED, TOO_LATE, EXPIRED = "placed", "refused", "too_late", "expired"


class PlatformSettingModel(Base):
    __tablename__ = "platform_settings"
    key        = Column("key", Text, primary_key=True)
    value      = Column("value", Text, nullable=False)
    updated_at = Column("updated_at", UtcDateTime, default=lambda: datetime.now(timezone.utc))
    updated_by = Column("updated_by", Text, nullable=True)


class TradeConfirmationModel(Base):
    __tablename__ = "trade_confirmations"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    signal_id   = Column("signal_id", String, nullable=True)
    strategy    = Column("strategy", Text, nullable=True)
    symbol      = Column("symbol", Text, nullable=False)
    side        = Column("side", Text, nullable=False)
    entry_price = Column("entry_price", Numeric(12, 5))
    stop_loss   = Column("stop_loss", Numeric(12, 5))
    take_profit = Column("take_profit", Numeric(12, 5))
    lots        = Column("lots", Numeric(10, 5))
    spread_used = Column("spread_used", Numeric(12, 5))
    status      = Column("status", Text, nullable=False, default=PENDING)
    chat_id     = Column("chat_id", Text, nullable=True)
    message_id  = Column("message_id", Integer, nullable=True)
    outcome     = Column("outcome", Text, nullable=True)
    created_at  = Column("created_at", UtcDateTime, default=lambda: datetime.now(timezone.utc))
    decided_at  = Column("decided_at", UtcDateTime, nullable=True)
    settled_at  = Column("settled_at", UtcDateTime, nullable=True)
