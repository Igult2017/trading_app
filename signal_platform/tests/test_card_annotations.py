"""The card's annotation layer — the labels, the zones, the mark and the arrow.

WHY THIS EXISTS. A GBP/USD signal with a 4.3-pip stop printed "STOP", "ENTRY", and both prices on
top of one another: the tightest, best setups were the least readable ones, and nothing caught it
because the only card test asks whether a PNG came out. These read back what was actually drawn on
the axis, so a collision fails a test instead of reaching Telegram.
"""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                                   # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.types import Candle                                     # noqa: E402
from charting import annotations as ann, price_panel              # noqa: E402

PASS = FAIL = 0


def check(label, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def bars(n=60, base=1.3435):
    """~90 pips of range, because THE RANGE IS THE THREAT.

    The first version of this fixture wiggled over 19 pips. Every label cleared every other one by
    miles, and the tests passed even with the anti-collision spacing set to ZERO — they proved
    nothing. A label collides when the gap between two levels is small AS A FRACTION OF WHAT IS ON
    SCREEN, so the fixture has to span what a real 60-bar H1 chart spans.
    """
    out = []
    for i in range(n):
        o = base + (i % 11) * 0.0008 + i * 0.00002
        c = o + (0.0009 if i % 3 else -0.0007)
        out.append(Candle(time=1_700_000_000 + i * 3600, open=o, high=max(o, c) + 0.0004,
                          low=min(o, c) - 0.0004, close=c, volume=100, timeframe="H1"))
    return out


def render(entry, stop, target, band=None, marks=None, buy=False):
    """Draw a panel and hand back the axis, so a test can read what is on it."""
    fig, ax = plt.subplots(figsize=(10, 5))
    price_panel.draw(ax, bars(), entry, stop, target, digits=5,
                     bands=band, buy=buy, marks=marks)
    return fig, ax


def texts(ax):
    return [t.get_text() for t in ax.texts]


def ys(ax, *labels):
    """The y each named label was finally placed at, in data units."""
    return {t.get_text(): t.get_position()[1] for t in ax.texts if t.get_text() in labels}


# ---------------------------------------------------------------- the collision that started it
print("\nTIGHT STOP - the 4.3-pip GBP/USD case that was illegible")
fig, ax = render(1.34927, 1.34970, 1.34841)
lo, hi = ax.get_ylim()
placed = ys(ax, "STOP", "ENTRY", "TARGET")
check("all three labels are drawn", sorted(placed), ["ENTRY", "STOP", "TARGET"])
sep = sorted(placed.values())
gaps = [round((sep[i + 1] - sep[i]) / (hi - lo), 3) for i in range(len(sep) - 1)]
check("no two labels are closer than 9% of the visible range", all(g >= 0.097 for g in gaps), True)
check("the true stop LINE is still at the true price, not at the label",
      any(abs(ln.get_ydata()[0] - 1.34970) < 1e-9 for ln in ax.lines), True)
check("the true entry LINE is still at the true price",
      any(abs(ln.get_ydata()[0] - 1.34927) < 1e-9 for ln in ax.lines), True)
check("STOP still reads above ENTRY on a sell (order preserved)",
      placed["STOP"] > placed["ENTRY"] > placed["TARGET"], True)
plt.close(fig)

# ---------------------------------------------------------------- a wide stop must NOT be nudged
print("\nWIDE STOP - nothing is moved when nothing collides")
fig, ax = render(1.34540, 1.34290, 1.35040, buy=True)
placed = ys(ax, "STOP", "ENTRY", "TARGET")
check("STOP sits exactly on its price", abs(placed["STOP"] - 1.34290) < 1e-9, True)
check("ENTRY sits exactly on its price", abs(placed["ENTRY"] - 1.34540) < 1e-9, True)
check("TARGET sits exactly on its price", abs(placed["TARGET"] - 1.35040) < 1e-9, True)
plt.close(fig)

# ---------------------------------------------------------------- bands share the one label column
print("\nBANDS - a strategy's own overlay goes through the SAME spacing pass")
fig, ax = render(1.34927, 1.34970, 1.34841,
                 band=[(1.34950, 1.34950, "#7C3AED", "1H LINE")])
check("the band's label is drawn", "1H LINE" in texts(ax), True)
placed = ys(ax, "STOP", "ENTRY", "TARGET", "1H LINE")
sep = sorted(placed.values())
gaps = [(sep[i + 1] - sep[i]) / (ax.get_ylim()[1] - ax.get_ylim()[0]) for i in range(len(sep) - 1)]
check("the band label does not collide with the level labels", all(g >= 0.097 for g in gaps), True)
check("a zero-height band DOES show its price", "1.34950" in texts(ax), True)
plt.close(fig)

fig, ax = render(1.34872, 1.35210, 1.33858,
                 band=[(1.34980, 1.35208, "#E5484D", "4H SUPPLY")])
check("a tall band is named", "4H SUPPLY" in texts(ax), True)
check("...and prints NO price - a zone is its edges, not its middle",
      "1.35094" in texts(ax), False)
check("...and no line is drawn through its middle",
      any(abs(ln.get_ydata()[0] - 1.35094) < 1e-6 for ln in ax.lines), False)
plt.close(fig)

# ---------------------------------------------------------------- the arrow
print("\nPROJECTION ARROW - the one mark that claims something about the future")
from matplotlib.patches import FancyArrowPatch                     # noqa: E402

for buy, entry, target, name in ((False, 1.34927, 1.34841, "sell"), (True, 1.34540, 1.35040, "buy")):
    fig, ax = render(entry, 1.34970 if not buy else 1.34290, target, buy=buy)
    arrows = [p for p in ax.patches if isinstance(p, FancyArrowPatch)]
    check(f"{name}: exactly one arrow", len(arrows) == 1, True)
    (x0, y0), (x1, y1) = arrows[0]._posA_posB
    check(f"{name}: it starts at the entry price", abs(y0 - entry) < 1e-9, True)
    check(f"{name}: it ends at the target price", abs(y1 - target) < 1e-9, True)
    check(f"{name}: it points {'up' if buy else 'down'}", (y1 > y0) == buy, True)
    check(f"{name}: it is drawn in the future, past the last candle", x0 >= len(bars()) - 1, True)
    check(f"{name}: it stops before the label column", x1 < ann.label_x(len(bars())), True)
    check(f"{name}: it is opaque", arrows[0].get_alpha() in (1.0, None), True)
    plt.close(fig)

# ---------------------------------------------------------------- the marked candle
print("\nMARKED CANDLE - matched on TIME, never on index")
b = bars()
fig, ax = render(1.34927, 1.34970, 1.34841, marks=[(b[20].time, "MOMENTUM")])
check("the mark's label is drawn", "MOMENTUM" in texts(ax), True)
xs = [t.get_position()[0] for t in ax.texts if t.get_text() == "MOMENTUM"]
check("it sits over the RIGHT bar (index 20)", abs(xs[0] - 20) < 0.6, True)
plt.close(fig)

fig, ax = render(1.34927, 1.34970, 1.34841, marks=[(1, "OLD")])
check("a timestamp outside the window is dropped, not mis-drawn", "OLD" in texts(ax), False)
plt.close(fig)

# ---------------------------------------------------------------- must never raise
print("\nFAILURE PATHS - a chart must never take a signal down")
try:
    fig, ax = render(0, 0, 0)
    check("a watch alert with no levels still draws", True, True)
    plt.close(fig)
except Exception as e:
    check(f"a watch alert with no levels still draws ({e})", False, True)

try:
    fig, ax = render(1.3492, 1.3497, 1.3484, marks=[b[5].time])
    check("a bare timestamp mark (no label) is accepted", True, True)
    plt.close(fig)
except Exception as e:
    check(f"a bare timestamp mark (no label) is accepted ({e})", False, True)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
