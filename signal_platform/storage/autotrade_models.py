"""
ORM model for every order autotrade placed — durable, so a restart cannot forget it.

WHY IT EXISTS. `execution/placer.py` kept this in a plain dict (`_intent`) and `execution/fill_watch`
read it back. A dict lives in the process, so a redeploy emptied it, and two things went with it:

  * the FILL REPORT he is waiting on — modelled entry vs actual fill, the whole point of the feature
  * the only link from a broker order back to the SIGNAL that produced it, which is what makes the
    original risk knowable

His instruction, 2026-09-02: *"persist every memory that we might need either for fixes, error
tracing or for records. I dont want to here that we redeployed and the memory was wiped so we cant
know what happened."*

THE LEVELS HERE ARE THE INTENDED ONES — what the signal asked for, before the broker rounded anything
and before the ladder moved anything. That distinction is the whole reason the journal's risk numbers
were wrong: the stop a position closes on is not the stop it was placed with.

Column names are snake_case to match the Drizzle schema in shared/schema.ts, same rule as
storage/models.py. The table is also declared there and in docker-migrate.sql — prod syncs schema
from that file, and a table missing from shared/schema.ts risks drizzle-kit pushing it away.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Index, Integer, Numeric, String, Text

from storage.db import Base
from storage.models import UtcDateTime


STATUS_PLACED    = "placed"
STATUS_FILLED    = "filled"
STATUS_CANCELLED = "cancelled"
STATUS_REJECTED  = "rejected"


class AutotradeOrderModel(Base):
    """One row per order sent to the broker. Updated once when it fills."""

    __tablename__ = "autotrade_orders"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # The broker's own order id — the join key. A closed position's OPENING deal carries this same
    # value, which is how a trade in the journal is matched back to what it was placed with.
    order_id    = Column("order_id",   String, nullable=False)
    # WHICH POSITION THE ORDER BECAME — the durable half of the strategy attribution. See
    # `fill_watch._owner`: that dict is memory-only, so a restart lost the link and every open
    # position silently fell back to the DEFAULT ladder (breakeven 1.0R, not VIX.1's 0.4R).
    position_id = Column("position_id", String, nullable=True)
    signal_id   = Column("signal_id",  String, nullable=True)
    strategy    = Column("strategy",   String, nullable=True)
    symbol      = Column("symbol",     String, nullable=False)
    side        = Column("side",       String, nullable=False)

    entry_price = Column("entry_price", Numeric(12, 5), nullable=True)
    stop_loss   = Column("stop_loss",   Numeric(12, 5), nullable=True)
    take_profit = Column("take_profit", Numeric(12, 5), nullable=True)
    lots        = Column("lots",        Numeric(10, 5), nullable=True)
    volume      = Column("volume",      Integer,        nullable=True)
    stop_pips   = Column("stop_pips",   Numeric(10, 2), nullable=True)

    placed_at   = Column("placed_at", UtcDateTime,
                         default=lambda: datetime.now(timezone.utc), nullable=False)
    filled_at   = Column("filled_at",  UtcDateTime,    nullable=True)
    fill_price  = Column("fill_price", Numeric(12, 5), nullable=True)
    status      = Column("status",     Text,           default=STATUS_PLACED)

    __table_args__ = (
        Index("autotrade_orders_order_idx", "order_id"),
        Index("autotrade_orders_pos_idx", "position_id"),
        Index("autotrade_orders_placed_idx", "placed_at"),
        Index("autotrade_orders_status_idx", "status"),
    )
