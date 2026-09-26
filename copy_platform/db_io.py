"""EVERY DATABASE CALL, OFF THE EVENT LOOP.

THE DEFECT THIS EXISTS FOR, measured 2026-09-26 while auditing the copy engine for many users. The
engine is asyncio. SQLAlchemy and psycopg2 are SYNCHRONOUS. There was not one `run_in_executor` or
`to_thread` anywhere in `copy_platform/`, so every `with Session()` stopped the whole engine while it
ran: the master's socket was not read, no other follower progressed, the heartbeat did not tick.

One copied trade costs 5-8 database round trips PER FOLLOWER. At 50 followers that is 250-400
blocking trips, one after another, on a single thread. **Adding CPU, RAM or workers does not help a
thread that is stopped** — which is exactly the ceiling his instruction was about: *"the only limit
is resources which is hosting."*

WHY A DEDICATED THREAD POOL AND NOT PLAIN `asyncio.to_thread`. `to_thread` uses the interpreter's
default executor, sized `min(32, cpu_count + 4)` — six threads on a two-core box. That silently
becomes the new ceiling, and it is invisible: the symptom is "copies are slow", not an error. The
pool here is sized from the same setting as the database pool, because one thread is what holds one
connection, and having more threads than connections just moves the queue.

THE FUNCTIONS HANDED TO `run_db` MUST OPEN THEIR OWN SESSION. A `Session` is not thread-safe and
must never be shared across the boundary; every caller here already uses `with Session() as db:`
inside the function, so the session is created, used and closed entirely inside the worker thread.
`expire_on_commit=False` (see `db.py`) is what lets the returned rows still be read afterwards.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from config import COPY_DB_POOL

log = logging.getLogger("copy.db_io")

# One thread per database connection in the pool, and no more: a thread without a connection just
# waits on the pool, which is the same queue one layer up with a worse error message.
_pool = ThreadPoolExecutor(max_workers=COPY_DB_POOL, thread_name_prefix="copy-db")


async def run_db(fn, *args, **kwargs):
    """Run a blocking database function in a worker thread. Awaitable, never blocks the loop.

    `fn` must open and close its own `Session`. Its return value is handed back unchanged.
    """
    loop = asyncio.get_running_loop()
    if kwargs:
        return await loop.run_in_executor(_pool, lambda: fn(*args, **kwargs))
    return await loop.run_in_executor(_pool, fn, *args)


def shutdown() -> None:
    """Let in-flight database work finish on the way down — a half-written follower row is worse
    than a slow shutdown."""
    _pool.shutdown(wait=True)
