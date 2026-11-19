"""THE OUTCOME MESSAGE KNOWS WHETHER A REAL ORDER STOOD BEHIND IT (20 Nov 2026).

His report: *"The system has no memory of the order that was placed. Sometimes I receive notification that SL hit or
TP hit and the order had been withdrawn long ago or was not placed."*

Runs the REAL `dispatcher.on_signal_closed`, `order_memory.note_for` and `format_signal_closed`. Faked at the edges
only: the signal row, the order table, the decision log, Telegram. Every rule has TEETH.
Run: python tests/test_order_memory.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "vix1")))
from _harness import Suite  # noqa: E402

from config import live_settings  # noqa: E402
from notifications import copy_dm, order_memory  # noqa: E402
import notifications.dispatcher as disp  # noqa: E402
from storage import autotrade_repo, observability_repo  # noqa: E402
import storage.db as db  # noqa: E402

s = Suite("OUTCOME MESSAGES — 'TP hit' only when a real order stood behind it")
run = asyncio.new_event_loop().run_until_complete
live_settings._load = lambda: {}

ORDER: dict = {}          # signal id -> the newest order row, as `latest_for_signal` returns it
EVENT: dict = {}          # signal id -> (when, detail) of its last withdrawal
BROKEN = [False]


def _latest(sid):
    if BROKEN[0]:
        raise RuntimeError("database down")
    return ORDER.get(sid)


autotrade_repo.latest_for_signal = _latest
observability_repo.last_event = lambda sid, stage: EVENT.get(sid)

ROW = SimpleNamespace(symbol="EUR/USD", type="sell", status="executed", entry_price=1.10000, strategy="vix1",
                      take_profit=1.09760, stop_loss=1.10120,
                      executed_at=datetime(2026, 11, 20, 9, 30, tzinfo=timezone.utc), invalidated_at=None,
                      triggered_at=datetime(2026, 11, 20, 8, 5, tzinfo=timezone.utc))


class _Session:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get(self, model, sid):
        return ROW


db.get_session = lambda: _Session()
sent: list[str] = []
disp._send_private = lambda m, *a, **k: asyncio.sleep(0, result=sent.append(m))
disp._send_text = lambda m, *a, **k: asyncio.sleep(0, result=sent.append(m))
copy_dm.route = lambda sid: False


def outcome(sid: str, status: str = "executed") -> str:
    ROW.status = status
    sent.clear()
    run(disp.on_signal_closed(sid))
    return sent[-1] if sent else ""


# ── 1. through the real outcome path ─────────────────────────────────────────────────────────────────────────────
ORDER["filled"] = dict(status="filled", order_id="1", placed_at=None)
card = outcome("filled")
s.check("an order that FILLED → the card as before, no 'Signal only'", ("Signal only" in card, "TP" in card or "TARGET" in card.upper()), (False, True))
card = outcome("never")
s.check("NO order was ever placed → 'Signal only — No order was placed.'", "Signal only</b> — No order was placed." in card, True)
ORDER["gone"] = dict(status="cancelled", order_id="2", placed_at=None)
EVENT["gone"] = (datetime(2026, 11, 20, 8, 40, tzinfo=timezone.utc), '{"order": "2", "reason": "you cancelled it"}')
card = outcome("gone")
s.check("an order WITHDRAWN → when and why", "Your order was withdrawn at 20 Nov 08:40 UTC — you cancelled it." in card, True)
card = outcome("gone", "invalidated")
s.check("...the same on a STOP hit", "Signal only</b> — Your order was withdrawn" in card, True)
ORDER["pulled"] = dict(status="news_pulled", order_id="3", placed_at=None)
s.check("an order pulled before news and never put back → withdrawn (no time recorded → no time invented)",
        "Your order was withdrawn." in outcome("pulled"), True)
ORDER["refused"] = dict(status="rejected", order_id="4", placed_at=None)
s.check("an order the BROKER refused → says so", "refused by the broker" in outcome("refused"), True)
ORDER["resting"] = dict(status="placed", order_id="5", placed_at=None)
s.check("an order still recorded as placed → treated as real (its fill may not be recorded yet)",
        "Signal only" in outcome("resting"), False)
s.check("an EXPIRED setup never gets the note — it claimed no trade", "Signal only" in outcome("never", "expired"), False)
BROKEN[0] = True
s.check("order table UNREADABLE → the old card, never 'No order was placed'", "Signal only" in outcome("never"), False)
BROKEN[0] = False

# ── 2. teeth ─────────────────────────────────────────────────────────────────────────────────────────────────────
_real = order_memory.note_for
order_memory.note_for = lambda sid: None                       # SABOTAGE: the order is never asked about
s.teeth("a signal with no order is labelled 'Signal only'", "Signal only" not in outcome("never"))
order_memory.note_for = _real
_real_latest = autotrade_repo.latest_for_signal
autotrade_repo.latest_for_signal = lambda sid: None            # SABOTAGE: every order forgotten
s.teeth("a filled order is NOT labelled 'Signal only'", "Signal only" in outcome("filled"))
autotrade_repo.latest_for_signal = _real_latest

# ── 3. his Cancel button now leaves a record ─────────────────────────────────────────────────────────────────────
src = open(os.path.join(os.path.dirname(__file__), "..", "execution", "trade_actions.py"), encoding="utf-8").read()
s.check("the ❌ Cancel button writes the withdrawal to the decision log (the call, not a def)",
        "await decision_log.cancelled(intent.get(\"signal_id\")" in src, True)
s.done()
