"""VALID vs FAKE CHANGE OF CHARACTER — the liquidity sweep is a GATE (2026-08-22).

HIS RULE: *"liquidity sweep is a gate for CHOCH validity. Before price taps the extreme zone, it must
sweep liquidity then tap extreme zone to create a CHOCH. If no liquidity sweep occurred on the price
way to tapping extreme zone, the CHOCH created becomes invalid... invalid CHOCH is a perfect
definition of decisional CHOCH."*

HIS DOCUMENT (`CHOCH AND DEMAND AND SUPPLY.pdf`), read before this was written:
  * p24 numbered sequence — step 4 "Wait for liquidity sweep", step 5 "Price reaches the
    higher-time-frame demand", step 7 the CHoCH. Step 4 has NO condition attached; step 9 (the
    optional one) begins "If".
  * p24 valid-vs-fake table — "Liquidity may remain unswept" is on the FAKE side.
  * p25 Mistake 3 — "Entering before a liquidity sweep."
  * p25 Mistake 4 — "Entering from a decisional zone too early: price may continue toward the
    extreme zone and sweep liquidity first."

WHAT WAS WRONG. Validity was one line — `child.broke_through >= 1` — and the sweep was measured in a
window ending at the CURRENT bar, which for signal 2 is price RETURNING to the child zone (step 11),
seven steps after the sweep that matters. The window now ends at the parent's FIRST TAP (step 5).
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from core.types import Candle                                        # noqa: E402
from strategies.bx_sd_registry import MarkedZone                     # noqa: E402
from strategies.bx_sd_liquidity import LiquidityPool                 # noqa: E402
from strategies import bx_sd_lineage as L                            # noqa: E402

failed, count = [], 0


def chk(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke: bool):
    global count
    count += 1
    print(f"   {'PASS' if broke else 'FAIL'}  TEETH — {name}: {broke}")
    if not broke:
        failed.append("TEETH:" + name)


def bar(t, lo, hi):
    return Candle(time=t, open=(lo + hi) / 2, high=hi, low=lo, close=(lo + hi) / 2,
                  volume=0, timeframe="H4")


def zone(direction, bottom, top, *, marked, mitigated=None, respected=None, through=0,
         group=1):
    z = MarkedZone(direction=direction, top=top, bottom=bottom,
                   proximal=bottom if direction == "supply" else top,
                   distal=top if direction == "supply" else bottom,
                   eq50=(top + bottom) / 2.0, kind="body",
                   ifc_time=marked, origin_time=marked)
    z.marked_at, z.mitigated_at, z.respected_at = marked, mitigated, respected
    z.broke_through = through
    z.group = group
    z.state = "respected" if respected else ("body_mitigated" if mitigated else "unmitigated")
    return z


# ── A BEARISH SEQUENCE, in his order ────────────────────────────────────────
# THE APPROACH IS A REAL RALLY, and that is new as of 2026-08-25. It used to be 37 near-identical
# flat bars, which `detect` reads as RANGING — and under his settled definition a supply zone can
# only be an extreme when price is SWINGING UP into it (*"when the price is swinging up, it is the
# extreme above it"*). The flat fixture made the parent fail that test and every verdict came back
# "no extreme zone behind it". The fixture was wrong, not the code.
#
# A staircase of higher highs and higher lows, because a straight ramp has no swing pivots at all
# (`find_swing_points` needs 3 lower bars either side) and reads RANGING too — the same trap.
#
#   bars 0-40     a rally: HH / HL all the way up
#   bar 40        price taps the extreme supply sitting above it (step 5)
#   bar 44        the reaction is confirmed — the zone is RESPECTED
#   bar 45        that reaction leaves the child zone behind (step 10)
#   bar 50        price returns to the child — where the entry would be (step 11)
#
# THE POOL IS DATA, NOT A BAR'S HIGH. `swept_within` only reads its price and index, so the resting
# level is derived from the bars: above everything before the window opens, below the window's own
# high. Picking a level out of a rising staircase by hand proves nothing — price took it out long
# before the approach, and `swept_within` correctly refuses an already-swept pool.
def _stair(n=55, start=1.0950, up=0.0012, dn=0.0006):
    out, px, i = [], start, 0
    while i < n:
        for _ in range(4):
            if i >= n: break
            c = px + up
            out.append(Candle(time=i, open=px, high=c + 0.0001, low=px, close=c, volume=0,
                              timeframe="H4")); px = c; i += 1
        for _ in range(4):
            if i >= n: break
            c = px - dn
            out.append(Candle(time=i, open=px, high=px, low=c - 0.0001, close=c, volume=0,
                              timeframe="H4")); px = c; i += 1
    return out


BARS = _stair()
_TAP = 40
_pre_hi = max(c.high for c in BARS[:_TAP - 20])
_win_hi = max(c.high for c in BARS[_TAP - 20:_TAP + 1])
POOL = [LiquidityPool(index=_TAP - 21, price=(_pre_hi + _win_hi) / 2, side="buy", kind="high")]

# the extreme supply sits ABOVE where price closed on the tap bar — his "the extreme above it"
_ZBOT = BARS[_TAP].close + 0.0008
parent = zone("supply", _ZBOT, _ZBOT + 0.0020, marked=2, mitigated=_TAP, respected=44)
child  = zone("supply", _ZBOT - 0.0040, _ZBOT - 0.0020, marked=45, through=1)   # born of the reaction
# A companion BELOW the parent. Without a second live zone in the group no zone can be the
# extreme at all, and every verdict would read decisional — the fixture, not the code.
lower  = zone("supply", _ZBOT - 0.0080, _ZBOT - 0.0060, marked=3)
BOOK   = [parent, child, lower]

print()
print("THE SWEEP HAPPENED ON THE APPROACH — step 4 before step 5")
chk("liquidity was swept before the extreme was tapped",
    L.swept_before_tap(parent, BARS, POOL), True)
chk("the change of character is VALID", L.choch_verdict(child, BOOK, BARS, POOL), L.CHOCH_VALID)
chk("...and the yes/no form agrees", L.choch_valid(child, BOOK, BARS, POOL), True)

print()
print("NO SWEEP ON THE APPROACH — his rule says FAKE")
# Same shape, but the resting high sits far above and is never taken out before the tap.
UNSWEPT = [LiquidityPool(index=5, price=1.1200, side="buy", kind="high")]
chk("nothing was swept before the tap", L.swept_before_tap(parent, BARS, UNSWEPT), False)
chk("the change of character is FAKE",
    L.choch_verdict(child, BOOK, BARS, UNSWEPT), L.CHOCH_FAKE_NO_SWEEP)
chk("...so it is not valid", L.choch_valid(child, BOOK, BARS, UNSWEPT), False)
teeth("THE GATE CAN ACTUALLY REFUSE — three checks in this codebase shipped vacuous",
      L.choch_valid(child, BOOK, BARS, POOL) is True
      and L.choch_valid(child, BOOK, BARS, UNSWEPT) is False)

print()
print("THE WINDOW IS THE NEW ONE — a sweep AFTER the tap must not count")
# The pool is only taken out on bar 46, six bars AFTER the extreme was tapped on bar 40. Under
# the OLD measurement (window ending at the current bar) this counted; it must not now.
LATE_BARS = list(BARS)
LATE_BARS[46] = bar(46, 1.1000, 1.1210)          # sweeps 1.1200 — but SIX BARS AFTER the tap
chk("a sweep after the extreme was tapped does NOT make it valid",
    L.swept_before_tap(parent, LATE_BARS, UNSWEPT), False)
teeth("this is exactly the error being fixed — the old window ended at the CURRENT bar",
      L.swept_before_tap(parent, LATE_BARS, UNSWEPT) is False)

print()
print("THE OTHER TWO WAYS A CHANGE OF CHARACTER IS FAKE")
# Marked at 45 — AFTER the parent reacted at 44 — so it genuinely has a parent and the verdict
# reaches the break test. At 25 it had no parent at all and reported that instead; fixture, not code.
no_break = zone("supply", 1.1060, 1.1080, marked=45, through=0)
chk("broke no opposite zone -> fake",
    L.choch_verdict(no_break, [parent, no_break, lower], BARS, POOL), L.CHOCH_FAKE_NO_BREAK)
orphan = zone("demand", 1.0900, 1.0920, marked=45, through=1)      # no parent on its side
chk("no extreme behind it -> fake",
    L.choch_verdict(orphan, [orphan], BARS, POOL), L.CHOCH_FAKE_NO_PARENT)

print()
print("EACH VERDICT SAYS WHY, IN WORDS — he asked the system to KNOW the difference")
for v in (L.CHOCH_FAKE_NO_SWEEP, L.CHOCH_FAKE_NO_BREAK, L.CHOCH_FAKE_NO_PARENT):
    chk(f"'{v[:34]}...' names itself fake", v.startswith("fake"), True)
chk("the three reasons are distinct",
    len({L.CHOCH_FAKE_NO_SWEEP, L.CHOCH_FAKE_NO_BREAK, L.CHOCH_FAKE_NO_PARENT}), 3)

print()
print("THE ENTRY GATE INHERITS IT — one rule, one place")
live = bar(50, 1.1060, 1.1082)                     # price back at the child zone right now
chk("swept + broken + loaded + tapped -> entry allowed",
    L.entry_refusal(child, BOOK, live, BARS, POOL), None)
chk("unswept -> the entry gate refuses, naming the sweep",
    L.entry_refusal(child, BOOK, live, BARS, UNSWEPT), L.CHOCH_FAKE_NO_SWEEP)
teeth("a caller that passes no bars/pools cannot silently skip the gate — it degrades to the old "
      "break-only answer, which is stricter than pretending it passed",
      L.entry_refusal(child, BOOK, live) is None)

# ── THE OLD BEHAVIOUR MUST FAIL THIS FILE ───────────────────────────────────
print()
print("TEETH — would this have caught the old code?")
teeth("the old rule (break only) called the unswept case VALID",
      L.choch_complete(child) is True
      and L.choch_valid(child, BOOK, BARS, UNSWEPT) is False)

print()
print("POSITION IS NOT A TEST — a zone further out must not make this change of character fake")
# SUPERSEDED, 2026-08-23. This block used to assert a FOURTH verdict, `CHOCH_FAKE_DECISIONAL`: if the
# parent was not the furthest-out zone in its group when price arrived, the change of character was
# called fake. His correction: *"decisional zones are zones that cause fake choch. The code already
# has logic for detecting fake choch and what qualifies as fake choch."* So DECISIONAL IS THE
# VERDICT, not the evidence, and testing it as evidence was circular.
#
# It was also the single biggest refusal in BX: 15 of 19 changes of character counted BY HAND from
# raw EUR/USD 4H candles over 3 months (79%) died on it, and nothing passed at all.
higher = zone("supply", 1.1200, 1.1220, marked=3)          # untouched, sits further out
higher.group = 1
BOOK_STACK = [higher, parent, child, lower]
chk("a zone sitting further out does NOT make this change of character fake",
    L.choch_verdict(child, BOOK_STACK, BARS, POOL), L.CHOCH_VALID)
chk("...and the entry gate allows it",
    L.entry_refusal(child, BOOK_STACK, live, BARS, POOL), None)
teeth("THIS IS THE 79%: the deleted fourth test returned fake here purely because `higher` exists, "
      "while price had visibly held at `parent`",
      higher.proximal > parent.proximal and parent.respected_at is not None
      and L.choch_valid(child, BOOK_STACK, BARS, POOL) is True)

# Removing the zone above changes nothing — which is the whole point. Position is not consulted.
BOOK_ALONE = [parent, child, lower]
chk("with nothing above it, the same answer",
    L.choch_verdict(child, BOOK_ALONE, BARS, POOL), L.CHOCH_VALID)
teeth("the verdict does not depend on what else happens to be on the book",
      L.choch_verdict(child, BOOK_STACK, BARS, POOL)
      == L.choch_verdict(child, BOOK_ALONE, BARS, POOL))
chk("there are THREE fake reasons now, and they are distinct",
    len({L.CHOCH_FAKE_NO_SWEEP, L.CHOCH_FAKE_NO_BREAK, L.CHOCH_FAKE_NO_PARENT}), 3)
chk("the deleted fourth reason is gone from the module",
    hasattr(L, "CHOCH_FAKE_DECISIONAL"), False)

print()
print("HIS `Fake CHOCH` DIAGRAM — still refused WITHOUT the deleted test, which is the proof")
# The picture he sent: a downtrend (High -> LH -> LL -> LH -> LL), three UNTOUCHED supply zones
# above, then a rally off a bare low that breaks the last lower high. The book calls that break a
# Fake Change of Character and the demand zone it leaves behind a "Fake Demand" — price drops
# straight back through it. Nothing was reacted from and nothing was swept, so tests 1 and 3 refuse
# it on their own. That is the evidence the fourth test was carrying nothing.
FAKE_BARS = [bar(i, 1.0900, 1.0940) for i in range(60)]
fake_demand = zone("demand", 1.0900, 1.0920, marked=40, through=1)   # born of the rally off the low
chk("the rally came off a bare low -> no parent -> FAKE",
    L.choch_verdict(fake_demand, [fake_demand], FAKE_BARS, []), L.CHOCH_FAKE_NO_PARENT)
# Give it a parent so the verdict reaches the sweep test, but leave the liquidity untaken.
bare = zone("demand", 1.0860, 1.0880, marked=5, mitigated=20, respected=30)
UNTAKEN = [LiquidityPool(index=2, price=1.0700, side="sell", kind="low")]   # far below, never swept
chk("...and even given a parent, nothing was swept on the way -> FAKE",
    L.choch_verdict(fake_demand, [bare, fake_demand], FAKE_BARS, UNTAKEN), L.CHOCH_FAKE_NO_SWEEP)
teeth("THE WHOLE CASE FOR THE DELETION: his own fake diagram is refused twice over without the "
      "fourth test",
      L.choch_valid(fake_demand, [fake_demand], FAKE_BARS, []) is False
      and L.choch_valid(fake_demand, [bare, fake_demand], FAKE_BARS, UNTAKEN) is False)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
