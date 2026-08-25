"""
BX-S/D — WHAT MAKES A ZONE AN EXTREME ZONE (`bx_sd_extreme`).

HIS DEFINITION, settled 2026-08-25:

    "Extreme zone is an extreme candidate that has been respected — meaning we are not guessing, we
     are waiting for the price to respect it."

    "When the price is swinging up, it is the extreme above it where price has to sweep liquidity to
     tap. It can be respected or not... The extreme zones can be endless and we might not know which
     one will be respected until the price does after sweeping liquidity."

WHAT WAS WRONG. Both signals tested `respected_at is not None` and nothing else, against the WHOLE
zone book. So a demand zone sitting BEHIND price in a rally counted as an "extreme" exactly like a
supply zone standing in front of it, and signal 1 never required a liquidity sweep at all.

THE TWO TEETH THAT MATTER are the two tests that did not exist before — direction against the swing,
and liquidity swept on the approach. If either can be deleted with this file still green, it is not
testing anything.

No P&L, no win rate — classification only.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle                                          # noqa: E402
from strategies.bx_sd_extreme import (against_the_swing, beyond_price,  # noqa: E402
                                      extreme_candidate_at, is_extreme, swing_at)
from strategies.bx_sd_liquidity import LiquidityPool                   # noqa: E402
from strategies.bx_sd_registry import LIQ_WINDOW, MarkedZone            # noqa: E402

F, N = [], 0


def chk(name, got, want):
    global N
    N += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        F.append(name)


def teeth(name, cond):
    """A rule that cannot refuse is not a rule."""
    chk(f"TEETH — {name} can actually refuse", bool(cond), True)


def bar(i, o, h, low, c):
    return Candle(time=1_700_000_000 + i * 14400, open=o, high=h, low=low, close=c,
                  volume=100, timeframe="H4")


def rally(legs=5, start=1.3000, up=0.0060, down=0.0030):
    """A STAIRCASE of higher highs and higher lows — verified to read as UPTREND.

    TWO WAYS THIS FIXTURE WAS WRONG BEFORE IT WORKED, both worth recording because either one makes
    the whole file prove nothing:

      * A MONOTONIC RAMP HAS NO SWING POINTS. `find_swing_points(n=3)` needs three lower bars either
        side of a pivot; a straight line up has none, so `detect` returned RANGING and every candidate
        check refused for the wrong reason.
      * TIED PIVOT PRICES READ AS *LOWER*. The first staircase let the peak's high repeat on the next
        bar, which produced duplicate pivots at equal prices — `classify_structure` labelled them
        LH/LL, and a clean rally came back DOWNTREND. Each bar's high/low is now strictly inside its
        neighbours so every pivot is unique.
    """
    out, px, i = [], start, 0
    for _ in range(legs):
        for _ in range(4):                       # up leg
            o, c = px, px + up / 4
            out.append(bar(i, o, c + 0.0001, o, c)); px = c; i += 1
        for _ in range(4):                       # shallower pullback -> a HIGHER low
            o, c = px, px - down / 4
            out.append(bar(i, o, o, c - 0.0001, c)); px = c; i += 1
    return out


def selloff(**kw):
    """The rally reflected — LH/LL, so `detect` reads DOWNTREND. Built by mirroring rather than
    written twice, so the two fixtures cannot drift apart."""
    ax = 2.6
    return [bar(i, ax - c.open, ax - c.low, ax - c.high, ax - c.close)
            for i, c in enumerate(rally(**kw))]


def supply(t, lo, hi, **kw):
    return MarkedZone(direction="supply", top=hi, bottom=lo, proximal=lo, distal=hi,
                      eq50=(lo + hi) / 2, kind="institutional", ifc_time=t, origin_time=t,
                      marked_at=t, **kw)


def demand(t, lo, hi, **kw):
    return MarkedZone(direction="demand", top=hi, bottom=lo, proximal=hi, distal=lo,
                      eq50=(lo + hi) / 2, kind="institutional", ifc_time=t, origin_time=t,
                      marked_at=t, **kw)


UP, DOWN = rally(), selloff()

# ── THE SWING IS READ AT THE TAP, NOT FROM TODAY ─────────────────────────────────────────────────
print("WHICH WAY WAS IT SWINGING WHEN PRICE ARRIVED")
chk("a clean rally reads up", swing_at(UP, 39), "up")
chk("a clean sell-off reads down", swing_at(DOWN, 39), "down")
chk("too few bars to judge -> no answer", swing_at(UP[:5], 4), "")
# BOUNDED AT THE TAP. Reading today's trend would let a zone become a candidate retroactively
# because of what happened AFTER price tapped it — the lookahead trap this codebase has paid for
# twice (zone marking, 34% of the book).
_late = UP[:20] + [bar(20 + i, c.open, c.high, c.low, c.close) for i, c in enumerate(selloff())]
chk("judged at bar 19 it is still the rally, not the later collapse", swing_at(_late, 19), "up")

# ── AGAINST THE SWING — supply above in a rally, demand below in a sell-off ──────────────────────
print()
print("AN EXTREME STANDS AGAINST THE SWING (his: 'when price is swinging up, it is the extreme ABOVE')")
chk("rally into SUPPLY -> yes", against_the_swing("supply", "up"), True)
chk("rally into demand -> no, that is behind price", against_the_swing("demand", "up"), False)
chk("sell-off into DEMAND -> yes", against_the_swing("demand", "down"), True)
chk("sell-off into supply -> no", against_the_swing("supply", "down"), False)
chk("ranging -> neither side qualifies", against_the_swing("supply", ""), False)
teeth("the direction rule",
      against_the_swing("supply", "up") and not against_the_swing("demand", "up"))

# ── STILL IN FRONT OF PRICE ──────────────────────────────────────────────────────────────────────
print()
print("AND IT MUST STILL BE IN FRONT OF PRICE ON THE APPROACH")
_b = bar(0, 1.3000, 1.3060, 1.2990, 1.3050)
chk("supply above the close, in a rally -> in front", beyond_price(supply(0, 1.3080, 1.3100), _b, "up"), True)
chk("supply BELOW the close -> price is already past it",
    beyond_price(supply(0, 1.3000, 1.3020), _b, "up"), False)
chk("demand below the close, in a sell-off -> in front",
    beyond_price(demand(0, 1.2900, 1.2920), _b, "down"), True)

# ── THE FULL CANDIDATE TEST ──────────────────────────────────────────────────────────────────────
print()
print("A CANDIDATE: untouched, against the swing, in front, and price SWEPT ITS WAY THERE")
TAP = len(UP) - 1
_top = UP[TAP].close + 0.0020
_sup = supply(10, _top, _top + 0.0030)

# THE POOL HAS TO BE GENUINELY RESTING AND THEN GENUINELY TAKEN. `swept_within` refuses a pool price
# had already exceeded before the window opened ("already swept — no resting stops left"), so a level
# picked at random out of a rising staircase proves nothing: it was taken long before the approach.
# Derived from the bars instead — above everything before the window, below the window's own high.
_WIN_START = TAP - LIQ_WINDOW
_pre_hi = max(c.high for c in UP[:_WIN_START])
_win_hi = max(c.high for c in UP[_WIN_START:TAP + 1])
_swept = [LiquidityPool("buy", (_pre_hi + _win_hi) / 2, "eqh", _WIN_START - 1)]
_unswept = [LiquidityPool("buy", 1.9999, "eqh", _WIN_START - 1)]   # far above — never reached
chk("(fixture) the pool really was resting, then really was taken",
    _pre_hi < (_pre_hi + _win_hi) / 2 < _win_hi, True)

chk("swept its way into a supply zone above, in a rally -> CANDIDATE",
    extreme_candidate_at(_sup, UP, _swept, TAP), True)
chk("same zone, NOTHING swept on the way -> refused",
    extreme_candidate_at(_sup, UP, _unswept, TAP), False)
teeth("the sweep rule",
      extreme_candidate_at(_sup, UP, _swept, TAP)
      and not extreme_candidate_at(_sup, UP, _unswept, TAP))

# THE CASE SIGNAL 1 GOT WRONG: a demand zone BEHIND price in a rally.
_dem_behind = demand(10, UP[TAP].close - 0.0050, UP[TAP].close - 0.0020)
chk("a demand zone BEHIND price in a rally -> NOT an extreme",
    extreme_candidate_at(_dem_behind, UP, _swept, TAP), False)
teeth("the behind-price case",
      not extreme_candidate_at(_dem_behind, UP, _swept, TAP))

# RANGING — his description covers up and down only, so no NEW candidate opens.
_flat = [bar(i, 1.3000, 1.3010, 1.2990, 1.3000) for i in range(40)]
chk("ranging -> no new candidate opens", extreme_candidate_at(_sup, _flat, _swept, 39), False)

# ── EXTREME = CANDIDATE THAT WAS RESPECTED ───────────────────────────────────────────────────────
print()
print("EXTREME = A CANDIDATE PRICE RESPECTED — 'we are not guessing, we are waiting'")
_t = UP[TAP].time
_never = supply(10, _top, _top + 0.0030)
chk("a candidate never tapped is not yet an extreme", is_extreme(_never, UP, _swept), False)

_tapped = supply(10, _top, _top + 0.0030, state="body_mitigated", mitigated_at=_t)
chk("tapped but not yet respected -> not an extreme", is_extreme(_tapped, UP, _swept), False)

_held = supply(10, _top, _top + 0.0030, state="respected", mitigated_at=_t, respected_at=_t)
chk("tapped AND respected -> EXTREME", is_extreme(_held, UP, _swept), True)

# respect alone is NOT enough — this is precisely what the old code accepted
_held_behind = demand(10, UP[TAP].close - 0.0050, UP[TAP].close - 0.0020,
                      state="respected", mitigated_at=_t, respected_at=_t)
chk("RESPECTED but behind price -> still NOT an extreme (the old bug)",
    is_extreme(_held_behind, UP, _swept), False)
teeth("respect alone is no longer sufficient",
      is_extreme(_held, UP, _swept) and not is_extreme(_held_behind, UP, _swept))

_held_nosweep = supply(10, _top, _top + 0.0030, state="respected",
                       mitigated_at=_t, respected_at=_t)
chk("RESPECTED but nothing swept to reach it -> not an extreme",
    is_extreme(_held_nosweep, UP, _unswept), False)

# a tap older than the window handed to us cannot be judged — refuse rather than guess
_stale = supply(10, _top, _top + 0.0030, state="respected", mitigated_at=1, respected_at=1)
chk("a tap outside the bars given -> cannot judge, refused", is_extreme(_stale, UP, _swept), False)

# ── THE ORDERING TRAP IN `build` ─────────────────────────────────────────────────────────────────
print()
# `classify_roles` asks `choch_verdict`, which reads `broke_through` — set by `count_breakthroughs`.
# Run in the old order (classify first) every zone reads as a fake change of character and the whole
# book comes back `decisional`, with NO error raised. This pins the order rather than the symptom.
print("BUILD ORDER — breakthroughs must be counted BEFORE roles are named")
import inspect                                                          # noqa: E402

from strategies import bx_sd_registry as R                              # noqa: E402

_src = inspect.getsource(R.build)
_i_count = _src.find("count_breakthroughs(zones")
_i_class = _src.find("classify_roles(zones")
chk("both are called in build", _i_count > 0 and _i_class > 0, True)
chk("count_breakthroughs runs FIRST", _i_count < _i_class, True)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
