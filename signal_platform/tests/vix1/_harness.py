"""Shared helpers for the VIX.1 test suite.

Deliberately no test framework: each test file is a plain script that prints PASS/FAIL per case and
exits non-zero if anything failed, so it behaves identically here and anywhere else, with no
dependency added to pyproject.

The point of this suite is to EXECUTE VIX.1's real functions. A suite that inspects source text or
re-implements the rule can stay green while the strategy is broken in production, which is the exact
failure it exists to prevent.
"""
import csv
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PLATFORM = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _PLATFORM not in sys.path:
    sys.path.insert(0, _PLATFORM)
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")   # no DB is touched; imports need it set

from core.types import Candle          # noqa: E402

DATA = r"C:\Users\FSD\trading_app_data\ctrader"


class Suite:
    """Collects results so a file can report once and exit with the right code."""

    def __init__(self, title):
        self.failed = []
        self.count = 0
        print()
        print(title)

    def check(self, name, got, want):
        self.count += 1
        ok = got == want
        print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
        if not ok:
            self.failed.append(name)
        return ok

    def teeth(self, name, broke_it_and_failed: bool):
        """Prove an assertion CAN fail. A test that cannot fail proves nothing."""
        self.count += 1
        ok = bool(broke_it_and_failed)
        print(f"   {'PASS' if ok else 'FAIL'}  TEETH — {name} fails when deliberately broken: {ok}")
        if not ok:
            self.failed.append(f"TEETH:{name}")
        return ok

    def done(self):
        print()
        if self.failed:
            print(f"{len(self.failed)} of {self.count} FAILED: {self.failed}")
            sys.exit(1)
        print(f"ALL PASS ({self.count} checks)")
        sys.exit(0)


def C(t, o, h, l, c, tf="M1"):
    """A candle. `t` is a bar index; times are spaced so ordering is unambiguous."""
    step = {"M1": 60, "H1": 3600, "H4": 14400}[tf]
    return Candle(time=1700000000 + t * step, open=o, high=h, low=l, close=c, volume=0, timeframe=tf)


def body(o, c, tf="M1", t=0, wick_up=0.0, wick_dn=0.0):
    """A candle described by body + wicks, so tests read like the rule they check."""
    hi = max(o, c) + wick_up
    lo = min(o, c) - wick_dn
    return C(t, o, hi, lo, c, tf)


def flat_series(n, price=1.1000, size=0.0002, tf="H1"):
    """A run of identical small candles — the baseline that `baseline_body` measures."""
    return [body(price, price + size, tf=tf, t=i) for i in range(n)]


def load(fn, tf, limit=None):
    """Real broker candles. Returns [] when the file is absent so a test can skip rather than error."""
    path = os.path.join(DATA, fn)
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            rows.append((int(r["time"]), float(r["open"]), float(r["high"]),
                         float(r["low"]), float(r["close"])))
    rows.sort()
    if limit:
        rows = rows[-limit:]
    return [Candle(time=t, open=o, high=h, low=l, close=c, volume=0, timeframe=tf)
            for t, o, h, l, c in rows]
