"""
APScheduler setup — session-aware scan frequency.
Three job types:
  1. scan_markets()    — dynamic interval driven by active sessions
  2. monitor.check_all() — fixed every 30s
  3. session_open notifications — CronTrigger per major session
"""

import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from core import event_bus
from scheduler.session_windows import is_market_open

log = logging.getLogger(__name__)
_scheduler: AsyncIOScheduler | None = None


def _make_session_job(name: str):
    """Factory returning an async job that emits SESSION_OPEN for the named session."""
    async def _job():
        if is_market_open(datetime.now(timezone.utc)):
            await event_bus.emit(event_bus.SESSION_OPEN, name)
    _job.__name__ = f"session_open_{name.lower()}"
    return _job


def build(scan_fn, monitor_fn) -> AsyncIOScheduler:
    """
    Create and return a configured scheduler.
    scan_fn and monitor_fn are coroutines injected by main.py
    to avoid circular imports.
    """
    global _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")

    # Scan job — starts at 60s; scanner adjusts dynamically each tick
    _scheduler.add_job(
        scan_fn,
        trigger=IntervalTrigger(seconds=60),
        id="scan_markets",
        name="Market scanner",
        max_instances=1,       # never overlap; skip tick if still running
        coalesce=True,
    )

    # Signal monitor — fixed every 30s
    _scheduler.add_job(
        monitor_fn,
        trigger=IntervalTrigger(seconds=30),
        id="signal_monitor",
        name="Signal monitor",
        max_instances=1,
        coalesce=True,
    )

    # Session-open notifications — CronTrigger at each session's UTC open
    # Sydney (Asian): 22:00 UTC Sun–Thu (Mon–Fri Sydney morning)
    _scheduler.add_job(
        _make_session_job("SYDNEY"),
        trigger=CronTrigger(hour=22, minute=0, day_of_week="sun,mon,tue,wed,thu", timezone="UTC"),
        id="session_open_sydney",
        name="Sydney session open",
        max_instances=1,
    )
    # Tokyo: 00:00 UTC Mon–Fri
    _scheduler.add_job(
        _make_session_job("TOKYO"),
        trigger=CronTrigger(hour=0, minute=0, day_of_week="mon,tue,wed,thu,fri", timezone="UTC"),
        id="session_open_tokyo",
        name="Tokyo session open",
        max_instances=1,
    )
    # London: 07:00 UTC Mon–Fri
    _scheduler.add_job(
        _make_session_job("LONDON"),
        trigger=CronTrigger(hour=7, minute=0, day_of_week="mon,tue,wed,thu,fri", timezone="UTC"),
        id="session_open_london",
        name="London session open",
        max_instances=1,
    )
    # New York: 12:00 UTC Mon–Fri
    _scheduler.add_job(
        _make_session_job("NEW_YORK"),
        trigger=CronTrigger(hour=12, minute=0, day_of_week="mon,tue,wed,thu,fri", timezone="UTC"),
        id="session_open_new_york",
        name="New York session open",
        max_instances=1,
    )

    log.info("[scheduler] built — scan 60s, monitor 30s, session opens: Sydney/Tokyo/London/NY")
    return _scheduler


def start() -> None:
    if _scheduler:
        _scheduler.start()
        log.info("[scheduler] started")


def shutdown() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("[scheduler] stopped")
