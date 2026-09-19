"""A WITHDRAWN ORDER IS ANNOUNCED — and an order whose setup is no longer live is withdrawn within a poll.

HIS ANSWER, 2026-09-15: *"Yes"* to a message when a resting order is withdrawn, saying why. Placing an
order always sent a DM; withdrawing one sent nothing.

AND THE GAP FOUND WHILE CHECKING. When VIX.1 calls a delivered setup dead before the entry fills, it
expires the signal (`vix1.py:235-244`) and never touches the broker order. `signal_monitor` only walks
ACTIVE signals and the orphan sweep ran ONCE per process, so the order rested until the next deploy or
the broker's 24h expiry. His rule, 04 Sep: *"the order should be canceled as soon as possible not
waiting 24HR."* The sweep now runs on every poll.

The broker, the account and Telegram are faked. The canceller, the sweep and the message are real.
"""
import asyncio
import time

from _harness import Suite

import core.delivery_ledger as ledger
import execution.account as acct_mod
import execution.broker as broker_mod
import storage.signal_repo as sr
from execution import canceller
from execution import withdrawal_notice as W
from storage import autotrade_repo

s = Suite("AUTOTRADE — a withdrawn order is announced, and a dead setup's order is withdrawn")
run = asyncio.new_event_loop().run_until_complete

sent: list[str] = []


async def _telegram(text):
    sent.append(text)
    return True

W._sender = _telegram
_told: set[str] = set()
ledger.is_delivered = lambda k: k in _told          # in memory: this suite never touches the database
ledger.mark_delivered = lambda k: _told.add(k)


class _Res:
    def __init__(self, ok, error=None):
        self.ok, self.error = ok, error


class _Broker:
    error = None                                    # None = the cancel succeeds

    def __init__(self, creds, account_type):
        pass

    async def cancel(self, order_id):
        cancelled.append(int(order_id))
        return _Res(_Broker.error is None, _Broker.error)


class _Acct:
    creds, account_type = {"ctraderId": 1, "accessToken": "x"}, "demo"


async def _account():
    return _Acct()

cancelled: list[int] = []
closed: list[tuple] = []
book: dict = {}
acct_mod.load_account = _account
broker_mod.StopOrderClient = _Broker
autotrade_repo.order_for_signal = lambda sid: book.get(sid)
autotrade_repo.record_closed = lambda oid, st: closed.append((oid, st))
filled: list[tuple] = []
autotrade_repo.record_filled = lambda oid, px, at=None: filled.append((oid, px))
# WHAT THE BROKER'S DEAL LIST SAYS about a vanished order (docs/OPEN.md B29, 19 Sep 2026). Default:
# it never filled, so every "already gone" check below keeps its meaning. This suite never reaches a
# real broker.
from data import ctrader_orders                                       # noqa: E402
_fate = {"answer": (True, None)}


async def _fill_for_order(order_id, lookback_days=14):
    return _fate["answer"]
ctrader_orders.fill_for_order = _fill_for_order
# His 14 Sep 07:23 EUR/USD sell, as `autotrade_orders` holds it. Any other order has no record.
ORDER_0723 = dict(symbol="EUR/USD", side="SELL", entry=1.15508, sl=1.1556, tp=1.15301, lots=3.85, strategy="VIX.1")
autotrade_repo.intent_for = lambda oid: dict(ORDER_0723) if oid == "360658076" else None
WHY = "the high reached 1.15568, through the stop at 1.1556, before the entry ever filled"

# ── WITHDRAWN ──────────────────────────────────────────────────────────────
book["sig-0723"] = "360658076"
s.check("the withdrawal itself still succeeds", run(canceller.cancel_for_signal("sig-0723", "EUR/USD", WHY)), True)
s.check("...and sends exactly ONE message", len(sent), 1)
for want in ("ORDER WITHDRAWN", "EUR/USD", "SELL", "VIX.1", "360658076", "1.15508", "1.15560", "1.15301",
             "3.85 lots", "1.15568", "no trade was opened"):
    s.check(f"...which states {want!r}", want in sent[0], True)
run(canceller.cancel_for_signal("sig-0723", "EUR/USD", WHY))
s.check("the same withdrawal again sends NO second message", len(sent), 1)
_Broker.error = "ORDER_NOT_FOUND"                   # an overlapping sweep finds it already gone
run(canceller.cancel_for_signal("sig-0723", "EUR/USD", WHY))
s.check("...nor a late 'already gone' for an order he was told was withdrawn", len(sent), 1)
_Broker.error = None

# ── ALREADY GONE: never claims a withdrawal that did not happen ───────────
sent.clear()
book["sig-gone"] = "359170674"
_Broker.error = "cTrader refused: ORDER_NOT_FOUND Order not found with id 359170674"
run(canceller.cancel_for_signal("sig-gone", "XAU/USD", "its signal is no longer active"))
s.check("an order the broker no longer has sends ONE message", len(sent), 1)
s.check("...saying it was ALREADY GONE", "ALREADY GONE" in sent[0], True)
s.check("...never that it was WITHDRAWN", "ORDER WITHDRAWN" in sent[0], False)
s.check("...and with no order record it still names the pair and the order", ("XAU/USD" in sent[0], "359170674" in sent[0]), (True, True))

# ── COULD NOT WITHDRAW: the failure is the loud one ───────────────────────
sent.clear()
book["sig-refused"] = "444"
_Broker.error = "TRADING_DISABLED"
run(canceller.cancel_for_signal("sig-refused", "GBP/USD", WHY))
s.check("a broker refusal sends ONE message", len(sent), 1)
s.check("...COULD NOT WITHDRAW, with the broker's words", ("COULD NOT WITHDRAW" in sent[0], "TRADING_DISABLED" in sent[0]), (True, True))
s.check("...and warns the order may still be live", "may still be resting" in sent[0], True)
run(canceller.cancel_for_signal("sig-refused", "GBP/USD", WHY))
s.check("the sweep's retry sends NO second message", len(sent), 1)
_Broker.error = None

sent.clear()
book["sig-noacct"] = "445"


async def _no_account():
    return None

acct_mod.load_account = _no_account
run(canceller.cancel_for_signal("sig-noacct", "EUR/USD", WHY))
s.check("no trading account → COULD NOT WITHDRAW", "COULD NOT WITHDRAW" in (sent[0] if sent else ""), True)
acct_mod.load_account = _account

# ── A MESSAGE THAT DID NOT ARRIVE IS NOT RECORDED AS SENT ─────────────────
sent.clear()
book["sig-dead-tg"] = "446"


async def _telegram_down(text):
    return False

W._sender = _telegram_down
run(canceller.cancel_for_signal("sig-dead-tg", "EUR/USD", WHY))
s.check("a failed send is not recorded as told", "withdrawal:withdrawn:446" in _told, False)
W._sender = _telegram
s.check("...so it can still be sent later", run(W.announce("446", "EUR/USD", WHY, W.WITHDRAWN)), True)

# ── A HANGING TELEGRAM CANNOT HOLD THE WITHDRAWAL UP ──────────────────────
book["sig-hang"] = "447"
closed.clear()


async def _telegram_hangs(text):
    await asyncio.sleep(30)
    return True

W._sender = _telegram_hangs
t0 = time.monotonic()
ok = run(canceller.cancel_for_signal("sig-hang", "EUR/USD", WHY))
s.check("with Telegram hanging, the withdrawal still completes", ok, True)
s.check(f"...within the send cap ({time.monotonic() - t0:.1f}s)", time.monotonic() - t0 < 5.0, True)
s.check("...and the order record is still closed", closed, [("447", autotrade_repo.STATUS_CANCELLED)])
W._sender = _telegram
s.check("a reason carrying markup is escaped, not sent raw", "&lt;b&gt;" in W.message(W.WITHDRAWN, 1, "EUR/USD", __import__("html").escape("<b>"), None), True)

# ── THE GAP: A SETUP CALLED DEAD LEAVES ITS ORDER RESTING ─────────────────
# VIX.1 has expired the signal (so it is not active) while its order still rests at the broker.
sent.clear(); cancelled.clear()
canceller._sweeping = False
resting = {"360700001": {"symbol": "EUR/USD", "signal_id": "sig-retracted"}}
autotrade_repo.pending = lambda: resting
book["sig-retracted"] = "360700001"
sr.get_active = lambda: []


async def _two_polls_at_once():
    canceller.sweep_orphans_soon()
    canceller.sweep_orphans_soon()       # a poll arriving while the first sweep still runs
    await asyncio.sleep(0.5)
    return list(cancelled)

got = run(_two_polls_at_once())
s.check("the next poll withdraws the retracted setup's order", got, [360700001])
s.check("...once, even with two polls overlapping", got.count(360700001), 1)
s.check("...and he is told", any("ORDER WITHDRAWN" in m for m in sent), True)
s.check("...and the guard is free again afterwards", canceller._sweeping, False)

cancelled.clear()
resting.clear(); resting["360700002"] = {"symbol": "XAU/USD", "signal_id": "sig-expired"}
book["sig-expired"] = "360700002"


async def _later_poll():
    canceller.sweep_orphans_soon()
    await asyncio.sleep(0.5)
    return list(cancelled)

s.check("a LATER poll sweeps again — it is no longer once per process", run(_later_poll()), [360700002])

# ── IT FILLED FIRST: a real trade is never announced as a withdrawal (B29, 19 Sep 2026) ──────────
# His 16 Sep GBP/USD sell, order 361154082: filled 15:03:17.525 at 1.34548 and stopped 1.2 s later.
from data.ctrader_orders import Fill                                  # noqa: E402

sent.clear(); closed.clear(); filled.clear()
book["sig-16sep"] = "361154082"
_Broker.error = "cTrader refused: ORDER_NOT_FOUND Order not found with id 361154082"
_fate["answer"] = (True, Fill("361154082", 241869270, 1.34548, 1789560197525))
run(canceller.cancel_for_signal("sig-16sep", "GBP/USD", "its signal is no longer active"))
s.check("an order that FILLED sends ONE message", len(sent), 1)
s.check("...saying it had ALREADY FILLED, at its real price",
        ("HAD ALREADY FILLED" in sent[0], "1.34548" in sent[0]) if sent else None, (True, True))
s.check("...never that it was withdrawn or merely gone",
        ("ORDER WITHDRAWN" in sent[0], "ALREADY GONE" in sent[0]) if sent else None, (False, False))
s.check("...and the record says FILLED, not cancelled", (filled, closed), ([("361154082", 1.34548)], []))
_Broker.error = None
_fate["answer"] = (True, None)
s.done()
