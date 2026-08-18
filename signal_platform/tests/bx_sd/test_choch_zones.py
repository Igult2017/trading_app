"""
BX-S/D — EXTREME vs DECISIONAL zones (Smart Risk, "3. Double Zone Break Out").

THE RULE, in the document's own words:

    "the upper supply zone is the extreme one and the second supply zone located a bit lower is
     called the decisional zone. Please consider that we cannot place any trades based on the
     decisional supply zone because there is a high chance that the price will push higher to sweep
     the liquidity accumulated above the double tops and trigger the stop-loss of traders who entered
     from the decisional supply zone."

    "Don't use the decisional zones, you will be a liquidity."

Page 11 of his PDF is the fixture: two supply zones from one down-move, the upper marked EXTREME and
the lower marked Decisional, with the sell limit at the extreme.

WHY THIS IS LABELLING AND NOT MINTING. He settled it: *"the qualities that make a zone are not
different from what the book we have been using says."* Measured on 3,500 real H4 bars, the opposite
zone is ALREADY in the book within 12 bars of a break 86% of the time (median 1 bar, 43% same-bar),
so nothing needs creating — only naming. Do not add a second way to mint a zone.

No P&L, no win rate — classification only.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from strategies.bx_sd_registry import MarkedZone, classify_roles   # noqa: E402

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


class E:
    def __init__(self, index, direction):
        self.index, self.direction = index, direction


def supply(t, lo, hi, state="respected"):
    """A supply zone: price approaches from BELOW, so proximal is the bottom edge."""
    return MarkedZone(direction="supply", top=hi, bottom=lo, proximal=lo, distal=hi,
                      eq50=(lo + hi) / 2, kind="institutional", ifc_time=t, origin_time=t,
                      state=state, marked_at=t)


def demand(t, lo, hi, state="respected"):
    return MarkedZone(direction="demand", top=hi, bottom=lo, proximal=hi, distal=lo,
                      eq50=(lo + hi) / 2, kind="institutional", ifc_time=t, origin_time=t,
                      state=state, marked_at=t)


BI = {t: t for t in range(0, 200)}          # marked_at doubles as the bar index in these fixtures

# ── HIS PAGE 11: two supply zones from ONE down-move ─────────────────────────────────────────────
print("PAGE 11 — the upper supply is the EXTREME, the lower is DECISIONAL")
hi_z, lo_z = supply(10, 1.3100, 1.3130), supply(14, 1.3040, 1.3070)
classify_roles([hi_z, lo_z], [], BI)
chk("the HIGHER supply is the extreme", hi_z.role, "extreme")
chk("the lower one is decisional", lo_z.role, "decisional")
# order of formation must NOT decide it — a later zone that prints HIGHER is still the extreme
a, b = supply(10, 1.3040, 1.3070), supply(14, 1.3100, 1.3130)
classify_roles([a, b], [], BI)
chk("formed LATER but higher -> still the extreme", b.role, "extreme")
chk("  and the earlier, lower one is decisional", a.role, "decisional")
teeth("the extreme rule", supply(10, 1.3100, 1.3130).role == "")

# ── MIRRORED FOR DEMAND ──────────────────────────────────────────────────────────────────────────
print()
print("DEMAND is mirrored — the LOWEST is the extreme")
d_hi, d_lo = demand(10, 1.2900, 1.2930), demand(14, 1.2840, 1.2870)
classify_roles([d_hi, d_lo], [], BI)
chk("the LOWER demand is the extreme", d_lo.role, "extreme")
chk("the higher one is decisional", d_hi.role, "decisional")
teeth("the demand mirror", d_hi.role != "extreme")

# ── A ZONE ALONE CLAIMS NOTHING ──────────────────────────────────────────────────────────────────
print()
print("A ZONE ALONE IN ITS GROUP IS NEITHER — there is no distinction to draw")
solo = supply(10, 1.3100, 1.3130)
classify_roles([solo], [], BI)
chk("a lone zone keeps role ''", solo.role, "")
chk("  so the cascade treats it normally", solo.role == "decisional", False)
teeth("the lone-zone rule", supply(10, 1.3100, 1.3130).role != "extreme")

# ── A BREAK THE OTHER WAY ENDS THE GROUP ─────────────────────────────────────────────────────────
print()
print("AN OPPOSITE BREAK ENDS THE MOVE — zones after it are a different group")
z1, z2 = supply(10, 1.3040, 1.3070), supply(30, 1.3100, 1.3130)
classify_roles([z1, z2], [E(20, "up")], BI)      # an UP break sits between them
chk("with an up-break between, neither is decisional", (z1.role, z2.role), ("", ""))
z3, z4 = supply(10, 1.3040, 1.3070), supply(30, 1.3100, 1.3130)
classify_roles([z3, z4], [E(20, "down")], BI)    # a DOWN break does not end a supply move
chk("a same-way break does NOT split the group", z4.role, "extreme")
teeth("the group cut", classify_roles([z1, z2], [E(20, "up")], BI) is None and z1.role == "")

# ── DEAD ZONES ARE NOT GROUPED ───────────────────────────────────────────────────────────────────
print()
print("A BROKEN ZONE CANNOT BE THE EXTREME — it is not on offer")
dead, alive = supply(10, 1.3100, 1.3130, state="broken"), supply(14, 1.3040, 1.3070)
classify_roles([dead, alive], [], BI)
chk("the broken zone is skipped", dead.role, "")
chk("  so the live one is alone, not decisional", alive.role, "")
teeth("the live-only rule", supply(10, 1.3100, 1.3130, state="broken").live is False)

# ── THREE-DEEP STACK ─────────────────────────────────────────────────────────────────────────────
print()
print("A DEEPER STACK — exactly one extreme, the rest decisional")
stack = [supply(10, 1.3100, 1.3130), supply(12, 1.3060, 1.3090), supply(14, 1.3020, 1.3050)]
classify_roles(stack, [], BI)
chk("one extreme in the group", sum(1 for z in stack if z.role == "extreme"), 1)
chk("  and it is the highest", stack[0].role, "extreme")
chk("  the other two are decisional", [z.role for z in stack[1:]], ["decisional", "decisional"])

# ── THE ENTRY MODEL: A STOP ORDER, AND THE STOP OFF THE ZONE ─────────────────────────────────────
# His instruction, 2026-08-15: *"we will do confirmation in LTF plus we use stop orders."*
print()
print("THE ENTRY IS A STOP ORDER BEYOND THE CONFIRMING BAR, STOP BEYOND THE ZONE DISTAL")

from core.types import Candle                                            # noqa: E402
from strategies.bx_sd_entry import entry_trigger, _ENTRY_STOP_BUFFER_PIPS  # noqa: E402
from strategies.bx_sd_ltf import LTFConfluence                           # noqa: E402
from strategies.bx_sd_setup import SetupResult, _SL_BUFFER_PIPS          # noqa: E402
from strategies.bx_sd_zones import Zone                                  # noqa: E402

PIP = 0.0001


def m1(seq):
    """M1 candles from (open, close) pairs, small wicks so swings are unambiguous."""
    out = []
    for i, (o, c) in enumerate(seq):
        out.append(Candle(time=1700000000 + i * 60, open=o, high=max(o, c) + 0.00003,
                          low=min(o, c) - 0.00003, close=c, volume=0, timeframe="M1"))
    return out


def zig(legs, start=1.3100):
    """A zigzag of (target, bars) legs. A MONOTONIC staircase will not do: `find_swing_points` needs
    local extremes, so a straight descent produces no swings, no BOS, and `reaction_on` returns "" —
    which is how the first version of this fixture failed to fire and briefly looked like a bug in
    the code rather than in the test."""
    seq, p = [], start
    for tgt, n in legs:
        step = (tgt - p) / n
        for _ in range(n):
            seq.append((p, p + step)); p += step
    return m1(seq)


# Lower highs and lower lows -> a DOWN BOS, which gives `reaction_on` its continuation arm.
down = zig([(1.3080, 6), (1.3088, 4), (1.3062, 6), (1.3070, 4), (1.3044, 6), (1.3052, 4), (1.3026, 6)])
zsup = Zone(direction="supply", top=1.3120, bottom=1.3110, proximal=1.3110, distal=1.3120,
            eq50=1.3115, origin_index=0, ifc_index=1)
setup_s = SetupResult(active=True, direction="sell", zone=zsup)
trig = entry_trigger(LTFConfluence(passed=True), setup_s, down, [], pip=PIP)

chk("a sell fires on the descending fixture", trig.triggered, True)
if trig.triggered:
    last = down[-1]
    chk("entry is a STOP below the confirming bar's low, not its close",
        round(trig.entry, 5), round(last.low - _ENTRY_STOP_BUFFER_PIPS * PIP, 5))
    chk("  ...so it is BELOW the close (a stop, never a market fill)", trig.entry < last.close, True)
    chk("stop sits beyond the zone's DISTAL",
        round(trig.sl, 5), round(zsup.distal + _SL_BUFFER_PIPS * PIP, 5))
    chk("  and above the entry, as a sell stop must be", trig.sl > trig.entry, True)
    chk("target is on the far side", trig.tp < trig.entry, True)
teeth("the stop-order rule", trig.triggered and trig.entry != down[-1].close)

# The wrong-side guard must survive: a zone whose distal sits BELOW a sell entry is unusable.
bad_zone = Zone(direction="supply", top=1.2000, bottom=1.1990, proximal=1.1990, distal=1.2000,
                eq50=1.1995, origin_index=0, ifc_index=1)
bad = entry_trigger(LTFConfluence(passed=True),
                    SetupResult(active=True, direction="sell", zone=bad_zone), down, [], pip=PIP)
chk("a stop on the wrong side of the entry is refused", bad.triggered, False)
teeth("the wrong-side guard", bad.triggered is False)

# THE PULLBACK MODEL IS GONE — not disabled, deleted. A test that only checked behaviour would pass
# if someone reintroduced the constants, so this checks the names are actually absent.
import strategies.bx_sd_setup as _setup_mod                              # noqa: E402
for _dead in ("pullback_4h", "_PB_LOOKBACK_H4", "_PB_MIN_MOVE", "_PB_MIN_RETRACE",
              "_PB_MAX_RETRACE", "_SL_BEHIND_PULLBACK_PIPS"):
    chk(f"the pullback model is deleted: {_dead}", hasattr(_setup_mod, _dead), False)
chk("SetupResult no longer carries pb_extreme",
    "pb_extreme" in SetupResult.__dataclass_fields__, False)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
