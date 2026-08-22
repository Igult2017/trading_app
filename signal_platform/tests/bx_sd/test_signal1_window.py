"""SIGNAL 1's WINDOW — opened by price leaving the extreme zone, closed by the first opposite break.

His rule, 2026-08-22:

    "any pullback that comes after the price has left the extreme zone it tapped... we dont use time
     we just keep track of price action."
    "this stops when the price has broken the first opposite zone which is the first qualification
     for signal 2 after CHOCH."
    "It must be unmitigated and extreme zones, not just any zone."

WHY THIS FILE EXISTS. Both labels his rule names are destroyed by the tap that opens the window — a
tapped zone is no longer `unmitigated`, and only an unmitigated zone may hold `extreme`
(bx_sd_registry:304). Asking either question at ENTRY time always answers NO, which is the exact
contradiction that has had signal 2 dead since 14 Aug 2026. Every check must be AS OF THE TAP, and
these tests are what hold that in place.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from core.types import Candle                                       # noqa: E402
from strategies.bx_sd_registry import MarkedZone                    # noqa: E402
from strategies import bx_sd_signal1 as s1                          # noqa: E402

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


def zone(direction, bottom, top, *, marked, mitigated=None, respected=None, broken=None, group=0):
    z = MarkedZone(direction=direction, top=top, bottom=bottom,
                   proximal=bottom if direction == "supply" else top,
                   distal=top if direction == "supply" else bottom,
                   eq50=(top + bottom) / 2.0, kind="body",
                   ifc_time=marked, origin_time=marked)
    z.marked_at, z.mitigated_at, z.respected_at, z.broken_at = marked, mitigated, respected, broken
    z.group = group
    z.state = ("broken" if broken else "respected" if respected
               else "body_mitigated" if mitigated else "unmitigated")
    return z


def bar(t, lo, hi):
    return Candle(time=t, open=(lo + hi) / 2, high=hi, low=lo, close=(lo + hi) / 2,
                  volume=0, timeframe="H4")


print()
print("STATE AS OF A MOMENT — rebuilt from the transition stamps")
z = zone("supply", 1.1000, 1.1020, marked=100, mitigated=200, respected=300, broken=400)
chk("before it existed",      s1.state_at(z, 50),  "")
chk("marked, untouched",      s1.state_at(z, 150), "unmitigated")
chk("on the tap bar itself",  s1.state_at(z, 200), "mitigated")
chk("after it reacted away",  s1.state_at(z, 350), "respected")
chk("after it broke",         s1.state_at(z, 450), "broken")
chk("live while untouched",   s1.live_at(z, 150),  True)
chk("not live once broken",   s1.live_at(z, 450),  False)
teeth("the stamps really do drive it — a later moment gives a later state",
      s1.state_at(z, 150) != s1.state_at(z, 350))

print()
print("WAS IT THE EXTREME **WHEN PRICE ARRIVED** — not now")
# Two supply zones in one group. The higher one (1.1100) is the extreme while both are untouched.
high = zone("supply", 1.1100, 1.1120, marked=100, mitigated=500, group=1)
low  = zone("supply", 1.1000, 1.1020, marked=110, mitigated=200, group=1)
chk("the higher supply zone was the extreme at bar 150", s1.was_extreme_at(high, [high, low], 150), True)
chk("the lower one was not",                             s1.was_extreme_at(low,  [high, low], 150), False)
# THE WHOLE POINT: after its own tap, `high` is no longer unmitigated, so today it reads decisional.
chk("AFTER its tap it is no longer extreme — as the registry would say",
    s1.was_extreme_at(high, [high, low], 600), False)
chk("...but asked AS OF THE TAP, it still is", s1.opened_window(high, [high, low]), True)
teeth("asking 'now' instead of 'at the tap' would refuse it — the signal-2 bug",
      s1.was_extreme_at(high, [high, low], 600) is False and s1.opened_window(high, [high, low]) is True)

# A zone alone in its group holds no role at all (registry:302)
lone = zone("demand", 1.0900, 1.0920, marked=100, mitigated=200, group=7)
chk("a zone alone in its group is not extreme", s1.was_extreme_at(lone, [lone], 150), False)
chk("...so it opens no window",                 s1.opened_window(lone, [lone]), False)
# Ungrouped (broken now -> group -1) claims no role
orphan = zone("supply", 1.1200, 1.1220, marked=100, mitigated=200, group=-1)
chk("an ungrouped zone claims no role", s1.was_extreme_at(orphan, [orphan], 150), False)

print()
print("THE WINDOW OPENS — price leaves the band (NOT 'a full zone-height away')")
ext = zone("demand", 1.0980, 1.1000, marked=100, mitigated=200, group=1)
# THE NEIGHBOUR SITS ABOVE, and that is the whole point: for DEMAND the extreme is the LOWEST zone
# (furthest below price), the mirror of supply where it is the highest. Placing it below instead made
# the neighbour the extreme and this file failed — the fixture was wrong, not the code.
nbr = zone("demand", 1.1040, 1.1060, marked=110, group=1)
before = [bar(150, 1.1050, 1.1070), bar(200, 1.0985, 1.1010)]      # arrives and taps
chk("still inside the band -> has not left", s1.has_left(ext, before), False)
after = before + [bar(250, 1.1010, 1.1030)]                        # clear of the zone, only just
chk("clear of the band -> it has left", s1.has_left(ext, after), True)
teeth("leaving does NOT require a full zone-height move (that is `respected`, and far later)",
      s1.has_left(ext, after) is True and ext.respected_at is None)

print()
print("THE WINDOW CLOSES — the first OPPOSITE zone breaks")
opp_live   = zone("supply", 1.1100, 1.1120, marked=120, group=2)
chk("no opposite break yet -> window open",
    s1.window_open(ext, [ext, nbr, opp_live], after), True)
opp_broken = zone("supply", 1.1100, 1.1120, marked=120, broken=260, group=2)
chk("an opposite zone broken AFTER the tap -> window closed",
    s1.window_open(ext, [ext, nbr, opp_broken], after), False)
# A break BEFORE the tap belongs to an older move and must not close this window.
opp_old = zone("supply", 1.1100, 1.1120, marked=120, broken=180, group=2)
chk("an opposite break BEFORE the tap is a different move — window stays open",
    s1.window_open(ext, [ext, nbr, opp_old], after), True)
chk("a SAME-side break does not close it",
    s1.opposite_broken_since(ext, [zone("demand", 1.09, 1.092, marked=120, broken=260, group=3)], 200),
    False)

print()
print("ALL THREE BOUNDARIES TOGETHER")
chk("never extreme -> no window", s1.window_open(nbr, [ext, nbr], after), False)
chk("extreme but price still inside -> no window", s1.window_open(ext, [ext, nbr], before), False)
chk("extreme, left the band, no opposite break -> OPEN", s1.window_open(ext, [ext, nbr], after), True)
untapped = zone("demand", 1.0980, 1.1000, marked=100, group=1)
chk("never tapped at all -> no window", s1.window_open(untapped, [untapped, nbr], after), False)

print()
print("THE 1H + 15M/30M REQUIREMENT — it GATES, it does not score")
# "These are a confluence for signal one and also a requirement. Without them the signal doesn't fire."
def h1bar(t_, lo, hi):
    return Candle(time=t_, open=(lo + hi) / 2, high=hi, low=lo, close=(lo + hi) / 2,
                  volume=0, timeframe="H1")

flat = [h1bar(i * 3600, 1.1000, 1.1002) for i in range(200)]   # no imbalance -> no zones anywhere
books_flat = s1.build_mtf_books(flat, flat, flat, 0.0001)
here = h1bar(999, 1.0990, 1.1010)
ok, legs, _ = s1.mtf_confluence("buy", here, books_flat)
chk("a market with no zones fails the requirement", ok, False)
chk("...and names no legs", legs, [])

books_no_h1 = s1.build_mtf_books([], flat, flat, 0.0001)
ok2, _l, _h = s1.mtf_confluence("buy", here, books_no_h1)
chk("no 1H feed at all -> refused (1H is required, not optional)", ok2, False)

chk("no confluence -> no pullback zone to enter on",
    s1.pullback_zone("buy", here, books_flat), (None, None))
teeth("the requirement can actually refuse — it is a gate, not a score",
      s1.mtf_confluence("buy", here, books_flat)[0] is False)

print()
print("PERFORMANCE CONTRACT — the books are built once, not once per zone")
import time as _t
_t0 = _t.perf_counter()
for _ in range(50):
    s1.mtf_confluence("buy", here, books_flat)
_ms = (_t.perf_counter() - _t0) * 1000
chk("50 zones cost well under a second when the books are passed in", _ms < 500, True)
print(f"        (measured {_ms:.1f} ms for 50 — rebuilding inside the loop was ~2,400 ms)")

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
