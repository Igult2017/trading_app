"""
scan_markets() — concurrent market scanner.

Tenant/house model:
  Each strategy (tenant) declares what it needs. The platform (house) resolves
  dependencies, fetches only the required TFs, builds a strategy-specific
  StrategyContext, and calls analyze(context). Strategies never fetch candles,
  import utilities, or call APIs directly.

  Shared TFs across strategies are served from the TTL cache — one network
  call, zero duplication even under full concurrency.
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from functools import partial

from core import strategy_registry, event_bus
from config.settings import settings
from data import candle_fetcher, instrument_filter
from news import news_fetcher
from scheduler.session_windows import get_current_sessions, scan_interval_seconds
from scheduler.scheduler import set_scan_interval
from orchestrator.strategy_runner import run_strategy

log = logging.getLogger(__name__)

_PORT = os.getenv("PORT", "5000")
_SESSIONS_URL = os.getenv("APP_BASE_URL", f"http://localhost:{_PORT}") + "/api/market-sessions"

# Tracks whether the scanner was active on the previous tick.
# SCAN_STARTED fires only on the closed→open transition, not every 60s tick.
_was_scanning: bool = False
# None until the first tick — lets us seed live sessions silently so a restart
# during London/NY does not re-emit SESSION_OPEN for already-open sessions.
_active_sessions: set[str] | None = None
_current_interval: int = 60   # mirrors the scheduler's initial scan interval


async def _fetch_active_sessions() -> set[str] | None:
    """
    Active sessions from the Sessions API (/api/market-sessions), as lowercase
    underscore names e.g. {"london", "new_york"}.

    Returns None when the API is unreachable. The caller then SKIPS session-open
    detection for that tick rather than seeding/diffing against the local
    taxonomy (which uses "asian" instead of "tokyo"/"sydney"). Mixing the two
    sources is what made a restart announce already-open sessions as "just
    opened" — so we deliberately use a single source and wait for it.
    """
    try:
        import requests as _req
        loop = asyncio.get_running_loop()
        data = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _req.get(_SESSIONS_URL, timeout=3).json()),
            timeout=4,
        )
        return {
            s["name"].lower().replace(" ", "_")
            for s in data.get("sessions", [])
            if s.get("isActive")
        }
    except Exception as exc:
        log.debug("[scanner] sessions API unavailable (%s) — skipping session-open detection this tick", exc)
        return None


def _is_paused() -> bool:
    paused = os.path.exists(settings.scan_pause_file)
    if paused:
        log.debug("[scanner] paused — delete .scan_paused to resume")
    return paused


async def _scan_instrument(
    instrument: str,
    strategies: list,
    news_context,
    current_sessions: list,
    tick_now: datetime,
) -> None:
    """Fan each strategy out independently — no shared state between tenants."""
    await asyncio.gather(
        *[run_strategy(s, instrument, news_context, current_sessions, tick_now)
          for s in strategies],
        return_exceptions=True,
    )


async def scan_markets() -> None:
    """Scheduled entry point. ALWAYS stamps the heartbeat, whatever the tick decides to do.

    THE HEARTBEAT MEANS "THIS LOOP IS ALIVE", NOT "A SCAN HAPPENED". Until 2026-08-22 the write sat
    at the end of the tick, past four legitimate early returns, so a closed market froze it for the
    whole weekend and the next boot reported the idle stretch as an outage. Full root cause and the
    false alert it sent: `docs/signal-platform-observability.md`.

    The write lives in a `finally` DELIBERATELY — patching each `return` works today and breaks at
    the next `return` someone adds, which is exactly how this broke the first time.
    """
    scanned, tick_ms = False, None
    try:
        scanned, tick_ms = await _run_tick()
    finally:
        # Best-effort by contract (observability_repo never raises), and in an executor because the
        # DB write is blocking. An idle tick still beats; it just does not claim to have scanned.
        from storage import observability_repo as obs
        await asyncio.get_running_loop().run_in_executor(
            None, partial(obs.beat, scanned, tick_ms))


async def _run_tick() -> tuple[bool, int | None]:
    """The tick itself. Returns (did_a_real_scan, tick_duration_ms) for the heartbeat above."""
    global _was_scanning, _active_sessions, _current_interval
    tick_now = datetime.now(timezone.utc)
    current_sessions = get_current_sessions(tick_now)

    # Dynamic cadence — faster scans during the London/NY overlap (higher vol).
    desired = scan_interval_seconds(tick_now)
    if desired != _current_interval:
        set_scan_interval(desired)
        _current_interval = desired

    if _is_paused():
        _was_scanning = False
        return False, None
    if not settings.scan_enabled:
        log.info("[scanner] SCAN_ENABLED=false — tick skipped, no signals will be produced")
        _was_scanning = False
        return False, None

    # Market-hours gate FIRST: when forex is closed (all Saturday, Sunday before
    # 22:00 UTC, Friday from 22:00 UTC) the whole tick is a no-op — no scanning,
    # no news fetch, and no session-open alerts. Nothing fires while closed.
    instruments = instrument_filter.get_open_instruments(tick_now)
    if not instruments:
        if _was_scanning:
            log.info("[scanner] market closed — scanning paused")
        _was_scanning = False
        return False, None

    # Session-open detection (market is open). Uses ONE source (the sessions API);
    # when it's unreachable (e.g. the first seconds after a restart, before Node is
    # up) we skip this tick rather than diff against a different taxonomy. The
    # first *real* reading seeds silently, so a restart never re-announces
    # already-open sessions.
    live = await _fetch_active_sessions()
    if live is not None:
        if _active_sessions is None:
            _active_sessions = live                       # seed silently on first real reading
        elif live != _active_sessions:
            for name in sorted(live - _active_sessions):
                await event_bus.emit(event_bus.SESSION_OPEN, name)
            _active_sessions = live

    log.info(f"[scanner] tick at {tick_now.strftime('%H:%M:%S UTC')}")

    news_context = await news_fetcher.fetch(tick_now)

    strategies = strategy_registry.get_enabled()
    if not strategies:
        # WARNING: zero strategies means the platform cannot produce a signal at all. That is the
        # single most important thing to know when nothing has arrived, and it was hidden at DEBUG.
        log.warning("[scanner] NO STRATEGIES REGISTERED — no signal can be produced this tick")
        _was_scanning = False
        return False, None

    # Fire SCAN_STARTED only on the closed→open transition — AND only once the
    # active session is established (sessions API reachable). After a restart we
    # hold the announcement until then, so it always names the accurate session
    # instead of going out session-less in the first seconds before Node is up.
    if not _was_scanning and _active_sessions is not None:
        await event_bus.emit(event_bus.SCAN_STARTED, {
            "instruments": instruments,
            "sessions":    sorted(_active_sessions),
            "tick_now":    tick_now.isoformat(),
        })
        _was_scanning = True

    log.info(f"[scanner] {len(instruments)} instruments × {len(strategies)} strategies")

    # Tell the bar-triggered scanner these are covered, so a 1M close landing moments from now does
    # not scan the same instrument twice. It scans SOONER, never MORE.
    from orchestrator.scan_on_demand import note_scheduled_scan
    note_scheduled_scan(instruments)

    # TIMED, PER INSTRUMENT AND OVERALL. Nothing measured how long a tick took, so a slow tick was
    # invisible and could only be inferred from the spacing of other rows — which is exactly how a
    # "174-second tick" got asserted on evidence that could not support it. `_timed` costs one
    # `perf_counter` per instrument and turns that into a fact.
    t0 = time.perf_counter()
    per_instrument: dict[str, float] = {}

    async def _timed(inst):
        started = time.perf_counter()
        try:
            return await _scan_instrument(inst, strategies, news_context, current_sessions, tick_now)
        finally:
            # `finally`, so an instrument that RAISED is still timed. A scan that blows up after two
            # minutes is precisely the one worth seeing, and it is the one a success-path timer misses.
            per_instrument[inst] = time.perf_counter() - started

    results = await asyncio.gather(*[_timed(inst) for inst in instruments],
                                   return_exceptions=True)
    tick_s = time.perf_counter() - t0
    # SAME BUG THE MONITOR HAD (fixed 2026-07-27): `return_exceptions=True` with the results thrown
    # away means an instrument whose scan raised is skipped in total silence — the tick still logs
    # "complete". An instrument can stop producing signals indefinitely with nothing to show for it.
    failed = 0
    for inst, res in zip(instruments, results):
        if isinstance(res, BaseException):
            failed += 1
            log.error(f"[scanner] {inst} scan raised {type(res).__name__}: {res}", exc_info=res)

    # A TICK THAT OVERRUNS ITS OWN INTERVAL SAYS SO, AND NAMES WHO. APScheduler will not start the
    # next tick until this one returns, so an overrun is lost scanning time — the window in which a
    # closing candle is missed. Logging only the total would say a tick was slow without saying why,
    # and the answer is nearly always one instrument's feed, so the three slowest are named.
    if tick_s > _current_interval:
        slowest = sorted(per_instrument.items(), key=lambda kv: -kv[1])[:3]
        log.warning("[scanner] SLOW TICK — %.1fs against a %ds interval; slowest: %s",
                    tick_s, _current_interval,
                    ", ".join(f"{i} {d:.1f}s" for i, d in slowest) or "n/a")

    log.info(f"[scanner] tick complete in {tick_s:.1f}s — "
             f"{len(instruments) - failed}/{len(instruments)} instruments "
             f"scanned{f', {failed} FAILED' if failed else ''} — "
             f"cache: {candle_fetcher.candle_cache.stats()}")

    # The heartbeat is written by `scan_markets` above, for EVERY tick. This one really scanned, so
    # it is the only kind that may claim a scan and report a meaningful tick duration.
    return True, int(tick_s * 1000)
