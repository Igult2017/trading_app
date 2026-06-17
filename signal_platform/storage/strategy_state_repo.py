"""
Strategy-state CRUD — load/save a strategy's persistent dedup memory as JSON.

Keyed by strategy id. Used so a redeploy does not wipe a strategy's in-memory
alert state and re-fire setups it already alerted on.
"""

import logging
from datetime import datetime, timezone

from storage.db import get_session
from storage.models import StrategyStateModel

log = logging.getLogger(__name__)


def load(strategy_id: str) -> dict | None:
    """Return the persisted state dict for a strategy, or None if none saved."""
    with get_session() as s:
        row = s.get(StrategyStateModel, strategy_id)
        return dict(row.state) if row and row.state else None


def save(strategy_id: str, state: dict) -> None:
    """Upsert a strategy's state blob (get-or-create; single writer per id)."""
    with get_session() as s:
        row = s.get(StrategyStateModel, strategy_id)
        if row is None:
            s.add(StrategyStateModel(
                strategy_id=strategy_id,
                state=state,
                updated_at=datetime.now(timezone.utc),
            ))
        else:
            row.state = state
            row.updated_at = datetime.now(timezone.utc)
