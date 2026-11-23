"""PIX OPTIONS — the dealer map, Barchart's grade and the respected-level signal, proved with answers worked by hand
(23 Nov 2026; plan: his guide + answers 1B 2 4A 5B 6 7, Q3 = A). docs/options-levels.md.

The map runs on TODAY'S REAL gold overnight table (Investing.com / Sentry panel, read live 23 Nov 02:18 UTC, expiring
24 Nov; our price 3584.4). Worked by hand: ATM 3586.1 (13.9 away beats 34.1 / 34.2); IV vs neighbours — 3692.4 LOW (42.77
< 44.00), 3462.5 HIGH (51.82 > 49.13), every other MODERATE; every sell has put > call, every buy call > put.
Run: python tests/pix/test_options.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from core.types import Candle  # noqa: E402
from strategies.pix_options import mapping as MP, grade as G, watch as W  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def row(pd, pp, k, cp, cd, iv):
    return {"put_delta": pd, "put_price": pp, "strike": k, "call_price": cp, "call_delta": cd, "iv": iv}


GOLD = [row(-0.10, 4.921, 3462.5, 127.11, 0.90, 51.82), row(-0.25, 14.15, 3524.6, 74.21, 0.75, 49.13),
        row(-0.35, 21.50, 3552.0, 54.27, 0.65, 47.57), row(-0.50, 35.03, 3586.1, 33.60, 0.50, 45.91),
        row(-0.66, 53.34, 3618.6, 19.45, 0.34, 44.75), row(-0.76, 69.94, 3642.5, 12.24, 0.24, 44.00),
        row(-0.91, 111.77, 3692.4, 4.101, 0.09, 42.77)]
STRIKES = [r["strike"] for r in GOLD]

# ── THE MAP ────────────────────────────────────────────────────────────────────────────────────────────────────────
m = MP.map_market(GOLD, 3584.4)
lv = {x["strike"]: x for x in m["levels"]}
check("ATM = 3586.1, ignored (not among the levels)", (m["status"], m["atm"], 3586.1 in lv), ("mapped", 3586.1, False))
check("sell zones outward", [(x["strike"], x["label"]) for x in m["levels"] if x["side"] == "sell"],
      [(3618.6, "Active Dealer Resistance"), (3642.5, "Main Reclaim Pivot"), (3692.4, "Main Dealer Ceiling")])
check("buy zones outward", [(x["strike"], x["label"]) for x in m["levels"] if x["side"] == "buy"],
      [(3552.0, "Active Dealer Support"), (3524.6, "Stabilization Support"), (3462.5, "Sweep Trap Zone")])
check("IV vs neighbours, worked by hand", {k: v["iv_class"] for k, v in lv.items()},
      {3618.6: "MODERATE", 3642.5: "MODERATE", 3692.4: "LOW", 3552.0: "MODERATE", 3524.6: "MODERATE", 3462.5: "HIGH"})
check("every level qualifies today", all(x["qualified"] for x in m["levels"]), True)
check("the Sweep Trap is traded the sweep way; the others are not", {k: v["sweep"] for k, v in lv.items()},
      {3618.6: False, 3642.5: False, 3692.4: False, 3552.0: False, 3524.6: False, 3462.5: True})
check("speed from delta: 3692.4 put -0.91 fast, 3618.6 put -0.66 fast, 3552.0 call 0.65 fast",
      [lv[k]["speed"].split(",")[0] for k in (3692.4, 3618.6, 3552.0)], ["fast", "fast", "fast"])

shift = [dict(r) for r in GOLD]
shift[1]["iv"] = 55.0                                     # the 2nd buy strike now has the highest IV of the three
ms = {x["strike"]: x["label"] for x in MP.map_market(shift, 3584.4)["levels"]}
check("DYNAMIC IV SHIFT: 2nd buy strike highest IV → it is the Sweep Trap, the lowest Stabilization",
      (ms[3524.6], ms[3462.5]), ("Sweep Trap Zone", "Stabilization Support"))
hi = [dict(r) for r in GOLD]
hi[5]["iv"] = 46.0                                        # 3642.5 above both neighbours (44.75, 42.77)
mh = {x["strike"]: x for x in MP.map_market(hi, 3584.4)["levels"]}
check("a SELL strike with HIGH IV: not qualified (breakout expected)", (mh[3642.5]["iv_class"], mh[3642.5]["qualified"]),
      ("HIGH", False))
err = [dict(r) for r in GOLD]
err[4]["iv"], err[5]["put_price"] = 0.0, -0.0004
me = {x["strike"]: x for x in MP.map_market(err, 3584.4)["levels"]}
check("IV 0 and a negative price: data errors, not qualified",
      (me[3618.6]["qualified"], me[3642.5]["qualified"], "data error" in me[3642.5]["why_not"][0]), (False, False, True))
check("our price beyond the table: spot mismatch, nothing mapped",
      (MP.map_market(GOLD, 3700.0)["status"], MP.map_market(GOLD, 3700.0)["levels"]), ("spot mismatch", []))

# ── BARCHART'S GRADE ───────────────────────────────────────────────────────────────────────────────────────────────
pk = lambda side, spot, fails=(): {"side": side, "strike": spot + 10, "spot": spot, "fails": list(fails)}  # noqa: E731
picks = [pk("buy", 3550.0), pk("sell", 3640.0, ["Vega high"]), pk("sell", 3552.0), pk("sell", 3750.0),
         pk("buy", 3600.0), pk("buy", 3700.0)]
g = G.grade(MP.map_market(GOLD, 3584.4), STRIKES, picks, 3584.4)
gl = {x["strike"]: x["grade"] for x in g["levels"]}
check("3552.0 backed by a Barchart full qualifier 2 away (window 13.7) → A", gl[3552.0], "A")
check("3642.5 backed by a near miss → B", gl[3642.5], "B")
check("a SELL pick at 3552 never backs the BUY level there; unbacked levels → C", (gl[3618.6], gl[3524.6]), ("C", "C"))
check("a Barchart full qualifier beyond the table (sell 3750) → its own 'Barchart level', B",
      [(x["strike"], x["grade"]) for x in g["levels"] if x["label"] == "Barchart level"], [(3750.0, "B")])
check("next to the ATM (buy 3600) and on the wrong side of price (buy 3700): not added",
      [x["strike"] for x in g["levels"] if x["label"] == "Barchart level" and x["side"] == "buy"], [])
nb = G.grade(MP.map_market(GOLD, 3584.4), STRIKES, None, 3584.4)
check("Barchart missing this open → every level C, said", ({x["grade"] for x in nb["levels"]}, bool(nb["barchart_note"])),
      ({"C"}, True))


# ── THE SIGNAL ─────────────────────────────────────────────────────────────────────────────────────────────────────
def c(i, h, l, cl):
    return Candle(time=1_795_400_000 + 60 * i, open=cl, high=h, low=l, close=cl, volume=1, timeframe="M1")


SELL = {"side": "sell", "strike": 3618.6, "sweep": False}
seq = [c(0, 3610, 3600, 3605), c(1, 3620, 3605, 3615), c(2, 3619, 3608, 3612)]
check("the touching candle is never its own confirmation", W.judge(SELL, seq[:2])[0], "waiting")
kind, p = W.judge(SELL, seq)
check("touch, then a LATER close below → signal at 3612", (kind, p["entry"]), ("signal", 3612))
# worked by hand: average range of the 3 candles = (10 + 15 + 11) / 3 = 12; highest high of the visit 3620;
# stop = 3620 + 0.5 × 12 = 3626; risk 14 ≥ floor 12; target = 3612 − 3 × 14 = 3570.
check("stop PIX's way, beyond the visit's high: 3626; target 3R: 3570; R:R 3",
      (round(p["sl"], 6), round(p["tp"], 6), p["rr"]), (3626.0, 3570.0, 3.0))
check("a candle CLOSING above the sell level → broken", W.judge(SELL, [c(0, 3610, 3600, 3605), c(1, 3625, 3605, 3620)])[0],
      "broken")
check("price never reached the level → waiting", W.judge(SELL, seq[:1])[0], "waiting")
# worked by hand: ranges 1 and 1 → average 1; visit high 3619, entry 3618.55; PIX's stop = 3619 + 0.5 + 0.3 = 3619.8,
# only 1.25 away — under the floor 1 × 1 + 0.3 = 1.3, so it is widened to exactly 1.3.
tight = [c(0, 3619, 3618, 3618.55), c(1, 3618.65, 3617.65, 3618.55)]
kp = W.judge(SELL, tight, spread=0.3)[1]
check("a stop closer than 1× range + spread is WIDENED to that floor (1.25 → 1.3)",
      (round(abs(kp["entry"] - kp["sl"]), 6), "floor" in kp["note"]), (1.3, True))
wide = [c(0, 3618.7, 3618.5, 3618.55), c(1, 3618.65, 3618.45, 3618.5)]
kw = W.judge(SELL, wide, spread=0.3)[1]
check("…and one already beyond the floor (0.6 vs 0.5) is NOT widened", (round(abs(kw["entry"] - kw["sl"]), 6),
      "floor" in kw["note"]), (0.6, False))
SWEEP = {"side": "buy", "strike": 3462.5, "sweep": True}
sw = [c(0, 3475, 3470, 3472), c(1, 3466, 3455, 3458), c(2, 3462, 3456, 3460), c(3, 3468, 3459, 3466)]
check("SWEEP TRAP: a touch from above alone → waiting", W.judge(SWEEP, [c(0, 3470, 3462.5, 3466)])[0], "waiting")
check("SWEEP TRAP: closing below is part of the sweep, not a break", W.judge(SWEEP, sw[:3])[0], "waiting")
ks, ps = W.judge(SWEEP, sw)
check("SWEEP TRAP: below, then a close back above 3462.5 → BUY at 3466, stop under the sweep low 3455",
      (ks, ps["entry"], ps["extreme"], ps["sl"] < 3455), ("signal", 3466, 3455, True))
BUY = {"side": "buy", "strike": 3552.0, "sweep": False}
check("a normal BUY level: a close below → broken", W.judge(BUY, [c(0, 3560, 3550, 3549)])[0], "broken")

# ── WIRED INTO PIX: the options check is CALLED, and EUR/USD never reaches the zone logic ─────────────────────────────
import asyncio  # noqa: E402
import strategies.pix as PX  # noqa: E402
from core.strategy_context import StrategyContext  # noqa: E402
from core.types import MTFCandles, TF  # noqa: E402
from core.indicator_types import IndicatorBundle  # noqa: E402
from core.pattern_types import PatternBundle  # noqa: E402
calls, zone_calls = [], []


async def fake_check(sym, m1, spread, sid, name):
    calls.append((sym, len(m1), round(spread, 6)))
    return ["OPTION-SIGNAL"]


real_check, real_zone = PX.pix_options_signals.check, PX.zone_plan
PX.pix_options_signals.check = fake_check
PX.zone_plan = lambda *a, **k: (zone_calls.append(1), (None, "no zone"))[1]
def bars(tf, n):
    return [Candle(time=1_795_000_000 + 60 * i, open=1.05, high=1.1, low=1.0, close=1.05, volume=1, timeframe=tf)
            for i in range(n)]


def ctx(sym):
    return StrategyContext(symbol=sym, candles=MTFCandles(_data={TF.M1: bars("M1", 120)}),
                           indicators=IndicatorBundle(), patterns=PatternBundle(), quote=(1.0500, 1.0502))


res = asyncio.new_event_loop().run_until_complete(PX.PIXStrategy().analyze(ctx("EUR/USD")))
check("EUR/USD: the options check IS called (closed 1M, the live spread) and its signal returned",
      (calls, list(res.signals)), ([("EUR/USD", 120, 0.0002)], ["OPTION-SIGNAL"]))
check("EUR/USD: the zone logic never runs", zone_calls, [])
calls.clear()
asyncio.new_event_loop().run_until_complete(PX.PIXStrategy().analyze(ctx("BTC/USD")))
check("BTC/USD: no options check (not an options market)", calls, [])
PX.pix_options_signals.check, PX.zone_plan = real_check, real_zone

# ── TEETH ──────────────────────────────────────────────────────────────────────────────────────────────────────────
real = MP.iv_class
MP.iv_class = lambda rows, i: "LOW"
check("TEETH: without the IV rule the HIGH-IV sell would qualify",
      {x["strike"]: x["qualified"] for x in MP.map_market(hi, 3584.4)["levels"]}[3642.5], True)
MP.iv_class = real

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
