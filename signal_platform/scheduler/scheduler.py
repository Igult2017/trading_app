"""
APScheduler setup — session-aware scan frequency.
Three jobs:
  1. scan_markets()             — dynamic interval driven by active sessions
  2. monitor.check_all()        — signals, fixed every 30s
  3. position_tracker.check_all() — HIS OPEN TRADES, every 2s (see the note on that job)
Session-open notifications are event-driven inside scan_markets(), not cron-based.
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger(__name__)
_scheduler: AsyncIOScheduler | None = None


def build(scan_fn, monitor_fn, tracker_fn=None) -> AsyncIOScheduler:
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

    # ── POSITION TRACKER — ITS OWN CLOCK, AND THIS IS THE POINT OF THE CHANGE ────────────────────
    #
    # HIS QUESTION, 2026-09-06: *"how did we make position tracker per 30 secs instead of per sec? I
    # think position tracker should be faster because we need to move position faster."*
    #
    # NOBODY EVER DECIDED 30 SECONDS FOR IT. It had no schedule at all — it ran as the last step
    # INSIDE the signal monitor's job (`signal_monitor.py`), so it inherited that job's 30s. The
    # reason written there was about SIGNALS — *"a position's R has to be watched at the same cadence
    # as a signal's TP/SL"* — and it was true when this was the ONLY thing moving stops. The
    # half-second watcher arrived later, the tracker became the safety net, and its clock was never
    # revisited. He is right that a stop-mover has no business running on the signal poller's tick.
    #
    # TWO SECONDS COSTS NOTHING NOW. It reads prices from memory (the pushed tick book, see
    # `position_tracker._price_now`) and the position list from `monitor/position_book`, which is
    # shared with the fast watcher and refreshed on its own slow timer. Before those two changes this
    # interval would have meant a broker request every two seconds; now it means none.
    #
    # IT MUST STAY A NET, NOT A COPY. It keeps its OWN price fallback chain, so a dead stream cannot
    # blind both paths at once, and the DB-backed `delivery_ledger` already makes it impossible for
    # the two to act on the same rung twice.
    if tracker_fn is not None:
        _scheduler.add_job(
            tracker_fn,
            trigger=IntervalTrigger(seconds=2),
            id="position_tracker",
            name="Position tracker",
            max_instances=1,       # never overlap — a slow pass skips a tick rather than stacking
            coalesce=True,
        )

    # Monthly reset — the signal board carries ONE MONTH and starts fresh on the 1st (user's rule,
    # 2026-08-22: "let the signals expire at the end of every month"; it was weekly before that).
    # 00:05 rather than 00:00 UTC so it lands just after the boundary, never a hair before it.
    _scheduler.add_job(
        _monthly_reset,
        trigger=CronTrigger(day=1, hour=0, minute=5, timezone="UTC"),
        id="monthly_signal_reset",
        name="Monthly signal reset",
        max_instances=1,
        coalesce=True,     # a missed 1st fires once on resume, not once per missed month
    )

    # Abandoned setups — hourly. A watch that stopped refreshing, or a stop order that was
    # cancelled before it filled, never became a trade and is dropped rather than shown.
    _scheduler.add_job(
        _drop_abandoned,
        trigger=IntervalTrigger(hours=1),
        id="drop_abandoned_setups",
        name="Drop setups with no entry",
        max_instances=1,
        coalesce=True,
    )

    # AND once at boot. A container that is down across the 1st would otherwise sail past it and
    # carry two months on the board. `purge_before_month_start` is idempotent — it deletes by an
    # absolute cutoff, so running it twice in the same month is a no-op the second time.
    _monthly_reset_on_boot(_scheduler)

    log.info("[scheduler] built — scan every 60s, monitor every 30s, monthly reset 1st 00:05 UTC")
    return _scheduler


async def _monthly_reset() -> None:
    """Drop signals from before the 1st of this month. Never allowed to kill the scheduler."""
    import asyncio
    from storage import signal_repo
    try:
        n = await asyncio.get_running_loop().run_in_executor(
            None, signal_repo.purge_before_month_start)
        log.info(f"[scheduler] monthly reset done — {n} signal(s) purged")
    except Exception as exc:
        log.error(f"[scheduler] monthly reset FAILED ({type(exc).__name__}: {exc})")


async def _drop_abandoned() -> None:
    """Remove setups that never produced an entry — stale watches and cancelled stop orders.

    Hourly rather than daily: a setup that stopped being watched should leave the board promptly,
    not sit there implying the system is still tracking it.
    """
    import asyncio
    from storage import signal_repo
    try:
        n = await asyncio.get_running_loop().run_in_executor(None, signal_repo.drop_abandoned)
        if n:
            log.info(f"[scheduler] dropped {n} setup(s) with no entry")
    except Exception as exc:
        log.error(f"[scheduler] drop_abandoned FAILED ({type(exc).__name__}: {exc})")


def _monthly_reset_on_boot(sched: AsyncIOScheduler) -> None:
    """Run the reset shortly after start-up, once."""
    from datetime import datetime, timedelta, timezone
    sched.add_job(
        _monthly_reset,
        trigger="date",
        run_date=datetime.now(timezone.utc) + timedelta(seconds=20),   # let the DB settle first
        id="monthly_signal_reset_boot",
        name="Monthly signal reset (boot)",
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
