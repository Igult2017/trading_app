"""
Shared asyncio lock for the single MT5 terminal (Path B).

One MT5 terminal can only be logged into one account at a time.
Every component that touches the terminal (monitor polling, trade
execution) must acquire this lock before calling mt5linux APIs.
"""
import asyncio

_lock: asyncio.Lock | None = None


def get_mt5_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock
