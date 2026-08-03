"""How much MARKET-OPEN time sits between two instants.

Wall-clock age is the wrong measure for "is this candle stale". Two things break it:

  1. A bar is stamped at its OPEN. The newest CLOSED daily bar on a Monday opened the previous
     Thursday 21:00 UTC (it covers Thursday 21:00 -> Friday 21:00, i.e. Friday's session), so its
     open timestamp is ~3.7 days old while the data is perfectly current.
  2. The market is SHUT all weekend. Nothing is late because nothing was published.

Together these made `candle_fetcher` log `D1: data is stale (5353m old)` for every pair on every
Monday scan, against a feed that was fine — and worse, they push toward the DROP threshold, which
would discard good higher-timeframe context and silently downgrade signal grading.

The forex week here matches `data/instrument_filter.is_forex_open`: open Sun 22:00 UTC, shut Fri
22:00 UTC. That is the one definition of market hours in the platform and this module defers to it
rather than restating it.
"""
from datetime import datetime, timedelta, timezone

from data.instrument_filter import is_forex_open

_STEP = timedelta(minutes=30)   # resolution of the walk; a bar age never needs finer


def open_seconds_between(start: float, end: float) -> float:
    """Seconds the forex market was OPEN between two unix timestamps.

    Walks in 30-minute steps rather than deriving closed spans analytically: the week has exactly
    two edges and a loop over them is obviously correct, where the arithmetic version has to handle
    a start inside the weekend, an end inside the weekend, and spans covering several weekends. At
    30-minute resolution a year of walking is ~17k iterations, and it is only ever called on a span
    of days.
    """
    if end <= start:
        return 0.0
    t = datetime.fromtimestamp(start, timezone.utc)
    stop = datetime.fromtimestamp(end, timezone.utc)
    total = 0.0
    while t < stop:
        nxt = min(t + _STEP, stop)
        if is_forex_open(t):
            total += (nxt - t).total_seconds()
        t = nxt
    return total


def bar_age_seconds(bar_time: float, bar_seconds: float, now: float | None = None) -> float:
    """Age of a candle measured from when it CLOSED, counting only market-open time.

    `bar_time` is the bar's OPEN (how every feed here stamps them), so its close is
    `bar_time + bar_seconds`. A bar that has not closed yet ages 0 — the forming bar is the newest
    thing that can exist and is never stale.
    """
    import time
    now = time.time() if now is None else now
    closed_at = bar_time + bar_seconds
    if closed_at >= now:
        return 0.0
    return open_seconds_between(closed_at, now)
