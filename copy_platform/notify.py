"""
Postgres LISTEN/NOTIFY bridge — wakes the engine the instant a master/follower
changes (Node fires `pg_notify('copy_change', …)`), so a new provider starts in
~real time instead of waiting for the 60 s poll.

Fully defensive: if the listener connection can't be opened or later drops, we
log and fall back to the engine's 60 s poll — copying is never blocked.
"""
import logging

import psycopg2
import psycopg2.extensions

from config import DATABASE_URL

log = logging.getLogger("notify")

CHANNEL = "copy_change"


def start_listener(loop, on_change) -> None:
    """Open a dedicated LISTEN connection; call the async `on_change()` on each NOTIFY.
    Wired into the asyncio loop via add_reader so it never blocks the reactor."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute(f"LISTEN {CHANNEL};")
        log.info("[notify] listening on '%s'", CHANNEL)
    except Exception as e:
        log.warning("[notify] could not start listener (%s) — using 60s poll only", e)
        return

    def _on_readable():
        try:
            conn.poll()
            fired = False
            while conn.notifies:
                conn.notifies.pop(0)
                fired = True
            if fired:
                loop.create_task(on_change())
        except Exception as e:
            log.warning("[notify] listener dropped (%s) — using 60s poll only", e)
            try:
                loop.remove_reader(conn.fileno())
                conn.close()
            except Exception:
                pass

    loop.add_reader(conn.fileno(), _on_readable)
