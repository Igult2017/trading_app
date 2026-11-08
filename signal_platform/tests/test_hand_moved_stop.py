"""
test_hand_moved_stop.py — run with:
    cd signal_platform && python tests/test_hand_moved_stop.py

HIS ASK, 2026-11-08: *"Im asking seeing the trade visually in pepperstone when it is placed so that
i can adjust SL manually."*

Two things stood in the way, and he corrected me on a third.

 1. A bot order carried NO label, NO comment and NO clientOrderId (`orders.build_stop`), so it was
    indistinguishable from one he placed by hand. The proof it mattered: on the same day, his own
    account held four of MY test orders, and the only reason I could tell them from his trades was
    that mine carried labels ("routing-proof-shared-socket", "gate-probe") and his carried nothing.

 2. Adjusting the stop could not work. `monitor/signal_monitor.py:167` judges a setup against
    `row.stop_loss` — OUR stored stop — and NEVER against the broker's live order. So a stop he
    widened was invisible: the platform kept measuring the original tight level, decided the setup
    was dead, and `canceller` withdrew the very order he had just edited.

 3. ⚠ HE WAS RIGHT THAT THE CANCEL IS NOT THE PROBLEM: *"The cancel takes effect once the price has
    gone outside the SL band on the opposite side not the direction we predicted. So i dont know why
    you are saying we delay it."* It is correctly targeted and is NOT changed here. Only the question
    of WHICH STOP it is judged against changes.

⚠ THE CHECKS THAT MATTER MOST ARE THE ONES THAT STILL CANCEL. A dead order left resting is the fault
he reported on 2026-09-04 — a gold buy stop sitting 72 points offside while the market had long gone
the other way. Every uncertain case must fall through to the cancel, so those are tested harder than
the new behaviour.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data import ctrader_positions                     # noqa: E402
from execution import canceller                        # noqa: E402
from execution.orders import LABEL_PREFIX, order_label  # noqa: E402
from storage import autotrade_repo                     # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def teeth(what, held):
    global _pass, _fail
    print(f"  {'PASS' if held else 'FAIL'}  TEETH — {what}: {held}")
    if held:
        _pass += 1
    else:
        _fail += 1


class _Broker:
    """Stand in for the reconcile reply's resting-order stops, and for what we recorded placing."""

    def __init__(self, live_stop, our_stop, symbol="GBP/USD"):
        self.live_stop, self.our_stop, self.symbol = live_stop, our_stop, symbol

    def __enter__(self):
        self._real_live = ctrader_positions.last_resting_stop
        self._real_intent = autotrade_repo.intent_for
        ctrader_positions.last_resting_stop = lambda _oid: self.live_stop
        autotrade_repo.intent_for = lambda _oid: (
            None if self.our_stop is None else {"sl": self.our_stop, "symbol": self.symbol})
        return self

    def __exit__(self, *exc):
        ctrader_positions.last_resting_stop = self._real_live
        autotrade_repo.intent_for = self._real_intent


print("\nA STOP HE MOVED BY HAND IS HIS, AND THE ORDER IS NOT WITHDRAWN\n")

# ── 1. he moved it -> we notice, and we report HIS level ─────────────────────
print("1. a stop he widened is recognised as his:")
with _Broker(live_stop=1.30500, our_stop=1.30200):          # 30 pips wider on a sell
    check("a stop 30 pips away from ours is his", canceller._stop_he_moved(1), 1.30500)
with _Broker(live_stop=1.30210, our_stop=1.30200):          # 1 pip
    check("even one pip of difference counts", canceller._stop_he_moved(1), 1.30210)
with _Broker(live_stop=1.30150, our_stop=1.30200):          # he TIGHTENED it
    check("a stop he TIGHTENED is still his", canceller._stop_he_moved(1), 1.30150)
# Gold: a different pip size must not change the answer's shape.
with _Broker(live_stop=4324.50, our_stop=4319.90, symbol="XAU/USD"):
    check("gold, 46 pips wider, is his", canceller._stop_he_moved(1), 4324.50)

# ── 2. ⚠ EVERY UNCERTAIN CASE MUST FALL THROUGH TO THE CANCEL ───────────────
print("\n2. anything less than certain still cancels (None = cancel as today):")
with _Broker(live_stop=1.30200, our_stop=1.30200):
    teeth("the SAME stop is not a hand edit", canceller._stop_he_moved(1) is None)
with _Broker(live_stop=1.302001, our_stop=1.30200):
    teeth("float noise below a tenth of a pip is not a hand edit",
          canceller._stop_he_moved(1) is None)
with _Broker(live_stop=None, our_stop=1.30200):
    teeth("the reconcile has never been read -> cancel", canceller._stop_he_moved(1) is None)
with _Broker(live_stop=1.30500, our_stop=None):
    teeth("we have no record of what we placed -> cancel", canceller._stop_he_moved(1) is None)
with _Broker(live_stop=0.0, our_stop=1.30200):
    teeth("a zero/absent stop at the broker -> cancel, never read as 'his stop is 0'",
          canceller._stop_he_moved(1) is None)
# An instrument this platform does not know still COMPARES fine — `pip_size` falls back to a
# default, and the comparison only needs a tolerance, not a correct pip. Asserted as it really is;
# my first version of this check claimed it would cancel, which was simply not true.
with _Broker(live_stop=1.30500, our_stop=1.30200, symbol="WAT/XYZ"):
    check("an unknown instrument still compares, on a default tolerance",
          canceller._stop_he_moved(1), 1.30500)


class _Boom:
    def __enter__(self):
        self._real = ctrader_positions.last_resting_stop
        def boom(_oid):
            raise RuntimeError("broker read exploded")
        ctrader_positions.last_resting_stop = boom
        return self
    def __exit__(self, *exc):
        ctrader_positions.last_resting_stop = self._real


with _Boom():
    teeth("a THROWING broker read -> cancel, and never propagates",
          canceller._stop_he_moved(1) is None)

# ── 3. the stops really do come off the reconcile reply ─────────────────────
print("\n3. the live stop is read from the reply that already arrives:")


class _Order:
    def __init__(self, oid, sl):
        self.orderId, self.stopLoss = oid, sl


class _Res:
    def __init__(self, orders):
        self.order = orders


# Prices in that reply are scaled by a fixed 100,000, like trendbars (ctrader_positions' header).
got = ctrader_positions._resting_stops(_Res([_Order(11, 130500), _Order(12, 0), _Order(13, 212893)]))
check("the stop is divided by the fixed 100,000", got.get(11), 1.305)
check("...and a JPY-scale price too", got.get(13), 2.12893)
teeth("an order with NO stop is ABSENT, not present as 0.0", 12 not in got)
check("ids still come back unchanged",
      ctrader_positions._resting_ids(_Res([_Order(11, 1), _Order(12, 0)])), {11, 12})

# ── 4. the order is marked so he can find it ─────────────────────────────────
print("\n4. the order carries a mark he can see in Pepperstone:")
lab = order_label("vix1", "1a2b3c4d-5e6f-7890-abcd-ef1234567890")
check("the label names the bot and the strategy", lab, "auto-vix1-1a2b3c4d")
check("a missing signal id still labels it", order_label("vix1", None), "auto-vix1")
check("an unknown strategy still labels it", order_label("", None), "auto-bot")
teeth("it NEVER starts with cp- (the copy engine owns that namespace)",
      not order_label("cp", "cp-999").startswith("cp-"))
teeth("...and the prefix is the one the copier does not use", LABEL_PREFIX != "cp")
teeth("the label stays short enough for the broker's field", len(lab) <= 50)

# ── 5. the builder actually sets them ───────────────────────────────────────
# Source-read, the way test_request_pacing and test_auth_recovery do it: the failure that matters is
# a call site that forgot, not a helper that misbehaves.
print("\n5. the builder and the placer are wired:")
o_src = (Path(__file__).resolve().parent.parent / "execution/orders.py").read_text(encoding="utf-8")
p_src = (Path(__file__).resolve().parent.parent / "execution/placer.py").read_text(encoding="utf-8")
c_src = (Path(__file__).resolve().parent.parent / "execution/canceller.py").read_text(encoding="utf-8")
check("build_stop sets the label", "req.label = label" in o_src, True)
check("build_stop sets the comment", "req.comment = comment" in o_src, True)
teeth("build_stop refuses a cp- label even if handed one",
      'not label.startswith("cp-")' in o_src)
check("the placer supplies a label", "label=label" in p_src, True)
#; ⚠ ASSERT THE CALL, NOT THE DEFINITION. The first version of this check searched for
#; "_stop_he_moved(order_id)", which also matches the function's own `def` line — so deleting the
#; CALL left the suite entirely green. Found by sabotage: replacing the call with `moved = None`
#; removed the whole feature and nothing went red. This is the "wired is not working" trap inside
#; the test that was meant to catch it.
call_at = c_src.find("moved = _stop_he_moved(")
teeth("the canceller really CALLS it, not merely defines it", call_at > 0)
check("...and does so BEFORE it withdraws anything",
      0 < call_at < c_src.index("StopOrderClient(acct.creds"), True)
check("...and adopts it so later passes use his level", "signal_repo.adopt_stop" in c_src, True)

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
