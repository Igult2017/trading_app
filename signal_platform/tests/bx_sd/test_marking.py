"""
BX-S/D — ZONE MARKING GEOMETRY: the band is the whole candle, high to low.

WHY THIS EXISTS. `mark_institutional` returned (open, MTH) from 2026-07-26 to 2026-07-30, on a
misreading of p17. The book's pictures (p16 schematic, p19 live "1HR Institutional candle (IC)") draw
the box around the ENTIRE candle; p17's open and MTH are two reference RAYS drawn on it — "By putting
these horizontal lines allows us to constantly MONITOR these Institutional candles" — not its edges.

open->MTH crops the band to whatever lies between the open and the midpoint, which for a candle that
opens near its own midpoint is nearly nothing. It cost a real GBP/JPY setup on 2026-07-29: see
REGRESSION below. Every candle here is REAL cTrader H4, not synthetic — the failure mode was that the
geometry looked reasonable in the abstract and was degenerate on actual bars.

Lifecycle (states, mitigation, retaps, breaks) is test_zones.py's job; this file is only the band.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle                                              # noqa: E402
from strategies.bx_sd_zones import mark_institutional, mark_zone           # noqa: E402

F, N = [], 0
PIP = 0.01                                       # GBP/JPY


def chk(name, got, want):
    global N
    N += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        F.append(name)


def near(name, got, want, tol=1e-6):
    global N
    N += 1
    ok = abs(got - want) < tol
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got:.4f}" + ("" if ok else f", want {want:.4f}"))
    if not ok:
        F.append(name)


def teeth(name, broke):
    global N
    N += 1
    print(f"   {'PASS' if broke else 'FAIL'}  TEETH — {name}: {bool(broke)}")
    if not broke:
        F.append("TEETH:" + name)


def C(t, o, h, l, c):
    return Candle(time=1700000000 + t * 14400, open=o, high=h, low=l, close=c,
                  volume=0, timeframe="H4")


# REAL GBP/JPY H4, 15 Jul 2026 — the zone candle, its IFC, and the bar that "broke" it on 29 Jul.
Z_CANDLE = C(2, 217.415, 217.807, 217.312, 217.760)   # 15 Jul 09:00 — the zone
IFC      = C(3, 217.759, 219.384, 217.743, 219.341)   # 15 Jul 13:00 — 164-pip impulse away
AFTER    = C(4, 219.343, 219.608, 219.303, 219.580)   # 15 Jul 17:00 — leaves the gap open
BEFORE   = C(1, 217.404, 217.695, 217.352, 217.415)   # 15 Jul 05:00
FLAT     = C(0, 217.265, 217.444, 217.103, 217.399)   # 15 Jul 01:00 — opens ON its own midpoint

BREAK_BAR = C(9, 217.607, 217.689, 217.166, 217.319)  # 29 Jul 01:00 — wick under, close inside

print("THE BAND IS THE WHOLE CANDLE (p16 / p19 / p72)")
top, bottom = mark_institutional(Z_CANDLE, True)
near("top is the candle's HIGH", top, 217.807)
near("bottom is the candle's LOW", bottom, 217.312)
near("  so the band is the candle's full range", (top - bottom) / PIP, 49.5)

# The old geometry, recomputed here so the regression is stated in the file rather than remembered.
_mth = (Z_CANDLE.high + Z_CANDLE.low) / 2.0
old_top, old_bottom = max(Z_CANDLE.open, _mth), min(Z_CANDLE.open, _mth)
near("open->MTH would have kept only this much of it", (old_top - old_bottom) / PIP, 14.45)
teeth("the geometries actually differ", abs(bottom - old_bottom) / PIP > 10)

print()
print("REGRESSION 29 Jul 2026 — a SWEEP must not read as a BREAK")
# A demand zone dies on a body CLOSE beyond its distal (the low). 29 Jul 01:00 wicked to 217.166 and
# closed 217.319: below the CROPPED floor, above the REAL one. The cropped band therefore deleted the
# zone; four bars later 29 Jul 17:00 ran 217.796 -> 218.482 off it.
chk("close 217.319 does NOT break the correctly marked zone", BREAK_BAR.close < bottom, False)
chk("  it WOULD have broken the open->MTH zone", BREAK_BAR.close < old_bottom, True)
chk("the wick to 217.166 is under the zone (a sweep, not a break)", BREAK_BAR.low < bottom, True)
near("  the margin the real zone survived by, in pips", (BREAK_BAR.close - bottom) / PIP, 0.7)
teeth("the regression discriminates", (BREAK_BAR.close < old_bottom) and not (BREAK_BAR.close < bottom))

print()
print("DEGENERATE BANDS — the failure open->MTH produced on real bars")
ftop, fbottom = mark_institutional(FLAT, True)
near("a 34-pip candle that opens on its midpoint marks its FULL range", (ftop - fbottom) / PIP, 34.1)
_fmth = (FLAT.high + FLAT.low) / 2.0
near("  open->MTH would have marked it this wide", abs(FLAT.open - _fmth) / PIP, 0.85)
teeth("open->MTH really did collapse this candle", abs(FLAT.open - _fmth) / PIP < 1.0)

print()
print("DISPATCH — mark_zone still routes wick / engulfed / institutional correctly")
# The IFC's own lower wick (217.743) does NOT sweep the zone candle's low (217.312), so the wick
# technique must NOT fire here and the ordinary candle-before rule stands.
bars = [FLAT, BEFORE, Z_CANDLE, IFC, AFTER]
mtop, mbottom, origin, kind = mark_zone(bars, 3, True)
chk("origin is the candle BEFORE the IFC", origin, 2)
chk("  not a wick zone (the impulse never swept it)", kind == "wick", False)
near("  and it carries the whole-candle band", (mtop - mbottom) / PIP, 49.5)

# p33-35 still owns the sweep case: an impulse whose lower wick runs through the prior candle.
swept = C(5, 217.500, 217.900, 217.000, 217.850)      # low 217.000 < zone candle low 217.312
w_top, w_bottom, w_origin, w_kind = mark_zone([FLAT, BEFORE, Z_CANDLE, swept, AFTER], 3, True)
chk("an impulse that DOES sweep the prior candle -> wick zone", w_kind, "wick")
chk("  and the wick zone anchors on the impulse, not the candle before", w_origin, 3)
teeth("the two techniques are distinguishable", kind != w_kind)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
