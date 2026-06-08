"""
Signal CRUD — four functions, no business logic.
All decisions about what to store are made in the orchestrator or monitor.
"""

import logging
from datetime import datetime, timedelta, timezone
from core.types import Signal, SignalStatus
from storage.db import get_session
from storage.models import SignalModel

log = logging.getLogger(__name__)


def save(signal: Signal) -> str:
    """Persist a new signal. Returns the generated ID."""
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
        s.flush()
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


def expire_stale(older_than_hours: int = 24) -> int:
    """Mark expired signals and return the count updated."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
    with get_session() as s:
        rows = s.query(SignalModel).filter(
            SignalModel.status == "active",
            SignalModel.created_at < cutoff,
        ).all()
        for row in rows:
            row.status = SignalStatus.EXPIRED.value
        log.info(f"[signal_repo] expired {len(rows)} stale signals")
        return len(rows)
