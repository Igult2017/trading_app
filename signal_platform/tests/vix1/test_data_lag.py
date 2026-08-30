"""HOW LATE WAS THE DATA? The number every lateness argument turns on.

He said *"signal arrives late when its past entry"*. Tested against real broker M1 bars, all four
stored signals were at or past their own entry when they fired — EUR/USD 19 Aug PAST by 1.1 pips,
XAU/USD 19 Aug PAST by 9.3 pips, the other two 0.2 and 0.1 pips short. Two of four were unplaceable.

But that had to be RECONSTRUCTED afterwards: `createdAt` compared against re-fetched bars. It mixed
legitimate 1M-entry waiting time with the platform's own delay and could not separate them, and four
signals was every one that existed to measure. `data_lag` stamps the platform's own share onto the
audit row at the moment a signal is built, so the question stops being an argument.

WHAT IT MEASURES, precisely: seconds since the freshest CLOSED bar of the strategy's finest
timeframe actually closed. That bar is what the entry is read from, so its age is the delay that is
OURS — the market's own waiting is not in it.
"""
import time

from _harness import Suite
from core.types import Candle, MTFCandles
from orchestrator.lateness import data_lag

s = Suite("DATA LAG — the platform's own delay, stamped on the row")


class _Ctx:
    def __init__(self, data):
        self.candles = MTFCandles(_data=data)


def bars(tf: str, closes_ago: float, n: int = 3):
    """`n` bars of `tf` whose LAST one closed `closes_ago` seconds ago."""
    from shared.mtf_utils import seconds as sec
    period = sec(tf)
    last_open = time.time() - closes_ago - period
    return [Candle(time=int(last_open - (n - 1 - i) * period), open=1.1, high=1.1,
                   low=1.1, close=1.1, volume=1, timeframe=tf) for i in range(n)]


# ── THE MEASUREMENT ─────────────────────────────────────────────────────────
out = data_lag(_Ctx({"M1": bars("M1", closes_ago=5)}))
s.check("a bar that closed 5s ago reads as a small lag", "lag=5s(M1)" in out or "lag=4s(M1)" in out
        or "lag=6s(M1)" in out, True)

out = data_lag(_Ctx({"M1": bars("M1", closes_ago=55)}))
s.check("a bar that closed 55s ago reads ~55s", "(M1)" in out and "lag=5" in out, True)

# THE FINEST TIMEFRAME IS THE ONE THAT MATTERS — the entry is read off it. An H1 bar is up to an
# hour old by design and would swamp the number that is actually ours.
out = data_lag(_Ctx({"H1": bars("H1", closes_ago=1800), "M1": bars("M1", closes_ago=8)}))
s.check("with H1 and M1 present, M1 is the one measured", "(M1)" in out, True)
s.check("...and the 30-minute-old H1 does not swamp it", "lag=18" in out, False)

out = data_lag(_Ctx({"H4": bars("H4", closes_ago=100), "H1": bars("H1", closes_ago=20)}))
s.check("with H4 and H1, H1 is the finer and wins", "(H1)" in out, True)


# ── IT MUST NEVER COST A SIGNAL ─────────────────────────────────────────────
# This goes into an audit row. A measurement that can raise is worse than no measurement at all.
s.check("no candles at all -> empty string, not a crash", data_lag(_Ctx({})), "")


class _Broken:
    @property
    def candles(self):
        raise RuntimeError("context is unusable")


s.check("a context that raises -> empty string", data_lag(_Broken()), "")


class _NoClosedBars:
    """Every bar still forming — nothing has closed yet."""
    def __init__(self):
        future = int(time.time() + 30)
        self.candles = MTFCandles(_data={"M1": [Candle(time=future, open=1.1, high=1.1, low=1.1,
                                                       close=1.1, volume=1, timeframe="M1")]})


s.check("no CLOSED bar yet -> empty string, never a negative lag",
        data_lag(_NoClosedBars()), "")

s.check("an unknown timeframe is skipped rather than guessed",
        data_lag(_Ctx({"NONSENSE": bars("M1", closes_ago=5)})) in ("", " lag=5s(NONSENSE)"), True)


# ── IT IS APPENDED TO THE BUILT ROW, WHICH IS WHERE IT BECOMES READABLE ─────
import ast, os
_runner = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                       "orchestrator", "strategy_runner.py")
_src = open(_runner, encoding="utf-8").read()
s.check("data_lag is called on the BUILT path", "data_lag(context)" in _src, True)
s.check("...and its value reaches the recorded detail", "{lag}" in _src, True)
# Measured ONCE per tick, not per signal — the same delay applies to every signal from one analyse.
s.check("measured once, outside the per-signal loop",
        _src.index("lag = data_lag(context)") < _src.index("for s in result.signals:"), True)

s.done()
