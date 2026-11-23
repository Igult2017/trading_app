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
me = MP.map_market(err, 3584.4)
check("IV 0 or a negative price ANYWHERE in the table → the whole market is NOT mapped (his word 23 Nov: GBP had "
      "negatives and was mapped anyway)", (me["status"], me["levels"], "3618.6" in me["note"]), ("data error", [], True))
neg = [dict(r) for r in GOLD]
neg[0]["put_price"] = -0.0004                             # one bad strike far from price — still the whole table fails
check("…even ONE bad strike far from price", MP.map_market(neg, 3584.4)["status"], "data error")
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

# ── PRICE REACHED A LEVEL / NOT RESPECTED — his notices (23 Nov 2026) ─────────────────────────────────────────────────
from strategies.pix_options import signals as SG  # noqa: E402
check("REACHED: the first candle whose high reaches the sell level (the 2nd)", W.touched(SELL, seq).time, seq[1].time)
check("REACHED: nothing while price stays away", W.touched(SELL, seq[:1]), None)
check("SWEEP TRAP: a touch from above is NOT 'reached' — only trading below it is",
      (W.touched(SWEEP, [c(0, 3470, 3462.5, 3466)]), W.touched(SWEEP, sw).time), (None, sw[1].time))
import inspect  # noqa: E402
check("ONLY RESPECTED LEVELS reach his DM (his word 23 Nov): no 'reached' / 'not respected' notice exists any more",
      (hasattr(SG, "notice"), "send" in inspect.signature(SG.check).parameters), (False, False))

# ── THE CARD: EVERY OPTIONS METRIC FAILED IS ON IT (his ask, 23 Nov 2026) — rendered by the REAL Telegram card ──────────
from notifications.telegram_cards import format_signal_confirmed  # noqa: E402
LV_B = {"level": 3575.7, "label": "Active Dealer Support", "side": "buy", "sweep": False, "grade": "B", "run_id": "r",
        "detail": {"why": ["call price 55.88 > put price 21.08 — buyers' side", "IV 47.65% is MODERATE against its "
                           "neighbours — a clean bounce can hold"], "speed": "fast, aggressive reaction expected",
                   "barchart": {"side": "buy", "strike": 3565.0, "spot": 3575.54,
                                "fails": ["Theta -14.76 — should be high (≤ -20.27)",
                                          "IV skew -10.23% — should be positive"]}}}
PLAN = {"entry": 3580.0, "sl": 3570.0, "tp": 3610.0, "rr": 3.0, "note": "stop 0.5× the 1M average range"}
card = format_signal_confirmed(SG.build("XAU/USD", LV_B, PLAN, "pix", "PIX"))
check("the Telegram card names the level and grade", "Active Dealer Support 3575.70 — grade B" in card, True)
check("…EVERY Barchart metric failed, with its value and what it should be",
      ("❌ Barchart Theta -14.76 — should be high (≤ -20.27)" in card,
       "❌ Barchart IV skew -10.23% — should be positive" in card), (True, True))
check("…what Barchart's strike DID pass (IV, Delta, Gamma, Vega)",
      "passes: IV, Delta, Gamma, Vega" in card, True)
check("…the Investing.com qualifications and the 3R target", ("Investing.com: call price 55.88" in card,
                                                               "Target 3R" in card), (True, True))
LV_C = dict(LV_B, grade="C", detail=dict(LV_B["detail"], barchart=None))
check("no Barchart strike → the card says so with ❌",
      "❌ Barchart: no strike backs this level" in format_signal_confirmed(SG.build("XAU/USD", LV_C, PLAN, "pix", "PIX")),
      True)

# ── INVESTING.COM FAILED ITS 3 TRIES → BARCHART'S FULL QUALIFIERS ONLY (his order, 23 Nov 2026) ────────────────────────
bo = G.barchart_only([pk("buy", 3550.0), pk("sell", 3640.0, ["Vega high"]), pk("sell", 3700.0), pk("buy", 3700.0)],
                     3584.4)
check("Investing.com missing: only Barchart's FULL qualifiers on the right side of price are mapped",
      [(x["side"], x["strike"], x["label"]) for x in bo["levels"]],
      [("buy", 3550.0, "Barchart level"), ("sell", 3700.0, "Barchart level")])
check("…and a market where nothing fully qualifies is NOT mapped (rules never relaxed)",
      G.barchart_only([pk("buy", 3550.0, ["Theta low"])], 3584.4)["status"], "no data")

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

# ── THE MAP POST: ONLY WHAT QUALIFIED, AS A CHART WITH THE TEXT UNDER IT (his word, 23 Nov 2026) ─────────────────────
import json  # noqa: E402
from datetime import datetime, timezone  # noqa: E402
from strategies.pix_options import job as J, message as MSG  # noqa: E402
from charting import levels_map  # noqa: E402
GBP_BAD = [row(-0.09, -0.0004, 1.3020, 0.01708, 0.91, 10.14), row(-0.24, -0.0011, 1.3065, 0.01190, 0.76, 9.68),
           row(-0.34, -0.0014, 1.3085, 0.00960, 0.66, 9.45), row(-0.49, -0.0017, 1.3110, 0.00680, 0.51, 9.22),
           row(-0.65, -0.0017, 1.3134, 0.00445, 0.35, 9.09), row(-0.75, -0.0013, 1.3152, 0.00304, 0.25, 9.04),
           row(-0.90, 0.00064, 1.3191, 0.00114, 0.10, 9.07)]               # the live 23 Nov GBP/USD table
EUR_NONE = [row(-0.1, 0.002, 1.090, 0.001, 0.9, 7.0), row(-0.3, 0.002, 1.095, 0.001, 0.7, 7.1),
            row(-0.5, 0.002, 1.0993, 0.0019, 0.5, 7.2), row(-0.7, 0.001, 1.104, 0.002, 0.3, 7.3),
            row(-0.9, 0.001, 1.108, 0.002, 0.1, 7.4)]                       # every side the wrong way round: none qualify
RUN = {"run_id": "r1", "slot": "ln", "taken_at": datetime(2026, 11, 23, 8, 28, tzinfo=timezone.utc), "snaps": [
    {"source": "investing", "market": "XAU/USD", "rows": json.dumps(GOLD), "spot": 3584.4, "expiry": "2026-11-24"},
    {"source": "investing", "market": "GBP/USD", "rows": json.dumps(GBP_BAD), "spot": 1.3112, "expiry": "2026-11-24"},
    {"source": "investing", "market": "EUR/USD", "rows": json.dumps(EUR_NONE), "spot": 1.0995, "expiry": "2026-11-24"}]}
posts = J.build(RUN)
check("one post per market WITH qualified levels: gold only — GBP (negative prices) and EUR (nothing qualified) are "
      "not posted at all", [x["market"] for x in posts], ["XAU/USD"])
check("…every level saved and posted qualified", all(lv["qualified"] for lv in posts[0]["map"]["levels"]), True)
m_mix = MP.map_market(hi, 3584.4)                          # 3642.5 does NOT qualify (HIGH IV sell)
blk = "\n".join(MSG.market_block("XAU/USD", m_mix, 3584.4, "2026-11-24"))
check("a level that did not qualify is NOT in the text", ("3642.5" in blk, "not watched" in blk, "✗" in blk),
      (False, False, False))
check("…while the qualified ones are", "3618.6" in blk, True)
check("a market with nothing qualified → no text at all", MSG.market_block("EUR/USD", MP.map_market(EUR_NONE, 1.0995),
                                                                          1.0995, ""), [])
full = MSG.text("ln", RUN["taken_at"], posts[0]["block"])
cap, rest = MSG.split(full)
check("the text under the picture fits Telegram's caption, cut on a whole line; the rest follows",
      (len(cap) <= 1000, (cap + "\n" + rest) == full if rest else cap == full), (True, True))
candles = [Candle(time=1_795_000_000 + 1800 * i, open=3580 + (i % 7), high=3590 + (i % 7), low=3570 + (i % 5),
                  close=3582 + (i % 6), volume=1, timeframe="M30") for i in range(96)]
png = levels_map.render(MSG.title("XAU/USD", "ln", RUN["taken_at"]), candles,
                        [{"price": lv["strike"], "name": lv["label"], "side": lv["side"], "dashed": lv["sweep"]}
                         for lv in posts[0]["map"]["levels"]], 3584.4, 2)
check("the chart is drawn (a PNG on disk)", bool(png) and Path(png).exists() and Path(png).stat().st_size > 20_000, True)
import tempfile  # noqa: E402
KEEP = Path(tempfile.gettempdir()) / "pix_options_map_sample.png"        # outside the repo, for a look by eye
if png:
    import shutil
    shutil.copy(png, KEEP)
sent = []


async def s_photo(path, caption):
    sent.append(("photo", Path(path).exists(), caption))
    return True


async def s_text(t):
    sent.append(("text", t))
    return True


async def some_candles(market):
    return candles


async def no_candles(market):
    return []

p0 = dict(posts[0], when=RUN["taken_at"], slot="ln")
asyncio.new_event_loop().run_until_complete(J.post(p0, s_text, s_photo, some_candles))
check("posted as a PHOTO with the text as its caption (then any rest as a message)",
      (sent[0][0], sent[0][1], sent[0][2] == cap, [x[0] for x in sent[1:]]), ("photo", True, True, ["text"] if rest else []))
sent.clear()
asyncio.new_event_loop().run_until_complete(J.post(p0, s_text, s_photo, no_candles))
check("no candles → the TEXT alone (the map is never lost)", [x[0] for x in sent], ["text"])

# ── TEETH ──────────────────────────────────────────────────────────────────────────────────────────────────────────
real = MP.iv_class
MP.iv_class = lambda rows, i: "LOW"
check("TEETH: without the IV rule the HIGH-IV sell would qualify",
      {x["strike"]: x["qualified"] for x in MP.map_market(hi, 3584.4)["levels"]}[3642.5], True)
MP.iv_class = real
real_q = MSG.qualified
MSG.qualified = lambda m: m.get("levels", [])
check("TEETH: without the qualified-only rule EUR/USD (nothing qualified) would be posted",
      "EUR/USD" in [x["market"] for x in J.build(RUN)], True)
MSG.qualified = real_q
real_bad = MP._bad
MP._bad = lambda r: ""
check("TEETH: without the bad-number check the 23 Nov GBP table would map", MP.map_market(GBP_BAD, 1.3112)["status"],
      "mapped")
MP._bad = real_bad

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
