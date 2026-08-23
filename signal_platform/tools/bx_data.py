"""Loading and slicing the stored cTrader history, for the BX measurement tools.

WHY THIS EXISTS. Every measurement of BX so far was written from scratch in a scratch directory and
then lost, so the next session rebuilt it — and rebuilt its mistakes with it. Twice this week a
harness defect produced a number that was reported as a BX defect. This is the shared, reviewed
loader so that stops happening.

WHERE THE DATA IS: `C:\\Users\\FSD\\trading_app_data\\ctrader\\`. What is actually there, checked
2026-08-23 (the ranges matter — a measurement is only as long as its shortest feed):

    EURUSD_H4real.csv   3,500 bars    24 Apr 2024 -> 24 Jul 2026
    EURUSD_M1.csv     800,000 bars    22 May 2024 -> 17 Jul 2026   <- the full one
    EURUSD_M1_145d.csv 150,000 bars   23 Feb 2026 -> 17 Jul 2026   <- a SHORT extract
    EURUSD_H1.csv      26,000 bars    12 May 2022 -> 17 Jul 2026
    GBPUSD / GBPJPY / AUDUSD equivalents also present

THE 145-DAY FILE IS A TRAP. It is named like the main one and sits beside it, and a 3-month
measurement was run against it on the assumption it was all there was. Anything needing more than
~5 months of 15M/30M/1H must use `EURUSD_M1.csv`.

SLICING IS BY BINARY SEARCH, not by re-filtering. `[c for c in m15 if c.time < t]` inside a bar loop
is O(n) per bar; at 800k rows that alone took a measurement from 8 minutes to over half an hour.
"""
import bisect
import csv
import datetime
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.types import Candle                                          # noqa: E402

DATA_DIR = os.path.join("C:" + os.sep, "Users", "FSD", "trading_app_data", "ctrader")


def load(name: str, tf: str) -> list[Candle]:
    """Read one stored CSV. `name` may be a bare filename (looked up in DATA_DIR) or a full path.

    The time column is found by name rather than position, and both epoch seconds and ISO text are
    accepted, because the stored files do not all agree on either.
    """
    path = name if os.path.isabs(name) else os.path.join(DATA_DIR, name)
    rows = list(csv.DictReader(open(path, newline="")))
    if not rows:
        raise ValueError(f"{path} is empty")
    key = next(c for c in rows[0] if c.lower() in ("time", "timestamp", "date", "datetime"))
    out = []
    for r in rows:
        try:
            t = int(r[key])
        except ValueError:
            t = int(datetime.datetime.fromisoformat(r[key]).timestamp())
        out.append(Candle(time=t, open=float(r["open"]), high=float(r["high"]),
                          low=float(r["low"]), close=float(r["close"]),
                          volume=float(r.get("volume") or 0), timeframe=tf))
    out.sort(key=lambda c: c.time)
    return out


class Feed:
    """A finer series plus its timestamps, sliced by binary search.

    `before(t, n)` returns the last `n` bars that CLOSED STRICTLY BEFORE `t`. Strictly before,
    because a bar stamped at `t` is the one being tested and letting it in is lookahead — the class
    of error that once put 33% of zones on the book before their break had printed.
    """

    def __init__(self, candles: list[Candle]):
        self.candles = candles
        self.times = [c.time for c in candles]

    def before(self, t: int, n: int) -> list[Candle]:
        end = bisect.bisect_left(self.times, t)
        return self.candles[max(0, end - n):end]


def month_of(ts: int) -> str:
    return datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m")


def day_of(ts: int) -> str:
    return datetime.datetime.utcfromtimestamp(ts).strftime("%d %b %Y")
