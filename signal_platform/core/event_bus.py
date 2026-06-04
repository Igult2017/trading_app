"""
Asyncio pub/sub event bus — module-level singleton.
Producers call emit(); consumers call subscribe().
No direct imports between layers — everything flows through here.
"""

from __future__ import annotations
import asyncio
import logging
from collections import defaultdict
from typing import Any, Callable, Coroutine

log = logging.getLogger(__name__)

# Event name → list of async handlers
_subscribers: dict[str, list[Callable[..., Coroutine]]] = defaultdict(list)


def subscribe(event: str, handler: Callable[..., Coroutine]) -> None:
    """Register an async handler for an event."""
    _subscribers[event].append(handler)
    log.debug(f"[event_bus] subscribed {handler.__name__} to '{event}'")


async def emit(event: str, payload: Any = None) -> None:
    """Fire all handlers registered for this event (concurrently)."""
    handlers = _subscribers.get(event, [])
    if not handlers:
        return
    results = await asyncio.gather(
        *[h(payload) for h in handlers],
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, Exception):
            log.error(f"[event_bus] handler error on '{event}': {r}")


# ── Canonical event names ──────────────────────────────────────────────────────
SIGNAL_PENDING   = "signal_pending"    # storage watchlist
SIGNAL_CONFIRMED = "signal_confirmed"  # storage + notifications + monitor
SIGNAL_CLOSED    = "signal_closed"     # storage final status
