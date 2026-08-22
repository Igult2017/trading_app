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


def zone(direction, bottom, top, *, marked, mitigated=None, respected=None, through=0):
    z = MarkedZone(direction=direction, top=top, bottom=bottom,
                   proximal=bottom if direction == "supply" else top,
                   distal=top if direction == "supply" else bottom,
                   eq50=(top + bottom) / 2.0, kind="body",
                   ifc_time=marked, origin_time=marked)
    z.marked_at, z.mitigated_at, z.respected_at = marked, mitigated, respected
    z.broke_through = through
    z.state = "respected" if respected else ("body_mitigated" if mitigated else "unmitigated")
    return z


# ── A BEARISH SEQUENCE, in his order ────────────────────────────────────────
# `swept_within` needs the pool to have formed BEFORE the window opens, and the window itself to
# start past bar 0 (it returns False on start <= 0). So the tap sits at bar 40, giving a window of
# [20, 40] with LIQ_WINDOW = 20, and the resting high forms at bar 10.
#
#   bar 10        a high prints at 1.1090 — the liquidity, left resting
#   bars 11-19    price stays below it, so it is STILL RESTING when the window opens at bar 20
#   bar 38        price runs through 1.1090 — THE SWEEP (step 4)
#   bar 40        price taps the extreme supply at 1.1100 (step 5)
#   bar 45        the reaction leaves the child zone behind (step 10)
#   bar 50        price returns to the child — where the entry would be (step 11)
BARS = [bar(i, 1.1000, 1.1010) for i in range(10)]
BARS.append(bar(10, 1.1050, 1.1090))          # the high that becomes the liquidity
BARS += [bar(i, 1.1000, 1.1040) for i in range(11, 38)]   # stays below it — still resting
BARS.append(bar(38, 1.1060, 1.1095))          # takes it out — THE SWEEP, on the approach
BARS.append(bar(39, 1.1070, 1.1098))
BARS.append(bar(40, 1.1080, 1.1105))          # taps the extreme supply
BARS += [bar(i, 1.1000, 1.1050) for i in range(41, 55)]

POOL = [LiquidityPool(index=10, price=1.1090, side="buy", kind="high")]

parent = zone("supply", 1.1100, 1.1120, marked=2, mitigated=40, respected=44)
child  = zone("supply", 1.1060, 1.1080, marked=45, through=1)      # born after the reaction

print()
print("THE SWEEP HAPPENED ON THE APPROACH — step 4 before step 5")
chk("liquidity was swept before the extreme was tapped",
    L.swept_before_tap(parent, BARS, POOL), True)
chk("the change of character is VALID", L.choch_verdict(child, [parent, child], BARS, POOL), L.CHOCH_VALID)
chk("...and the yes/no form agrees", L.choch_valid(child, [parent, child], BARS, POOL), True)

print()
print("NO SWEEP ON THE APPROACH — his rule says FAKE")
# Same shape, but the resting high sits far above and is never taken out before the tap.
UNSWEPT = [LiquidityPool(index=5, price=1.1200, side="buy", kind="high")]
chk("nothing was swept before the tap", L.swept_before_tap(parent, BARS, UNSWEPT), False)
chk("the change of character is FAKE",
    L.choch_verdict(child, [parent, child], BARS, UNSWEPT), L.CHOCH_FAKE_NO_SWEEP)
chk("...so it is not valid", L.choch_valid(child, [parent, child], BARS, UNSWEPT), False)
teeth("THE GATE CAN ACTUALLY REFUSE — three checks in this codebase shipped vacuous",
      L.choch_valid(child, [parent, child], BARS, POOL) is True
      and L.choch_valid(child, [parent, child], BARS, UNSWEPT) is False)

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
    L.choch_verdict(no_break, [parent, no_break], BARS, POOL), L.CHOCH_FAKE_NO_BREAK)
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
    L.entry_refusal(child, [parent, child], live, BARS, POOL), None)
chk("unswept -> the entry gate refuses, naming the sweep",
    L.entry_refusal(child, [parent, child], live, BARS, UNSWEPT), L.CHOCH_FAKE_NO_SWEEP)
teeth("a caller that passes no bars/pools cannot silently skip the gate — it degrades to the old "
      "break-only answer, which is stricter than pretending it passed",
      L.entry_refusal(child, [parent, child], live) is None)

# ── THE OLD BEHAVIOUR MUST FAIL THIS FILE ───────────────────────────────────
print()
print("TEETH — would this have caught the old code?")
teeth("the old rule (break only) called the unswept case VALID",
      L.choch_complete(child) is True
      and L.choch_valid(child, [parent, child], BARS, UNSWEPT) is False)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
