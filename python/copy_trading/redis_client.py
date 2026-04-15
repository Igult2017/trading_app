"""
Shared Redis client — used by both producer and consumer so they share the
same in-process fake server when a real Redis server is unavailable.

When REDIS_HOST points to a reachable Redis instance the real client is used.
When it is unreachable (e.g. local dev without Docker) fakeredis provides a
fully-compatible in-process fallback so the queue still works within one
process.  For production / multi-worker deployments, run a real Redis server.
"""
import logging
import redis
from .config import REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD

log = logging.getLogger(__name__)

_client: redis.Redis | None = None
_fake_server = None


def get_client() -> redis.Redis:
    global _client, _fake_server
    if _client is not None:
        return _client

    try:
        r: redis.Redis = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            password=REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        r.ping()
        _client = r
        log.info("[Redis] Connected to real Redis at %s:%d", REDIS_HOST, REDIS_PORT)
    except Exception as e:
        log.warning(
            "[Redis] Cannot reach Redis server (%s) — falling back to "
            "in-process queue (fakeredis). This is fine for development. "
            "For production with multiple workers, run a real Redis server.",
            e,
        )
        try:
            import fakeredis
            if _fake_server is None:
                _fake_server = fakeredis.FakeServer()
            _client = fakeredis.FakeRedis(server=_fake_server, decode_responses=True)
            log.info("[Redis] In-process fallback queue ready")
        except ImportError:
            raise RuntimeError(
                "Redis server unreachable and fakeredis is not installed. "
                "Install fakeredis (`pip install fakeredis`) or start a Redis server."
            )

    return _client
