"""PIX — HIS SKELETON, proved on hand-built candles with known answers (18 Nov 2026). docs/strategies/pix.md.

Every rule is run through the REAL functions (`pix_bigzones`, `pix_skeleton`, `pix.analyze`'s signal builder), and
every key assertion has a TEETH case: the rule is deliberately broken and the check must then fail.
Run: python tests/pix/test_skeleton.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
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
B.travelled_to = lambda closed, z, others: (z, len(closed) - 1)
teeth("the travel rule (every zone treated as having travelled)",
      len(demand_of(B.big_zones(short, "4H", "demand", short[-1].close, 30))) == 1)
B.travelled_to = real_travel
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

print("\nRULE 5 — 5M respect: the LAST closed 5M candle is the FIRST close back out of the zone")
M5_0 = 1_600_000_000 // 300 * 300


def m5(rows):
    return [Candle(M5_0 + k * 300, o, h, lo, c, 1, "M5") for k, (o, h, lo, c) in enumerate(rows)]


above = [(104, 104.5, 103.5, 104)] * 5
tap, out = (103, 103.2, 100.4, 100.6), (100.6, 102.0, 100.5, 101.8)
check("tap (low 100.4) then a close above 101 → respected", S.respected_5m(m5(above + [tap, out]), 101, 100, True) is not None, True)
check("still inside the zone → not yet", S.respected_5m(m5(above + [tap]), 101, 100, True), None)
check("closed BELOW the zone after the tap → refused",
      S.respected_5m(m5(above + [tap, (100.6, 100.7, 99.0, 99.5), out]), 101, 100, True), None)
check("the close back out happened a candle EARLIER → stale, refused",
      S.respected_5m(m5(above + [tap, out, (101.8, 102.5, 101.5, 102.2)]), 101, 100, True), None)
check("sell mirror: tap of supply 100-101 then close below 100 → respected",
      S.respected_5m(m5([(97, 97.5, 96.5, 97)] * 5 + [(98, 100.6, 97.8, 100.4), (100.4, 100.5, 98.5, 99.2)]),
                     101, 100, False) is not None, True)
forming = m5(above + [tap])
forming.append(Candle(int(time.time()) // 300 * 300, 100.6, 102.0, 100.5, 101.8, 1, "M5"))
check("NO LOOK-AHEAD: a still-forming 5M candle closing out does not count", S.respected_5m(forming, 101, 100, True), None)

print("\nRULE 6 — 1M stop order, stop beyond the zone (+ spread on a sell), 3R")
now = int(time.time()) // 60 * 60
m1 = [Candle(now - 120, 101.5, 102.0, 101.4, 101.8, 1, "M1"), Candle(now, 101.8, 109.0, 101.7, 101.9, 1, "M1")]
check("buy stop = the last CLOSED 1M high (the forming bar's 109 is ignored)", S.entry_1m(m1, True, 100.0, 101.9), 102.0)
check("market already through the entry → no order", S.entry_1m(m1, True, 100.0, 102.1), None)
GO = lambda m5, m1, bull, tap: (True, ["order flow: GO (stub)"])
zone = B.Zone("demand", 101.0, 100.0, 101.0, 100.0, 100.5, 40, 41)
S.regime, S.daily_atr = (lambda h4: 1), (lambda d1: 50.0)
S.big_zones = lambda c, tf, want, price, reach: [B.BigZone("4H", zone, 1, zone, 2, 0.9)] if (tf == "4H" and want == "demand") else []
plan, _ = S.zone_plan([], [], m5(above + [tap, out]), m1, 101.7, 0.3, [], flow=GO)
check("...but with the ASK (101.9 + half the 0.3 spread = 102.05) already past the 102.0 entry → no order",
      S.zone_plan([], [], m5(above + [tap, out]), m1, 101.9, 0.3, [], flow=GO)[0], None)
check("BUY: entry 102.0, stop 100.0 (zone bottom), target 102 + 3×2 = 108.0", (plan.entry, plan.sl, plan.tp, plan.rr),
      (102.0, 100.0, 108.0, 3.0))
check("NO ORDER-FLOW CHECK → no plan (no order flow, no trade)",
      S.zone_plan([], [], m5(above + [tap, out]), m1, 101.7, 0.3, [])[0], None)
check("ORDER FLOW SAYS NO → no plan, and the reason is given",
      S.zone_plan([], [], m5(above + [tap, out]), m1, 101.7, 0.3, [], flow=lambda *a: (False, ["5M ABSORPTION"])),
      (None, "order flow said no: 5M ABSORPTION"))
szone = B.Zone("supply", 101.0, 100.0, 100.0, 101.0, 100.5, 40, 41)
S.regime = lambda h4: -1
S.big_zones = lambda c, tf, want, price, reach: [B.BigZone("4H", szone, 1, szone, 2, 0.5)] if want == "supply" else []
m1s = [Candle(now - 120, 99.6, 99.7, 99.0, 99.2, 1, "M1"), Candle(now, 99.2, 99.3, 99.1, 99.2, 1, "M1")]
sm5 = m5([(97, 97.5, 96.5, 97)] * 5 + [(98, 100.6, 97.8, 100.4), (100.4, 100.5, 98.5, 99.2)])
splan, _ = S.zone_plan([], [], sm5, m1s, 99.2, 0.3, [], flow=GO)
check("SELL: entry 99.0, stop 101.0 + 0.3 spread = 101.3, target 99 − 3×2.3 = 92.1",
      (splan.entry, round(splan.sl, 2), round(splan.tp, 2)), (99.0, 101.3, 92.1))
S.regime = lambda h4: 0
check("4H ranging → the zone path stays off", S.zone_plan([], [], sm5, m1s, 99.2, 0.3, [], flow=GO)[0], None)

print("\nRULE 8 — ranging: 5M support on its 2nd respect, stop order, only with 2R of room")


def path(closes):
    out, o = [], closes[0]
    for k, c in enumerate(closes):
        out.append(Candle(M5_0 + k * 300, o, max(o, c) + 0.5, min(o, c) - 0.5, c, 1, "M5")); o = c
    return out


def sr_series(rebound):
    return path([120 - k for k in range(20)] + [100.5] + [101 + k for k in range(rebound - 100)]
                + [rebound - k for k in range(1, rebound - 101)] + [100.3, 103.0])


m1r = [Candle(now - 120, 102.8, 103.5, 102.6, 103.2, 1, "M1"), Candle(now, 103.2, 103.3, 103.1, 103.2, 1, "M1")]
rp, _ = S.range_plan([], sr_series(115), m1r, 103.2, 0.0, flow=GO)
check("support 100 respected, rebound to 115.5, back to 100 and out → BUY at 103.5, target capped at the resistance",
      (rp.direction, rp.entry, rp.tp), ("buy", 103.5, 115.5))
check("rebound only to 108.5 → 1.2R of room, refused", S.range_plan([], sr_series(108), m1r, 103.2, 0.0, flow=GO)[0], None)
S.RANGE_MIN_R = 1.0
teeth("the 2R room rule (lowered to 1R)", S.range_plan([], sr_series(108), m1r, 103.2, 0.0, flow=GO)[0] is not None)
S.RANGE_MIN_R = 2.0
S.regime = lambda h4: -1
check("4H DOWNTREND → a support (buy) is not taken", S.range_plan([], sr_series(115), m1r, 103.2, 0.0, flow=GO)[0], None)

print("\nTHE SIGNAL — what reaches the channel")
from strategies.pix import build_signal  # noqa: E402
sig = build_signal("XAU/USD", plan, 2, "pix", "PIX")
check("entry / stop / target / RR carried exactly", (sig.entry_price, sig.stop_loss, sig.take_profit, sig.risk_reward),
      (102.0, 100.0, 108.0, 3.0))
check("a real monitored signal, not an alert", (sig.alert_only, sig.strategy_id), (False, "pix"))

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
