"""A WAITING ORDER IS PULLED BEFORE HIGH-IMPACT NEWS AND PUT BACK AFTER — the same 10 / 10 minutes (his rule of
18 Nov 2026; was 15 / 30) VIX.1 uses for new entries (`news_candle.in_news_window`).

Through `news_pull.check` with the calendar, broker, account and records faked at their edges.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from _harness import Suite

from core.types import NewsContext, NewsEvent, NewsImpact
from execution import intents, news_pull as NP, placer

s = Suite("AUTOTRADE — a waiting order is pulled before high-impact news, and put back after")
NOW = datetime.now(timezone.utc)


def calendar(minutes_away, ok=True):
    ev = NewsEvent(title="US CPI", currency="USD", impact=NewsImpact.HIGH,
                   scheduled_at=NOW + timedelta(minutes=minutes_away))
    return NewsContext(events=[ev], ok=ok)


news = [calendar(10)]
from news import news_fetcher                            # noqa: E402
news_fetcher.fetch = lambda now=None: asyncio.sleep(0, result=news[0])
from data import ctrader_positions as cp                 # noqa: E402
resting = {"55"}
cp.last_resting_levels = lambda oid: {"entry": 1.1, "sl": 1.1012} if str(oid) in resting else None
from execution import account, decision_log, withdrawal_notice   # noqa: E402
import execution.broker as broker                        # noqa: E402
from storage import autotrade_changes                     # noqa: E402
account.load_account = lambda: asyncio.sleep(0, result=SimpleNamespace(
    creds={}, account_type="demo", risk_base=10_000.0, equity=10_000.0))
cancels, statuses, placed = [], [], []


class _Client:
    def __init__(self, *a):
        pass

    async def cancel(self, oid):
        cancels.append(oid)
        resting.discard(str(oid))
        return SimpleNamespace(ok=True, error=None)


broker.StopOrderClient = _Client
autotrade_changes.set_status = lambda oid, st: statuses.append((oid, st))
autotrade_changes.news_pulled = lambda hours=24: []
decision_log.cancelled = lambda *a, **k: asyncio.sleep(0)
withdrawal_notice.announce = lambda *a, **k: asyncio.sleep(0, result=True)
placer.place_for_signal = lambda sig, *a, **k: asyncio.sleep(0, result=placed.append(sig))
setup_alive = [True]
NP._signal_for = lambda rec: SimpleNamespace(symbol=rec["symbol"]) if setup_alive[0] else None
NP._booted = False
intents._intent.clear()
intents._intent["55"] = dict(symbol="EUR/USD", side="SELL", entry=1.1, sl=1.1012, signal_id="sig-9",
                            spread_used=0.00008)
run = asyncio.new_event_loop().run_until_complete

run(NP.check(None))
s.check("CPI in 10 minutes → the waiting EUR/USD order is cancelled", cancels, [55])
s.check("...and saved as pulled for news (durable)", statuses[-1], ("55", "news_pulled"))
s.check("...and it is no longer treated as waiting", "55" in intents._intent, False)
run(NP.check(None))
s.check("nothing goes back while the window is still open", placed, [])

news[0] = calendar(-5)
run(NP.check(None))
s.check("5 minutes after the release (inside the 10) → still not back", placed, [])
news[0] = calendar(-11, ok=False)
run(NP.check(None))
s.teeth("window over but the calendar UNKNOWN → still not back", placed == [])
news[0] = calendar(-11)
run(NP.check(None))
s.check("11 minutes after, calendar known, setup alive → re-placed through the normal placer",
        [p.symbol for p in placed], ["EUR/USD"])
s.check("...and the old row closed as withdrawn", statuses[-1], ("55", "cancelled"))
run(NP.check(None))
s.check("...only once", len(placed), 1)

# a setup that ended during the news is not put back
resting.add("56")
intents._intent["56"] = dict(symbol="GBP/USD", side="BUY", entry=1.3, sl=1.299, signal_id="sig-10")
news[0] = calendar(5)
run(NP.check(None))
setup_alive[0] = False
news[0] = calendar(-40)
run(NP.check(None))
s.check("a setup that ended during the news is NOT put back", len(placed), 1)

news[0] = calendar(120)
resting.add("57")
intents._intent["57"] = dict(symbol="EUR/USD", side="SELL", entry=1.1, sl=1.1012, signal_id="s")
n = len(cancels)
run(NP.check(None))
s.check("a release two hours away pulls nothing", len(cancels), n)
jpy = NewsContext(events=[NewsEvent(title="BoJ", currency="JPY", impact=NewsImpact.HIGH,
                                    scheduled_at=NOW + timedelta(minutes=5))], ok=True)
news[0] = jpy
run(NP.check(None))
s.check("a yen release does not pull a EUR/USD order", len(cancels), n)

src = open(__import__("monitor.position_tracker", fromlist=["x"]).__file__, encoding="utf-8").read()
s.teeth("the tracker really runs it every poll", "await news_pull.check(send)" in src
        and "await resting_watch.check(send)" in src)
s.done()
