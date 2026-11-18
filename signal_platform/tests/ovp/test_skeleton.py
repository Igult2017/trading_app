"""OVP — HIS SKELETON, proved on hand-built candles with known answers (18 Nov 2026). docs/strategies/ovp.md.

Every rule is run through the REAL functions (`ovp_bigzones`, `ovp_skeleton`, `ovp.analyze`'s signal builder), and
every key assertion has a TEETH case: the rule is deliberately broken and the check must then fail.
Run: python tests/ovp/test_skeleton.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
import storage.observability_repo as _obs  # noqa: E402
_obs.record = lambda *a, **k: None

from core.types import Candle  # noqa: E402
import strategies.ovp_bigzones as B  # noqa: E402
import strategies.ovp_skeleton as S  # noqa: E402

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


def h4_series(run_closes):
    """40 'staircase' candles (each leaves a SMALL 1.2 gap), zone candle at 140-141, then a move of `run_closes`."""
    rows = [(100 + i + 0.1, 100 + i + 0.8, 100 + i, 100 + i + 0.7) for i in range(40)]
    rows.append((140.6, 141.0, 140.0, 140.3))                       # the zone candle (index 40)
    rows += [(140.3, 150.0, 140.2, 149.5), (149.5, 155.0, 146.0, 154.0)]   # gap 141 → 146 at index 41
    c = 154.0
    for _ in range(run_closes - 2):
        rows.append((c, c + 3, c - 0.5, c + 2.5)); c += 2.5
    rows += [(c, c + 0.5, c - 6, c - 5.5), (c - 5.5, c - 5, c - 9.5, c - 9)]   # pull back toward the zone
    return [Candle(H4_0 + k * 14400, o, h, lo, cl, 1, "H4") for k, (o, h, lo, cl) in enumerate(rows)]


def ifcs(found):
    return sorted(b.zone.ifc_index for b in found)


print("RULE 1 — BIG zones only: the move travelled 4+ closes AND the gap beats the recent median")
big = h4_series(5)
check("a 5-close move with a tall gap (5.0 vs median 1.2) → its zone is kept",
      41 in ifcs(B.big_zones(big, "4H", "demand", big[-1].close, 30)), True)
short = h4_series(3)
check("the SAME gap left by a 3-close move → refused ('1 or 3 candles … only for re-tap')",
      ifcs(B.big_zones(short, "4H", "demand", short[-1].close, 30)), [])
check("the 40 miniature staircase gaps are never 'big' (none equals-or-below the median is kept)",
      [i for i in ifcs(B.big_zones(big, "4H", "demand", big[-1].close, 999)) if i < 41], [])
check("fewer than 20 earlier gaps → too little history, nothing is called big", B.is_big([5.0] * 19, 9.0, 6)[0], False)
B.MIN_RUN = 3
teeth("the 3-close refusal (MIN_RUN set to 3)", 41 in ifcs(B.big_zones(short, "4H", "demand", short[-1].close, 30)))
B.MIN_RUN = 4

print("\nRULES 2-4 — trend direction, near the money, broken = dead")
check("wanting SUPPLY in the same market → no zone (never against the trend's side)",
      ifcs(B.big_zones(big, "4H", "supply", big[-1].close, 30)), [])
far = big[-1].close - 141.0
check(f"zone {far:.1f} below price, reach 1.0 → too far (day trading)",
      41 in ifcs(B.big_zones(big, "4H", "demand", big[-1].close, 1.0)), False)
broken = big + [Candle(big[-1].time + 14400, 145, 145, 138, 139.0, 1, "H4")]
check("a candle CLOSES below the zone → the zone is dead",
      41 in ifcs(B.big_zones(broken, "4H", "demand", 139.5, 30)), False)
wicked = big + [Candle(big[-1].time + 14400, 145, 146, 139.5, 142.0, 1, "H4")]
check("a WICK into/below the zone that closes back above → still alive (touched zones are allowed)",
      41 in ifcs(B.big_zones(wicked, "4H", "demand", 142.0, 30)), True)

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
zone = B.Zone("demand", 101.0, 100.0, 101.0, 100.0, 100.5, 40, 41)
S.regime, S.daily_atr = (lambda h4: 1), (lambda d1: 50.0)
S.big_zones = lambda c, tf, want, price, reach: [B.BigZone("4H", zone, 1, 5, 5.0, 1.2, 0.9)] if (tf == "4H" and want == "demand") else []
plan, _ = S.zone_plan([], [], m5(above + [tap, out]), m1, 101.7, 0.3, [])
check("...but with the ASK (101.9 + half the 0.3 spread = 102.05) already past the 102.0 entry → no order",
      S.zone_plan([], [], m5(above + [tap, out]), m1, 101.9, 0.3, [])[0], None)
check("BUY: entry 102.0, stop 100.0 (zone bottom), target 102 + 3×2 = 108.0", (plan.entry, plan.sl, plan.tp, plan.rr),
      (102.0, 100.0, 108.0, 3.0))
szone = B.Zone("supply", 101.0, 100.0, 100.0, 101.0, 100.5, 40, 41)
S.regime = lambda h4: -1
S.big_zones = lambda c, tf, want, price, reach: [B.BigZone("4H", szone, 1, 5, 5.0, 1.2, 0.5)] if want == "supply" else []
m1s = [Candle(now - 120, 99.6, 99.7, 99.0, 99.2, 1, "M1"), Candle(now, 99.2, 99.3, 99.1, 99.2, 1, "M1")]
sm5 = m5([(97, 97.5, 96.5, 97)] * 5 + [(98, 100.6, 97.8, 100.4), (100.4, 100.5, 98.5, 99.2)])
splan, _ = S.zone_plan([], [], sm5, m1s, 99.2, 0.3, [])
check("SELL: entry 99.0, stop 101.0 + 0.3 spread = 101.3, target 99 − 3×2.3 = 92.1",
      (splan.entry, round(splan.sl, 2), round(splan.tp, 2)), (99.0, 101.3, 92.1))
S.regime = lambda h4: 0
check("4H ranging → the zone path stays off", S.zone_plan([], [], sm5, m1s, 99.2, 0.3, [])[0], None)

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
rp, _ = S.range_plan([], sr_series(115), m1r, 103.2, 0.0)
check("support 100 respected, rebound to 115.5, back to 100 and out → BUY at 103.5, target capped at the resistance",
      (rp.direction, rp.entry, rp.tp), ("buy", 103.5, 115.5))
check("rebound only to 108.5 → 1.2R of room, refused", S.range_plan([], sr_series(108), m1r, 103.2, 0.0)[0], None)
S.RANGE_MIN_R = 1.0
teeth("the 2R room rule (lowered to 1R)", S.range_plan([], sr_series(108), m1r, 103.2, 0.0)[0] is not None)
S.RANGE_MIN_R = 2.0
S.regime = lambda h4: -1
check("4H DOWNTREND → a support (buy) is not taken", S.range_plan([], sr_series(115), m1r, 103.2, 0.0)[0], None)

print("\nTHE SIGNAL — what reaches the channel")
from strategies.ovp import build_signal  # noqa: E402
sig = build_signal("XAU/USD", plan, 2, "ovp", "OVP")
check("entry / stop / target / RR carried exactly", (sig.entry_price, sig.stop_loss, sig.take_profit, sig.risk_reward),
      (102.0, 100.0, 108.0, 3.0))
check("a real monitored signal, not an alert", (sig.alert_only, sig.strategy_id), (False, "ovp"))

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
