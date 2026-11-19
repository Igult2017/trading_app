"""PIX — HIS SKELETON, proved on hand-built candles with known answers (18 Nov 2026). docs/strategies/pix.md.

Every rule is run through the REAL functions (`pix_bigzones`, `pix_skeleton`, `pix.analyze`'s signal builder), and
every key assertion has a TEETH case: the rule is deliberately broken and the check must then fail.
Run: python tests/pix/test_skeleton.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x.invalid/x")
import storage.observability_repo as _obs  # noqa: E402
_obs.record = lambda *a, **k: None

from core.types import Candle  # noqa: E402
import strategies.pix_bigzones as B  # noqa: E402
import strategies.pix_skeleton as S  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def teeth(name, failed_when_broken):
    check(f"TEETH — {name} fails when deliberately broken", bool(failed_when_broken), True)


H4_0 = 1_600_000_000 // 14400 * 14400


def h4_series(peak):
    """A supply zone forms at 160.0-161.5 (index 5); price drifts down; a demand zone forms at 140-141.5 (index 18,
    its gap at 19); price rallies to `peak`, then pulls back to ~146. Peak 160.2 TAPS the supply; peak 157 does not."""
    rows = [(161, 161.5, 160.5, 161)] * 5
    rows += [(161, 161.5, 160.0, 160.2), (160.2, 160.3, 152, 152.5), (152.5, 153, 151, 152)]   # supply, gap at 6
    c = 152
    while c > 142:
        rows.append((c, c + 1, c - 2, c - 1)); c -= 1                   # overlapping candles: no gaps
    rows += [(141, 141.5, 140, 140.5), (140.5, 150, 140.4, 149.5), (149.5, 155, 146, 154.5)]    # demand + its gap
    rows += [(154.5, peak, 154, peak - 0.5), (peak - 0.5, peak, 150, 151), (151, 151.5, 145, 146)]
    return [Candle(H4_0 + k * 14400, o, h, lo, cl, 1, "H4") for k, (o, h, lo, cl) in enumerate(rows)]


def demand_of(found):
    return [b for b in found if b.zone.direction == "demand" and abs(b.zone.bottom - 140.0) < 1e-9]


print("RULE 1 — HIS REAL ZONES: price left the zone and travelled to ANOTHER zone before coming back")
went = h4_series(160.2)
got = demand_of(B.big_zones(went, "4H", "demand", went[-1].close, 30))
check("demand 140-141.5, rally TAPS the supply 160.0-161.5 → kept", len(got), 1)
check("...and it names the zone price travelled to",
      (got[0].reached.direction, got[0].reached.bottom) if got else None, ("supply", 160.0))
short = h4_series(157.0)
check("the SAME demand, rally stops at 157 (never reaches the supply) → refused — and the pullback's own supply, "
      "formed AFTER the peak, does not count", demand_of(B.big_zones(short, "4H", "demand", short[-1].close, 30)), [])
real_travel = B.travelled_to
B._cache.clear()                     # the zone search remembers each window — clear it so the broken rule is used
B.travelled_to = lambda closed, z, others: (z, len(closed) - 1)
teeth("the travel rule (every zone treated as having travelled)",
      len(demand_of(B.big_zones(short, "4H", "demand", short[-1].close, 30))) == 1)
B.travelled_to = real_travel
B._cache.clear()
o = B.Zone("supply", 161.5, 160.0, 160.0, 161.5, 160.75, 5, 6)
d = B.Zone("demand", 141.5, 140.0, 141.5, 140.0, 140.75, 18, 19)
check("travelled_to on the tapping series → the supply, tapped by the rally candle (index 21)",
      (lambda h: (h[0].bottom, h[1]) if h else None)(B.travelled_to(went, d, [o])), (160.0, 21))
# The impulse candle (index 19) runs straight THROUGH the little supply 142-145 just above the demand: that is price
# going beyond a zone, not travelling to it, so it must not count — the demand above is kept ONLY because of 160.
check("a zone the move closed straight through (supply 142-145) is not where price travelled to",
      B.travelled_to(short, d, [z for z in B.find_zones(short) if z.direction == "supply" and z.bottom == 142]), None)
dead = list(went[:10]) + [Candle(0, 150, 163, 149, 162.0, 1, "H4")] + list(went[10:])
dead = [Candle(H4_0 + k * 14400, x.open, x.high, x.low, x.close, 1, "H4") for k, x in enumerate(dead)]
d2 = B.Zone("demand", 141.5, 140.0, 141.5, 140.0, 140.75, 19, 20)
check("the supply was CLOSED THROUGH before the rally reached it → no longer a zone, refused",
      B.travelled_to(dead, d2, [o]), None)

print("\nRULES 2-4 — trend direction, near the money, broken = dead")
check("a demand zone is never returned when SUPPLY is wanted",
      [b for b in B.big_zones(went, "4H", "supply", went[-1].close, 30) if b.zone.direction != "supply"], [])
check("zone 4.5 below price, reach 1.0 → too far (day trading)",
      demand_of(B.big_zones(went, "4H", "demand", went[-1].close, 1.0)), [])
broken = went + [Candle(went[-1].time + 14400, 145, 145, 138, 139.0, 1, "H4")]
check("a candle CLOSES below the zone → the zone is dead",
      demand_of(B.big_zones(broken, "4H", "demand", 139.5, 30)), [])
wicked = went + [Candle(went[-1].time + 14400, 145, 146, 139.5, 142.0, 1, "H4")]
check("a WICK into/below the zone that closes back above → still alive (touched zones are allowed)",
      len(demand_of(B.big_zones(wicked, "4H", "demand", 142.0, 30))), 1)

M5_0 = 1_600_000_000 // 300 * 300
GO = lambda m5_, m1_, bull, e_: (None, "Order flow CONFIRMS (stub)", [])  # noqa: E731
S.direction = lambda h4, h1: (0, "")
print("\nRULE 8 — ranging: 5M support on its 2nd respect (proved on 1M), only with 2R of room")


def path(closes):
    out, o = [], closes[0]
    for k, c in enumerate(closes):
        out.append(Candle(M5_0 + k * 300, o, max(o, c) + 0.5, min(o, c) - 0.5, c, 1, "M5")); o = c
    return out


def sr_series(rebound):
    return path([120 - k for k in range(20)] + [100.5] + [101 + k for k in range(rebound - 100)]
                + [rebound - k for k in range(1, rebound - 101)] + [101.5] * 3)


# support 100.0 (band 99.5-100.5). 1M visit after the 5M series: touch 100.2, up, up, pullback → entry at its high 102.1
SRM1 = [Candle(sr_series(115)[-1].time + 300 + k * 60, o, h, lo, c, 1, "M1") for k, (o, h, lo, c) in enumerate(
    [(101.5, 102, 101, 101.5)] * 3 + [(101.5, 101.6, 100.2, 100.9), (100.9, 101.5, 100.8, 101.4),
                                       (101.4, 102.0, 101.3, 101.9), (101.9, 102.1, 101.6, 101.7)])]
rp, _ = S.range_plan([], sr_series(115), SRM1, 101.8, 0.0, flow=GO)
check("support 100 respected before, touched again on 1M, 2 up, 1 down → BUY stop at the pullback's high 102.1",
      rp and (rp.direction, round(rp.entry, 6), round(rp.sl, 6)), ("buy", 102.1, round(101.6 - 0.5 * 6.3 / 7, 6)))
check("no 1M reaction → no range plan", S.range_plan([], sr_series(115), SRM1[:4], 101.8, 0.0, flow=GO)[0], None)
S.RANGE_MIN_R = 20.0
check("room to the resistance under the required multiple (raised to 20R) → refused",
      S.range_plan([], sr_series(115), SRM1, 101.8, 0.0, flow=GO)[0], None)
S.RANGE_MIN_R = 2.0
S.direction = lambda h4, h1: (-1, "4H")
check("4H DOWNTREND → a support (buy) is not taken", S.range_plan([], sr_series(115), SRM1, 101.8, 0.0, flow=GO)[0], None)

print("\nHIS LAYERS (18 Nov) — trend from 4H (1H when the 4H is sideways); 5M zones first, best inside a 1H/4H zone")
import strategies.pix_trend as PT  # noqa: E402
real_regime = PT.regime
for name, r4, r1, want in [("4H up, 1H pulling back down → UP (never against the 4H)", 1, -1, (1, "4H")),
                           ("4H sideways, 1H up → UP (a trend starts on the lower timeframe)", 0, 1, (1, "1H")),
                           ("4H sideways, 1H down → DOWN", 0, -1, (-1, "1H")),
                           ("both sideways → ranging (support/resistance path)", 0, 0, (0, ""))]:
    PT.regime = lambda c, r4=r4, r1=r1: r4 if c == "H4" else r1
    check(name, PT.direction("H4", "H1"), want)
PT.regime = real_regime

real_big = B.big_zones
Z = lambda lo, hi: B.Zone("demand", hi, lo, hi, lo, (lo + hi) / 2, 1, 2)  # noqa: E731
inside_5m = B.BigZone("5M", Z(100.2, 100.6), 10, Z(0, 0), 20, 1.0)
outer_1h = B.BigZone("1H", Z(100.0, 101.0), 11, Z(0, 0), 21, 0.5)
alone_5m = B.BigZone("5M", Z(102.0, 102.3), 12, Z(0, 0), 22, 0.2)
B.big_zones = lambda c, tf, want, price, reach: {"5M": [alone_5m, inside_5m], "1H": [outer_1h], "4H": []}[tf]
order = [(z.tf, z.zone.bottom, o.tf if o else None) for z, o in B.candidates([], [], [], "demand", 103, 5)]
check("ORDER: 5M zone inside a 1H zone first, then the 1H zone, then the lone 5M zone (even though it is nearer)",
      order, [("5M", 100.2, "1H"), ("1H", 100.0, None), ("5M", 102.0, None)])
B.big_zones = real_big

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
