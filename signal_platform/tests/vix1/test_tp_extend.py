"""test_tp_extend.py — run with:
    cd signal_platform && python tests/vix1/test_tp_extend.py

His rule, 17 Nov 2026: *"I target 2R not 4R, i only target 4R when the trade is willing to run"* — option A: the
target starts at 2R and is moved to 4R when a new momentum candle closes in the trade's direction. Fake broker,
fake candles: every safety rule is checked without touching an account.
"""
import asyncio
from dataclasses import replace

from _harness import Suite

from config.settings import settings                        # noqa: E402
from core.types import Candle                               # noqa: E402
from data import ctrader_positions                          # noqa: E402
from data.ctrader_positions import Position                 # noqa: E402
from execution import tp_extend                             # noqa: E402
from strategies import vix1_momentum                        # noqa: E402
import data.candle_fetcher as cf                            # noqa: E402
import execution.broker as broker                           # noqa: E402

s = Suite("VIX.1 — target 2R, moved to 4R when a momentum candle closes the trade's way")
FILL = 1_790_000_000                                       # a fill time in the past (Sep 2026)


def pos(**kw):
    base = dict(position_id=1, symbol="GBP/USD", bullish=False, volume=100, entry=1.31842, stop=1.31936,
                target=1.31842 - 2 * 0.00094, commission=0.0, swap=0.0, opened_at=FILL,
                start_stop=1.31936, label="auto-vix1-1a2b3c4d")
    base.update(kw)
    return Position(**base)


BARS = [Candle(time=FILL - 7200 + 3600 * k, open=1, high=1, low=1, close=1, volume=0, timeframe="H1")
        for k in range(4)]                                   # closes: FILL-3600, FILL, FILL+3600, FILL+7200
sent, amends, broker_after = [], [], {}


async def _fetch(sym, tf, n=100):
    return BARS


class _Client:
    def __init__(self, creds, acct):
        pass

    async def amend_sltp(self, pid, sym, sl, tp):
        amends.append((pid, sl, tp))
        return type("R", (), {"ok": True, "error": None})()


async def _positions():
    return [broker_after["p"]] if broker_after.get("p") else []


async def _send(m):
    sent.append(m)

cf.fetch_candles = _fetch
broker.StopOrderClient = _Client
ctrader_positions.open_positions = _positions
settings.auto_breakeven_enabled, settings.auto_breakeven_demo_only = True, True
_real_q = vix1_momentum.qualifies_for_trade


def run(p, momentum_at=None, after=None, acct="demo"):
    """momentum_at = index of the bar that qualifies (None = none). after = the position the re-read returns."""
    amends.clear(); sent.clear()
    vix1_momentum.qualifies_for_trade = lambda h1, k, bull, sym: k == momentum_at
    broker_after["p"] = after
    try:
        async def go():
            out = await tp_extend.maybe_extend(p, _send, {}, acct)
            await asyncio.sleep(0.2)     # let a queued DM (`tell_soon`) go out before the loop closes
            return out
        return asyncio.run(go())
    finally:
        vix1_momentum.qualifies_for_trade = _real_q


risk = 0.00094
moved = pos(target=1.31842 - 4 * risk)
print("1. a momentum candle closing AFTER the fill moves the target to 4R, stop untouched:")
s.check("moved", run(pos(position_id=11), momentum_at=2, after=replace(moved, position_id=11)), True)
s.check("...one amend: same stop, target at entry - 4R", [(a[1], round(a[2], 5)) for a in amends],
        [(1.31936, round(1.31842 - 4 * risk, 5))])

print("\n2. what must NOT move it:")
s.check("a momentum candle that closed BEFORE the fill (index 0 closes an hour before it)",
        run(pos(position_id=12), momentum_at=0), False)
s.check("...no amend sent", amends, [])
s.check("no momentum candle at all", run(pos(position_id=13), momentum_at=None), False)
s.check("a target already at 4R (moved before, or set by him)", run(pos(position_id=14, target=1.31842 - 4 * risk),
                                                                momentum_at=2), False)
s.check("his manual trade (no label)", run(pos(position_id=15, label=""), momentum_at=2), False)
s.check("another strategy's trade (auto-bxsd)", run(pos(position_id=16, label="auto-bxsd-1a2b3c4d"), momentum_at=2),
        False)
s.check("a LIVE account", run(pos(position_id=17), momentum_at=2, acct="live"), False)
s.check("...no amend sent on any of them", amends, [])

print("\n3. the read-back is believed, not the call:")
gone = replace(pos(position_id=18), target=None)
s.check("broker says ok but the target vanished -> not counted as moved", run(pos(position_id=18), momentum_at=2,
                                                                              after=gone), False)
s.check("...and the message telling him is queued", any("TAKE PROFIT IS GONE" in m for m in sent), True)

print("\n4. the signal itself now carries 2R:")
from strategies import vix1                                 # noqa: E402
s.check("the order's target multiple is 2R", vix1._TP_R, 2.0)
s.check("the run target is 4R", vix1._TP_R_RUN, 4.0)

s.done()
