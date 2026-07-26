"""
Signal CRUD — four functions, no business logic.
All decisions about what to store are made in the orchestrator or monitor.
"""

import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, and_
from sqlalchemy.exc import IntegrityError
from core.types import Signal, SignalStatus
from storage.db import get_session
from storage.models import SignalModel

log = logging.getLogger(__name__)


def save(signal: Signal) -> str:
    """Persist a new signal. Returns the generated ID, or '' on duplicate."""
    with get_session() as s:
        row = SignalModel(
            symbol=signal.symbol,
            asset_class=signal.asset_class,
            type=signal.direction.value,
            strategy=signal.strategy_id,
            entry_price=signal.entry_price or None,
            stop_loss=signal.stop_loss or None,
            take_profit=signal.take_profit or None,
            risk_reward=signal.risk_reward or None,
            primary_tf=signal.primary_timeframe,
            confidence=int(signal.confidence * 100),
            smc_factors=signal.smc_factors,
            technical_reasons=signal.technical_reasons,
            market_context=signal.market_context,
            trend_direction=signal.direction.value,
            status=signal.status.value,
            expires_at=signal.expires_at,
            created_at=signal.created_at,
            updated_at=signal.created_at,
        )
        s.add(row)
        try:
            s.flush()
        except IntegrityError:
            log.warning(f"[signal_repo] duplicate signal for {signal.symbol} — skipped")
            return ""
        log.info(f"[signal_repo] saved signal {row.id} for {signal.symbol}")
        return row.id


def get_active() -> list[SignalModel]:
    """Return all signals currently in 'active' status."""
    with get_session() as s:
        return s.query(SignalModel).filter(
            SignalModel.status == "active"
        ).all()


def update_status(signal_id: str, status: SignalStatus,
                  timestamp_field: str | None = None) -> None:
    """Update the status of a signal and optionally stamp a timestamp field."""
    with get_session() as s:
        row = s.get(SignalModel, signal_id)
        if not row:
            return
        row.status = status.value
        if timestamp_field:
            setattr(row, timestamp_field, datetime.now(timezone.utc))


def mark_triggered(signal_id: str, when: datetime | None = None) -> None:
    """Stamp the moment the ENTRY actually filled. Status stays 'active' — the card is live either
    way; triggered_at is what separates an open POSITION (TP/SL outcomes are real) from a pending
    stop ORDER (nothing has been won or lost yet).

    `when` is the time of the BAR the fill happened on, not the time we noticed it. The monitor
    replays candles from this timestamp forward, so a `now()` stamp would silently skip every bar
    between the real fill and the poll that spotted it — which is the whole class of bug the replay
    exists to remove. Defaults to now() for callers with no bar to point at.

    Idempotent: an already-triggered row is left alone, so re-running the replay over the same
    window cannot move the fill time.
    """
    with get_session() as s:
        row = s.get(SignalModel, signal_id)
        if row and row.triggered_at is None:
            row.triggered_at = when or datetime.now(timezone.utc)


def cancel_active(strategy: str, symbol: str, direction: str) -> int:
    """Expire the still-PENDING active signal(s) a strategy has retracted (setup invalidated before
    the entry filled). EXPIRED, not INVALIDATED: invalidated is a real SL loss; a retracted setup
    never opened a trade and must not be scored as one. Rows already triggered are left alone —
    the monitor owns a live position. Returns the count cancelled."""
    with get_session() as s:
        rows = s.query(SignalModel).filter(
            SignalModel.status == "active",
            SignalModel.strategy == strategy,
            SignalModel.symbol == symbol,
            SignalModel.type == direction,
            SignalModel.triggered_at.is_(None),
        ).all()
        for row in rows:
            row.status = SignalStatus.EXPIRED.value
            row.invalidated_at = datetime.now(timezone.utc)
        if rows:
            log.info(f"[signal_repo] cancelled {len(rows)} retracted pending signal(s) "
                     f"{strategy}/{symbol}/{direction}")
        return len(rows)


def expire_stale(older_than_hours: int = 24) -> list[tuple[str, str, str]]:
    """Mark expired signals; returns (symbol, type, strategy) per expired row so the CALLER can
    free the in-memory dedup reservations. Without that release an expired signal held its
    strategy:symbol:direction key for the whole process lifetime, silently muting the strategy
    for that pair+direction until a restart (guaranteed for any Friday-evening signal — the
    weekend passes, nothing touches TP/SL, the 24h cap expires it).

    Honours each signal's own expires_at when set (e.g. a 4h intraday setup);
    falls back to created_at + older_than_hours as a blanket cap when expires_at
    is null."""
    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=older_than_hours)
    with get_session() as s:
        rows = s.query(SignalModel).filter(
            SignalModel.status == "active",
            or_(
                SignalModel.expires_at < now,
                and_(SignalModel.expires_at.is_(None), SignalModel.created_at < cutoff),
            ),
        ).all()
        freed = [(row.symbol, row.type, row.strategy or "") for row in rows]
        for row in rows:
            row.status = SignalStatus.EXPIRED.value
        if rows:
            log.info(f"[signal_repo] expired {len(rows)} stale signals")
        return freed
        return len(rows)
