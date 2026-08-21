"""
Timeframe string utilities — fully dynamic, broker-agnostic.

Any TF string is valid. Non-native TFs are aggregated transparently
from the largest native base — strategies never need to know this.

cTrader Open API native periods (ProtoOATrendbarPeriod enum):
  M1 M2 M3 M4 M5 M10 M15 M30  H1 H4 H12  D1 W1 MN

Non-native (aggregated automatically):
  M6  → M3  × 2       H2  → H1  × 2
  M12 → M4  × 3       H3  → H1  × 3
  M20 → M10 × 2       H6  → H1  × 6
                       H8  → H4  × 2

Supported input formats: M1, M5, M15, M30, H1, H2, H4, H6, H8, D1, W1, MN
"""

import re
import time


def to_minutes(tf: str) -> int:
    """Convert any TF string to its duration in minutes."""
    tf = tf.strip().upper()

    m = re.fullmatch(r'M(\d+)', tf)
    if m:
        return int(m.group(1))

    m = re.fullmatch(r'H(\d+)', tf)
    if m:
        return int(m.group(1)) * 60

    if tf in ('D', 'D1'):
        return 1_440
    if tf in ('W', 'W1'):
        return 10_080
    if tf in ('MN', 'MON', 'M'):
        return 43_200

    raise ValueError(
        f"Unrecognised timeframe '{tf}'. "
        "Expected formats: M1, M5, M15, M30, H1, H4, D1, W1, MN"
    )


def seconds(tf: str) -> int:
    """Duration of one bar in seconds — used for cache TTL and signal expiry."""
    return to_minutes(tf) * 60


def is_closed(bar_time: int, tf: str, now: float | None = None) -> bool:
    """Has this bar finished forming? Bars are stamped at their OPEN, so a bar is closed once its
    own duration has elapsed. The feed returns the bar currently forming as the newest one, and a
    forming bar's body, wicks and close all still change — anything anchored to it moves with it."""
    return bar_time + seconds(tf) <= (now if now is not None else time.time())


def closed_only(candles: list, now: float | None = None) -> list:
    """Drop a trailing still-forming bar. Use wherever a value must STAY PUT once read — a level, a
    line, a zone. Do NOT use where the live price is the point (an entry reacting to price now)."""
    return [c for c in candles if is_closed(c.time, c.timeframe, now)]


# ── WHERE A TIMEFRAME'S BARS ACTUALLY SIT ON THE CLOCK ────────────────────────
#
# THE ONE HOME FOR THIS, and it exists because there were two copies and one of them was wrong.
# `candle_cache` and `candle_aggregator` each worked the boundary out with `t // period * period`,
# which assumes bars start at midnight UTC. This broker's H4 bars open at 01:00/05:00/09:00/13:00/
# 17:00/21:00 UTC — its trading day starts 21:00 UTC on a UTC+3 server — so the cache held an H4 copy
# for hours past the close it was built to respect (fixed 2026-08-21), and the aggregator would have
# mis-bucketed every H4 it ever built. Two copies of an assumption is how one of them stays wrong.
#
# THE GRID IS READ, NEVER COMPUTED. Bars are stamped at their OPEN, so any real bar says where every
# bar on that timeframe sits: `last_open % period`. Callers always have a bar in hand at the moment
# they need this. It also follows a daylight-saving shift on its own, because it is re-read each time.


def grid_phase(last_open: float | None, tf: str, now: float | None = None) -> float:
    """How far this timeframe's bars sit past each period boundary, read off a real bar's OPEN time.

    Returns 0.0 (the midnight grid) when there is no usable bar. The bounds check also rejects a
    millisecond timestamp, so a units change in the feed degrades to the old assumption rather than
    poisoning every caller.
    """
    period = seconds(tf)
    now = time.time() if now is None else now
    if last_open is None or not (0 < last_open <= now + period):
        return 0.0
    return last_open % period


def seconds_to_close(tf: str, now: float | None = None, last_open: float | None = None) -> float:
    """Seconds from `now` until this timeframe's next bar close, on its own grid.

    A GRID, NOT `last_open + period`. Over a weekend or a feed gap the newest bar is long closed and
    that sum is already in the past; a gap moves which bars exist, never where they sit.
    """
    period = seconds(tf)
    now = time.time() if now is None else now
    return (grid_phase(last_open, tf, now) - now) % period or float(period)


def bar_open_at(now: float | None = None, tf: str = "H1", last_open: float | None = None) -> float:
    """The OPEN time of the bar in progress at `now`, on this timeframe's own grid."""
    now = time.time() if now is None else now
    return now + seconds_to_close(tf, now, last_open) - seconds(tf)


# THE BROKER'S TRADING DAY STARTS AT 21:00 UTC — MEASURED, not assumed. GBP/USD on the live feed,
# 2026-08-21: every D1 bar opens 21:00 UTC, W1 opens Sunday 21:00, H4 sits 1h past the midnight grid
# and H1 sits 0h past it. All four agree, and 21:00 UTC is a UTC+3 server rolling at midnight local.
#
# THIS IS THE FALLBACK, NOT THE ROUTE. Wherever a real bar of the timeframe exists, read the grid off
# it with `grid_phase` — that follows a daylight-saving shift or a broker change on its own. This
# constant exists for the one case with no such bar to read: a NON-NATIVE timeframe (H2, H3, H6, H8,
# M6, M12, M20), which the broker never serves, so `candle_aggregator` has to build the grid before
# any bar of it can exist. Re-measure with `D1` if the broker is ever changed.
BROKER_DAY_START_S = 21 * 3600


def day_grid_phase(tf: str) -> float:
    """Grid phase for a timeframe with no real bar to read, from the broker's measured day start.

    Correct for every non-native timeframe, which are all sub-daily: H8 -> 05:00/13:00/21:00,
    H6 -> 03:00/09:00/15:00/21:00, H2 and H3 and the M-series -> 0 (they divide the hour evenly).
    """
    return BROKER_DAY_START_S % seconds(tf)


# ── cTrader native TF registry ────────────────────────────────────────────────

# Durations (minutes) that cTrader serves natively via ProtoOATrendbarPeriod.
# Everything NOT in this set is fetched from the largest native divisor
# and aggregated by candle_aggregator.aggregate() — transparent to strategies.
_NATIVE_MINUTES: frozenset[int] = frozenset({
    1, 2, 3, 4, 5, 10, 15, 30,    # minute bars  (M6 M12 M20 NOT native)
    60, 240, 720,                   # hour bars    (H1 H4 H12 only — H2 H3 H6 H8 NOT native)
    1440, 10080, 43200,             # D1  W1  MN
})

_NATIVE_TF: dict[int, str] = {
    1: "M1",   2: "M2",   3: "M3",   4: "M4",  5: "M5",
    10: "M10", 15: "M15", 30: "M30",
    60: "H1",  240: "H4", 720: "H12",
    1440: "D1", 10080: "W1", 43200: "MN",
}


def is_native(tf: str) -> bool:
    """True if cTrader serves this TF natively — no aggregation needed."""
    return to_minutes(tf) in _NATIVE_MINUTES


def native_base_for(tf: str) -> str:
    """
    For a non-native TF, return the largest native TF that divides evenly into it.
    candle_fetcher fetches the base and candle_aggregator builds the target bars.

    Examples:
      H2  (120m) → H1  (60m,  ratio 2)
      H3  (180m) → H1  (60m,  ratio 3)
      H6  (360m) → H1  (60m,  ratio 6)
      H8  (480m) → H4  (240m, ratio 2)
      M6  (  6m) → M3  (3m,   ratio 2)
      M12 ( 12m) → M4  (4m,   ratio 3)
      M20 ( 20m) → M10 (10m,  ratio 2)
    """
    mins = to_minutes(tf)
    if mins in _NATIVE_MINUTES:
        return tf
    for base_mins in (240, 60, 30, 15, 10, 5, 4, 3, 2, 1):
        if mins % base_mins == 0 and base_mins in _NATIVE_MINUTES:
            return _NATIVE_TF[base_mins]
    return "M1"
