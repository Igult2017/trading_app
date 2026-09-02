"""
Reads and writes the durable record of what autotrade placed.

EVERY FUNCTION HERE IS BEST-EFFORT AND NEVER RAISES — the same contract as `observability_repo`, and
for the same reason: **recording that we placed an order must never be able to stop us placing one.**
A database hiccup writing the audit row would otherwise turn a good order into a failed one, which is
exactly the wrong trade.

It will not fail SILENTLY though. Every failure logs at WARNING; silent `except` blocks are what made
27 Jul undiagnosable and what made 02 Sep cost four deploys.
"""

import logging
from datetime import datetime, timezone

from storage.autotrade_models import (
    AutotradeOrderModel, STATUS_CANCELLED, STATUS_FILLED, STATUS_PLACED, STATUS_REJECTED,
)
from storage.db import get_session

log = logging.getLogger(__name__)

__all__ = ["record_placed", "record_filled", "record_closed", "pending", "intent_for",
           "STATUS_PLACED", "STATUS_FILLED", "STATUS_CANCELLED", "STATUS_REJECTED"]


def record_placed(order_id: str, *, symbol: str, side: str, entry: float | None,
                  stop: float | None, target: float | None, lots: float | None,
                  volume: int | None, stop_pips: float | None,
                  strategy: str | None = None, signal_id: str | None = None) -> None:
    """Store what was sent to the broker, and what it was meant to be."""
    try:
        with get_session() as s:
            s.add(AutotradeOrderModel(
                order_id=str(order_id), signal_id=signal_id, strategy=strategy,
                symbol=symbol, side=side, entry_price=entry, stop_loss=stop,
                take_profit=target, lots=lots, volume=volume, stop_pips=stop_pips,
                status=STATUS_PLACED))
    except Exception as exc:
        log.warning(f"[autotrade_repo] could not persist order {order_id}: "
                    f"{type(exc).__name__}: {exc} — the ORDER is unaffected")


def record_filled(order_id: str, fill_price: float,
                  filled_at: datetime | None = None) -> None:
    """Stamp the fill. Leaves the intended levels untouched — they are the record of the plan."""
    try:
        with get_session() as s:
            row = (s.query(AutotradeOrderModel)
                    .filter(AutotradeOrderModel.order_id == str(order_id))
                    .order_by(AutotradeOrderModel.placed_at.desc()).first())
            if not row:
                return
            row.fill_price = fill_price
            row.filled_at = filled_at or datetime.now(timezone.utc)
            row.status = STATUS_FILLED
    except Exception as exc:
        log.warning(f"[autotrade_repo] could not stamp the fill for {order_id}: "
                    f"{type(exc).__name__}: {exc}")


def record_closed(order_id: str, status: str) -> None:
    """Mark an order that never became a position — cancelled or refused."""
    try:
        with get_session() as s:
            row = (s.query(AutotradeOrderModel)
                    .filter(AutotradeOrderModel.order_id == str(order_id))
                    .order_by(AutotradeOrderModel.placed_at.desc()).first())
            if row:
                row.status = status
    except Exception as exc:
        log.warning(f"[autotrade_repo] could not close {order_id}: {type(exc).__name__}: {exc}")


def pending() -> dict[str, dict]:
    """Orders placed and not yet filled — SURVIVING A RESTART, which the old dict did not.

    This is what `fill_watch` iterates. Before, it read an in-memory dict, so a redeploy between
    placing an order and its fill meant the fill report never arrived and nothing said why.
    """
    out: dict[str, dict] = {}
    try:
        with get_session() as s:
            rows = (s.query(AutotradeOrderModel)
                     .filter(AutotradeOrderModel.status == STATUS_PLACED)
                     .order_by(AutotradeOrderModel.placed_at.desc()).limit(200).all())
            for r in rows:
                out[r.order_id] = _as_intent(r)
    except Exception as exc:
        log.warning(f"[autotrade_repo] could not read pending orders: {type(exc).__name__}: {exc}")
    return out


def intent_for(order_id: str) -> dict | None:
    """What one order was meant to be — for the fill report, after any restart."""
    try:
        with get_session() as s:
            row = (s.query(AutotradeOrderModel)
                    .filter(AutotradeOrderModel.order_id == str(order_id))
                    .order_by(AutotradeOrderModel.placed_at.desc()).first())
            return _as_intent(row) if row else None
    except Exception as exc:
        log.warning(f"[autotrade_repo] could not read order {order_id}: "
                    f"{type(exc).__name__}: {exc}")
        return None


def _as_intent(r: AutotradeOrderModel) -> dict:
    """The same shape `placer._intent` used, so callers did not have to change."""
    f = lambda v: float(v) if v is not None else None      # noqa: E731 — Numeric -> float
    return dict(symbol=r.symbol, side=r.side, entry=f(r.entry_price), sl=f(r.stop_loss),
                tp=f(r.take_profit), lots=f(r.lots), volume=r.volume,
                stop_pips=f(r.stop_pips) or 0.0, placed_at=r.placed_at,
                strategy=r.strategy or "")
