"""
Redis queue producer.
Receives a NormalisedSignal from any signal source and pushes it to the
Redis queue so workers can consume it asynchronously.
"""
import redis
import logging
from ..models import NormalisedSignal
from ..config import REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD, TRADE_QUEUE_KEY

log = logging.getLogger(__name__)
_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.Redis(
            host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB,
            password=REDIS_PASSWORD, decode_responses=True,
        )
        log.info("[Producer] Redis connected at %s:%s", REDIS_HOST, REDIS_PORT)
    return _redis


def enqueue(signal: NormalisedSignal) -> None:
    """Push a normalised signal onto the left end of the Redis list (LPUSH)."""
    r = get_redis()
    r.lpush(TRADE_QUEUE_KEY, signal.to_json())
    log.info(
        "[Producer] Queued %s %s %s (master=%s trade=%s)",
        signal.event_type, signal.action, signal.symbol,
        signal.master_id, signal.trade_id,
    )


def queue_depth() -> int:
    return get_redis().llen(TRADE_QUEUE_KEY)
