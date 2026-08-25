"""A ZONE MUST HAVE BEEN LEFT — "the bigger and cleaner the move away, the stronger the imbalance".

HIS COMPLAINT, 2026-08-25, with his own marking images attached: *"what those signals sent are
candles in a ranging market, there was no movement there that would even cause break of structure...
I am tired of receiving signals of miniature zones."*

HIS RULE, from the images (Smart Risk, "Look for Strong Moves Away from the Zone"): *"The bigger and
cleaner the move away from the zone, the stronger the imbalance."* It is the book's own definition
too (Ch.6 p25): *"Supply/demand is a zone, where price RAPIDLY PUSHES AWAY from (lots of orders
placed), creating inefficiency (IFC), and breaks structure."*

THAT SENTENCE SAT IN `bx_sd_zones`'s DOCSTRING FROM THE DAY IT WAS WRITTEN AND WAS NEVER IMPLEMENTED.
A gap existing was the whole test, so a doji in a quiet range qualified like a base under a 200-pip
rally. The zone he reported (GBP/JPY demand 216.458-216.794, one candle on 21 Aug 09:00 with a 3.1-pip
body in a 33.6-pip range) travelled 1.01x an average candle after forming.

MEASURED before the thresholds were chosen, on 800 real H4 bars per pair:
    clean run  >=2 keeps 67% of GBP/JPY zones, >=3 keeps 43%
    distance   >=1.5x average candle keeps 88%, >=2.0x keeps 74%
    the pair-by-pair cut at (2, 1.5x): EUR/USD 39%, GBP/USD 40%, GBP/JPY 37% - not tuned to one.

NOT MEASURED: the zone's own SIZE. His standing rule is that zones are not measured because they have
distinct qualities; what is compared here is the MOVE AWAY, which his image states comparatively, and
it is compared against the pair's own average candle rather than a pip count.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/none")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from core.types import Candle                                          # noqa: E402
from strategies.bx_sd_zones import departed_strongly                   # noqa: E402

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


def bar(t, o, h, l, c):
    return Candle(time=t * 14400, open=o, high=h, low=l, close=c, volume=0, timeframe="H4")


def series(n=30, step=0.0010, base=1.1000):
    """A quiet run so ATR is a known ~`step`. The zone sits at the end and the departure is appended."""
    out = []
    for i in range(n):
        lo = base + (i % 2) * step * 0.2
        out.append(bar(i, lo, lo + step, lo, lo + step * 0.5))
    return out


ZONE_TOP, ZONE_BOT = 1.1010, 1.1000

print()
print("A CLEAN, BIG DEPARTURE QUALIFIES — his image 3, the circled run")
bars = series()
ifc = len(bars)
for k in range(4):                                   # four strong up closes, well clear of the zone
    o = 1.1015 + k * 0.0020
    bars.append(bar(ifc + k, o, o + 0.0022, o - 0.0002, o + 0.0020))
chk("a four-candle run that travels far -> qualifies",
    departed_strongly(bars, ifc, ZONE_TOP, ZONE_BOT, True), True)

print()
print("IT MUST REFUSE — the miniature zone he is complaining about")
bars = series()
ifc = len(bars)
# Two up closes that barely clear the zone — the shape is fine, the distance is not.
for k in range(2):
    o = 1.1011 + k * 0.0002
    bars.append(bar(ifc + k, o, o + 0.0003, o - 0.0001, o + 0.0002))
chk("a clean run that goes NOWHERE -> refused", departed_strongly(bars, ifc, ZONE_TOP, ZONE_BOT, True), False)
teeth("THIS IS HIS CASE: the run was clean (2 candles) and it still fails, because the DISTANCE half "
      "is what his zone failed — it moved 1.01x an average candle",
      departed_strongly(bars, ifc, ZONE_TOP, ZONE_BOT, True) is False)

print()
print("ONE CANDLE IS NOT A RUN — 'cleaner' means it kept going")
bars = series()
ifc = len(bars)
bars.append(bar(ifc, 1.1015, 1.1080, 1.1013, 1.1075))     # one huge candle
bars.append(bar(ifc + 1, 1.1075, 1.1076, 1.1005, 1.1008))  # then straight back into the zone
chk("one candle then a close back inside -> refused",
    departed_strongly(bars, ifc, ZONE_TOP, ZONE_BOT, True), False)

print()
print("A CLOSE BACK INSIDE ENDS THE RUN — that is price returning, not leaving")
bars = series()
ifc = len(bars)
bars.append(bar(ifc,     1.1015, 1.1040, 1.1013, 1.1035))
bars.append(bar(ifc + 1, 1.1035, 1.1038, 1.1002, 1.1005))   # closes back INSIDE the zone
bars.append(bar(ifc + 2, 1.1005, 1.1090, 1.1004, 1.1085))   # big, but the run already ended
chk("a big candle AFTER price returned does not rescue it",
    departed_strongly(bars, ifc, ZONE_TOP, ZONE_BOT, True), False)

print()
print("MIRRORED FOR SUPPLY — the same rule downward")
bars = series()
ifc = len(bars)
for k in range(4):
    o = 1.0995 - k * 0.0020
    bars.append(bar(ifc + k, o, o + 0.0002, o - 0.0022, o - 0.0020))
chk("a four-candle drop away from supply -> qualifies",
    departed_strongly(bars, ifc, ZONE_TOP, ZONE_BOT, False), True)

print()
print("IT CANNOT ANSWER WITHOUT EVIDENCE — an unfinished departure stays PENDING")
bars = series()
chk("no bars after the zone -> refused (not admitted on faith)",
    departed_strongly(bars, len(bars), ZONE_TOP, ZONE_BOT, True), False)
chk("a flat series has no average candle -> refused",
    departed_strongly([bar(i, 1.1, 1.1, 1.1, 1.1) for i in range(20)], 10, ZONE_TOP, ZONE_BOT, True), False)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
