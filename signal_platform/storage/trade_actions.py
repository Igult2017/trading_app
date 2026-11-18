"""
HIS ❌ CANCEL TRADE / ✏️ ADJUST SL buttons (18 Nov 2026) — the model and the reads and writes.

His ask: *"add a button for cancelling a trade and adjusting SL by entering the price level where SL should reach"*,
*"Make the cancels interactive or communicative so that I can know what is going on when I press it"*; Cancel is ONE
button (cancel the waiting order, or close the filled trade at market); on the "order placed" and "trade filled"
messages.

One row per message that carries the buttons. status: offered → awaiting_price (Adjust SL asked him for a price) →
pending (written by the website server, `server/services/tradeActionPress.ts`) → working (claimed here, once) →
done | failed. Same contract as the other repos: best-effort, never raises, failures logged.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Float, Integer, String, Text

from storage.db import Base, get_session
from storage.models import UtcDateTime

log = logging.getLogger(__name__)

OFFERED, AWAITING_PRICE, PENDING, WORKING, DONE, FAILED = (
    "offered", "awaiting_price", "pending", "working", "done", "failed")
CANCEL, MOVE_SL = "cancel", "move_sl"


class TradeActionModel(Base):
    __tablename__ = "trade_actions"
    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id    = Column("order_id", Text, nullable=True)
    position_id = Column("position_id", Text, nullable=True)
    symbol      = Column("symbol", Text, nullable=False)
    bullish     = Column("bullish", Boolean, nullable=False)
    kind        = Column("kind", Text, nullable=True)
    price       = Column("price", Float, nullable=True)
    status      = Column("status", Text, nullable=False, default=OFFERED)
    chat_id     = Column("chat_id", Text, nullable=True)
    message_id  = Column("message_id", Integer, nullable=True)
    prompt_id   = Column("prompt_id", Integer, nullable=True)
    result      = Column("result", Text, nullable=True)
    created_at  = Column("created_at", UtcDateTime, default=lambda: datetime.now(timezone.utc))
    updated_at  = Column("updated_at", UtcDateTime, nullable=True)


def create(*, symbol: str, bullish: bool, order_id=None, position_id=None) -> str | None:
    """A new OFFERED row for a message about to carry the buttons. Returns its id, or None."""
    try:
        with get_session() as s:
            row = TradeActionModel(symbol=symbol, bullish=bool(bullish),
                                   order_id=str(order_id) if order_id else None,
                                   position_id=str(position_id) if position_id else None)
            s.add(row)
            s.flush()
            return row.id
    except Exception as exc:
        log.warning(f"[trade_actions] could not create the row for {symbol}: {type(exc).__name__}: {exc}")
        return None


def set_message(aid: str, chat_id, message_id) -> None:
    """Where the message landed, so every answer is replied under it."""
    try:
        with get_session() as s:
            row = s.get(TradeActionModel, aid)
            if row is not None:
                row.chat_id, row.message_id = str(chat_id), int(message_id)
    except Exception as exc:
        log.warning(f"[trade_actions] could not store the message for {aid}: {type(exc).__name__}: {exc}")


def pending() -> list[dict]:
    """Every press the website server has recorded and nobody has acted on yet."""
    try:
        with get_session() as s:
            return [_as_dict(r) for r in s.query(TradeActionModel)
                    .filter(TradeActionModel.status == PENDING).all()]
    except Exception as exc:
        log.warning(f"[trade_actions] could not read pending presses: {type(exc).__name__}: {exc}")
        return []


def claim(aid: str) -> bool:
    """pending → working, atomically: only the caller that gets True acts, so one press is never two broker
    commands — not even across a restart (a row left `working` by a crash is never retried; its outcome is
    unknown, so it is not guessed)."""
    try:
        with get_session() as s:
            n = (s.query(TradeActionModel)
                  .filter(TradeActionModel.id == aid, TradeActionModel.status == PENDING)
                  .update({"status": WORKING, "updated_at": datetime.now(timezone.utc)},
                          synchronize_session=False))
            return n == 1
    except Exception as exc:
        log.warning(f"[trade_actions] could not claim {aid}: {type(exc).__name__}: {exc}")
        return False


def settle(aid: str, ok: bool, result: str) -> None:
    """working → done | failed, with what happened (the same words he was sent)."""
    try:
        with get_session() as s:
            row = s.get(TradeActionModel, aid)
            if row is not None:
                row.status, row.result = (DONE if ok else FAILED), result[:1000]
                row.updated_at = datetime.now(timezone.utc)
    except Exception as exc:
        log.warning(f"[trade_actions] could not settle {aid}: {type(exc).__name__}: {exc}")


def _as_dict(r: TradeActionModel) -> dict:
    return dict(id=r.id, order_id=r.order_id, position_id=r.position_id, symbol=r.symbol,
                bullish=bool(r.bullish), kind=r.kind, price=r.price, status=r.status,
                chat_id=r.chat_id, message_id=r.message_id)
