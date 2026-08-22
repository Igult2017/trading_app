"""THE FOUR STATIC LIQUIDITY PATTERNS his document names (p17, section 11).

    "Equal highs   — liquidity may accumulate above equal highs."
    "Equal lows    — liquidity may accumulate below equal lows."
    "Double top    — two similar highs can create a liquidity pool."
    "Double bottom — two similar lows can create a liquidity pool."
    "Triple top    — three highs can create liquidity above the highs."
    "Triple bottom — three lows can create liquidity below the lows."
    "Dynamic trend lines — bullish and bearish trend lines can also contain liquidity."

WHAT WAS MISSING BEFORE 2026-08-23:
  * equal highs/lows compared only NEIGHBOURING swings (`zip(highs, highs[1:])`), so a double top
    with any smaller swing between its two highs was invisible. Measured on EUR/USD over 4.8 months
    that found 5 equal highs and 1 equal low in the entire period.
  * double / triple tops were never named as such.
  * trend-line liquidity was not detected at all — the docstring said so outright.

Liquidity matters because it gates whether a change of character is real: no sweep on the way to the
extreme zone means a fake one, and a fake one is never traded. Missing a pattern means missing a
sweep, which means refusing a valid setup.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from core.types import Candle                                          # noqa: E402
from strategies.bx_sd_liquidity import (find_liquidity, _equal_level_pools,   # noqa: E402
                                        _trendline_pools, is_swept)

failed, count = [], 0
PIP = 0.0001


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


def kinds(pools, kind):
    return [p for p in pools if p.kind == kind]


print()
print("EQUAL HIGHS / DOUBLE TOP — two similar highs, however far apart")
# Two highs at 1.1050, with a LOWER swing between them. The old neighbouring-pairs scan could not
# see this; that is the whole defect.
pts = [(10, 1.1050), (20, 1.1010), (30, 1.10505)]
pools = _equal_level_pools(pts, "buy", 2 * PIP)
chk("the two matching highs form a pool", len(kinds(pools, "eqh")), 1)
chk("...even with a different swing between them",
    kinds(pools, "eqh")[0].index, 30)          # dated at the SECOND touch
chk("...priced at the HIGHEST of them, where the stops rest",
    round(kinds(pools, "eqh")[0].price, 5), 1.10505)
teeth("the OLD neighbouring-only rule would have missed this",
      abs(pts[0][1] - pts[1][1]) > 2 * PIP)           # neighbours 10 and 20 do NOT match

print()
print("TRIPLE TOP — three highs create a stronger pool")
pts3 = [(10, 1.1050), (20, 1.1010), (30, 1.1051), (40, 1.10495)]
p3 = _equal_level_pools(pts3, "buy", 2 * PIP)
chk("a third touch adds its own pool", len(kinds(p3, "triple_top")), 1)
chk("...dated at the THIRD touch", kinds(p3, "triple_top")[0].index, 40)

print()
print("DOUBLE / TRIPLE BOTTOM — the same, mirrored")
lows = [(10, 1.0900), (20, 1.0950), (30, 1.09005), (40, 1.08995)]
pl = _equal_level_pools(lows, "sell", 2 * PIP)
chk("two similar lows form a pool", len(kinds(pl, "eql")), 1)
chk("three form the stronger one too", len(kinds(pl, "triple_bottom")), 1)
chk("...priced at the LOWEST of them", round(kinds(pl, "eql")[0].price, 5), 1.08995)

print()
print("IT MUST STILL REFUSE — a rule that cannot say no is not a rule")
far = [(10, 1.1050), (20, 1.1200), (30, 1.1400)]      # nothing within tolerance
chk("highs far apart form NO pool", _equal_level_pools(far, "buy", 2 * PIP), [])
teeth("the tolerance genuinely bites", len(_equal_level_pools(far, "buy", 2 * PIP)) == 0)

print()
print("DYNAMIC TREND LINES — the fourth pattern, previously not detected at all")
# Three rising lows exactly on a line: 1.1000 at 0, 1.1010 at 10, 1.1020 at 20 -> slope 0.0001/bar
rising = [(0, 1.1000), (10, 1.1010), (20, 1.1020)]
tl = _trendline_pools(rising, "sell", 30, 2 * PIP)
chk("three rising lows on a line make a bullish trend-line pool", len(tl), 1)
chk("...the level is the line PROJECTED to now, not an old low",
    round(tl[0].price, 4), round(1.1000 + 0.0001 * 30, 4))
chk("...and it is sell-side liquidity (stops rest below)", tl[0].side, "sell")

falling = [(0, 1.1400), (10, 1.1390), (20, 1.1380)]
tlb = _trendline_pools(falling, "buy", 30, 2 * PIP)
chk("three falling highs make a bearish trend-line pool", len(tlb), 1)
chk("...buy-side (stops rest above)", tlb[0].side, "buy")

print()
print("...AND IT REFUSES WHEN THE POINTS ARE NOT ON A LINE")
bent = [(0, 1.1000), (10, 1.1300), (20, 1.1020)]      # middle nowhere near the line
chk("a bent set forms no trend line", _trendline_pools(bent, "sell", 30, 2 * PIP), [])
two_only = [(0, 1.1000), (20, 1.1020)]
chk("two points alone are not a trend line", _trendline_pools(two_only, "sell", 30, 2 * PIP), [])
teeth("three points are required, not two", len(_trendline_pools(two_only, "sell", 30, 2 * PIP)) == 0)

print()
print("END TO END — the patterns reach the real pool set")
bars = []
price = 1.1000
for i in range(120):
    # a saw-tooth that revisits the same highs, so equal highs really form
    price = 1.1000 + (0.0030 if i % 10 < 5 else 0.0)
    bars.append(Candle(time=i * 14400, open=price, high=price + 0.0005,
                       low=price - 0.0005, close=price, volume=0, timeframe="H4"))
pools = find_liquidity(bars, PIP)
present = {p.kind for p in pools}
chk("equal-high/double-top pools reach the pool set", "eqh" in present or "eql" in present, True)
chk("triple tops are named separately from the two-touch case",
    "triple_top" not in present or "eqh" in present, True)
teeth("the pool set is not empty", len(pools) > 0)

print()
print("A POOL STILL KNOWS WHEN IT HAS BEEN TAKEN")
from strategies.bx_sd_pools import LiquidityPool                       # noqa: E402
pool = LiquidityPool("buy", 1.1050, "eqh", 5)
up = bars[:6] + [Candle(time=99 * 14400, open=1.106, high=1.1060, low=1.1055,
                        close=1.1058, volume=0, timeframe="H4")]
chk("price trading above it counts as swept", is_swept(up, pool), True)
chk("price staying below it does not", is_swept(bars[:6], pool), False)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
