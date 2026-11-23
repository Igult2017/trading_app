"""PUTTING BACK A STOP CHANGED BY HAND GOES THROUGH HIS RISK RULE (his decision "A", 23 Nov 2026).

The REAL `dispatcher._exec_follower` and the REAL `risk_stop.follower_stop`, with only the outside world stood in for (the
database, the credentials, the broker). In words:
  * since 23 Nov 2026 the follower's account is READ first and the copy's OWN live levels decide (`linked_copies.py`):
    a stop move to the levels it already has sends nothing; a hand-changed copy is put back;
  * when the account cannot be read, the copier's record decides, as before: a normal stop move to levels the record says
    are there sends NOTHING (the 21 Nov rule); a RESTORE (`restore=True`) sends them anyway;
  * a restore still goes through the stop ceiling: the master's 50-pip stop on 1 lot is 5% of a $10,000 account, so the
    follower gets the 1% stop (10 pips, 1.0990), never the master's raw 1.0950.
"""
import asyncio
from types import SimpleNamespace

from _harness import Suite
import dispatcher as D
from providers.ctrader import PositionSnapshot

s = Suite("COPY — a hand-changed stop is put back through the normal stop path")

snap = PositionSnapshot(position_id=500, symbol="EURUSD", action="BUY", volume_lots=1.0, entry_price=1.1000,
                        stop_loss=1.0950, take_profit=1.1200)
follower = SimpleNamespace(id="f-1", master_id="m-1", direction="same", lot_mode="mult", lot_multiplier=1,
                           fixed_lot=None, risk_percent=1, trade_delay_sec=0, symbol_whitelist=None)
account = SimpleNamespace(platform="ctrader", balance=10000, is_active=True, account_type="demo")
sent, logged, recorded = [], [], []
LIVE = {"read": False, "sl": 1.099, "tp": 1.12}      # what the broker shows on follower trade 77 (cp-500)


def _account():
    td = SimpleNamespace(label="cp-500", volume=100000, symbolId=1)
    pos = SimpleNamespace(positionId=77, tradeData=td, stopLoss=LIVE["sl"], takeProfit=LIVE["tp"])
    return SimpleNamespace(position=[pos], order=[])


class Executor:
    creds, account_type = {"ctraderId": "9"}, "demo"

    async def read_account(self):
        if not LIVE["read"]:
            return SimpleNamespace(ok=False, error="unreadable", account=None)
        return SimpleNamespace(ok=True, error=None, account=_account())

    async def modify_position(self, pid, sl, tp):
        sent.append((pid, sl, tp))
        return SimpleNamespace(ok=True, external_id=str(pid), entry_price=None, error=None, broker_ms=None)


async def fake_run_db(fn, *a):
    name = getattr(fn, "__name__", "")
    if name == "_get_broker_account":
        return account
    if name == "check_follower_allowed":
        return True, None
    if name == "_find_follower_position_id":
        return "77", 1.0
    if name == "_follower_levels":
        return (1.099, 1.12)                 # the copier's record: the 1% stop it set, and the master's target
    if name == "master_order_of":
        return None
    if name == "_record_follower_trade":
        recorded.append(a)
        return None
    raise AssertionError(f"unexpected database call {name}")


async def creds(_):
    return {"ctraderId": "9"}

D.run_db, D.get_creds, D._get_executor = fake_run_db, creds, lambda b, c: Executor()
D.is_symbol_allowed = lambda sym, f: True
D._log = lambda fid, tid, lvl, ev, msg: logged.append((ev, msg))
D.COPY_ENABLED, D.COPY_DRY_RUN = True, False

loop = asyncio.new_event_loop()
loop.run_until_complete(D._exec_follower(None, follower, snap, "MODIFY"))
s.check("a NORMAL stop move to the levels on record sends nothing ('already there')", sent, [])
s.check("…and says so in the Activity log", any("already there" in m for _, m in logged), True)

loop.run_until_complete(D._exec_follower(None, follower, snap, "MODIFY", restore=True))
s.check("a RESTORE sends them anyway, to follower trade 77", [x[0] for x in sent], [77])
s.check("…with the 1% stop (1.099), NOT the master's raw 5% stop (1.095) — the ceiling still applies",
        [x[1] for x in sent], [1.099])
s.check("…and the master's target (1.12)", [x[2] for x in sent], [1.12])
s.check("…and it is recorded as a MODIFY, so the next check compares against it",
        [r[3] for r in recorded], ["MODIFY"])

# ── THE ACCOUNT READ AT THE BROKER (23 Nov 2026): the copy's own live levels decide ──────────────────────────────────
LIVE["read"] = True
sent.clear(); logged.clear()
loop.run_until_complete(D._exec_follower(None, follower, snap, "MODIFY", restore=True))
s.check("read at the broker: the copy already shows 1.099 / 1.12 -> even a restore sends nothing", sent, [])
LIVE["sl"] = 1.0980                                   # the follower moved the stop by hand
loop.run_until_complete(D._exec_follower(None, follower, snap, "MODIFY", restore=True))
s.check("…its stop changed by hand to 1.098 -> put back to 1.099 on trade 77", sent, [(77, 1.099, 1.12)])
sent.clear()
loop.run_until_complete(D._exec_follower(None, follower, snap, "MODIFY"))
s.check("…and a NORMAL stop move does the same: the live levels, not the record, say it differs", sent,
        [(77, 1.099, 1.12)])
s.done()
