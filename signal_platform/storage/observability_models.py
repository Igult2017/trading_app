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

# WHAT AUTOTRADE DID WITH A CONFIRMED SIGNAL. Added 2026-09-15, one row per decision, written by
# `execution.decision_log`. A refusal used to exist only as a Telegram DM and a container log line, so
# "why was there no order behind that signal?" could only be answered from the broker's own history.
STAGE_AUTOTRADE_PLACED    = "autotrade_placed"
STAGE_AUTOTRADE_REFUSED   = "autotrade_refused"    # our own guards said no; `detail` says which
STAGE_AUTOTRADE_REJECTED  = "autotrade_rejected"   # the BROKER said no to an order we sent
STAGE_AUTOTRADE_CANCELLED = "autotrade_cancelled"  # a resting order withdrawn, or found already gone
STAGE_AUTOTRADE_FAILED    = "autotrade_failed"     # nothing to trade with, or the path crashed
# The order was gone when we came to withdraw it because it had FILLED — a real trade the polls never
# saw open (16 Sep: 1.2 seconds). Recorded instead of "cancelled" since 19 Sep 2026 (docs/OPEN.md B29).
STAGE_AUTOTRADE_FILLED_UNSEEN = "autotrade_filled_unseen"


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
    # How long the tick that wrote this beat took, in milliseconds. NULLABLE — a boot that has not
    # completed a tick yet has no answer, and inventing a 0 would read as "instant" rather than
    # "unknown". Added 2026-08-20: the scan loop's duration was measured by NOTHING, so "ticks
    # sometimes take three minutes" could be neither confirmed nor refuted. It is one number and it
    # settles the question every time it is asked, instead of once by inference.
    last_tick_ms = Column("last_tick_ms", Integer, nullable=True)

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
