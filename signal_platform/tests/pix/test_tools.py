"""PIX's THREE TOOLS — volume profile, footprint, and the upgraded absorption / initiation — proved on hand-built data
with known answers (18 Nov 2026). Every key rule has TEETH, and the tools are shown to be MARKET-AGNOSTIC: multiplying
every volume by 1000 (a different market's scale) gives the same answer. Run: python tests/pix/test_tools.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
import storage.observability_repo as _obs  # noqa: E402
_obs.record = lambda *a, **k: None

from core.types import Candle  # noqa: E402
import strategies.pix_profile as P  # noqa: E402
import strategies.pix_footprint as FP  # noqa: E402
import strategies.pix_flow as F  # noqa: E402
import strategies.pix_btcflow as BT  # noqa: E402
import strategies.pix_goldflow as GF  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def teeth(name, failed_when_broken):
    check(f"TEETH — {name} fails when deliberately broken", bool(failed_when_broken), True)


T0 = 1_600_000_000 // 300 * 300
C = lambda i, o, h, lo, c, v=1.0: Candle(T0 + i * 300, o, h, lo, c, v, "M5")  # noqa: E731

print("VOLUME PROFILE — POC, value area, and what the POC is doing")
trades = [(100.5, 10), (101.5, 30), (102.5, 100), (103.5, 40), (104.5, 5)]        # rows 100-105, row size 1
prof = P.from_trades(trades + [(100.0, 0.0001), (105.0, 0.0001)], rows=5)
check("POC = the busiest row (102-103, centre 102.5)", round(prof.poc, 3), 102.5)
check("value area = 70% grown from the POC towards the busier side: 102-104 (140 of 185 ≥ 129.5)",
      (round(prof.val, 3), round(prof.vah, 3)), (102.0, 104.0))
big = P.from_trades([(p, s * 1000) for p, s in trades] + [(100.0, 0.1), (105.0, 0.1)], rows=5)
check("MARKET-AGNOSTIC: every volume ×1000 → the same POC / VAL / VAH",
      (round(big.poc, 3), round(big.val, 3), round(big.vah, 3)), (102.5, 102.0, 104.0))
spread = P.from_candles([C(0, 100, 110, 100, 110, 10.0), C(1, 105.5, 105.8, 105.2, 105.5, 10.0)], rows=10)
check("each candle's volume is spread over its own range — the POC is where they overlap (105-106), "
      "not at the first candle's close (110)", round(spread.poc, 3), 105.5)
P.VALUE_AREA = 0.99
teeth("the 70% value area (made 99%)", P.from_trades(trades + [(100.0, 0.0001), (105.0, 0.0001)], rows=5).val != 102.0)
P.VALUE_AREA = 0.70
up = [C(i, 0, 0, 0, c) for i, c in enumerate([99, 99.5, 100.5, 101, 101.5])]
dn = [C(i, 0, 0, 0, c) for i, c in enumerate([101, 100.5, 99.5, 99, 98])]
chop = [C(i, 0, 0, 0, c) for i, c in enumerate([99, 101, 99, 101, 99])]
check("closes broke UP through the POC (100) → it is SUPPORT", P.poc_role(up, 100.0), "support")
check("broke DOWN → RESISTANCE", P.poc_role(dn, 100.0), "resistance")
check("crossed it 4 times → RANGING around it (weak)", P.poc_role(chop, 100.0), "ranging")
check("a zone 101-103 has the POC (102.5) inside it → confluence", P.touching(prof, 101.0, 103.0), ["POC", "VAL"])
check("a zone 106-107 far from POC / VAH / VAL → none", P.touching(prof, 106.0, 107.0), [])

print("\nFOOTPRINT — who bought and sold at each price, read DIAGONALLY")
fp = FP.build({100.0: (1, 10), 101.0: (40, 2), 102.0: (40, 3), 103.0: (40, 2), 104.0: (1, 5), 105.0: (1, 5)}, rows=10)
check("buying at 101/102/103 ≥ 3× the selling one price below → three buy imbalances STACKED (101-103)",
      [(round(a, 3), round(b, 3)) for a, b in fp.buy_stacks], [(101.0, 103.0)])
check("totals kept exactly (bought 123, sold 27)", (fp.bought, fp.sold), (123.0, 27.0))
dense = FP.build({100.0 + k * 0.01: ((40, 2) if 10 <= k < 40 else (1, 1)) for k in range(100)}, rows=20)
check("many prices (100 traded, 20 rows): the busy buying band 100.10-100.40 shows as one stack",
      [(round(a, 2), round(b, 2)) for a, b in dense.buy_stacks], [(100.1, 100.4)])
FP.IMB_RATIO = 50.0
teeth("the 3× diagonal rule (made 50×)", FP.build({100.0: (1, 10), 101.0: (40, 2), 102.0: (40, 3), 103.0: (40, 2),
                                                   104.0: (1, 5), 105.0: (1, 5)}, rows=10).buy_stacks == [])
FP.IMB_RATIO = 3.0
same = FP.build({100.0: (10, 10), 101.0: (40, 39), 102.0: (40, 38), 103.0: (40, 37), 104.0: (5, 5)}, rows=4)
check("buyers ≈ sellers at every price → no stacked imbalance (the SAME-price comparison is not used)",
      same.buy_stacks, [])

print("\nABSORPTION (footprint) and INITIATION (volume) — CVD is NOT used for either")


def market():
    rows = [(110.5 - k * 0.8, 110.7 - k * 0.8, 109.5 - k * 0.8, 109.9 - k * 0.8) for k in range(12)]
    rows += [(101.0, 101.2, 100.2, 100.6), (100.6, 102.4, 100.5, 102.2)]
    return [C(i, *r) for i, r in enumerate(rows)]


TAP = T0 + 12 * 300
flows = {T0 + i * 300: v for i, v in enumerate([(10, 30)] * 7 + [(20, 20)] * 5 + [(22, 18), (40, 10)])}
flat = {t: {100.0: (1.0, 1.0)} for t in flows}
check("baseline: GO", F.verdict(market(), flows, True, TAP, "5M", prints=flat).kind, F.GO)
trap = dict(flat)
trap[TAP + 300] = {102.6: (1, 9), 102.8: (40, 2), 103.0: (40, 2), 103.2: (40, 2), 103.4: (40, 2), 103.6: (1, 1)}
v = F.verdict(market(), flows, True, TAP, "5M", prints=trap)
check("buyers STACKED at 102.8-103.4 but the candle closed BELOW them (102.2) → REFUSE (footprint absorption)",
      (v.kind, "footprint" in v.reasons[0]), (F.REFUSE, True))
miss = dict(flat)
miss.pop(TAP)
check("a visit candle with no footprint → UNKNOWN", F.verdict(market(), flows, True, TAP, "5M", prints=miss).kind,
      F.UNKNOWN)
quiet = dict(flows)
quiet[TAP + 300] = (8, 2)                                     # 80% one-sided, but only 10 traded vs ~40 average
v = F.verdict(market(), quiet, True, TAP, "5M")
check("leaving with 80% buying but only 25% of the usual volume → REFUSE (no initiation)",
      (v.kind, "average volume" in v.reasons[0]), (F.REFUSE, True))
F.VOL_AVG_N = 0
teeth("the volume rule (no earlier candles counted)", F.verdict(market(), quiet, True, TAP, "5M").kind != F.REFUSE)
F.VOL_AVG_N = 20
huge = dict(flows)
huge[TAP + 300] = (4000, 1000)                                # a giant leaving candle must not lift its own average
check("the candle judged is NOT in its own average (5000 vs an average of 40 → 125×)",
      "125.0×" in F.verdict(market(), huge, True, TAP, "5M").reasons[0], True)
x1000 = {t: (b * 1000, s * 1000) for t, (b, s) in flows.items()}
check("MARKET-AGNOSTIC: every volume ×1000 → the same verdict",
      F.verdict(market(), x1000, True, TAP, "5M").kind, F.verdict(market(), flows, True, TAP, "5M").kind)

print("\nTHE DATA ADAPTERS — Bitcoin trades and the gold tick count, per price")
rows = [{"a": 1, "p": "100.5", "q": "0.25", "T": T0 * 1000 + 10, "m": False},
        {"a": 2, "p": "100.5", "q": "0.10", "T": T0 * 1000 + 20, "m": True},
        {"a": 3, "p": "101.0", "q": "1.00", "T": (T0 + 60) * 1000, "m": False}]
check("a Binance trade with m=false is a BUY, m=true a SELL; decimals kept; out-of-minute trades dropped",
      BT.parse_trades(rows, T0, T0 + 59), {100.5: (0.25, 0.10)})
GF.reset()
GF.on_tick("XAU/USD", 4000.0, T0 + 30)
for i, b in enumerate([4000.1, 4000.2, 4000.1]):
    GF.on_tick("XAU/USD", b, T0 + 60 + i)
check("gold: the up / down ticks are counted AT the price they moved to",
      GF.prints("M1", now=T0 + 400).get(T0 + 60), {4000.1: (1.0, 1.0), 4000.2: (1.0, 0.0)})
GF.reset()

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
