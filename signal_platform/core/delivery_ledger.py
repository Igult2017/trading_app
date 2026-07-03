"""
Delivery ledger — a process-wide, DB-backed set of alert dedup-keys that have been CONFIRMED sent.

Makes DM alerts AT-LEAST-ONCE. A producer (e.g. BX-S/D's zone reports) checks `is_delivered(key)`
before emitting and stamps the key onto the Signal; the dispatcher calls `mark_delivered(key)` ONLY
after a successful Telegram send. So a send that fails all retries — or a crash before the send —
leaves the key uncommitted, and the producer re-emits on the next scan instead of losing it forever.

Backed by FiredRegistry (same strategy_state persistence + graceful in-memory fallback if the DB is
down), under a dedicated id so it never collides with a strategy's own fired keys.
"""
from core.fired_registry import FiredRegistry

_ledger = FiredRegistry("alert_delivery")


def is_delivered(key: str) -> bool:
    return _ledger.has(key)


def mark_delivered(key: str) -> None:
    _ledger.add(key)


def cleanup(ttl_seconds: int) -> None:
    _ledger.cleanup(ttl_seconds)
