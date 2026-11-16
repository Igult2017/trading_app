"""
Reads and writes the DM confirmations (`trade_confirmations`, 16 Nov 2026).

Same contract as `autotrade_repo`: best-effort, never raises, every failure logged at WARNING.
The website server writes his press (pending -> confirmed | rejected, `server/services/
tradeConfirmPress.ts`); everything else is written here.
"""
import logging
from datetime import datetime, timedelta, timezone

from storage.confirm_models import (CONFIRMED, EXPIRED, PENDING, PLACING, TEST_REQUESTED,
                                    TradeConfirmationModel)
from storage.db import get_session

log = logging.getLogger(__name__)


def create(*, signal_id, strategy, symbol, side, entry, stop, target, lots, spread_used) -> str | None:
    """A new PENDING offer. Returns its id, or None if it could not be saved (then nothing is sent)."""
    try:
        with get_session() as s:
            row = TradeConfirmationModel(signal_id=signal_id, strategy=strategy, symbol=symbol,
                                         side=side, entry_price=entry, stop_loss=stop,
                                         take_profit=target, lots=lots, spread_used=spread_used,
                                         status=PENDING)
            s.add(row)
            s.flush()
            return row.id
    except Exception as exc:
        log.warning(f"[confirm_repo] could not save the offer for {symbol}: {type(exc).__name__}: {exc}")
        return None


def set_message(cid: str, chat_id: str, message_id: int) -> None:
    try:
        with get_session() as s:
            row = s.get(TradeConfirmationModel, cid)
            if row is not None:
                row.chat_id, row.message_id = str(chat_id), int(message_id)
    except Exception as exc:
        log.warning(f"[confirm_repo] could not store the DM id for {cid}: {type(exc).__name__}: {exc}")


def confirmed() -> list[dict]:
    """Offers he has CONFIRMED and the engine has not yet acted on."""
    try:
        with get_session() as s:
            return [dict(id=r.id, signal_id=r.signal_id, symbol=r.symbol, side=r.side,
                         chat_id=r.chat_id, message_id=r.message_id, is_test=bool(r.is_test),
                         spread_used=float(r.spread_used) if r.spread_used is not None else 0.0)
                    for r in s.query(TradeConfirmationModel)
                    .filter(TradeConfirmationModel.status == CONFIRMED).limit(20).all()]
    except Exception as exc:
        log.warning(f"[confirm_repo] could not read confirmations: {type(exc).__name__}: {exc}")
        return []


def claim(cid: str) -> bool:
    """Take a confirmed offer to act on: `confirmed` -> `placing`, atomically. Only the caller that
    gets True may place it, so one press can never become two orders — not even across a restart
    (a row left `placing` by a crash is never retried; its outcome is unknown, so it is not guessed)."""
    try:
        with get_session() as s:
            n = (s.query(TradeConfirmationModel)
                  .filter(TradeConfirmationModel.id == cid, TradeConfirmationModel.status == CONFIRMED)
                  .update({"status": PLACING}, synchronize_session=False))
            return n == 1
    except Exception as exc:
        log.warning(f"[confirm_repo] could not claim {cid}: {type(exc).__name__}: {exc}")
        return False


def settle(cid: str, status: str, outcome: str) -> bool:
    """Record what happened to an offer this process CLAIMED (`placing` -> placed | refused | too_late).
    True if this call settled it."""
    try:
        with get_session() as s:
            n = (s.query(TradeConfirmationModel)
                  .filter(TradeConfirmationModel.id == cid, TradeConfirmationModel.status == PLACING)
                  .update({"status": status, "outcome": outcome[:500],
                           "settled_at": datetime.now(timezone.utc)}, synchronize_session=False))
            return n == 1
    except Exception as exc:
        log.warning(f"[confirm_repo] could not settle {cid}: {type(exc).__name__}: {exc}")
        return False


def expire_unanswered(hours: int = 24) -> int:
    """Offers never answered within `hours` are closed as EXPIRED. Nothing is sent — no answer means
    nothing happens, his rule; this only keeps the table honest."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        with get_session() as s:
            return (s.query(TradeConfirmationModel)
                     .filter(TradeConfirmationModel.status == PENDING,
                             TradeConfirmationModel.created_at < cutoff)
                     .update({"status": EXPIRED, "settled_at": datetime.now(timezone.utc),
                              "outcome": "never answered"}, synchronize_session=False))
    except Exception as exc:
        log.warning(f"[confirm_repo] could not expire old offers: {type(exc).__name__}: {exc}")
        return 0


def close_unsent(cid: str, outcome: str) -> None:
    """A PENDING offer whose card never reached him: closed, so a press can never match it."""
    from storage.confirm_models import UNSENT
    try:
        with get_session() as s:
            (s.query(TradeConfirmationModel)
              .filter(TradeConfirmationModel.id == cid, TradeConfirmationModel.status == PENDING)
              .update({"status": UNSENT, "outcome": outcome[:500],
                       "settled_at": datetime.now(timezone.utc)}, synchronize_session=False))
    except Exception as exc:
        log.warning(f"[confirm_repo] could not close unsent {cid}: {type(exc).__name__}: {exc}")


def test_requests() -> list[str]:
    """Test cards asked for on the admin page (written by the website server), not yet sent."""
    try:
        with get_session() as s:
            return [r.id for r in s.query(TradeConfirmationModel)
                    .filter(TradeConfirmationModel.status == TEST_REQUESTED,
                            TradeConfirmationModel.is_test.is_(True)).limit(5).all()]
    except Exception as exc:
        log.warning(f"[confirm_repo] could not read test requests: {type(exc).__name__}: {exc}")
        return []


def mark_test_sent(cid: str, chat_id: str, message_id: int | None) -> None:
    """The test card went out (now PENDING, waiting for his press) — or could not (UNSENT)."""
    from storage.confirm_models import UNSENT
    try:
        with get_session() as s:
            row = s.get(TradeConfirmationModel, cid)
            if row is None or row.status != TEST_REQUESTED:
                return
            if message_id:
                row.status, row.chat_id, row.message_id = PENDING, str(chat_id), int(message_id)
            else:
                row.status, row.outcome = UNSENT, "the test card could not be sent"
                row.settled_at = datetime.now(timezone.utc)
    except Exception as exc:
        log.warning(f"[confirm_repo] could not mark test {cid}: {type(exc).__name__}: {exc}")
