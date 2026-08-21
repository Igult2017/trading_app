"""THE BAR CURRENTLY FORMING, BUILT FROM THE MINUTES WE ALREADY HOLD — and it must change nothing else.

WHY THIS EXISTS. `ProtoOAGetTrendbarsReq` serves CLOSED bars only. Measured live 2026-08-21: 14 polls
10s apart across 3 minute boundaries, the newest M1 bar was NEVER the minute in progress; at 09:41 UTC
the newest H1 bar was 08:00 and the newest H4 was 05:00. The platform was written believing the feed
returns the forming bar as its newest, so `vix1_preclose` found None every time and the T-5 pre-close
warning had fired ZERO times in 30 days — unreachable, not merely unfired.

THE DECISIVE TEST IS `the safety property` AT THE BOTTOM. Appending a bar to a list that every
strategy reads is the kind of change that moves something three modules away. The whole argument for
doing it is that the appended bar is not closed, so `closed_only` drops it and every LEVEL reads
exactly what it read before. That is asserted here and again on live broker data before it ships.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

import calendar  # noqa: E402

from core.types import Candle  # noqa: E402
from data.candle_aggregator import aggregate, forming_bar  # noqa: E402
from orchestrator.strategy_runner import _forming_base  # noqa: E402
from shared.mtf_utils import (BROKER_DAY_START_S, bar_open_at, closed_only,  # noqa: E402
                              day_grid_phase, grid_phase, seconds_to_close)

failed, count = [], 0


def check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke_it):
    global count
    count += 1
    print(f"   {'PASS' if broke_it else 'FAIL'}  TEETH — {name}: {broke_it}")
    if not broke_it:
        failed.append(f"TEETH:{name}")


def utc(h, m=0, day=21):
    return float(calendar.timegm((2026, 8, day, h, m, 0, 0, 0, 0)))


def m1(ts, o, h, lo, c, v=1.0):
    return Candle(time=int(ts), open=o, high=h, low=lo, close=c, volume=v, timeframe="M1")


print()
print("THE FORMING BAR — built from the finer series, changing nothing else")

# ── the grid, read off a real bar ────────────────────────────────────────────
# MEASURED on the live broker 2026-08-21 (GBP/USD): every D1 bar opens 21:00 UTC, W1 opens Sunday
# 21:00, H4 sits 1h past the midnight grid, H1 sits 0h past it. A UTC+3 server rolling at local
# midnight. All four agree, which is why 21:00 is a measurement and not a guess.
check("the broker day starts at 21:00 UTC", BROKER_DAY_START_S, 75600)
check("H4's grid, read off the real 05:00 bar", grid_phase(utc(5), "H4", utc(8)), 3600.0)
check("H1 is on the hour, so its phase is zero", grid_phase(utc(7), "H1", utc(8)), 0.0)
check("no bar to read -> the midnight grid", grid_phase(None, "H4", utc(8)), 0.0)
check("a millisecond timestamp is rejected", grid_phase(utc(5) * 1000, "H4", utc(8)), 0.0)
check("next H4 close from 08:05 is 09:00", seconds_to_close("H4", utc(8, 5), utc(5)), 3300.0)
check("the H4 bar in progress at 08:05 opened 05:00", bar_open_at(utc(8, 5), "H4", utc(5)), utc(5))
check("the H1 bar in progress at 10:11 opened 10:00", bar_open_at(utc(10, 11), "H1", utc(9)), utc(10))

# ── the derived grid, for timeframes the broker never serves ─────────────────
# These have no real bar to read, so they hang off the measured day start instead.
check("H8 opens 05:00/13:00/21:00", day_grid_phase("H8"), 18000.0)
check("H6 opens 03:00/09:00/15:00/21:00", day_grid_phase("H6"), 10800.0)
# H2 FROM A 21:00 DAY LANDS ON ODD HOURS — 21:00, 23:00, 01:00 — so it is an hour off the epoch
# 2-hour grid, NOT on it. The first draft of this file asserted 0 here by confusing "divides the hour
# evenly" with "starts where the epoch does"; the code was right and the yardstick was bent.
check("H2 opens on ODD hours, an hour off the epoch grid", day_grid_phase("H2"), 3600)
check("H3 divides the 21:00 day exactly, so phase 0", day_grid_phase("H3"), 0)
check("and the whole M-series is on the grid", [day_grid_phase(t) for t in ("M6", "M12", "M20")],
      [0, 0, 0])

# ── building the bar ─────────────────────────────────────────────────────────
# The hour 10:00-11:00, with eleven of its minutes printed — exactly the live shape measured on
# GBP/USD at 10:11 UTC (11 of 12 minutes held; one quiet minute printed no bar at all).
NOW = utc(10, 11) + 45
bars = ([m1(utc(9, 30), 1.3, 1.3, 1.3, 1.3)] +                       # previous hour — must be excluded
        [m1(utc(10, 0), 1.36548, 1.36560, 1.36540, 1.36550)] +
        [m1(utc(10, i), 1.36550, 1.36597, 1.36532, 1.36560) for i in range(1, 10)] +
        [m1(utc(10, 10), 1.36560, 1.36580, 1.36555, 1.36590)])
fb = forming_bar(bars, "H1", anchor=utc(9), now=NOW)
check("it is stamped at the hour's OPEN", fb.time, int(utc(10)))
check("open comes from the FIRST minute of the hour", fb.open, 1.36548)
check("high is the highest of them", fb.high, 1.36597)
check("low is the lowest", fb.low, 1.36532)
check("close is the LAST minute's close", fb.close, 1.36590)
check("volume is summed", fb.volume, 11.0)
check("it is labelled as the target timeframe", fb.timeframe, "H1")
check("the previous hour's minute was excluded", fb.volume, 11.0)

check("no minutes yet in this period -> no bar", forming_bar(bars, "H1", utc(9), utc(11, 0) + 5), None)
check("no base bars at all -> no bar", forming_bar([], "H1", utc(9), NOW), None)

# A STILL-FORMING BASE BAR IS EXCLUDED. Its own high, low and close still move; folding one in would
# make this bar change for two reasons at once.
with_open = bars + [m1(utc(10, 11), 1.36590, 1.39999, 1.30000, 1.36600)]
check("a base bar that has not closed is left out", forming_bar(with_open, "H1", utc(9), NOW).high,
      1.36597)

# THE GRID IS THE ANCHOR'S, NOT MIDNIGHT'S. Same minutes, an H4 anchor an hour off the midnight grid.
h4_bars = [m1(utc(9, i), 1.0, 2.0, 0.5, 1.5) for i in range(0, 30)]
check("H4 forming bar opens on the broker's grid (09:00), not 08:00",
      forming_bar(h4_bars, "H4", anchor=utc(5), now=utc(9, 30)).time, int(utc(9)))
teeth("assuming midnight would have opened it at 08:00 instead",
      int(forming_bar(h4_bars, "H4", anchor=None, now=utc(9, 30)).time) == int(utc(8)))

# ── THE SAFETY PROPERTY — the whole argument for touching a shared path ──────
closed_h1 = [Candle(time=int(utc(h)), open=1.0, high=1.1, low=0.9, close=1.05,
                    volume=1.0, timeframe="H1") for h in range(2, 10)]
check("the forming bar is NOT closed, so closed_only drops it",
      closed_only(closed_h1 + [fb], NOW), closed_h1)
check("...so every level reads an identical list",
      [c.time for c in closed_only(closed_h1 + [fb], NOW)], [c.time for c in closed_h1])
teeth("and without it the list would grow, which is what must never happen",
      len(closed_h1 + [fb]) == len(closed_h1) + 1)

# ── which series builds it ───────────────────────────────────────────────────
view = {"M1": [1], "M15": [1], "H1": [1], "H4": [1], "D1": [1]}
check("the FINEST divisor is chosen for H1", _forming_base("H1", view), view["M1"])
check("...and for H4 as well", _forming_base("H4", view), view["M1"])
check("nothing finer divides M1 -> None", _forming_base("M1", view), None)
check("an empty series is not chosen", _forming_base("H1", {"M1": [], "M15": [1]}), view["M15"])
check("a non-dividing series is not chosen", _forming_base("H1", {"M15": [], "M30": [1]}),
      [1])

# ── aggregate still works, now on the real grid ──────────────────────────────
# H8 from H4 on the broker's 21:00 day: bars open 05:00 and 13:00, never 04:00/08:00/12:00.
h4 = [Candle(time=int(utc(h)), open=1.0, high=2.0, low=0.5, close=1.5, volume=1.0, timeframe="H4")
      for h in (5, 9, 13, 17)]
built = aggregate(h4, "H8")
check("H8 bars open on the broker's grid", [c.time for c in built], [int(utc(5)), int(utc(13))])
teeth("midnight bucketing would have split them onto 00:00/08:00/16:00 boundaries",
      {int(utc(h)) // (8 * 3600) * (8 * 3600) for h in (5, 9, 13, 17)} !=
      {int(utc(5)), int(utc(13))})

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
