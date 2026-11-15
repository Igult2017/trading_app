"""A FILL WORSE THAN PLANNED IS CUT BACK TO 1% — the plan's example: 2 pips worse on a 12-pip stop.

Through `fill_risk.correct` with the broker, account and ledger faked at their edges, and through
`fill_watch.check_fills` to prove it is really called on a fill, before the report.
"""
import asyncio
from types import SimpleNamespace

from _harness import Suite

from config.settings import settings
from core import delivery_ledger
from execution import fill_risk
from execution.sizing import plan_size

s = Suite("AUTOTRADE — an over-risked fill is cut back to 1%, once")
for k, v in dict(autotrade_risk_pct=1.0, autotrade_fixed_lots=0.0, autotrade_max_lots=5.0).items():
    object.__setattr__(settings, k, v)
BASE = 10_000.0

# Planned: a SELL at 1.10000, stop 1.10120 (12 pips) → sized for 12 pips.
_, planned_vol, _ = plan_size(equity=BASE, entry=1.10000, stop=1.10120, symbol="EUR/USD",
                              risk_pct=1.0, max_lots=5.0)
# Filled 2 pips WORSE (1.09980) with the same stop → 14 pips at risk on 12 pips' worth of lots.
pos = SimpleNamespace(position_id=77, symbol="EUR/USD", bullish=False, volume=planned_vol,
                      entry=1.09980, stop=1.10120, start_stop=1.10120)
_, target, _ = plan_size(equity=BASE, entry=1.09980, stop=1.10120, symbol="EUR/USD",
                         risk_pct=1.0, max_lots=5.0)

s.check("2 pips worse on 12 is ~17% over → over the 10% tolerance",
        round((planned_vol / target - 1) * 100), 17)
s.check("the excess is the difference to the 1% size", fill_risk.excess(planned_vol, target),
        planned_vol - target)
s.check("under 10% over → nothing is closed", fill_risk.excess(int(target * 1.09), target), 0)
s.teeth("the tolerance is what decides", fill_risk.excess(int(target * 1.11), target) > 0)

marks, closes, told = set(), [], []
delivery_ledger.is_delivered = lambda k: k in marks
delivery_ledger.mark_delivered = lambda k: marks.add(k)
from execution import account                           # noqa: E402
import execution.broker as broker                       # noqa: E402
from execution import placer                            # noqa: E402
account.load_account = lambda: asyncio.sleep(0, result=SimpleNamespace(
    creds={}, account_type="demo", risk_base=BASE, equity=BASE))
placer._usd_jpy_for = lambda sym: asyncio.sleep(0, result=None)
ok = [True]


class _Client:
    def __init__(self, *a):
        pass

    async def close_part(self, pid, vol):
        closes.append((pid, vol))
        return SimpleNamespace(ok=ok[0], error=None if ok[0] else "timed out — state UNKNOWN")


broker.StopOrderClient = _Client


async def send(t):
    told.append(t)
    return True

run = asyncio.new_event_loop().run_until_complete
intent = dict(volume=planned_vol)
run(fill_risk.correct("ord-1", intent, pos, send))
s.check("the over-risked part is closed, on THIS position", closes, [(77, planned_vol - target)])
s.check("...the intent keeps the remaining size, so the fill report still matches",
        intent["volume"], target)
s.check("...and he is told", "OVER-RISKED FILL CUT BACK" in (told[-1] if told else ""), True)
run(fill_risk.correct("ord-1", intent, pos, send))
s.check("seen again on the next poll → NOT closed twice", len(closes), 1)

ok[0] = False
run(fill_risk.correct("ord-2", dict(volume=planned_vol), pos, send))
run(fill_risk.correct("ord-2", dict(volume=planned_vol), pos, send))
s.check("a failed close is reported and NOT retried (its outcome may be unknown)",
        (len(closes), "NOT CUT" in told[-1]), (2, True))

exact = SimpleNamespace(**{**pos.__dict__, "entry": 1.10000, "volume": planned_vol})
run(fill_risk.correct("ord-3", dict(volume=planned_vol), exact, send))
s.check("a fill exactly as planned closes nothing", len(closes), 2)

src = open(__import__("execution.fill_watch", fromlist=["x"]).__file__, encoding="utf-8").read()
s.teeth("check_fills really CALLS it, before the fill report",
        0 < src.index("await fill_risk.correct(order_id, intent, match, send)")
        < src.index("msg = fill_report("))
s.done()
