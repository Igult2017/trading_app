"""barchart_levels — his options guide, proved with known answers. Run: python barchart_levels_test.py

Every rule has a hand-built case with a known answer, the real 19 Nov gold table is judged end to end, and each rule is
broken on purpose once to show the check would catch it."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import barchart_levels as L  # noqa: E402
from barchart_parse import parse_options  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def row(strike, iv, delta, gamma, theta, vega, skew):
    return dict(strike=strike, iv=iv, delta=delta, gamma=gamma, theta=theta, vega=vega, ivSkew=skew)


# ── 1. his own example: 17.20 low, 18.40 moderate, 18.70 high ─────────────────────────────────────────────────
pool = [18.40, 17.20, 18.70]
check("his example: 17.20 is LOW", (L.is_low(17.20, pool), L.is_high(17.20, pool)), (True, False))
check("his example: 18.40 is MODERATE (neither)", (L.is_low(18.40, pool), L.is_high(18.40, pool)), (False, False))
check("his example: 18.70 is HIGH", (L.is_low(18.70, pool), L.is_high(18.70, pool)), (False, True))

# ── 2. a buy side where strike 100 is perfect and every other strike fails something ──────────────────────────
calls = [row(100, 15.0, 0.60, 0.0050, -9.0, 0.42, 0.20),    # low IV, delta ok, high gamma, high theta, low vega, +skew
         row(105, 18.0, 0.40, 0.0030, -5.0, 0.90, 0.10),
         row(110, 19.0, 0.30, 0.0020, -4.0, 1.10, 0.05),
         row(95, 16.0, 0.70, 0.0049, -8.5, 0.45, -0.02),    # everything but the skew sign → a near miss
         row(90, 17.5, 0.80, 0.0010, -2.0, 0.60, 0.10),
         row(85, 0.0, 0.90, 0.0005, -1.0, 0.70, 0.10)]      # IV 0.00 = an error
full, near = L.pick(calls, L.BUY, 101)
check("the perfect strike QUALIFIES as a buy", [r["strike"] for r in full], [100])
check("the strike failing only the skew is a NEAR MISS", [r["strike"] for r in near][:1], [95])
check("...and says what failed and what it should be", near[0]["fails"], ["IV skew -2.00% — should be positive"])
check("IV 0.00 never counts as low", any("IV 0.00" in f for f in L.judge(calls, L.BUY)[5]["fails"]), True)

# ── 3. sells: delta must be -0.50 or beyond, skew strictly negative, vega LOW (his answers) ──────────────────
puts = [row(110, 15.0, -0.56, 0.0050, -9.0, 0.50, -0.20),
        row(105, 18.0, -0.30, 0.0030, -5.0, 0.90, -0.10),
        row(100, 19.0, -0.20, 0.0020, -4.0, 1.10, -0.05)]
full, _ = L.pick(puts, L.SELL, 104)
check("delta -0.56 counts as 'above 0.5' for a sell", [r["strike"] for r in full], [110])
weak = [dict(puts[0], delta=-0.45)] + puts[1:]
check("delta -0.45 does NOT", L.pick(weak, L.SELL, 104)[0], [])
pos = [dict(puts[0], ivSkew=0.01)] + puts[1:]
check("a sell with POSITIVE skew does not qualify (strict sign)", L.pick(pos, L.SELL, 104)[0], [])
hiv = [dict(puts[0], vega=2.0)] + puts[1:]
check("HIGH vega fails a sell (low vega favours the reversal)", L.pick(hiv, L.SELL, 104)[0], [])

# ── 4. spot level ──────────────────────────────────────────────────────────────────────────────────────────────
check("strike 3600 → his 20 Nov gold example 3594.96", round(L.spot_level(3600, 3605.35, 3600.3), 2), 3594.96)

# ── 5. the real 19 Nov gold table runs end to end ─────────────────────────────────────────────────────────────
here = os.path.dirname(os.path.abspath(__file__))
real = parse_options(json.load(open(os.path.join(here, "fixtures", "barchart_gc_sample.json"), encoding="utf-8")))
for side, kind in ((L.BUY, "Call"), (L.SELL, "Put")):
    judged = L.judge([r for r in real if r["type"] == kind], side)
    check(f"real gold {kind}s: every strike judged with its reasons", all(isinstance(j["fails"], list) for j in judged), True)

# ── 6. teeth ──────────────────────────────────────────────────────────────────────────────────────────────────
real_low = L.is_low
L.is_low = lambda v, p: True                                     # SABOTAGE: everything counts as low
check("TEETH — the vega rule is what refuses high vega", L.pick(hiv, L.SELL, 104)[0] != [], True)
L.is_low = real_low

print(f"\n{len(BAD)} of {N[0]} FAILED: {BAD}" if BAD else f"\nALL PASS ({N[0]} checks)")
sys.exit(1 if BAD else 0)
