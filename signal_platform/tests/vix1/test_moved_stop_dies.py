"""A DEAD SETUP'S ORDER IS WITHDRAWN EVEN WHEN HE MOVED ITS STOP — once price is past HIS stop (16 Nov 2026).

His rule: *"Even if i moved the stop, if the signal has died it should be removed. It should check if the
price has moved past the SL band to the opposite side meaning the price is no longer in our direction."*

Until today `canceller.cancel_for_signal` never withdrew an order whose stop he had moved. Proved through
the real function with his GBP/JPY SELL (order 377158463: entry 210.394, our stop 210.597); the broker,
the candles and the database are faked at their edges.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from _harness import Suite

from execution import canceller, decision_log, withdrawal_notice
from storage import autotrade_repo

s = Suite("A dead setup's order goes once price is past HIS stop")
run = asyncio.new_event_loop().run_until_complete
OID, PLACED = "377158463", datetime.now(timezone.utc) - timedelta(minutes=20)
cancelled, kept, closed = [], [], []

autotrade_repo.order_for_signal = lambda sid: OID
autotrade_repo.intent_for = lambda oid: dict(symbol="GBP/JPY", side="SELL", entry=210.394, sl=210.597,
                                             placed_at=PLACED)
autotrade_repo.record_closed = lambda oid, st: closed.append(st)
import storage.signal_repo as signal_repo                           # noqa: E402
signal_repo.adopt_levels = lambda *a, **k: True
decision_log.cancelled = lambda *a, **k: asyncio.sleep(0)
withdrawal_notice.announce = lambda oid, sym, why, outcome: asyncio.sleep(0, result=(
    kept.append(why) if outcome == withdrawal_notice.NOT_WITHDRAWN else None) or True)
from execution import account                                      # noqa: E402
account.load_account = lambda: asyncio.sleep(0, result=SimpleNamespace(creds={}, account_type="demo"))


class _Client:
    def __init__(self, *a):
        pass

    async def cancel(self, oid):
        cancelled.append(oid)
        return SimpleNamespace(ok=True, error=None)


import execution.broker as broker                                  # noqa: E402
broker.StopOrderClient = _Client
import data.candle_fetcher as cf                                   # noqa: E402
from data import fix_quotes                                        # noqa: E402
fix_quotes.live_quote = lambda sym, *a: None


def bars(highs):
    t0 = int(PLACED.timestamp())
    return [SimpleNamespace(time=t0 + 60 * i, high=h, low=h - 0.05) for i, h in enumerate(highs)]


def case(his_stop, highs, moved=True):
    cancelled.clear(); kept.clear()
    canceller._levels_he_moved = lambda oid: {"sl": his_stop} if moved else None
    cf.fetch_candles = lambda sym, tf, n: asyncio.sleep(0, result=bars(highs))
    return run(canceller.cancel_for_signal("sig-1", "GBP/JPY", "the setup died"))


# He widened the stop to 210.800. Price went to 210.650 — past OUR stop, not past HIS.
s.check("stop moved to 210.800, highest 210.650 → KEPT (his wider stop is still alive)",
        (case(210.800, [210.40, 210.55, 210.65]), cancelled), (False, []))
s.check("...and he is told why", "has not reached it" in (kept[0] if kept else ""), True)
s.check("stop moved to 210.800, a high of 210.812 → WITHDRAWN", (case(210.800, [210.40, 210.812, 210.60]),
                                                                   cancelled), (True, [377158463]))
s.check("a spike past his stop that came back (between two checks) still counts",
        case(210.800, [210.50, 210.85, 210.45]), True)
s.check("stop NOT moved → withdrawn as before (the caller already judged it dead)",
        (case(None, [210.40], moved=False), cancelled), (True, [377158463]))
canceller._levels_he_moved = lambda oid: {"entry": 210.30}
cf.fetch_candles = lambda sym, tf, n: asyncio.sleep(0, result=bars([210.40]))
cancelled.clear()
s.check("only his ENTRY moved → withdrawn (the stop is still ours)",
        run(canceller.cancel_for_signal("sig-1", "GBP/JPY", "dead")), True)
s.teeth("before today a moved stop was NEVER withdrawn — now price past it withdraws it",
        case(210.800, [210.90]) is True)
s.check("no bars and no live price → kept this pass, asked again next pass (no guess)",
        case(210.800, []), False)
fix_quotes.live_quote = lambda sym, *a: (210.79, 210.81)        # the ASK is past his stop
s.check("the live ASK past his stop counts for a SELL (its stop fires on the ask)",
        case(210.800, [210.40]), True)
s.done()
