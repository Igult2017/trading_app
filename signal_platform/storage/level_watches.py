"""
HIS /level PRICE WATCHES (19 Nov 2026) — the model and the reads and writes.

His ask: *"I just type /level … it watches. When the price hits those levels, it sends me a notification with an
option to enter entry values like SL and entry level using stop order."* The website server holds the conversation and
writes his level and his order (`server/services/levelWatchPress.ts`); `execution/level_watch.py` watches and places.

status: awaiting_level → new (his level written) → watching (armed here) → hit (reached; the card with Buy / Sell
stop sent) → awaiting_order → order_pending (his entry / stop written) → placing (claimed here, once) → placed |
refused; cancelled (❌ Stop watching) before placing. Same contract as the other repos: never raises, failures logged.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Float, Integer, String, Text

from storage.db import Base, get_session
from storage.models import UtcDateTime

log = logging.getLogger(__name__)

NEW, WATCHING, HIT, ORDER_PENDING, PLACING, PLACED, REFUSED = (
    "new", "watching", "hit", "order_pending", "placing", "placed", "refused")


class LevelWatchModel(Base):
    __tablename__ = "level_watches"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    chat_id    = Column("chat_id", Text, nullable=False)
    symbol     = Column("symbol", Text, nullable=False)
    low        = Column("low", Float, nullable=True)
    high       = Column("high", Float, nullable=True)
    side       = Column("side", Text, nullable=True)
    status     = Column("status", Text, nullable=False, default="awaiting_level")
    prompt_id  = Column("prompt_id", Integer, nullable=True)
    last_price = Column("last_price", Float, nullable=True)
    hit_price  = Column("hit_price", Float, nullable=True)
    hit_at     = Column("hit_at", UtcDateTime, nullable=True)
    order_side = Column("order_side", Text, nullable=True)
    entry      = Column("entry", Float, nullable=True)
    sl         = Column("sl", Float, nullable=True)
    tp         = Column("tp", Float, nullable=True)
    signal_id  = Column("signal_id", Text, nullable=True)
    result     = Column("result", Text, nullable=True)
    created_at = Column("created_at", UtcDateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column("updated_at", UtcDateTime, nullable=True)


_FIELDS = ("id", "chat_id", "symbol", "low", "high", "side", "status", "last_price", "hit_price",
           "order_side", "entry", "sl", "tp", "signal_id")


def _as_dict(r) -> dict:
    return {f: getattr(r, f) for f in _FIELDS}


def with_status(*statuses: str) -> list[dict]:
    """Every watch in one of these states."""
    try:
        with get_session() as s:
            return [_as_dict(r) for r in s.query(LevelWatchModel).filter(LevelWatchModel.status.in_(statuses)).all()]
    except Exception as exc:
        log.warning(f"[level_watches] could not read {statuses}: {type(exc).__name__}: {exc}")
        return []


def move(wid: str, frm: str, to: str, **fields) -> bool:
    """Change the status from `frm` to `to` (and write `fields`) ONLY if it is still `frm` — the claim-once rule:
    his ❌ Stop watching between the read and this write wins, and a row is never acted on twice."""
    try:
        with get_session() as s:
            row = s.get(LevelWatchModel, wid)
            if row is None or row.status != frm:
                return False
            row.status, row.updated_at = to, datetime.now(timezone.utc)
            for k, v in fields.items():
                setattr(row, k, v)
            return True
    except Exception as exc:
        log.warning(f"[level_watches] could not move {wid} {frm}→{to}: {type(exc).__name__}: {exc}")
        return False
