"""THREE TRIES, FIVE MINUTES APART (his order 23 Nov 2026) — the real `barchart_greeks.main` with stand-in readers.
Run: cd server/python && python barchart_retry_test.py
  Investing.com: gold on try 1, nothing on try 2, EUR/USD on try 3, GBP/USD never.
  Barchart:      gold fails twice then works on try 3; EUR/USD works on try 1; GBP/USD fails all three.
Expected: exactly two 5-minute waits; only MISSING markets re-read; what was read is stored, the rest left out."""
import os
import sys

import barchart_greeks as B

BAD = []


def check(name, got, want):
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


tries_s, tries_b, sleeps, posts = [], [], [], []
plan_s = {1: ["XAU/USD"], 2: [], 3: ["EUR/USD"]}


def fake_sentry(fetcher, markets):
    tries_s.append(list(markets))
    n = len(tries_s)
    return [{"market": m, "expiry": "2026-11-24", "rows": [{"strike": 1.0}]} for m in plan_s[n] if m in markets]


fails_left = {"GC": 2, "E6": 0, "B6": 99}


def fake_barchart(fetcher, root, expiry, out):
    tries_b.append(root)
    if fails_left[root] > 0:
        fails_left[root] -= 1
        out["error"] = RuntimeError(f"{root} failed")
        return None
    return {"rows": [], "futures": 1.0, "contract": root, "used": expiry}


def fake_app(path, payload=None):
    if payload is None:
        return {"mid": 1.0}
    posts.append((path, payload))
    return {"ok": True, "stored": len(payload.get("snapshots", []))}


B._read_sentry, B._read_barchart, B._app = fake_sentry, fake_barchart, fake_app
B.time.sleep = lambda s: sleeps.append(s)
os.environ.update({"BC_RUN_ID": "t", "BC_SLOT": "ln"})
rc = B.main()
big = [s for s in sleeps if s >= 60]
check("exactly two waits of 5 minutes between the three tries", big, [300, 300])
check("Investing.com re-read only what was missing each try", tries_s,
      [["XAU/USD", "EUR/USD", "GBP/USD"], ["EUR/USD", "GBP/USD"], ["EUR/USD", "GBP/USD"]])
check("Barchart: gold 3 tries, EUR/USD once, GBP/USD 3 tries", (tries_b.count("GC"), tries_b.count("E6"),
                                                               tries_b.count("B6")), (3, 1, 3))
snap = next(p for path, p in posts if path == "/api/internal/options/snapshot")
check("what was read is STORED: Investing gold + EUR/USD, Barchart gold + EUR/USD; GBP/USD left out",
      sorted((s["source"], s["market"]) for s in snap["snapshots"]),
      [("barchart", "EUR/USD"), ("barchart", "XAU/USD"), ("investing", "EUR/USD"), ("investing", "XAU/USD")])
check("the run then says the engine maps it (no separate Barchart post)",
      [p.get("mapped") for path, p in posts if path == "/api/internal/barchart/levels"], [True])
check("exit code 0", rc, 0)
print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED: {BAD}'}")
sys.exit(1 if BAD else 0)
