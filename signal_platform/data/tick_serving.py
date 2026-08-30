"""Serve the minutes the broker has not published yet — the last step of the tick-candle work.

WHAT THIS REMOVES. The broker publishes a finished bar 10-70 seconds AFTER it closes. Scanning the
instant the minute rolls (`monitor/entry_watcher`) already removed the other half of the delay — the
wait for the next scheduled scan — but it cannot conjure a bar the broker has not sent. So a scan at
T+0 still reads the PREVIOUS minute. This is what closes that: the minute that just ended is served
from the ticks we watched it being made of, while the broker's copy is still in the post.

MEASURED BEFORE IT WAS BUILT, on the live session of 30 Aug 2026:

    EUR/USD  200/200 bars identical    GBP/USD  200/200    USD/JPY  200/200    XAU/USD  200/200
    GBP/JPY    0/200                   — every bar exactly 0.005 BELOW the broker's

Four instruments matched to the last decimal. GBP/JPY is off by a constant half-pip on every bar,
open high low and close alike, cause not yet established — so it is simply not trusted, and this
module serves it nothing. That is the whole reason trust is per symbol.

THREE THINGS MUST ALL BE TRUE before a single tick-built bar is served:

  1. the switch is on          — `TICK_BARS_SERVE_ENABLED`, off by default
  2. the symbol has earned it  — `tick_bar_audit.trusted()`: a minimum sample AND no mismatch
                                 anywhere in the recent window. One wrong bar withdraws trust.
  3. the join is continuous    — the appended minutes run consecutively from the broker's newest,
                                 with no gap. See below.

WHY CONTINUITY IS CHECKED HERE TOO, when the builder already only keeps fully-covered bars: a gap
in a candle series is invisible to everything downstream. Indicators, swing detection and the
momentum test all treat the list as consecutive minutes; hand them a series with a hole and they
compute confidently on a shape that never existed. The builder guarantees each bar it kept is
whole — it does not guarantee that what we are about to append starts exactly where the broker's
copy stopped. A stream that dropped for 90 seconds produces perfectly good bars on either side of
a hole.

NOTHING IS EVER OVERWRITTEN. The broker's bars are returned exactly as they arrived; this only ever
APPENDS minutes newer than its newest. Where both have a minute, the broker's wins — it is the
answer sheet, and `tick_bar_audit` is the record of us agreeing with it.

FAILING HERE COSTS NOTHING. Every error is swallowed and the broker's bars are returned untouched,
which is the behaviour of the whole platform before this existed.
"""
import logging

from core.types import Candle

log = logging.getLogger(__name__)

_MINUTE = 60


def serving_enabled() -> bool:
    """The master switch. Read live so it can be flipped by redeploying, without a code change."""
    try:
        from config.settings import settings
        return bool(getattr(settings, "tick_bars_serve_enabled", False))
    except Exception:
        return False


# The timeframes this can serve, and the length of one of their bars in seconds.
#
# H1 IS HERE BECAUSE H1 IS WHERE THE COMPLAINT STARTED — *"The delay begins from 1HR momentum
# candle."* The hourly bar is served natively by the broker, so it arrives 10-70s after the hour
# ends exactly as the minute bar does, and nothing in the scan-on-close work touched that.
#
# An hour is only ever built from SIXTY whole minutes. `candle_aggregator.aggregate` drops any
# bucket holding fewer base bars than the ratio, so an hour we did not watch all of cannot be
# produced at all — it is not rounded, not estimated, not partially filled. That is what makes
# serving an hourly LEVEL from ticks safe: the bar is genuinely closed, or it does not exist.
_SERVABLE = {"M1": _MINUTE, "H1": 60 * _MINUTE}


def extend_with_ticks(symbol: str, tf: str, broker_bars: list[Candle]) -> list[Candle]:
    """The broker's bars, plus any newer whole bars we watched being made.

    Returns `broker_bars` unchanged whenever there is the slightest reason to — switch off, symbol
    not trusted, timeframe not servable, nothing newer, or a gap at the join.
    """
    step = _SERVABLE.get(tf)
    if step is None or not broker_bars:
        return broker_bars
    try:
        if not serving_enabled():
            return broker_bars
        from data.tick_bar_audit import audit
        if not audit.trusted(symbol):
            return broker_bars
        from data.tick_bars import builder
        ours = builder.bars(symbol)
        if not ours:
            return broker_bars
        if tf != "M1":
            from data.candle_aggregator import aggregate
            ours = aggregate(ours, tf)
            if not ours:
                return broker_bars

        newest = broker_bars[-1].time
        tail = [c for c in ours if c.time > newest]
        if not tail:
            return broker_bars

        # THE JOIN MUST BE UNBROKEN. Each appended bar has to follow the one before it exactly,
        # starting from the broker's newest. Anything else is a hole, and a hole is served silently.
        expect = newest + step
        kept: list[Candle] = []
        for c in tail:
            if c.time != expect:
                break
            kept.append(c)
            expect += step
        if not kept:
            log.debug(f"[tick-serve] {symbol} {tf}: tick bars do not join the broker's newest")
            return broker_bars

        return broker_bars + kept
    except Exception as exc:
        # A speed optimisation must never be able to cost a candle.
        log.debug(f"[tick-serve] {symbol} {tf}: {type(exc).__name__}: {exc}")
        return broker_bars
