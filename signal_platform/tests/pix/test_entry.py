"""PIX — THE 1M ENTRY (his 19 Nov sequence), the zone plan around it, and the signal it makes — proved on hand-built
candles with known answers. docs/strategies/pix.md rules 5, 5b, 6. (Split out of test_skeleton.py to keep both under
200 lines.)

Every rule is run through the REAL functions (`pix_bigzones`, `pix_skeleton`, `pix.analyze`'s signal builder), and
every key assertion has a TEETH case: the rule is deliberately broken and the check must then fail.
Run: python tests/pix/test_entry.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
import storage.observability_repo as _obs  # noqa: E402
_obs.record = lambda *a, **k: None

from core.types import Candle  # noqa: E402
import strategies.pix_bigzones as B  # noqa: E402
import strategies.pix_skeleton as S  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def teeth(name, failed_when_broken):
    check(f"TEETH — {name} fails when deliberately broken", bool(failed_when_broken), True)


print("RULE 5 — THE 1M PROOF (his 19 Nov rule): touch, 2+ candles our way, ONE opposite candle → stop order off it")
import strategies.pix_entry as E  # noqa: E402
M5_0 = 1_600_000_000 // 300 * 300
M1_0 = M5_0 + 40 * 300                     # the 1M visit comes after every 5M candle below


def m5(rows):
    return [Candle(M5_0 + k * 300, o, h, lo, c, 1, "M5") for k, (o, h, lo, c) in enumerate(rows)]


def m1(rows):
    return [Candle(M1_0 + k * 60, o, h, lo, c, 1, "M1") for k, (o, h, lo, c) in enumerate(rows)]


# DEMAND 100-101. Ranges: approach 1.0 each ×3, touch 1.7, up1 0.7, up2 0.8, pullback 0.6 → average 6.8 / 7
APP = [(104, 104.5, 103.5, 104)] * 3
TOUCH = (102.0, 102.2, 100.5, 101.2)       # low 100.5 into the zone, closes 101.2 — above the bottom
UP1, UP2 = (101.2, 101.8, 101.1, 101.7), (101.7, 102.4, 101.6, 102.3)
PB = (102.3, 102.5, 101.9, 102.0)          # closes DOWN: the pullback
RE = lambda rows, price=102.0, sp=0.1: E.reaction_entry(m1(rows), 101.0, 100.0, True, price + sp / 2, sp)  # noqa: E731
e, _ = RE(APP + [TOUCH, UP1, UP2, PB])
check("touch, 2 up, 1 down → ENTRY: stop order at the pullback's high 102.5 + the 0.1 spread = 102.6",
      e and round(e.entry, 6), 102.6)
check("...stop BEHIND THE PULLBACK: its low 101.9 − 0.5 × the 1M average range (6.8/7)",
      e and round(e.sl, 6), round(101.9 - 0.5 * 6.8 / 7, 6))
check("...the visit's touch and the pullback are named", e and (e.first_touch_at, e.pullback.time, len(e.reaction)),
      (M1_0 + 3 * 60, M1_0 + 6 * 60, 2))
check("TOUCH, NO REACTION → no trade (still touching)", RE(APP + [TOUCH])[0], None)
check("touch, 2 up, no opposite candle yet → no trade, waiting for the pullback", RE(APP + [TOUCH, UP1, UP2])[0], None)
one = RE(APP + [TOUCH, UP1, PB])
check("only ONE candle our way before the opposite one → no trade (no proven reaction)",
      (one[0], "only 1" in one[1]), (None, True))
E.MIN_REACTION = 1
teeth("the 2-candle reaction rule (lowered to 1)", RE(APP + [TOUCH, UP1, PB])[0] is not None)
E.MIN_REACTION = 2
UP3, UP4 = (102.3, 102.9, 102.2, 102.8), (102.8, 103.3, 102.7, 103.2)
PB4 = (103.2, 103.4, 102.9, 103.0)
e4, _ = RE(APP + [TOUCH, UP1, UP2, UP3, UP4, PB4])
check("4 candles our way (his A: keep waiting) then the first opposite candle → ENTRY at 103.4 + 0.1",
      e4 and round(e4.entry, 6), 103.5)
check("the pullback has PASSED (a candle after it) → no trade from a stale pullback",
      RE(APP + [TOUCH, UP1, UP2, PB, UP3])[0], None)
DOJI = (101.7, 101.9, 101.6, 101.7)
check("a candle that closes AT its open neither counts nor ends the wait: up, doji, up, down → ENTRY",
      RE(APP + [TOUCH, UP1, DOJI, UP2, PB])[0] is not None, True)
check("...and does not count: up, doji, down → no trade", RE(APP + [TOUCH, UP1, DOJI, PB])[0], None)
DIP = (102.3, 102.4, 100.9, 101.5)          # a pullback that dips BACK INTO the zone = a new touch
check("a pullback that dips back into the zone is a NEW TOUCH → no trade yet (the count restarts)",
      RE(APP + [TOUCH, UP1, UP2, DIP])[0], None)
UPa, UPb, PBb = (101.5, 102.0, 101.4, 101.9), (101.9, 102.6, 101.8, 102.5), (102.5, 102.7, 102.1, 102.2)
check("...then 2 up and a down after it → ENTRY off the NEW pullback (102.7 + 0.1)",
      (lambda r: r and round(r.entry, 6))(RE(APP + [TOUCH, UP1, UP2, DIP, UPa, UPb, PBb])[0]), 102.8)
THRU = (101.2, 101.3, 99.5, 99.8)           # CLOSES below the zone bottom
broke = RE(APP + [TOUCH, THRU, (99.8, 101.5, 99.7, 101.4), UP1, UP2, PB])
check("a 1M candle CLOSED THROUGH the zone during the visit → broken, no trade", (broke[0], "broken" in broke[1]),
      (None, True))
check("market already through the stop level (ask 102.65 ≥ 102.6) → no order", RE(APP + [TOUCH, UP1, UP2, PB], 102.6)[0],
      None)
forming = m1(APP + [TOUCH, UP1, UP2])
forming.append(Candle(int(time.time()) // 60 * 60, 102.3, 102.5, 101.9, 102.0, 1, "M1"))
check("NO LOOK-AHEAD: a still-forming pullback candle does not count",
      E.reaction_entry(forming, 101.0, 100.0, True, 102.05, 0.1)[0], None)
E.MIN_ROOM_MULT = 3.0
wide, _ = RE(APP + [TOUCH, UP1, UP2, PB])
check("a stop closer than the floor is WIDENED to it (floor raised to 3× the range + the spread)",
      wide and round(wide.entry - wide.sl, 6), round(3.0 * 6.8 / 7 + 0.1, 6))
E.MIN_ROOM_MULT = 1.0
mir = lambda rows: [(200 - o, 200 - lo, 200 - h, 200 - c) for o, h, lo, c in rows]  # noqa: E731
se, _ = E.reaction_entry(m1(mir(APP + [TOUCH, UP1, UP2, PB])), 100.0, 99.0, False, 98.0 - 0.05, 0.1)
check("SELL mirror at supply 99-100: entry at the pullback's LOW 97.5 (no spread — a sell fills on the bid)",
      se and round(se.entry, 6), 97.5)
check("...stop = the pullback's high 98.1 + 0.5 × range + the 0.1 spread (a sell's stop fires on the ask)",
      se and round(se.sl, 6), round(98.1 + 0.5 * 6.8 / 7 + 0.1, 6))

print("\nRULE 6 — the zone plan: proof on 1M, not broken on 5M, order flow confirms (absorption alone refuses)")
GO = lambda m5_, m1_, bull, e_: (None, "Order flow CONFIRMS (stub)", [])  # noqa: E731
GOOD = m1(APP + [TOUCH, UP1, UP2, PB])
M5OK = m5([(104, 104.5, 103.5, 104)] * 30)
zone = B.Zone("demand", 101.0, 100.0, 101.0, 100.0, 100.5, 40, 41)
S.direction, S.daily_atr = (lambda h4, h1: (1, "4H")), (lambda d1: 50.0)
S.candidates = lambda h4, h1, m5_, want, price, reach, **k: [(B.BigZone("4H", zone, 1, zone, 2, 0.9), None)] if want == "demand" else []
plan, _ = S.zone_plan([], [], M5OK, GOOD, 102.0, 0.1, [], flow=GO)
check("BUY: entry 102.6, stop behind the pullback, target entry + 3 × risk",
      plan and (round(plan.entry, 6), round(plan.sl, 6), round(plan.tp, 6), plan.rr),
      (102.6, round(101.9 - 0.5 * 6.8 / 7, 6), round(102.6 + 3 * (102.6 - (101.9 - 0.5 * 6.8 / 7)), 6), 3.0))
check("...the touch and the pullback are carried (one signal per pullback)", plan and (plan.tap_at, plan.pullback_at),
      (M1_0 + 3 * 60, M1_0 + 6 * 60))
check("NO REACTION on 1M → no plan, and it says why",
      (lambda r: (r[0], "touching" in r[1]))(S.zone_plan([], [], M5OK, m1(APP + [TOUCH]), 102.0, 0.1, [], flow=GO)),
      (None, True))
M5BAD = m5([(104, 104.5, 103.5, 104)] * 29 + [(101, 101.2, 99.0, 99.5)])     # the 5M overlapping the visit closes below
GOOD5 = [Candle(M5BAD[-1].time + k * 60, x.open, x.high, x.low, x.close, 1, "M1") for k, x in enumerate(GOOD)]
check("a 5M candle CLOSED THROUGH the zone during the visit → no plan",
      S.zone_plan([], [], M5BAD, GOOD5, 102.0, 0.1, [], flow=GO)[0], None)
real_broken = S._broken_5m
S._broken_5m = lambda *a: False
teeth("the 5M not-broken check (removed)", S.zone_plan([], [], M5BAD, GOOD5, 102.0, 0.1, [], flow=GO)[0] is not None)
S._broken_5m = real_broken
ABSORB = lambda *a: ("1M ABSORPTION: buyers 60% one-sided but the candle closed down", "", [])  # noqa: E731
ab = S.zone_plan([], [], M5OK, GOOD, 102.0, 0.1, [], flow=ABSORB)
check("ABSORPTION → no plan (his 18 Nov rule), and the reason is given", (ab[0], "ABSORPTION" in ab[1]), (None, True))
DISAGREE = lambda *a: (None, "⚠ Order flow does NOT agree: CVD convergence ✗, delta -20% buying on the reaction ✗", [])  # noqa: E731
dp = S.zone_plan([], [], M5OK, GOOD, 102.0, 0.1, [], flow=DISAGREE)[0]
check("order flow DISAGREES → the plan STILL goes, carrying the warning (his rule: indicate it on the card)",
      dp is not None and any("does NOT agree" in r for r in dp.why), True)
np_ = S.zone_plan([], [], M5OK, GOOD, 102.0, 0.1, [])[0]
check("no order-flow feed at all → the plan still goes, saying the figures are not available",
      np_ is not None and any("not available" in r for r in np_.why), True)
szone = B.Zone("supply", 100.0, 99.0, 99.0, 100.0, 99.5, 40, 41)
S.direction = lambda h4, h1: (-1, "4H")
S.candidates = lambda h4, h1, m5_, want, price, reach, **k: [(B.BigZone("4H", szone, 1, szone, 2, 0.5), None)] if want == "supply" else []
sp_, _ = S.zone_plan([], [], m5([(96, 96.5, 95.5, 96)] * 30), m1(mir(APP + [TOUCH, UP1, UP2, PB])), 98.0, 0.1, [], flow=GO)
check("SELL plan: entry 97.5, stop 98.1 + 0.5 × range + 0.1 spread",
      sp_ and (round(sp_.entry, 6), round(sp_.sl, 6)), (97.5, round(98.1 + 0.5 * 6.8 / 7 + 0.1, 6)))
S.direction = lambda h4, h1: (0, "")
check("4H and 1H ranging → the zone path stays off", S.zone_plan([], [], M5OK, GOOD, 102.0, 0.1, [], flow=GO)[0], None)


S.direction = lambda h4, h1: (1, "4H")
S.candidates = lambda h4, h1, m5_, want, price, reach, **k: [(B.BigZone("4H", zone, 1, zone, 2, 0.9), None)] if want == "demand" else []
fresh = B.BigZone("5M", zone, 1, zone, GOOD[-1].time, 0.9)          # price "travelled" only on the last 1M candle
S.candidates = lambda *a, **k: [(fresh, None)]
check("a 5M zone is not 'touched' by candles from before price travelled away from it",
      S.zone_plan([], [], M5OK, GOOD, 102.0, 0.1, [], flow=GO)[0], None)
old = B.BigZone("5M", zone, 1, zone, M5_0 - 600, 0.9)
S.candidates = lambda *a, **k: [(old, None)]
p5 = S.zone_plan([], [], M5OK, GOOD, 102.0, 0.1, [], flow=GO)[0]
check("...the same zone, travelled away long before the touch → planned", p5 is not None, True)
real_tfs = dict(B.TF_S)
B.TF_S.update({"5M": -10 ** 12})
S.candidates = lambda *a, **k: [(fresh, None)]
teeth("the travelled-before-the-touch guard (guard removed)",
      S.zone_plan([], [], M5OK, GOOD, 102.0, 0.1, [], flow=GO)[0] is not None)
B.TF_S.clear(); B.TF_S.update(real_tfs)

print("\nTHE SIGNAL — what reaches the channel")
from strategies.pix import build_signal  # noqa: E402
sig = build_signal("XAU/USD", plan, 2, "pix", "PIX")
check("entry / stop / target / RR carried exactly", (sig.entry_price, sig.stop_loss, sig.take_profit, sig.risk_reward),
      (round(plan.entry, 2), round(plan.sl, 2), round(plan.tp, 2), 3.0))
check("a real monitored signal, not an alert", (sig.alert_only, sig.strategy_id), (False, "pix"))
check("the ORDER-FLOW line is inside the FIRST FIVE reasons (the Telegram card shows only five)",
      any("Order flow" in r for r in sig.technical_reasons[:5]), True)
check("...and so is the 1M proof", any("proved itself" in r for r in sig.technical_reasons[:5]), True)
dsig = build_signal("XAU/USD", dp, 2, "pix", "PIX")
check("a DISAGREEING order flow shows its warning inside the first five", any("does NOT agree" in r for r in
                                                                                 dsig.technical_reasons[:5]), True)


print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
