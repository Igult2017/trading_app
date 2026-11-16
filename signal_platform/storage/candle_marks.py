"""
HIS TRADEABLE / UNTRADEABLE PRESS on a momentum-candle announcement (16 Nov 2026) — the model and the
reads and writes. Same contract as the other repos here: best-effort, never raises, failures logged.

His ask: *"Whenever momentum candle closure is sent it should contain a button that asks if a trade
should be taken there, then the system starts waiting for entry and once entry is ready it takes a
trade there … the button should be tradeable and untradeable."*

status: open → tradeable | untradeable (his press, written by the website server — he may change his
mind until it is used) → used (a trade was built from it) | expired (a newer candle on the pair, or 24 h).
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import BigInteger, Boolean, Column, Integer, String, Text

from storage.db import Base, get_session
from storage.models import UtcDateTime

log = logging.getLogger(__name__)

OPEN, TRADEABLE, UNTRADEABLE, USED, EXPIRED = "open", "tradeable", "untradeable", "used", "expired"
_LIFE_H = 24


class CandleMarkModel(Base):
    __tablename__ = "candle_marks"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    symbol     = Column("symbol", Text, nullable=False)
    bar_time   = Column("bar_time", BigInteger, nullable=False)
    bullish    = Column("bullish", Boolean, nullable=False)
    status     = Column("status", Text, nullable=False, default=OPEN)
    chat_id    = Column("chat_id", Text, nullable=True)
    message_id = Column("message_id", Integer, nullable=True)
    signal_id  = Column("signal_id", String, nullable=True)
    created_at = Column("created_at", UtcDateTime, default=lambda: datetime.now(timezone.utc))
    decided_at = Column("decided_at", UtcDateTime, nullable=True)
    used_at    = Column("used_at", UtcDateTime, nullable=True)


def create(symbol: str, bar_time: int, bullish: bool) -> str | None:
    """A new OPEN mark for an announced candle; any older unused mark on the pair EXPIRES (his E1: a
    newer momentum candle on the pair replaces the old one). Returns the id, or None."""
    try:
        with get_session() as s:
            (s.query(CandleMarkModel)
              .filter(CandleMarkModel.symbol == symbol,
                      CandleMarkModel.status.in_((OPEN, TRADEABLE)),
                      CandleMarkModel.bar_time < int(bar_time))
              .update({"status": EXPIRED}, synchronize_session=False))
            row = CandleMarkModel(symbol=symbol, bar_time=int(bar_time), bullish=bool(bullish))
            s.add(row)
            s.flush()
            return row.id
    except Exception as exc:
        log.warning(f"[candle_marks] could not create the mark for {symbol}: {type(exc).__name__}: {exc}")
        return None


def set_message(mid: str, chat_id: str, message_id: int) -> None:
    try:
        with get_session() as s:
            row = s.get(CandleMarkModel, mid)
            if row is not None:
                row.chat_id, row.message_id = str(chat_id), int(message_id)
    except Exception as exc:
        log.warning(f"[candle_marks] could not store the DM id for {mid}: {type(exc).__name__}: {exc}")


def marks_for(symbol: str) -> list[dict]:
    """His TRADEABLE and UNTRADEABLE marks on this pair that are still live (not used, not expired,
    under 24 h). Read once per scan of the pair."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=_LIFE_H)
        with get_session() as s:
            return [dict(id=r.id, bar_time=int(r.bar_time), bullish=bool(r.bullish), status=r.status,
                         chat_id=r.chat_id, message_id=r.message_id)
                    for r in s.query(CandleMarkModel)
                    .filter(CandleMarkModel.symbol == symbol,
                            CandleMarkModel.status.in_((TRADEABLE, UNTRADEABLE)),
                            CandleMarkModel.created_at >= cutoff).all()]
    except Exception as exc:
        log.warning(f"[candle_marks] could not read marks for {symbol}: {type(exc).__name__}: {exc}")
        return []


def mark_used(mid: str) -> bool:
    """A trade was built from this candle: TRADEABLE → USED, once. True if this call did it."""
    try:
        with get_session() as s:
            n = (s.query(CandleMarkModel)
                  .filter(CandleMarkModel.id == mid, CandleMarkModel.status == TRADEABLE)
                  .update({"status": USED, "used_at": datetime.now(timezone.utc)},
                          synchronize_session=False))
            return n == 1
    except Exception as exc:
        log.warning(f"[candle_marks] could not mark {mid} used: {type(exc).__name__}: {exc}")
        return False
