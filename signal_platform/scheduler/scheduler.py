"""
APScheduler setup — session-aware scan frequency.
Two jobs:
  1. scan_markets()    — dynamic interval driven by active sessions
  2. monitor.check_all() — fixed every 30s
Session-open notifications are event-driven inside scan_markets(), not cron-based.
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

log = logging.getLogger(__name__)
_scheduler: AsyncIOScheduler | None = None


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

    log.info("[scheduler] built — scan every 60s, monitor every 30s")
    return _scheduler


def set_scan_interval(seconds: int) -> None:
    """
    Reschedule the scan job to a new interval (session-aware cadence).
    Called by the scanner each tick when the desired interval changes.
    APScheduler resets next_run_time relative to now.
    """
    if _scheduler and _scheduler.get_job("scan_markets"):
        _scheduler.reschedule_job("scan_markets", trigger=IntervalTrigger(seconds=seconds))
        log.info(f"[scheduler] scan interval → {seconds}s")


def start() -> None:
    if _scheduler:
        _scheduler.start()
        log.info("[scheduler] started")


def shutdown() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("[scheduler] stopped")
