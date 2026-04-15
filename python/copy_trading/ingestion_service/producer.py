"""
Redis queue producer.
Receives a NormalisedSignal from any signal source and pushes it to the
Redis queue so workers can consume it asynchronously.

Uses the shared redis_client module so both producer and consumer operate
on the same Redis instance (real or in-process fallback).
"""
import logging
from ..models import NormalisedSignal
from ..config import TRADE_QUEUE_KEY
from ..redis_client import get_client

log = logging.getLogger(__name__)


def enqueue(signal: NormalisedSignal) -> None:
    """Push a normalised signal onto the left end of the Redis list (LPUSH)."""
    r = get_client()
    r.lpush(TRADE_QUEUE_KEY, signal.to_json())
    log.info(
        "[Producer] Queued %s %s %s (master=%s trade=%s)",
        signal.event_type, signal.action, signal.symbol,
        signal.master_id, signal.trade_id,
    )


def queue_depth() -> int:
    return get_client().llen(TRADE_QUEUE_KEY)
