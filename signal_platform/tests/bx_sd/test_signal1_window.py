"""SIGNAL 1's WINDOW — opened by the zone being RESPECTED, closed by the first opposite break.

HIS RULE, 2026-08-23, and it replaced the one this file used to assert:

    "Signal 1 and 2 use the same extreme/respected zone however, signal one only waits for pullback
     then it fires. The price moves away from the zone and immediately we get a pullback we look for
     confirmations and alignments and then go to entry and look for confirmation entry."

    "this stops when the price has broken the first opposite zone which is the first qualification
     for signal 2 after CHOCH."

ONE definition of the extreme zone serves both signals, and price proves it: `respected` means price
tapped the zone and then CLOSED A FULL ZONE-HEIGHT AWAY from it (`bx_sd_registry.REACT_MULT`).

WHAT THIS FILE USED TO ASSERT, so it is not re-derived. Two weaker tests, both now deleted:
  * `was_extreme_at(z, zones, tap - 1)` — was this the furthest-out zone one bar BEFORE price
    arrived. A test on WHERE THE ZONE SAT, decided before the market had said anything. It was the
    single biggest refusal in BX: 15 of 19 changes of character counted BY HAND from raw EUR/USD 4H
    candles (79%) died on the same test in `choch_verdict`, and nothing passed at all.
  * `has_left(z, bars)` — any closed bar not touching the zone. Weaker than respect, so it was the
    binding one and respect never got asked. A full zone-height close away IS having left.

`state_at` / `live_at` existed only to serve `was_extreme_at` and went with it.
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
print("THE WINDOW OPENS ON RESPECT — price closed a full zone-height clear of the zone")
# THE NEIGHBOUR SITS ABOVE, and that is deliberate: for DEMAND the extreme is the LOWEST zone
# (furthest below price), the mirror of supply where it is the highest. Placing it below instead made
# the neighbour the extreme and this file failed — the fixture was wrong, not the code.
ext = zone("demand", 1.0980, 1.1000, marked=100, mitigated=200, respected=300, group=1)
nbr = zone("demand", 1.1040, 1.1060, marked=110, group=1)
before = [bar(150, 1.1050, 1.1070), bar(200, 1.0985, 1.1010)]      # arrives and taps
after  = before + [bar(250, 1.1010, 1.1030), bar(300, 1.1020, 1.1045)]
chk("a zone price tapped and reacted a full zone-height away from -> window opens",
    s1.opened_window(ext), True)

# THE CASE THE OLD RULE LET THROUGH, and the reason respect replaced it. This zone was tapped and
# price did step clear of the band — `has_left` said yes — but it never closed a full zone-height
# away, so price never actually held there. It opens NOTHING now.
touched_only = zone("demand", 1.0980, 1.1000, marked=100, mitigated=200, group=1)
chk("tapped and stepped clear, but never reacted -> NO window", s1.opened_window(touched_only), False)
teeth("this is exactly what the deleted `has_left` accepted — a step clear of the band with no "
      "full-height close behind it",
      s1.opened_window(touched_only) is False and touched_only.mitigated_at is not None)

untapped = zone("demand", 1.0980, 1.1000, marked=100, group=1)
chk("never tapped at all -> no window", s1.opened_window(untapped), False)
chk("...and the whole check agrees", s1.window_open(untapped, [untapped, nbr], after), False)

# POSITION NO LONGER DECIDES IT. The neighbour is the NEARER demand zone — under the deleted rule it
# could never open a window because a zone sat further out. Respected, it opens one.
nbr_held = zone("demand", 1.1040, 1.1060, marked=110, mitigated=210, respected=310, group=1)
chk("a NEARER zone that price respected opens a window — position is not the test",
    s1.opened_window(nbr_held), True)
teeth("THE 79% REFUSAL: the deleted rule called this zone decisional because `ext` sat further out, "
      "and refused it while price was visibly holding there",
      s1.opened_window(nbr_held) is True and ext.proximal < nbr_held.proximal)

print()
print("THE WINDOW CLOSES — the first OPPOSITE zone breaks")
opp_live   = zone("supply", 1.1100, 1.1120, marked=120, group=2)
chk("no opposite break yet -> window open",
    s1.window_open(ext, [ext, nbr, opp_live], after), True)
opp_broken = zone("supply", 1.1100, 1.1120, marked=120, broken=360, group=2)
chk("an opposite zone broken AFTER the tap -> window closed",
    s1.window_open(ext, [ext, nbr, opp_broken], after), False)
# A break BEFORE the tap belongs to an older move and must not close this window.
opp_old = zone("supply", 1.1100, 1.1120, marked=120, broken=180, group=2)
chk("an opposite break BEFORE the tap is a different move — window stays open",
    s1.window_open(ext, [ext, nbr, opp_old], after), True)
chk("a SAME-side break does not close it",
    s1.opposite_broken_since(ext, [zone("demand", 1.09, 1.092, marked=120, broken=260, group=3)], 200),
    False)

# MEASURED FROM THE TAP, NOT FROM THE RESPECT — the decision recorded in `window_open`'s docstring.
# Here the opposite zone breaks at 260, between the tap (200) and the respect (300). The change of
# character had already begun before the zone proved itself, so there was never a signal-1 phase.
opp_mid = zone("supply", 1.1100, 1.1120, marked=120, broken=260, group=2)
chk("an opposite break BETWEEN the tap and the respect -> no signal-1 phase, straight to signal 2",
    s1.window_open(ext, [ext, nbr, opp_mid], after), False)
teeth("that is the TAP being the boundary, not the respect — from the respect this would be open",
      s1.opposite_broken_since(ext, [ext, nbr, opp_mid], 200) is True
      and s1.opposite_broken_since(ext, [ext, nbr, opp_mid], 300) is False)

print()
print("BOTH BOUNDARIES TOGETHER")
chk("never respected -> no window", s1.window_open(nbr, [ext, nbr], after), False)
chk("respected, no opposite break -> OPEN", s1.window_open(ext, [ext, nbr], after), True)

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
