"""PIX — what the Assets page's three panels show (`strategies/pix_factors.py`), proved with known answers (19 Nov 2026).

His report: *"Assets page is not displaying anything here in this columns"*. The page splits `smc_factors` on `::`:
CTX::label::value → Context Alignment, IND::name::reading → Technical Confluence, PA::note → Price Action.
Run: python tests/pix/test_factors.py
"""
import os
import sys
from types import SimpleNamespace as NS

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
import strategies.pix_factors as PF  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


Z = lambda d, lo, hi: NS(direction=d, bottom=lo, top=hi)  # noqa: E731
bz = NS(tf="5M", zone=Z("supply", 3732.98, 3744.14), reached=Z("demand", 3726.9, 3728.1))
outer = NS(tf="1H", zone=Z("supply", 3730.0, 3750.0))
e = NS(reaction=[1, 2, 3, 4, 5, 6, 7])
prof = NS(poc=3735.58895)
line = "Order flow CONFIRMS (price-tick estimate): CVD divergence ✓, delta +1% selling on the reaction ✓"
f = PF.zone("4H", False, bz, outer, "supply", e, line, prof, "ranging", 3.0)

print("A ZONE SIGNAL — the 05:22 gold sell's shape")
check("CONTEXT: trend, the zone traded, the bigger zone it sits inside, where price travelled to",
      [x for x in f if x.startswith("CTX::")],
      ["CTX::TREND::4H DOWN", "CTX::ZONE::5M SUPPLY 3732.98–3744.14", "CTX::INSIDE::1H SUPPLY 3730–3750",
       "CTX::TRAVELLED TO::DEMAND 3726.9–3728.1"])
check("TECHNICAL: the order-flow verdict, CVD, delta, the volume profile's POC and its role",
      [x for x in f if x.startswith("IND::")],
      ["IND::ORDER FLOW::CONFIRMS", "IND::CVD::DIVERGENCE ✓", "IND::DELTA::+1% SELLING ✓",
       "IND::VOLUME PROFILE::POC 3735.58895 (RANGING)"])
check("PRICE ACTION: the 1M sequence as it happened, the order, the target",
      [x for x in f if x.startswith("PA::")],
      ["PA::Touched the zone, 7 candles down, then a pullback candle",
       "PA::Stop order at the pullback's low — stop behind the pullback", "PA::Target 3R"])
check("every CTX:: / IND:: entry is exactly label::value — what the page splits on",
      all(len(x.split("::")) == 3 for x in f if x.startswith(("CTX::", "IND::"))), True)
check("no bigger zone → no INSIDE row (nothing invented)",
      any(x.startswith("CTX::INSIDE") for x in PF.zone("4H", False, bz, None, "supply", e, line, prof, "", 3.0)), False)

print("\nORDER FLOW — every form the card's line takes")
check("disagreeing → DOES NOT AGREE, CVD and delta split out",
      PF.flow("⚠ Order flow does NOT agree (x): CVD convergence ✗, delta -20% buying on the reaction ✗"),
      ["IND::ORDER FLOW::DOES NOT AGREE", "IND::CVD::CONVERGENCE ✗", "IND::DELTA::-20% BUYING ✗"])
check("no divergence at all → NONE ✗",
      PF.flow("⚠ Order flow does NOT agree (x): no CVD divergence ✗, delta +5% buying on the reaction ✓")[1],
      "IND::CVD::NONE ✗")
check("one half missing → N/A for that half",
      PF.flow("⚠ Order flow does NOT agree (x): divergence not available, delta +5% buying on the reaction ✓")[1],
      "IND::CVD::N/A")
check("no figures yet → 'NOT AVAILABLE YET', not a blank",
      PF.flow("Order flow not available yet (price-tick estimate) — divergence and delta not checked"),
      ["IND::ORDER FLOW::NOT AVAILABLE YET"])
check("no feed at all → the same", PF.flow("Order flow not available yet — no order-flow feed"),
      ["IND::ORDER FLOW::NOT AVAILABLE YET"])

print("\nA SUPPORT / RESISTANCE SIGNAL")
lv = PF.level(0, True, 100.0, 4.2, NS(reaction=[1, 2]), "Order flow CONFIRMS (x)", 2.5)
check("context: ranging, the 5M level, the room; price action ends with its own target",
      ([x for x in lv if x.startswith("CTX::")], lv[-1]),
      (["CTX::TREND::RANGING", "CTX::LEVEL::5M DEMAND 100", "CTX::ROOM::4.2R TO THE OPPOSITE LEVEL"], "PA::Target 2.5R"))

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
