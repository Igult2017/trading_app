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
from apscheduler.triggers.cron import CronTrigger

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

    # Weekly reset — the signal board carries ONE WEEK and starts fresh every Monday (user's rule).
    # 00:05 rather than 00:00 UTC so it lands just after the boundary, never a hair before it.
    _scheduler.add_job(
        _weekly_reset,
        trigger=CronTrigger(day_of_week="mon", hour=0, minute=5, timezone="UTC"),
        id="weekly_signal_reset",
        name="Weekly signal reset",
        max_instances=1,
        coalesce=True,     # a missed Monday fires once on resume, not once per missed week
    )

    # AND once at boot. A container that restarts over a weekend would otherwise sail past its
    # Monday and carry two weeks on the board. `purge_before_week_start` is idempotent — it deletes
    # by an absolute cutoff, so running it twice on the same Monday is a no-op the second time.
    _weekly_reset_on_boot(_scheduler)

    log.info("[scheduler] built — scan every 60s, monitor every 30s, weekly reset Mon 00:05 UTC")
    return _scheduler


async def _weekly_reset() -> None:
    """Drop signals from before this week's Monday. Never allowed to kill the scheduler."""
    import asyncio
    from storage import signal_repo
    try:
        n = await asyncio.get_running_loop().run_in_executor(
            None, signal_repo.purge_before_week_start)
        log.info(f"[scheduler] weekly reset done — {n} signal(s) purged")
    except Exception as exc:
        log.error(f"[scheduler] weekly reset FAILED ({type(exc).__name__}: {exc})")


def _weekly_reset_on_boot(sched: AsyncIOScheduler) -> None:
    """Run the reset shortly after start-up, once."""
    from datetime import datetime, timedelta, timezone
    sched.add_job(
        _weekly_reset,
        trigger="date",
        run_date=datetime.now(timezone.utc) + timedelta(seconds=20),   # let the DB settle first
        id="weekly_signal_reset_boot",
        name="Weekly signal reset (boot)",
    )


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
