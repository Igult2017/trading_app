"""EVERY COPY OF A MASTER TRADE GETS THE STOP MOVE AND THE CLOSE; A COPY ALREADY THERE IS NEVER OPENED AGAIN (23 Nov 2026).

The GBP/USD loss on ctrader4: master stop order 379730644 filled as master position 266762486. The follower ended up
with TWO copies — copy A (market, label cp-266762486) and copy B (the order copy that filled 2 min later, label
cp-379730644). Breakeven (1.31246) and the close reached copy A only; copy B lost $109.44.

The REAL `dispatcher._exec_follower` and the REAL `linked_copies`, with the outside world stood in for (database,
credentials, broker). Run: cd copy_platform/tests && python test_linked_copies.py
"""
import asyncio
from types import SimpleNamespace as NS

from _harness import Suite
import dispatcher as D
import linked_copies as L
from providers.ctrader import PositionSnapshot

s = Suite("COPY — every copy of the master trade is found at the broker, none is opened twice")

snap = PositionSnapshot(position_id=266762486, symbol="GBPUSD", action="BUY", volume_lots=0.96, entry_price=1.31200,
                        stop_loss=1.31000, take_profit=1.31800)
follower = NS(id="f-ct4", master_id="m-ctp2", direction="same", lot_mode="mult", lot_multiplier=1, fixed_lot=None,
              risk_percent=1, trade_delay_sec=0, symbol_whitelist=None)
broker = NS(platform="ctrader", balance=10000, is_active=True, account_type="demo")
W = {}                                                    # what the broker shows / what the stand-ins answer


def reset(positions=(), orders=(), readable=True, recorded=("1", 0.96)):
    W.update(positions=list(positions), orders=list(orders), readable=readable, recorded=recorded, calls=[], db=[],
             logged=[])


def pos(pid, label, sl=1.31000, tp=1.31800):
    return NS(positionId=pid, tradeData=NS(label=label, volume=9_600_000, symbolId=2), stopLoss=sl, takeProfit=tp)


def order(oid, label):
    return NS(orderId=oid, tradeData=NS(label=label))


def ok(x=None):
    return NS(ok=True, external_id=str(x) if x is not None else None, entry_price=None, error=None, broker_ms=None)


class Executor:
    creds, account_type = {"ctraderId": "5347048"}, "demo"

    async def read_account(self):
        W["calls"].append(("read",))
        if not W["readable"]:
            return NS(ok=False, error="timed out", account=None)
        return NS(ok=True, error=None, account=NS(position=W["positions"], order=W["orders"]))

    async def open_position(self, *a, **k):
        W["calls"].append(("open",)); return ok(555)

    async def modify_position(self, pid, sl, tp):
        W["calls"].append(("modify", pid, sl, tp)); return ok(pid)

    async def close_position(self, pid, lots, symbol="", raw_volume=None):
        W["calls"].append(("close", pid, raw_volume)); return ok(pid)

    async def cancel_pending(self, oid):
        W["calls"].append(("cancel", oid)); return ok(oid)


async def fake_run_db(fn, *a):
    name = getattr(fn, "__name__", "")
    W["db"].append(name)
    answers = {"_get_broker_account": broker, "check_follower_allowed": (True, None),
               "check_trade_risk": (True, None), "_find_follower_position_id": W["recorded"],
               "_follower_levels": None, "master_order_of": "379730644"}
    if name in answers:
        return answers[name]
    if name in ("_record_follower_trade", "adopt", "correct_record"):
        W.setdefault("wrote", []).append((name, a))
        return None
    raise AssertionError(f"unexpected database call {name}")


async def creds(_):
    return {"ctraderId": "5347048"}


async def no_mirror(*a):
    return False

D.run_db, D.get_creds, D._get_executor = fake_run_db, creds, lambda b, c: Executor()
D.is_symbol_allowed = lambda sym, f: True
D.is_session_allowed = lambda f: (True, None)
D.mirror.record_fill_for = no_mirror
D._log = lambda fid, tid, lvl, ev, msg: W["logged"].append((lvl, ev, msg))
D.COPY_ENABLED, D.COPY_DRY_RUN = True, False
loop = asyncio.new_event_loop()
run = lambda *a, **k: loop.run_until_complete(D._exec_follower(*a, **k))        # noqa: E731
sent = lambda kind: [c for c in W["calls"] if c[0] == kind]                    # noqa: E731

# ── NO SECOND ENTRY ─────────────────────────────────────────────────────────────────────────────────────────────────
reset(orders=[order(379730645, "cp-379730644")])
W["wrote"] = []
run("mt-1", follower, snap, "OPEN", master_order_id=379730644)
s.check("master fill, the order copy still RESTING on the account (not on record) -> no market order", sent("open"), [])
s.check("...it is written down as the follower's copy", [w[0] for w in W["wrote"]], ["adopt"])
reset(positions=[pos(266762500, "cp-379730644")])
W["wrote"] = []
run("mt-1", follower, snap, "OPEN", master_order_id=379730644)
s.check("master fill, the order copy already FILLED on the account -> no market order", sent("open"), [])
s.check("...written down WITH its position", [w[1][3].position_id for w in W["wrote"] if w[0] == "adopt"],
        ["266762500"])
reset()
run("mt-1", follower, snap, "OPEN", master_order_id=379730644)
s.check("nothing on the account -> the market copy, as before", len(sent("open")), 1)
reset(readable=False)
run("mt-1", follower, snap, "OPEN", master_order_id=379730644)
s.check("account cannot be read -> NOT opened (a missed entry beats a double one)", sent("open"), [])
s.check("...and said in the Activity log", any(l[1] == "FAIL" and "could not read your account" in l[2]
                                               for l in W["logged"]), True)

# ── THE 23 NOV TRADE: TWO COPIES, BREAKEVEN AND THE CLOSE ──────────────────────────────────────────────────────────
be = PositionSnapshot(position_id=266762486, symbol="GBPUSD", action="BUY", volume_lots=0.96, entry_price=1.31200,
                      stop_loss=1.31246, take_profit=1.31800)
A, B = pos(266762490, "cp-266762486"), pos(266762500, "cp-379730644")
reset(positions=[A, B])
run(None, follower, be, "MODIFY")                         # an old-style event: no master order id on it
s.check("breakeven reaches BOTH copies (the order id read from the master's record)",
        sorted(c[1] for c in sent("modify")), [266762490, 266762500])
s.check("...both to 1.31246, target kept", {(c[2], c[3]) for c in sent("modify")}, {(1.31246, 1.318)})
s.check("...and the Activity log says two copies were found",
        any("2 copies of this master trade" in l[2] for l in W["logged"]), True)
reset(positions=[pos(266762490, "cp-266762486", sl=1.31246), B])
run(None, follower, be, "MODIFY")
s.check("one copy already at breakeven -> only the other is changed", [c[1] for c in sent("modify")], [266762500])
reset(positions=[A, B], orders=[order(379730699, "cp-379730644")])
run(None, follower, snap, "CLOSE", master_order_id=379730644)
s.check("the master's close closes BOTH copies, each by its own broker size",
        sorted((c[1], c[2]) for c in sent("close")), [(266762490, 9_600_000), (266762500, 9_600_000)])
s.check("...and a copy ORDER of it still resting is cancelled", [c[1] for c in sent("cancel")], [379730699])
D.COPY_DRY_RUN = True
reset(positions=[A, B], orders=[order(379730699, "cp-379730644")])
run(None, follower, snap, "CLOSE", master_order_id=379730644)
s.check("a DRY RUN sends nothing at all — no close, no cancel", sent("close") + sent("cancel"), [])
D.COPY_DRY_RUN = False

# ── A COPIED ORDER THAT FILLED AFTER THE MASTER'S: NO POSITION ON RECORD ────────────────────────────────────────────
reset(positions=[pos(9, "cp-379730644")], recorded=(None, 0.96))
W["wrote"] = []
run(None, follower, be, "MODIFY", master_order_id=379730644)
s.check("no position on record (filled 2 min after the master) -> breakeven still reaches it",
        [c[1] for c in sent("modify")], [9])
s.check("...and the record is corrected to that position", [w[1][2] for w in W["wrote"] if w[0] == "correct_record"],
        ["9"])

# ── ACCOUNT UNREADABLE: THE COPY ON RECORD, AS BEFORE ───────────────────────────────────────────────────────────────
reset(readable=False)
run(None, follower, be, "MODIFY")
s.check("account cannot be read -> the copy on record gets the move, as before", [c[1] for c in sent("modify")], [1])

# ── TEETH — only the market copy's label (the old blind spot) leaves copy B behind ────────────────────────────────
real = L.labels
L.labels = lambda key, oid=None: {f"cp-{key}"}
reset(positions=[A, B])
run(None, follower, be, "MODIFY")
s.check("TEETH: without the order copy's label, copy B misses breakeven (the 23 Nov loss)",
        [c[1] for c in sent("modify")], [266762490])
L.labels = real


async def no_check(*a):
    return False

real_hidden = D._hidden_copy
D._hidden_copy = no_check                                 # "no copy is ever already there" — the old behaviour
reset(orders=[order(379730645, "cp-379730644")])
run("mt-1", follower, snap, "OPEN", master_order_id=379730644)
s.check("TEETH: without the account check, the fill is copied AGAIN beside the hidden copy (copy A of 23 Nov)",
        len(sent("open")), 1)
D._hidden_copy = real_hidden
s.done()
