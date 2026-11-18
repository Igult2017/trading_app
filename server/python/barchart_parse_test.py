"""
barchart_parse_test.py — run with:  cd server/python && python barchart_parse_test.py

Proves the Barchart reader on a VERBATIM slice of the real response (fixtures/barchart_gc_sample.json, taken from
the page's own data request on 19 Nov 2026), plus the page-header price and the blocked-page test. No network.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import barchart_parse as P  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


SAMPLE = json.loads((Path(__file__).resolve().parent / "fixtures" / "barchart_gc_sample.json").read_text(encoding="utf-8"))
rows = P.parse_options(SAMPLE)
print("THE OPTIONS ROWS")
check("6 calls + 6 puts from the slice", (sum(r["type"] == "Call" for r in rows), sum(r["type"] == "Put" for r in rows)),
      (6, 6))
c = rows[0]
check("first call: strike 3530, last 216.6, IV 45.03, delta 0.8336 — the RAW numbers, not the display strings",
      (c["strike"], c["last"], round(c["iv"], 2), round(c["delta"], 4)), (3530.0, 216.6, 45.03, 0.8336))
p = next(r for r in rows if r["type"] == "Put")
check("first put: strike 3530, delta −0.0743, vega 0.6716", (p["strike"], round(p["delta"], 4), round(p["vega"], 4)),
      (3530.0, -0.0743, 0.6716))
check("every row carries all ten fields", all(set(r) == set(P.FIELDS) | {"type"} for r in rows), True)
broken = {"data": {"Call": [{"raw": {"strikePrice": None, "delta": 0.5}}, {"raw": {"strikePrice": 3600}}], "Put": []}}
check("a row with no strike is dropped; one with a strike but no Greeks is kept with blanks",
      [(r["strike"], r["delta"]) for r in P.parse_options(broken)], [(3600.0, None)])
check("an empty or missing response → no rows (never a crash)", (P.parse_options({}), P.parse_options(None)), ([], []))

print("\nTHE FUTURES PRICE ON THE PAGE")
html = '<div data-ng-init=\'init({"symbol":"GCZ26","symbolName":"Gold","symbolType":2,"lastPrice":"3,726.3","priceChange":"-137.9"})\'>'
check("contract and last price read from the page header (commas removed)", P.parse_underlying(html), ("GCZ26", 3726.3))
check("...also when the page escapes its quotes", P.parse_underlying(html.replace('"', "&quot;")), ("GCZ26", 3726.3))
check("no header → (None, None)", P.parse_underlying("<html></html>"), (None, None))

print("\nA BLOCK IS A BLOCK — reported, never fought")
check("Cloudflare 'Just a moment...' page → blocked", P.is_blocked("Just a moment...", "<html>cf_chl_opt</html>"), True)
check("'Access denied' → blocked", P.is_blocked("Access denied", "<html></html>"), True)
check("the real page title → not blocked",
      P.is_blocked("Gold Dec '26 Futures Options Volatility & Greeks - Barchart.com", "x" * 200_000), False)

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
