"""HIS ❌ CANCEL TRADE / ✏️ ADJUST SL buttons (18 Nov 2026) — the engine side, through `execution.trade_actions` with
the account, broker, book and live price faked at their edges. Every path must end in a message to him, and the two
money rules must hold: a stop on the wrong side of the market is refused; an amend re-passes the target."""
import asyncio
from types import SimpleNamespace

from _harness import Suite

from execution import trade_actions as TA

s = Suite("VIX.1 — his Cancel trade / Adjust SL presses, carried out and answered")
calls, replies = [], []


class FakeClient:
    def __init__(self, *a):
        pass

    async def cancel(self, oid):
        calls.append(("cancel", oid)); return SimpleNamespace(ok=True, error=None)

    async def close_part(self, pid, vol):
        calls.append(("close", pid, vol)); BOOK["positions"] = []; return SimpleNamespace(ok=True, error=None)

    async def amend_sltp(self, pid, sym, sl, tp):
        calls.append(("amend", pid, sl, tp))
        for p in BOOK["positions"]:
            if p.position_id == pid:
                p.stop, p.target = sl, (tp if not BOOK.get("drop_tp") else None)
        return SimpleNamespace(ok=True, error=None)

    async def amend_order(self, oid, sym, vol, entry, sl, tp, exp):
        calls.append(("amend_order", oid, vol, entry, sl, tp, exp)); BOOK["levels"]["sl"] = sl
        return SimpleNamespace(ok=True, error=None)


def pos(bull=True, stop=1.3100, target=1.3200):
    return SimpleNamespace(position_id=77, symbol="GBP/USD", bullish=bull, volume=10_000_000, stop=stop, target=target)


BOOK = {}


async def _positions():
    return BOOK["positions"]


import data.ctrader_positions as CP  # noqa: E402
import execution.broker as BR  # noqa: E402
import execution.account as AC  # noqa: E402
from config.settings import settings  # noqa: E402
CP.open_positions = _positions
CP.last_resting_order_ids = lambda: BOOK["resting"]
CP.last_resting_levels = lambda oid: dict(BOOK["levels"])
CP.last_resting_meta = lambda oid: {"volume": 5_000_000, "tp": 1.3300, "expiry_ms": 123}
BR.StopOrderClient = FakeClient
ACCT = {"type": "demo"}


async def _acct():
    return SimpleNamespace(creds={}, account_type=ACCT["type"])
AC.load_account = _acct
object.__setattr__(settings, "auto_breakeven_demo_only", True)
QUOTE = {"q": (1.3150, 1.3152)}


async def _quote(sym):
    return QUOTE["q"]
TA._quote = _quote


async def _reply(row, text):
    replies.append(text)
TA._reply = _reply


def run(kind, price=None, position_id=None, order_id="555", bull=True):
    calls.clear(); replies.clear()
    row = dict(id="r1", kind=kind, price=price, symbol="GBP/USD", bullish=bull, position_id=position_id,
               order_id=order_id, chat_id="1", message_id=9)
    import storage.trade_actions as R
    R.settle = lambda *a, **k: None
    asyncio.new_event_loop().run_until_complete(TA._act(row))
    return list(calls), (replies[-1] if replies else "")


print("CANCEL — one button: a waiting order is withdrawn, a filled trade closed at market")
BOOK.update(positions=[], resting={555}, levels={"entry": 1.3160, "sl": 1.3140})
c, r = run("cancel")
s.check("a waiting order → the broker is told to cancel it", c, [("cancel", 555)])
s.check("...and he is told", "CANCELLED" in r, True)
BOOK.update(positions=[pos()], resting=set())
c, r = run("cancel", position_id=77)
s.check("a filled trade → closed at market with its FULL size", c, [("close", 77, 10_000_000)])
s.check("...and he is told", "CLOSED AT MARKET" in r, True)
BOOK.update(positions=[], resting=set())
c, r = run("cancel", position_id=77)
s.check("already closed → nothing sent to the broker, and he is told why", (c, "already closed" in r), ([], True))

print("\nADJUST SL — his price; never through the market; the target always kept")
BOOK.update(positions=[pos()], resting=set())
c, r = run("move_sl", price=1.3155, position_id=77)
s.check("a BUY stop ABOVE the bid (1.3150) would close it at once → refused, nothing sent", (c, "REFUSED" in r), ([], True))
c, r = run("move_sl", price=1.3080, position_id=77)
s.check("a wider stop below the bid is allowed — it is his decision", c[0][:3], ("amend", 77, 1.308))
s.teeth("the CURRENT target is re-passed (omitting it deletes it)", c and c[0][3] == 1.3200)
s.check("...read back and reported", "STOP MOVED" in r and "1.308" in r, True)
BOOK.update(positions=[pos(bull=False, stop=1.3200, target=1.3000)])
c, r = run("move_sl", price=1.3151, position_id=77, bull=False)
s.check("a SELL stop BELOW the ask (1.3152) → refused", (c, "REFUSED" in r), ([], True))
BOOK.update(positions=[pos()], drop_tp=True)
c, r = run("move_sl", price=1.3090, position_id=77)
s.check("if the broker lost the target, he is told loudly", "TAKE PROFIT IS GONE" in r, True)
BOOK["drop_tp"] = False
c, r = run("move_sl", price=None, position_id=77)
s.check("no price received → nothing sent, he is told to press again", (c, "Press" in r), ([], True))

print("\nADJUST SL on a WAITING order — must stay on the stop side of its entry")
BOOK.update(positions=[], resting={555}, levels={"entry": 1.3160, "sl": 1.3140})
c, r = run("move_sl", price=1.3165)
s.check("a BUY order's stop above its entry → refused", (c, "REFUSED" in r), ([], True))
c, r = run("move_sl", price=1.3130)
s.check("a valid stop → the order amended with its own size, entry, target and expiry",
        c, [("amend_order", 555, 5_000_000, 1.3160, 1.313, 1.3300, 123)])
s.check("...read back and reported", "STOP MOVED" in r, True)

print("\nSAFETY")
ACCT["type"] = "live"
c, r = run("cancel", position_id=77)
s.check("not a demo account → nothing sent, he is told", (c, "not demo" in r), ([], True))
ACCT["type"] = "demo"
import inspect  # noqa: E402
from execution import fill_watch, placer  # noqa: E402
from monitor import position_tracker  # noqa: E402
s.teeth("the tracker really runs it, as its own task", "_action_task = loop.create_task(trade_actions.check())" in inspect.getsource(position_tracker))
s.teeth("the order-placed message carries the buttons, plain text if they fail",
        "if not await trade_buttons.send(msg" in inspect.getsource(placer))
s.teeth("the filled message carries the buttons too", "await trade_buttons.send(msg" in inspect.getsource(fill_watch))
s.done()
