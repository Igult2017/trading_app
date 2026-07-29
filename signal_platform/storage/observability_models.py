"""
ORM models for the two things a post-mortem needs and stdout logging cannot give: WHERE a signal
died, and WHETHER the platform was even running.

WHY THESE EXIST (2026-07-27). A VIX.1 EUR/USD signal was built, validated and saved at 11:17 UTC and
never reached Telegram. By the time anyone looked, the container had restarted and taken every log
line with it, so the question "where did it die?" was permanently unanswerable — the delivery path
left no trace outside stdout. Logs are ephemeral by construction: one restart and the evidence is
gone. These tables put the audit trail in Postgres, where a restart cannot touch it.

Column names are snake_case to match the Drizzle schema in shared/schema.ts, same rule as
storage/models.py. Both tables are also declared there and in docker-migrate.sql — prod syncs schema
from that file, and a table missing from shared/schema.ts risks drizzle-kit pushing it away.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Column, Index, Integer, String, Text

from storage.db import Base
from storage.models import UtcDateTime


# The stages a signal passes through, in order. `dropped` is terminal and carries the reason.
STAGE_BUILT     = "built"       # the strategy produced it
STAGE_VALIDATED = "validated"   # it survived rr / confidence / duplicate checks
STAGE_SAVED     = "saved"       # the DB row exists
STAGE_DISPATCHED= "dispatched"  # handed to the notifier
STAGE_DELIVERED = "delivered"   # the notifier confirmed the send
STAGE_DROPPED   = "dropped"     # refused or failed — `detail` says why
# Not part of a signal's life — a STRATEGY STATE change ("scanning, nothing tapped", "zone tapped,
# awaiting confirmation"). Written only when the state actually changes or the heartbeat elapses,
# never per tick: at ~7,700 scans/day per-tick rows would swamp the table and tell you nothing the
# previous row did not. This is what makes "what was it doing at 3am on Tuesday" answerable after the
# log buffer has rolled and the container has restarted.
STAGE_EVALUATED = "evaluated"


class SignalEventModel(Base):
    """One row per stage transition. Append-only; nothing ever updates a row.

    `signal_id` is nullable ON PURPOSE: the most valuable events happen BEFORE the row exists (a
    signal dropped by the validator never gets an id at all). Keying on strategy+symbol+time is what
    makes those visible — the 11:17 case would have been a two-second query instead of an
    investigation that could not be completed.
    """
    __tablename__ = "signal_events"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    signal_id  = Column("signal_id", String, nullable=True)
    strategy   = Column("strategy",  String, nullable=False)
    symbol     = Column("symbol",    String, nullable=False)
    stage      = Column("stage",     String, nullable=False)
    detail     = Column("detail",    Text,   nullable=True)
    created_at = Column("created_at", UtcDateTime,
                        default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("signal_events_created_idx", "created_at"),
        Index("signal_events_signal_idx", "signal_id"),
        Index("signal_events_lookup_idx", "strategy", "symbol", "created_at"),
    )


class PlatformHeartbeatModel(Base):
    """A single row, rewritten every scan. Its age at boot IS the downtime measurement.

    Single-row via a CHECK constraint, the same shape as `copy_engine_heartbeat` in
    docker-migrate.sql — one obvious place to read, no accumulating rows to prune.
    """
    __tablename__ = "platform_heartbeat"

    id      = Column(Integer, primary_key=True, default=1)
    beat_at = Column("beat_at", UtcDateTime,
                     default=lambda: datetime.now(timezone.utc), nullable=False)
    scans   = Column("scans", Integer, default=0)

    __table_args__ = (CheckConstraint("id = 1", name="platform_heartbeat_single"),)


class PlatformDowntimeModel(Base):
    """One row per detected outage, written at boot when the heartbeat is stale.

    This answers the question that could not be answered about 27 Jul: "was the platform even up
    when that candle closed?" A missing signal has two very different explanations — the strategy
    declined it, or the process was not running — and until now nothing distinguished them.
    """
    __tablename__ = "platform_downtime"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    down_from   = Column("down_from", UtcDateTime, nullable=False)   # last heartbeat before the gap
    down_to     = Column("down_to",   UtcDateTime, nullable=False)   # boot time that observed it
    seconds     = Column("seconds",   Integer,     nullable=False)
    note        = Column("note",      Text,        nullable=True)
    detected_at = Column("detected_at", UtcDateTime,
                         default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (Index("platform_downtime_from_idx", "down_from"),)
