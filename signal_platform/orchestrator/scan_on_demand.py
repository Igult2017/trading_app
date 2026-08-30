"""
Scan ONE instrument, right now, outside the schedule — because the deciding candle just closed.

THE PROBLEM, MEASURED. Against real broker M1 bars, every stored VIX.1 signal arrived at or past its
own entry: EUR/USD 19 Aug was 1.1 pips PAST, XAU/USD 19 Aug was 9.3 pips PAST, and the other two
missed by 0.2 and 0.1 pips. A stop order cannot be placed where price has already been, so two of
four were unplaceable on arrival and the others had no room. On a 3-pip stop this is not slowness,
it is the entire margin.

Part of that is the scan landing at an arbitrary offset: the 1M bar the entry is decided on can close
and then sit unlooked-at for almost a full minute (30s/45s/60s cadence, plus a 20s M1 cache). This
module removes that wait by scanning the instant the bar closes instead.

THE SAFETY PROPERTY THAT MAKES THIS SAFE TO SHIP UNSUPERVISED, and it is the reason for every design
choice below: **this can only make the EXISTING check happen sooner.** It calls the same
`run_strategy` a scheduled tick calls, behind the same gates, with the same inputs. It decides
nothing, changes no threshold, and places nothing. If the caller dies, misbehaves or is switched off,
the scheduled scan carries on untouched and behaviour is exactly what it is today. **The worst case
of this feature being wrong is the behaviour we already have.**

IT IS NOT A SECOND SCANNER. Every gate a tick obeys is obeyed here — paused, scan_enabled, market
hours, registered strategies — deliberately re-read from the same places rather than assumed, because
a parallel implementation that drifts is how a strategy ends up running under rules nobody chose.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone

from config.settings import settings
from core import strategy_registry
from data import instrument_filter
from news import news_fetcher
from orchestrator.scanner import _is_paused
from orchestrator.strategy_runner import run_strategy
from scheduler.session_windows import get_current_sessions

log = logging.getLogger(__name__)

# A scheduled tick and a bar-triggered scan can land within moments of each other. This keeps the
# instrument from being scanned twice in quick succession — the point is to scan SOONER, not MORE.
_MIN_GAP_S = 20.0
_last_scan: dict[str, float] = {}
_locks: dict[str, asyncio.Lock] = {}


def note_scheduled_scan(instruments: list[str]) -> None:
    """Tell this module a scheduled tick just covered these, so it does not immediately repeat one."""
    now = time.monotonic()
    for i in instruments:
        _last_scan[i] = now


async def scan_one(instrument: str, reason: str = "bar close") -> bool:
    """Run every enabled strategy over ONE instrument now. True if it actually scanned.

    Never raises: this is called from a streaming loop, and a fault here must not take that loop —
    or anything else — down. Every refusal is logged with its reason and returns False.
    """
    try:
        now = datetime.now(timezone.utc)

        # THE SAME GATES A TICK OBEYS, in the same order and from the same sources.
        if _is_paused():
            return False
        if not settings.scan_enabled:
            return False
        open_instruments = instrument_filter.get_open_instruments(now)
        if instrument not in open_instruments:
            return False                       # closed market, or not a traded instrument
        strategies = strategy_registry.get_enabled()
        if not strategies:
            return False

        last = _last_scan.get(instrument, 0.0)
        if time.monotonic() - last < _MIN_GAP_S:
            return False                       # a scan already covered this a moment ago

        lock = _locks.setdefault(instrument, asyncio.Lock())
        if lock.locked():
            return False                       # one already running for this instrument
        async with lock:
            _last_scan[instrument] = time.monotonic()
            started = time.perf_counter()
            news_context = await news_fetcher.fetch(now)
            sessions = get_current_sessions(now)
            await asyncio.gather(
                *[run_strategy(s, instrument, news_context, sessions, now) for s in strategies],
                return_exceptions=True,        # one strategy's fault never stops another's
            )
            log.info(f"[on-demand] scanned {instrument} on {reason} "
                     f"in {(time.perf_counter() - started) * 1000:.0f} ms")
            return True
    except Exception as exc:
        log.error(f"[on-demand] {instrument} scan failed: {type(exc).__name__}: {exc}",
                  exc_info=True)
        return False
