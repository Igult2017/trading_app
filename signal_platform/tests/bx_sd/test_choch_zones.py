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


# DEFAULT IS `unmitigated`, which is what `build()` actually stamps on a zone when it marks it.
# It was "respected" — a leftover from the model where the cascade REQUIRED respected — and
# since only an unmitigated zone may be the extreme (2026-08-19) that default silently turned
# every role fixture into a no-extreme case. Pass state= explicitly where mitigation is the
# thing under test.
def supply(t, lo, hi, state="unmitigated"):
    """A supply zone: price approaches from BELOW, so proximal is the bottom edge."""
    return MarkedZone(direction="supply", top=hi, bottom=lo, proximal=lo, distal=hi,
                      eq50=(lo + hi) / 2, kind="institutional", ifc_time=t, origin_time=t,
                      state=state, marked_at=t)


def demand(t, lo, hi, state="unmitigated"):
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
# CHANGED 2026-08-19 — his rule: "an extreme zone qualifies when a decisional zone is broken, then
# the second qualification is liquidity being swept." A lone zone used to keep role "" and the
# cascade traded it unconditionally, which is exactly where the qualification was being skipped for
# most of the book. It must now EARN "extreme" like any other zone; unqualified it is not tradeable.
print("A LONE ZONE MUST EARN THE NAME — it no longer gets a free pass")
solo = supply(10, 1.3100, 1.3130)
classify_roles([solo], [], BI)                 # no bars/pools -> rule off -> old behaviour kept
# Removing the <2 early-return means a lone UNMITIGATED zone is now the furthest (only) candidate
# in its group, so with the rule off it reads "extreme". With the rule ON it must still qualify.
chk("a lone unmitigated zone is its group's extreme once nothing outranks it", solo.role, "extreme")
chk("  ...but a lone SPENT zone is not", 
    (lambda z: (classify_roles([z], [], BI), z.role)[1])(supply(10, 1.31, 1.312, state="respected")),
    "decisional")
teeth("the lone-zone rule", supply(10, 1.3100, 1.3130).role != "extreme")

# ── A BREAK THE OTHER WAY ENDS THE GROUP ─────────────────────────────────────────────────────────
print()
print("AN OPPOSITE BREAK ENDS THE MOVE — zones after it are a different group")
z1, z2 = supply(10, 1.3040, 1.3070), supply(30, 1.3100, 1.3130)
classify_roles([z1, z2], [E(20, "up")], BI)      # an UP break sits between them
chk("with an up-break between, they are in DIFFERENT groups", z1.group != z2.group, True)
z3, z4 = supply(10, 1.3040, 1.3070), supply(30, 1.3100, 1.3130)
classify_roles([z3, z4], [E(20, "down")], BI)    # a DOWN break does not end a supply move
chk("a same-way break does NOT split the group", z4.role, "extreme")
teeth("the group cut", classify_roles([z1, z2], [E(20, "up")], BI) is None
      and z1.group != z2.group)

# ── DEAD ZONES ARE NOT GROUPED ───────────────────────────────────────────────────────────────────
print()
print("A BROKEN ZONE CANNOT BE THE EXTREME — it is not on offer")
dead, alive = supply(10, 1.3100, 1.3130, state="broken"), supply(14, 1.3040, 1.3070)
classify_roles([dead, alive], [], BI)
chk("the broken zone is skipped", dead.role, "")
chk("  so the live one is alone in its group", alive.group != -1, True)
teeth("the live-only rule", supply(10, 1.3100, 1.3130, state="broken").live is False)

# ── THREE-DEEP STACK ─────────────────────────────────────────────────────────────────────────────
print()
print("A DEEPER STACK — exactly one extreme, the rest decisional")
stack = [supply(10, 1.3100, 1.3130), supply(12, 1.3060, 1.3090), supply(14, 1.3020, 1.3050)]
classify_roles(stack, [], BI)
chk("one extreme in the group", sum(1 for z in stack if z.role == "extreme"), 1)
chk("  and it is the highest", stack[0].role, "extreme")
chk("  the other two are decisional", [z.role for z in stack[1:]], ["decisional", "decisional"])

# ── THE ENTRY MODEL: THE BOOK'S, p81 ─────────────────────────────────────────────────────────────
print()
print("ENTRY = START OF THE REFINED 5M ZONE, SL = ITS FURTHEST POINT (book p81)")
#     "To enter off a CHoCH you put your ENTRY AT THE START of the supply/demand and the SL AT THE
#      FURTHEST POINT of the supply/demand."
#
# WHY 5M AND NOT 1M — measured on 31 confirmed EUR/USD taps before choosing. Applying p81 to a 1M
# refinement gave a MEDIAN STOP OF 0.8 PIPS (max 3.6, all 23 under 5) — inside the spread, so every
# trade would have died on entry whichever way price went. 5M gives a 3.2-pip median. The user
# settled it: "I do use 5M and it is perfect."
#
# NO SPREAD ADDED. The book says to add it; he said not to. A deliberate departure, recorded.
from core.types import Candle                                            # noqa: E402
from strategies.bx_sd_entry import entry_trigger                         # noqa: E402
from strategies.bx_sd_ltf import LTFConfluence, refine_zone              # noqa: E402
from strategies.bx_sd_setup import SetupResult                           # noqa: E402
from strategies.bx_sd_zones import Zone                                  # noqa: E402

PIP = 0.0001


def m1(seq, tf="M1"):
    return [Candle(time=1700000000 + i * 60, open=o, high=max(o, c) + 0.00003,
                   low=min(o, c) - 0.00003, close=c, volume=0, timeframe=tf)
            for i, (o, c) in enumerate(seq)]


def zig(legs, start=1.3100):
    """A zigzag. A MONOTONIC staircase will not do: `find_swing_points` needs local extremes, so a
    straight descent produces no swings, no BOS, and `reaction_on` returns "" — which is how the
    first version of this fixture failed to fire and briefly looked like a bug in the code."""
    seq, p = [], start
    for tgt, n in legs:
        step = (tgt - p) / n
        for _ in range(n):
            seq.append((p, p + step)); p += step
    return m1(seq)


down = zig([(1.3080, 6), (1.3088, 4), (1.3062, 6), (1.3070, 4), (1.3044, 6), (1.3052, 4), (1.3026, 6)])
zsup = Zone(direction="supply", top=1.3120, bottom=1.3110, proximal=1.3110, distal=1.3120,
            eq50=1.3115, origin_index=0, ifc_index=1)
setup_s = SetupResult(active=True, direction="sell", zone=zsup)

# a 5M series carrying a supply zone whose proximal sits INSIDE the 4H zone
_r5 = [(1.3100 - i * 0.00004, 1.3100 - (i + 1) * 0.00004) for i in range(20)]
_r5 += [(1.3092, 1.3118), (1.3118, 1.3115), (1.3113, 1.3090),
        (1.3090, 1.3086), (1.3086, 1.3082), (1.3082, 1.3078)]
five = m1(_r5, tf="M5")
rz = refine_zone(five, "supply", zsup, PIP)
chk("the 5M fixture yields a refined zone inside the 4H zone", rz is not None, True)

trig = entry_trigger(LTFConfluence(passed=True), setup_s, down, [], pip=PIP, refine_tf=five)
chk("a sell fires with a 5M zone to enter at", trig.triggered, True)
if trig.triggered and rz is not None:
    chk("stop is the FURTHEST POINT (distal) of the 5M zone", round(trig.sl, 5), round(rz.distal, 5))
    chk("  entry comes off that same zone, never invented",
        round(trig.entry, 5) in (round(rz.proximal, 5), round(rz.eq50, 5)), True)
    chk("  no spread or buffer is added to either",
        min(abs(trig.sl - rz.distal), abs(trig.entry - rz.proximal),
            abs(trig.entry - rz.eq50)) < 1e-9, True)
    chk("  the stop is above the entry, as a sell must be", trig.sl > trig.entry, True)
    chk("  risk is a tradeable size, not sub-pip", abs(trig.sl - trig.entry) / PIP > 1.0, True)
# EQUILIBRIUM (50%) ENTRY — p51-54, wired 2026-08-15. `needs_eq50` was fully written with BOTH of
# the book's triggers and had ZERO CALLERS until the audit found it.
#   1. SHAPE  (p51-52) — wick bigger than 50% of the candle
#   2. WIDTH  (p53-54) — "if the maximum 2 pip SL can't fit ... I also use equilibrium entry"
# The fixture zone is 3.6 pips, so trigger 2 fires and the stop halves.
chk("a zone wider than the 2-pip max SL takes the EQUILIBRIUM entry",
    trig.details.get("entry_price_rule"), "equilibrium (50%)")
chk("  entry is the zone's 50%, not its edge", round(trig.entry, 5), round(rz.eq50, 5))
chk("  which HALVES the risk vs entering at the edge",
    round(abs(trig.sl - trig.entry), 6) < round(abs(rz.distal - rz.proximal), 6), True)
teeth("the equilibrium rule", trig.details.get("entry_price_rule") == "equilibrium (50%)"
      and round(trig.entry, 5) != round(rz.proximal, 5))

# NO 5M ZONE -> NO ENTRY. The book enters AT the supply/demand the reaction left; with none there is
# nothing to enter at, and inventing a level would be exactly the blind limit the book forbids.
none_trig = entry_trigger(LTFConfluence(passed=True), setup_s, down, [], pip=PIP, refine_tf=None)
chk("no refined 5M zone -> refused", none_trig.triggered, False)
chk("  ...and says why", "no refined 5M zone" in none_trig.reason, True)
teeth("the no-zone refusal", none_trig.triggered is False)

# THE PULLBACK MODEL IS GONE — not disabled, deleted. A test that only checked behaviour would pass
# if someone reintroduced the constants, so this checks the names are actually absent.
import strategies.bx_sd_setup as _setup_mod                              # noqa: E402
for _dead in ("pullback_4h", "_PB_LOOKBACK_H4", "_PB_MIN_MOVE", "_PB_MIN_RETRACE",
              "_PB_MAX_RETRACE", "_SL_BEHIND_PULLBACK_PIPS"):
    chk(f"the pullback model is deleted: {_dead}", hasattr(_setup_mod, _dead), False)
chk("SetupResult no longer carries pb_extreme",
    "pb_extreme" in SetupResult.__dataclass_fields__, False)

# ── GROUPS: "THE EXTREME" IS ONLY MEANINGFUL INSIDE ONE ─────────────────────────────────────────
print()
print("EVERY ZONE CARRIES ITS GROUP — so the extreme named is the RIGHT extreme")
# THE BUG THIS PINS (found by audit, 2026-08-15). The tap alert names the level price is expected to
# run to. It looked up "any live extreme on this side" and took the furthest — which on real EUR/USD
# told a decisional zone at 1.14066 that its extreme was 1.19601: 550 pips away, from a different
# move entirely. Right side, wrong zone, printed as fact on a card a reader may act on.
# UNMITIGATED on purpose: since 2026-08-19 only an unmitigated zone may be the extreme, so a
# fixture built from the helper's default ("respected") would produce no extreme at all and this
# test would be measuring the mitigation rule instead of the group scoping it exists for.
g1 = [supply(10, 1.3100, 1.3130, state="unmitigated"),
      supply(14, 1.3040, 1.3070, state="unmitigated")]
g2 = [supply(40, 1.2500, 1.2530, state="unmitigated"),
      supply(44, 1.2440, 1.2470, state="unmitigated")]
classify_roles(g1 + g2, [E(25, "up")], BI)      # an up-break between them = two separate moves
chk("two moves produce two groups", len({z.group for z in g1 + g2}), 2)
chk("  each group has its own extreme", sum(1 for z in g1 + g2 if z.role == "extreme"), 2)
_d = next(z for z in g2 if z.role == "decisional")
_same = [z for z in g1 + g2 if z.role == "extreme" and z.group == _d.group]
chk("  a decisional zone's extreme is in ITS OWN group", len(_same), 1)
chk("  ...and it is the near one, not the far one", _same[0].proximal, 1.2500)
teeth("the group scoping", _same[0].proximal != max(z.proximal for z in g1 + g2))
chk("a lone zone still gets a group id", supply(10, 1.31, 1.312).group == -1, True)

# ── ONLY AN UNMITIGATED ZONE MAY BE THE EXTREME (his rule, 2026-08-19) ──────────────────────────
# "we are only trading unmitigated and extreme zones."
#
# THE DEFECT THIS PINS. His EUR/USD card said "the extreme at 1.16380 is the one we take" while that
# zone was `respected` — already tapped, reacted and finished — with SIX unmitigated supply zones
# above it. Price ran through it and the monitor logged "4H zone broken before the entry triggered".
# The document says the same twice: a Fake CHoCH is "price did not reverse from a major UNMITIGATED
# demand zone" (§9), and §21's sequence ENDS at "extreme zone mitigated".
print()
print("only an UNMITIGATED zone may be the extreme:")
spent_far = supply(10, 1.3100, 1.3130, state="respected")      # furthest, but spent
fresh_near = supply(14, 1.3040, 1.3070, state="unmitigated")   # nearer, still loaded
classify_roles([spent_far, fresh_near], [], BI)
chk("the furthest zone does NOT win the label when it is spent", spent_far.role, "decisional")
chk("  ...the nearest UNMITIGATED zone does instead", fresh_near.role, "extreme")

allspent = [supply(10, 1.3100, 1.3130, state="respected"),
            supply(14, 1.3040, 1.3070, state="body_mitigated")]
classify_roles(allspent, [], BI)
chk("a group with nothing unmitigated has NO extreme at all",
    sum(1 for z in allspent if z.role == "extreme"), 0)
chk("  ...and every zone in it is decisional, so none is tradeable",
    all(z.role == "decisional" for z in allspent), True)
teeth("the unmitigated-extreme rule", spent_far.role == "decisional" and fresh_near.role == "extreme")


# ── CRITERION 2: LIQUIDITY SWEPT ON THE WAY IN ──────────────────────────────────────────────────
print()
print("LIQUIDITY MUST BE SWEPT BEFORE PRICE TAPS THE ZONE")
#     "If the price taps unmitigated HTF zone without sweeping liquidity, the zone or mitigation is
#      likely to fail and act as liquidity."
from strategies.bx_sd_liquidity import swept_before, swept_within                # noqa: E402
from strategies.bx_sd_pools import LiquidityPool                                 # noqa: E402


def h4(seq):
    return [Candle(time=1700000000 + i * 14400, open=o, high=max(o, c) + 0.0002,
                   low=min(o, c) - 0.0002, close=c, volume=0, timeframe="H4")
            for i, (o, c) in enumerate(seq)]


# Price sits at 1.1000, dips to take out a low, then drifts DOWN and stays there. The pool at 1.0990
# was swept long ago at bar 6 — by the time we reach bar 40 there are no stops left on it.
_seq = [(1.1000, 1.1000)] * 5 + [(1.1000, 1.0980)] + [(1.0980, 1.0960)] * 3 \
       + [(1.0960, 1.0960)] * 31
_bars = h4(_seq)
_pool = [LiquidityPool("sell", 1.0990, "eql", 2)]

# THE OLD QUESTION says yes — and that is the bug. Every bar in the window has a low below 1.0990,
# because price is simply BELOW that level now. It cannot tell "swept on the way in" from "left
# behind ages ago", so used at the tap it allowed 100% of taps on both real pairs.
chk("swept_before says yes (it only asks 'did any bar trade beyond this level')",
    swept_before(_pool, _bars, "sell", 40, 20), True)
# THE RIGHT QUESTION says no: the pool was already gone before the window opened.
chk("swept_within says NO — the pool was already taken long before the approach",
    swept_within(_pool, _bars, "sell", 20, 40), False)
teeth("the resting-pool requirement",
      swept_before(_pool, _bars, "sell", 40, 20) is True
      and swept_within(_pool, _bars, "sell", 20, 40) is False)

# ...and it says YES when a pool that WAS still resting gets grabbed inside the window.
_seq2 = [(1.1000, 1.1000)] * 30 + [(1.1000, 1.0975)] + [(1.0975, 1.0990)] * 9
_bars2 = h4(_seq2)
_pool2 = [LiquidityPool("sell", 1.0985, "eql", 5)]     # untouched until bar 30
chk("a pool still resting, then grabbed on the way in -> YES",
    swept_within(_pool2, _bars2, "sell", 25, 39), True)
chk("  ...and a pool on the WRONG side is not counted",
    swept_within([LiquidityPool("buy", 1.0985, "eqh", 5)], _bars2, "sell", 25, 39), False)
chk("a window before the sweep happened -> NO",
    swept_within(_pool2, _bars2, "sell", 10, 20), False)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
