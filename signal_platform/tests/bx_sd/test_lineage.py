"""
BX-S/D — THE PARENT -> CHILD LINK, and the two signals that hang off it.

HIS SEQUENCE (2026-08-19), which BX could not express:

    liquidity swept -> price taps the EXTREME HTF unmitigated zone -> it is RESPECTED -> the CHoCH
    breaks the opposite zone -> price RETURNS to tap the zone created when the CHoCH was born at the
    HTF zone -> confirmed entry.   "This means the signal fires twice."

WHAT WAS ACTUALLY MISSING was not a zone model — both zones are already in the 4H book — but the
sentence "this zone was born of the reaction at that one". Without it BX re-traded the SAME zone.

HIS CORRECTION ON THE TIMEFRAME, after I misread the diagram's `1M Supply` label: *"The LTF is for
entry. The zone created is a 4HR zone."* So the child is a 4H zone and the LTF only prices the entry
inside it.

No P&L, no win rate — linkage and gate verdicts only.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle                                            # noqa: E402
from strategies.bx_sd_registry import MarkedZone                         # noqa: E402
from strategies.bx_sd_lineage import child_of, choch_complete, ready_for_entry   # noqa: E402

F, N = [], 0


def chk(name, got, want):
    global N
    N += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        F.append(name)


def teeth(name, broke):
    global N
    N += 1
    print(f"   {'PASS' if broke else 'FAIL'}  TEETH — {name}: {bool(broke)}")
    if not broke:
        F.append("TEETH:" + name)


def zone(t, lo, hi, direction="supply", state="unmitigated", respected=None, through=0):
    prox, dist = (lo, hi) if direction == "supply" else (hi, lo)
    return MarkedZone(direction=direction, top=hi, bottom=lo, proximal=prox, distal=dist,
                      eq50=(lo + hi) / 2, kind="institutional", ifc_time=t, origin_time=t,
                      state=state, marked_at=t, respected_at=respected, broke_through=through)


def bar(t, lo, hi):
    return Candle(time=t, open=(lo + hi) / 2, high=hi, low=lo, close=(lo + hi) / 2,
                  volume=0, timeframe="H4")


# ── THE LINK ─────────────────────────────────────────────────────────────────────────────────────
print("THE CHILD IS THE ZONE CREATED BY THE REACTION OUT OF THE PARENT")
parent = zone(100, 1.3100, 1.3130, respected=110)      # tapped, then reacted away at t=110
child  = zone(112, 1.3070, 1.3095)                     # marked AFTER the reaction, just beneath it
older  = zone(50,  1.3060, 1.3090)                     # nearer in price, but formed long BEFORE
chk("the child is the zone marked after the reaction", child_of(parent, [child, older]), child)
chk("  a zone marked BEFORE the reaction is not a child", child_of(parent, [older]), None)

# A parent that never reacted has no child — the reaction is the anchor, not the tap.
never = zone(100, 1.3100, 1.3130, respected=None)
chk("no reaction -> no child", child_of(never, [child]), None)

# NEAREST, not furthest — the far zone belongs to a different move.
near = zone(112, 1.3070, 1.3095)
far  = zone(114, 1.2500, 1.2530)
chk("the NEAREST same-side zone is the child", child_of(parent, [far, near]), near)

# SAME side as the parent: a sell-off out of supply leaves supply behind. Demand is what the CHoCH
# breaks, and that is counted by `broke_through`, not by the link.
dem = zone(112, 1.3070, 1.3095, direction="demand")
chk("an OPPOSITE-side zone is not the child", child_of(parent, [dem]), None)

# A broken child is dead and cannot be waited for.
dead = zone(112, 1.3070, 1.3095, state="broken")
chk("a broken zone is never the child", child_of(parent, [dead]), None)
teeth("the lineage link", child_of(parent, [child, older]) is child and child_of(never, [child]) is None)

# ── THE CHoCH COMPLETES ON ONE BREAK ─────────────────────────────────────────────────────────────
print()
print("ONE OPPOSITE ZONE BROKEN IS THE RULE — two is a bonus, never a requirement")
chk("no break -> the CHoCH has not completed", choch_complete(zone(1, 1.30, 1.31, through=0)), False)
chk("ONE break completes it", choch_complete(zone(1, 1.30, 1.31, through=1)), True)
chk("two also completes it (stronger, not required)",
    choch_complete(zone(1, 1.30, 1.31, through=2)), True)
teeth("the one-break rule", choch_complete(zone(1, 1.30, 1.31, through=0)) is False)

# ── SIGNAL 2: THE RETURN ─────────────────────────────────────────────────────────────────────────
print()
print("SIGNAL 2 FIRES ONLY ON THE RETURN, WITH THE CHoCH BEHIND IT AND THE ZONE STILL LOADED")
tap    = bar(200, 1.3075, 1.3100)      # price back inside the child
away   = bar(200, 1.2900, 1.2950)      # price nowhere near it
ready  = zone(112, 1.3070, 1.3095, through=1)
chk("returned, CHoCH done, zone loaded -> ENTRY", ready_for_entry(ready, tap), True)
chk("  not returned -> no entry", ready_for_entry(ready, away), False)
chk("CHoCH not complete -> no entry",
    ready_for_entry(zone(112, 1.3070, 1.3095, through=0), tap), False)
chk("already spent -> no entry (the reaction has been used)",
    ready_for_entry(zone(112, 1.3070, 1.3095, state="respected", through=1), tap), False)
chk("wick-only still qualifies — the orders were never filled",
    ready_for_entry(zone(112, 1.3070, 1.3095, state="wick_mitigated", through=1), tap), True)
teeth("the return requirement", ready_for_entry(ready, away) is False)

# ── MIRRORED: BULLISH ────────────────────────────────────────────────────────────────────────────
print()
print("MIRRORED — price reacts UP out of demand and leaves DEMAND behind")
d_parent = zone(100, 1.2900, 1.2930, direction="demand", respected=110)
d_child  = zone(112, 1.2935, 1.2960, direction="demand")
chk("the demand child is found", child_of(d_parent, [d_child]), d_child)
chk("  and a supply zone is not it",
    child_of(d_parent, [zone(112, 1.2935, 1.2960, direction="supply")]), None)
d_ready = zone(112, 1.2935, 1.2960, direction="demand", through=1)
chk("demand return -> ENTRY", ready_for_entry(d_ready, bar(200, 1.2930, 1.2955)), True)
teeth("the demand mirror", child_of(d_parent, [d_child]) is d_child)

print()
if F:
    print(f"{len(F)} FAILED: {F}  ({N} checks)")
    sys.exit(1)
print(f"ALL PASS  ({N} checks)")
