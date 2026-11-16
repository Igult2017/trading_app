"""THE END-TO-END AUDIT OF DM CONFIRMATION, 16 Nov 2026 — each fix proved, with teeth.

1 a failure after his Confirm is closed and answered, never left hanging; 2 the Confirm pickup runs as its
own task, not behind the news check; 4 a card that could not be sent is NOT recorded as offered; 5 a broker
refusal reports the real reason; 7 the 24-hour clean-up runs once a minute, not every 2 s; 8 a TEST card
goes out, and a Confirm on it is answered without ever reaching the placer.
"""
import asyncio
from pathlib import Path
from types import SimpleNamespace

from _harness import Suite

from execution import confirm_messages as M, confirmations as CF, decision_log
from storage import confirm_repo

s = Suite("DM CONFIRMATION — the audit's fixes")
run = asyncio.new_event_loop().run_until_complete
ROOT = Path(__file__).resolve().parents[2]
state, replies, sent, logged, placer_calls = {}, [], [], [], []
confirm_repo.claim = lambda cid: state.get(cid) == "confirmed" and not state.update({cid: "placing"})
confirm_repo.settle = lambda cid, st, why: state.get(cid) == "placing" and not state.update({cid: (st, why)})
CF._reply = lambda row, text: asyncio.sleep(0, result=replies.append(text))
import execution.placer as placer                                  # noqa: E402
placer.place_for_signal = lambda *a, **k: asyncio.sleep(0, result=placer_calls.append(1))

# ── 1. a failure after the claim is closed and he is told ────────────────────
from execution import saved_signal                                 # noqa: E402
saved_signal.load = lambda *a: (_ for _ in ()).throw(RuntimeError("db blip"))
state["a"] = "confirmed"
run(CF._act(dict(id="a", signal_id="s", spread_used=0.0, chat_id="7", message_id=1), None))
s.check("a failure after his Confirm is CLOSED, not left 'placing'", state["a"][0], "refused")
s.check("...and he is told under the card", "could not be checked" in (replies[-1] if replies else ""), True)
s.teeth("...and it was not retried into the placer", placer_calls == [])

# ── 2. the Confirm pickup is its own task ─────────────────────────────────────
pt = (ROOT / "monitor/position_tracker.py").read_text(encoding="utf-8")
body = pt.split("def _start_waiting_order_work")[1].split("\nasync def ")[0]
s.teeth("the pickup is started as its OWN task, not inside the news / amendment pass",
        "_confirm_task = loop.create_task(confirmations.check(send))" in body
        and "confirmations.check" not in body.split("async def _pass():")[1].split("_waiting_task =")[0])

# ── 4. a card that could not be sent is not an offer ─────────────────────────
from core.types import Direction, Signal                          # noqa: E402
sig = Signal(symbol="EUR/USD", direction=Direction.SELL, strategy_id="vix1", strategy_name="VIX.1",
             entry_price=1.1, stop_loss=1.1012, take_profit=1.0952, db_id="s1")
confirm_repo.create = lambda **k: "cid-4"
closed = []
confirm_repo.close_unsent = lambda cid, why: closed.append(cid)
confirm_repo.set_message = lambda *a: sent.append("set")
decision_log.failed = lambda signal, why: asyncio.sleep(0, result=logged.append(("failed", why)))
decision_log.offered = lambda *a, **k: asyncio.sleep(0, result=logged.append(("offered",)))
CF._send = lambda *a, **k: asyncio.sleep(0, result=None)          # Telegram refused
run(CF.offer(sig, 0.83, 12.0))
s.check("Telegram refused the card → the offer is CLOSED", closed, ["cid-4"])
s.check("...recorded as not offered, never as 'Sent to your DM'", [x[0] for x in logged], ["failed"])

# ── 5. the real reason for a refusal ─────────────────────────────────────────
from execution.placer_messages import refusal_message, rejection_message   # noqa: E402
s.check("the broker's refusal gives the broker's reason, not the prices",
        M.refusal_reason([rejection_message("EUR/USD", "SELL", "VIX.1", 0.8, 1.1, 1.1012, 1.0952,
                                            "cTrader refused: NOT_ENOUGH_MONEY")]),
        "the broker refused it: cTrader refused: NOT_ENOUGH_MONEY")
s.check("our own guard's refusal gives its reason",
        M.refusal_reason([refusal_message("EUR/USD", "SELL", "VIX.1", "past the day's cut-off")]),
        "past the day's cut-off")

# ── 7. the clean-up runs once a minute ───────────────────────────────────────
expired = []
confirm_repo.expire_unanswered = lambda: expired.append(1) or 0
confirm_repo.confirmed = lambda: []
confirm_repo.test_requests = lambda: []
CF._last_expire = 0.0
for _ in range(5):
    run(CF.check(None))
s.check("five passes in a row → ONE clean-up", len(expired), 1)

# ── 8. the TEST card ──────────────────────────────────────────────────────────
marked = []
confirm_repo.test_requests = lambda: ["t1"]
confirm_repo.mark_test_sent = lambda cid, chat, mid: marked.append((cid, mid))
CF._send = lambda chat, text, **k: asyncio.sleep(0, result=sent.append((text, k.get("buttons"))) or 55)
from config.settings import settings                              # noqa: E402
object.__setattr__(settings, "watchdog_chat_id", "7615035273")
run(CF.check(None))
s.check("a test card asked for → sent WITH the buttons", sent[-1][1], "t1")
s.check("...it says plainly nothing will be placed", "nothing will be placed" in sent[-1][0], True)
s.check("...and is marked sent (now waiting for his press)", marked, [("t1", 55)])
confirm_repo.test_requests = lambda: []
state["t1"] = "confirmed"
n = len(placer_calls)
run(CF._act(dict(id="t1", is_test=True, signal_id=None, spread_used=0.0, chat_id="7", message_id=55), None))
s.check("his Confirm on the TEST card → answered 'the chain works'", "chain works" in replies[-1], True)
s.check("...recorded as tested", state["t1"][0], "tested")
s.teeth("...and the placer was NEVER called", len(placer_calls) == n)
src = (ROOT / "execution/confirmations.py").read_text(encoding="utf-8")
s.teeth("the test check comes BEFORE anything that could place",
        src.index('if row.get("is_test"):') < src.index("await _act_claimed(row, send, loop)"))
s.done()
