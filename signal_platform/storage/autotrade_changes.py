"""
What happened to an autotrade order AFTER it was placed — amended, or pulled before news.

Kept beside `autotrade_repo` and under the same contract: best-effort, never raises, every failure
logged at WARNING. Recording a change must never be able to stop the change.

WHY AN AMEND MUST BE RECORDED, and this is not bookkeeping (15 Nov 2026). Two parts of the platform
compare what the BROKER holds with what THIS TABLE holds:

  * `execution/canceller._levels_he_moved` — any difference reads as "he moved it by hand", and an
    order he moved is never withdrawn. An amend of ours left unrecorded would make every order the
    platform adjusted look like his, and a dead setup's order would sit at the broker for 24 hours.
  * the fill match (`execution/liveness.fill_matches`) recognises a fill by its SIZE. An order whose
    size we cut and did not record would fill unrecognised: no fill report, no one-trade guard.
"""
import logging
from datetime import datetime, timedelta, timezone

from storage.autotrade_models import AutotradeOrderModel, STATUS_CANCELLED, STATUS_NEWS_PULLED
from storage.db import get_session

log = logging.getLogger(__name__)


def _row(s, order_id: str):
    return (s.query(AutotradeOrderModel)
             .filter(AutotradeOrderModel.order_id == str(order_id))
             .order_by(AutotradeOrderModel.placed_at.desc()).first())


def record_amended(order_id: str, *, lots: float, volume: int, stop_pips: float,
                   entry: float | None = None, stop: float | None = None,
                   spread_used: float | None = None) -> bool:
    """Store the size (always) and the levels (only when WE moved them) after an amend.

    Levels HE moved are deliberately NOT written here: the difference between his number and ours is
    how the canceller knows the order is his (`_levels_he_moved`), and erasing it would get his
    edited order withdrawn. Pass `entry`/`stop` only for a move the platform made itself.
    """
    try:
        with get_session() as s:
            row = _row(s, order_id)
            if row is None:
                return False
            row.lots, row.volume, row.stop_pips = lots, int(volume), stop_pips
            if entry is not None:
                row.entry_price = entry
            if stop is not None:
                row.stop_loss = stop
            if spread_used is not None:
                row.spread_used = spread_used
            return True
    except Exception as exc:
        log.warning(f"[autotrade_changes] could not record the amend of {order_id}: "
                    f"{type(exc).__name__}: {exc}")
        return False


def set_status(order_id: str, status: str) -> None:
    """Mark an order pulled for news, or close the pull once it has been dealt with."""
    try:
        with get_session() as s:
            row = _row(s, order_id)
            if row is not None:
                row.status = status
    except Exception as exc:
        log.warning(f"[autotrade_changes] could not set {order_id} to {status}: "
                    f"{type(exc).__name__}: {exc}")


def news_pulled(hours: int = 24) -> list[dict]:
    """Orders pulled before a release and not yet put back or given up. Read at boot only."""
    out: list[dict] = []
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        with get_session() as s:
            for r in (s.query(AutotradeOrderModel)
                       .filter(AutotradeOrderModel.status == STATUS_NEWS_PULLED,
                               AutotradeOrderModel.placed_at >= cutoff).all()):
                out.append(dict(order_id=r.order_id, signal_id=r.signal_id, symbol=r.symbol,
                                side=r.side))
    except Exception as exc:
        log.warning(f"[autotrade_changes] could not read pulled orders: {type(exc).__name__}: {exc}")
    return out


__all__ = ["record_amended", "set_status", "news_pulled", "STATUS_NEWS_PULLED", "STATUS_CANCELLED"]
