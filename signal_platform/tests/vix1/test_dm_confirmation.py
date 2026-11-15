"""DM CONFIRMATION AND THE TRADING SWITCH — through the real placer and the real confirmation code.

HIS RULES, 16 Nov 2026: one switch on at a time (off | auto | confirm); the DM gets exactly what
autotrade would take; no answer = nothing placed; a Confirm after the price reached the entry is
refused with the reason; a Confirm goes through every guard again.
The broker, database and Telegram are faked at their edges.
"""
import asyncio
from types import SimpleNamespace

from _harness import Suite, trade_mode_is

from core.types import Direction, Signal
from execution import confirmations as CF, decision_log, guards, placer, trade_mode

s = Suite("DM CONFIRMATION — offered, not placed; a Confirm is checked again and placed")
run = asyncio.new_event_loop().run_until_complete
real_mode = trade_mode.mode


def sig(**k):
    base = dict(symbol="EUR/USD", direction=Direction.SELL, strategy_id="vix1", strategy_name="VIX.1",
                entry_price=1.10000, stop_loss=1.10120, take_profit=1.09520, confidence=0.85,
                db_id="sig-1")
    base.update(k)
    return Signal(**base)


# ── 1. the switch: unreadable or unknown reads as OFF ─────────────────────────
trade_mode.mode = real_mode
trade_mode.forget()
import execution.trade_mode as TM                                 # noqa: E402
_real_read = TM._read
TM._read = lambda: (_ for _ in ()).throw(RuntimeError("db down"))
s.check("the mode cannot be read → OFF (doubt refuses)", TM.mode(), "off")
TM.forget()
TM._read = lambda: "confirm"
s.check("a saved 'confirm' reads as confirm", TM.mode(), "confirm")
TM._read = lambda: "banana" if False else "off"
s.teeth("...and it is held 5 s, not re-read every check", TM.mode() == "confirm")
TM.forget()
TM._read = _real_read

# ── 2. the placer: CONFIRM offers instead of placing; AUTO and a Confirm place ─
sent, offers, refused = [], [], []


class _Broker:
    def __init__(self, *a):
        pass

    async def place_stop(self, **k):
        sent.append(k["symbol"])
        return SimpleNamespace(ok=True, order_id="900", error=None)


import execution.broker as broker                                 # noqa: E402
broker.StopOrderClient = _Broker
guards.check = lambda *a, **k: None
placer._live_book = lambda: asyncio.sleep(0, result=([], set()))
placer._usd_jpy_for = lambda sym: asyncio.sleep(0, result=None)
CF.offer = lambda signal, lots, pips: asyncio.sleep(0, result=offers.append((signal.symbol, lots)))
decision_log.refused = lambda *a, **k: asyncio.sleep(0, result=refused.append(a))
decision_log.placed = lambda *a, **k: asyncio.sleep(0)
from storage import autotrade_repo                                # noqa: E402
autotrade_repo.record_placed = lambda *a, **k: None
from execution import best_signal                                 # noqa: E402
best_signal._WINDOW_S = 0.01


def place(x):
    return run(placer.place_for_signal(x, {}, "demo", 10_000.0, risk_base=10_000.0))

trade_mode_is("confirm")
got = place(sig())
s.check("DM confirmation ON → the signal is OFFERED", offers, [("EUR/USD", 0.83)])
s.check("...and NOTHING reaches the broker", (got, sent), (None, []))
got = place(sig(confirmed=True))
s.check("the same signal after his Confirm → placed", (got, sent), ("900", ["EUR/USD"]))
trade_mode_is("auto")
offers.clear()
place(sig(symbol="GBP/USD", entry_price=1.3, stop_loss=1.3012, take_profit=1.2952))
s.check("autotrade ON → placed by itself, nothing offered", (sent[-1], offers), ("GBP/USD", []))
src = open(placer.__file__, encoding="utf-8").read()
s.teeth("the offer is made AFTER the guards and the choosing window — only what autotrade would take",
        src.index("why = guards.check(") < src.index("await best_signal.take_turn(signal)")
        < src.index("await confirmations.offer(signal, lots, stop_pips)"))

# ── 3. acting on his Confirm ─────────────────────────────────────────────────
from storage import confirm_repo                                  # noqa: E402
from execution import saved_signal                                # noqa: E402
from data import fix_quotes                                       # noqa: E402
from execution import account                                     # noqa: E402
state, replies, placed_with = {}, [], []
confirm_repo.claim = lambda cid: state.get(cid) == "confirmed" and not state.update({cid: "placing"})
confirm_repo.settle = lambda cid, st, why: state.get(cid) == "placing" and not state.update({cid: (st, why)})
CF._reply = lambda row, text: asyncio.sleep(0, result=replies.append(text))
account.load_account = lambda: asyncio.sleep(0, result=SimpleNamespace(
    creds={}, account_type="demo", equity=10_000.0, risk_base=10_000.0))


async def fake_place(x, *a, notify=None, **k):
    placed_with.append(x.confirmed)
    return "901"

placer.place_for_signal = fake_place
ROW = dict(id="c1", signal_id="sig-1", symbol="EUR/USD", side="SELL", chat_id="7", message_id=5,
           spread_used=0.0)

saved_signal.load = lambda sid, sp=0.0: (sig(), None)
fix_quotes.live_quote = lambda sym, *a: (1.10050, 1.10058)        # still above a SELL's entry
state["c1"] = "confirmed"
run(CF._act(dict(ROW), None))
s.check("his Confirm, setup still takeable → placed, MARKED confirmed", placed_with, [True])
s.check("...recorded as placed with the order", state["c1"], ("placed", "order 901"))
s.check("...and he is told under the card", "PLACED" in replies[-1], True)
run(CF._act(dict(ROW), None))
s.check("the same Confirm seen again → NOT placed twice", placed_with, [True])

state["c2"] = "confirmed"
saved_signal.load = lambda sid, sp=0.0: (None, "the price had already reached the entry")
run(CF._act(dict(ROW, id="c2"), None))
s.check("Confirm after the entry was reached → refused, NOT placed",
        (state["c2"][0], len(placed_with)), ("too_late", 1))
s.check("...with the reason, in his words", "already reached the entry" in replies[-1], True)

state["c3"] = "confirmed"
saved_signal.load = lambda sid, sp=0.0: (sig(), None)
fix_quotes.live_quote = lambda sym, *a: (1.09990, 1.09998)        # bid already below the entry
run(CF._act(dict(ROW, id="c3"), None))
s.check("the live price is already through the entry → too late, not placed",
        (state["c3"][0], len(placed_with)), ("too_late", 1))

state["c4"] = "rejected"
run(CF._act(dict(ROW, id="c4"), None))
s.check("a REJECTED offer is never placed", (state["c4"], len(placed_with)), ("rejected", 1))
s.teeth("an offer never answered stays pending and is never placed",
        "confirm_repo.confirmed" in open(CF.__file__, encoding="utf-8").read()
        and "PENDING" not in open(CF.__file__, encoding="utf-8").read())

buy = sig(direction=Direction.BUY, entry_price=1.10100, stop_loss=1.09980)
s.check("a BUY is too late once the ASK reaches its entry",
        CF.too_late_by_price(buy, (1.10090, 1.10100)) is not None, True)
s.check("...and not while it is below", CF.too_late_by_price(buy, (1.10080, 1.10090)), None)

# ── 4. an order put back after news is not asked about again ──────────────────
from execution import news_pull                                   # noqa: E402
saved_signal.load = lambda sid, sp=0.0: (sig(), None)
s.check("a news put-back is re-placed as already confirmed", news_pull._signal_for(
    {"signal_id": "sig-1"}).confirmed, True)

# ── 5. the card really carries the two buttons, within Telegram's 64-byte limit ──
import importlib                                                  # noqa: E402
CF2 = importlib.reload(CF)                                        # the real offer / _send again
got_msgs = []


class _Bot:
    async def send_message(self, **k):
        got_msgs.append(k)
        return SimpleNamespace(message_id=77)


import notifications.dispatcher as disp                           # noqa: E402
disp._get_bot = lambda: _Bot()
OID = "1a2b3c4d-5e6f-7890-abcd-ef1234567890"
saved = []
confirm_repo.create = lambda **k: OID
confirm_repo.set_message = lambda cid, chat, mid: saved.append((cid, mid))
offered = []
decision_log.offered = lambda *a, **k: asyncio.sleep(0, result=offered.append(a))
from config.settings import settings                              # noqa: E402
object.__setattr__(settings, "watchdog_chat_id", "7615035273")
run(CF2.offer(sig(), 0.83, 12.0))
kb = got_msgs[-1]["reply_markup"].inline_keyboard[0] if got_msgs else []
data = [b.callback_data for b in kb]
s.check("the card goes to his DM", got_msgs[-1]["chat_id"] if got_msgs else None, "7615035273")
s.check("...with Confirm and Reject carrying only the offer id", data, [f"tc:y:{OID}", f"tc:n:{OID}"])
s.check("...each within Telegram's 64-byte limit", all(len(d.encode()) <= 64 for d in data), True)
s.check("...the message id is stored so the result can be replied under it", saved, [(OID, 77)])
s.check("...and it is recorded for the Autotrade screen", len(offered), 1)
s.teeth("the server's press pattern matches exactly these buttons",
        "tc:([yn]):" in open(__import__("pathlib").Path(__file__).resolve().parents[3]
                             / "server/services/tradeConfirmPress.ts", encoding="utf-8").read())

trade_mode.mode = real_mode
s.done()
