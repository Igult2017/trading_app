"""GOLD PROFIT BANKING — his rule of 21 Nov 2026, Reading B, gold only.

*"At 0.4R lets breakeven so we dont lose. At 1R lets take enough that equals 0.5R in that trade in dollar value. At
2R lets take another 0.5R value. Then the remaining amount ... we will be banking every 20 dollar profit that it makes
... make it applicable in any amount we risk."* — and *"use it on gold only for now ... only make it work on forex
pairs"* for the old manager.

Drives the REAL `gold_bank.manage` with only the broker, the account and the saved state replaced, so what is asserted
is the close that would really be sent.
"""
import asyncio

from _harness import Suite
from data.ctrader_positions import Position
from monitor import gold_bank as G, gold_bank_plan as plan, rungs

s = Suite("GOLD — profit banked in pieces (Reading B)")

# ── THE SCHEDULE: the table he approved, $100 risk, no cost ────────────────
big = plan.schedule(1_000_000, 0.0, 1, 1)
s.check("1R closes half (banks 0.5R)", (big[0].level_r, big[0].close), (1.0, 500_000))
s.check("2R closes a quarter (another 0.5R)", (big[1].level_r, big[1].close), (2.0, 250_000))
s.check("Reading B levels 2.8R, 3.92R, 5.49R", [round(x.level_r, 2) for x in big[2:5]], [2.8, 3.92, 5.49])
s.check("each Reading B piece banks 0.2R", [round(x.close / 1_000_000 * x.level_r, 3) for x in big[2:5]],
        [0.2, 0.2, 0.2])
s.check("the same SHARES on a 10x risk (works for any amount)",
        [x.close for x in plan.schedule(10_000_000, 0.0, 1, 1)[:2]], [5_000_000, 2_500_000])
s.check("cost is covered: k = 0.04 closes MORE at 1R so 0.5R is net",
        plan.schedule(1_000_000, 0.04, 1, 1)[0].close > 500_000, True)
# gold wire units: 0.01 lot = 100
s.check("0.04 lot: 0.02 at 1R, 0.01 at 2R, last 0.01 at 2.8R",
        [(x.level_r, x.close) for x in plan.schedule(400, 0.0, 100, 100)], [(1.0, 200), (2.0, 100), (2.8, 100)])
s.check("0.01 lot cannot split: closes whole at 1R", [(x.level_r, x.close) for x in plan.schedule(100, 0.0, 100, 100)],
        [(1.0, 100)])
s.check("0.05 lot: 1R rounds UP to 0.03 (never less than 0.5R)", plan.schedule(500, 0.0, 100, 100)[0].close, 300)
s.teeth("rounding up is what makes 0.05 bank at least 0.5R", plan._round_up(250, 100) == 300)

# ── WHICH STEP IS NEXT — read from the trade's CURRENT size ───────────────
sch = plan.schedule(400, 0.0, 100, 100)
s.check("full size -> the 1R step, close 200", plan.next_step(sch, 400, 100), (sch[0], 200))
s.check("after the 1R close -> the 2R step", plan.next_step(sch, 200, 100), (sch[1], 100))
s.check("he closed 0.01 by hand at 1R: only 100 more to reach the schedule", plan.next_step(sch, 300, 100), (sch[0], 100))
s.check("all closed -> nothing", plan.next_step(sch, 0, 100), None)

# ── THE LADDER: gold breakeven only, forex untouched ──────────────────────
s.check("gold ladder = breakeven only", [r.tag for r in rungs.ladder("XAU/USD")], ["breakeven"])
s.check("gold has no trail", rungs.trail("XAU/USD"), None)
s.check("forex ladder unchanged", [r.tag for r in rungs.ladder("EUR/USD")], ["breakeven", "lock_1r"])
s.check("forex trail unchanged", rungs.trail("GBP/USD").from_r, 2.2)
s.check("gold at 3R reaches only breakeven", [r.tag for r in rungs.reached(rungs.ladder("XAU/USD"), 3.0,
                                                                          rungs.trail("XAU/USD"))], ["breakeven"])

from execution import tp_extend
s.check("the 2R->4R move refuses gold", "gold" in (tp_extend.why_not(
    Position(1, "XAU/USD", True, 400, 3500.0, 3490.0, 3520.0, 0.0, 0.0, 0, start_stop=3490.0, label="auto-vix1-x"),
    "demo") or ""), True)


# ── MANAGE: the real function, broker replaced ────────────────────────────
class Res:
    def __init__(self, ok=True, error=None):
        self.ok, self.error = ok, error


sent: list = []


class FakeClient:
    def __init__(self, creds, account_type):
        pass

    async def close_part(self, pid, vol):
        await asyncio.sleep(0.01)
        sent.append(("close", pid, vol))
        return Res(True)

    async def amend_sltp(self, pid, sym, sl, tp):
        sent.append(("amend", pid, sl, tp))
        return Res(True)


class Acct:
    creds, account_type = {}, "demo"


from config import live_settings
from core import delivery_ledger
from execution import account, broker
from monitor import position_book
from storage import strategy_state_repo

switch = {"on": True}
_get = live_settings.get
live_settings.get = lambda n: switch["on"] if n == "gold_banking_enabled" else _get(n)
acct = {"a": Acct()}


async def _load():
    return acct["a"]


account.load_account = _load
broker.StopOrderClient = FakeClient
position_book.invalidate = lambda: None
strategy_state_repo.save = lambda k, v: None
strategy_state_repo.load = lambda k: {}
_marked: set = set()
delivery_ledger.is_delivered = lambda k: k in _marked
delivery_ledger.mark_delivered = lambda k: _marked.add(k)


def gold(pid, vol=400, target=3520.0, bullish=True, symbol="XAU/USD"):
    # buy at 3500, starting stop 3490 -> 1R = $10. No costs, so breakeven is the entry.
    return Position(pid, symbol, bullish, vol, 3500.0, 3500.0, target, 0.0, 0.0, 0, start_stop=3490.0)


def reset():
    sent.clear()
    G._starts.clear(); G._after_close.clear(); G._locks.clear(); G._fails.clear()


reset()
asyncio.run(G.manage(gold(1), 3509.0, None))
s.check("0.9R: nothing closes, but the engine's 2R target is moved out to 10R",
        sent, [("amend", 1, 3500.0, 3600.0)])
reset()
asyncio.run(G.manage(gold(2), 3510.0, None))
s.check("1R: closes 200 of 400", [x for x in sent if x[0] == "close"], [("close", 2, 200)])
s.check("...and the starting size is remembered", G._starts.get(2), 400)
reset()
asyncio.run(G.manage(gold(3, target=3535.0), 3509.0, None))
s.check("HIS OWN take profit (3.5R) is never touched", sent, [])


async def both():
    p = gold(4)
    await asyncio.gather(G.manage(p, 3510.0, None), G.manage(p, 3510.0, None))


reset()
asyncio.run(both())
s.check("the 0.5s watcher and the 2s poll at once -> ONE close", [x for x in sent if x[0] == "close"],
        [("close", 4, 200)])
asyncio.run(G.manage(gold(4), 3510.0, None))
s.check("a stale read still showing 400 right after the close -> no second close",
        [x for x in sent if x[0] == "close"], [("close", 4, 200)])
reset(); G._starts[5] = 400
asyncio.run(G.manage(gold(5, vol=200), 3520.0, None))
s.check("after a restart, size 200 at 2R -> the 2R piece (100)", [x for x in sent if x[0] == "close"],
        [("close", 5, 100)])

reset(); switch["on"] = False
asyncio.run(G.manage(gold(6), 3530.0, None))
s.check("switch OFF -> nothing", sent, [])
switch["on"] = True
reset(); acct["a"] = type("L", (), {"creds": {}, "account_type": "live"})()
asyncio.run(G.manage(gold(7), 3530.0, None))
s.check("not a demo account -> nothing", sent, [])
acct["a"] = Acct()
reset()
asyncio.run(G.manage(gold(8, symbol="EUR/USD"), 3530.0, None))
s.check("forex -> nothing (the old manager keeps it)", sent, [])
reset()
asyncio.run(G.manage(Position(9, "XAU/USD", False, 400, 3500.0, 3500.0, 3480.0, 0.0, 0.0, 0, start_stop=3510.0),
                     3490.0, None))
s.check("a SELL at 1R (ask 3490) closes its half too", [x for x in sent if x[0] == "close"], [("close", 9, 200)])

# ── TEETH ─────────────────────────────────────────────────────────────────
reset()
try:
    G._locks = type("NoLock", (dict,), {"setdefault": lambda self, k, v: asyncio.Lock()})()
    asyncio.run(both())
    s.teeth("without the per-trade lock both loops close", len([x for x in sent if x[0] == "close"]) == 2)
finally:
    G._locks = {}
reset()
_eng = G.engine_target
G.engine_target = lambda p: True
asyncio.run(G.manage(gold(10, target=3535.0), 3509.0, None))
s.teeth("treating his target as the engine's would move it", any(x[0] == "amend" for x in sent))
G.engine_target = _eng

# ── WIRED: both loops really CALL it (the call, not the def — `def _bank_gold(` would match a bare name) ──
import pathlib
_root = pathlib.Path(__file__).resolve().parents[2]
s.check("the 2s poll calls it", "    await _bank_gold(p, guard, send)" in (_root / "monitor/position_tracker.py").read_text(
    encoding="utf-8"), True)
s.check("the 0.5s watcher calls it", "await _bank_gold(p, guard, self.send)" in (_root / "monitor/trade_watcher.py"
                                                                                  ).read_text(encoding="utf-8"), True)

s.done()
