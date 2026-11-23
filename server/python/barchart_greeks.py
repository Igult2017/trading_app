"""
barchart_greeks.py — THE DAY'S OPTIONS LEVELS, one run per market open (his job, 20-21 Nov 2026; plan and his guide:
`docs/barchart-levels-plan.md`). Runs inside a short-lived container that is REMOVED on exit (`scripts/bc/run.sh`),
never inside the app — the same shape as the MyFXBook scraper.

ONE BROWSER, THREE MARKETS: gold (GC), euro (E6), pound (B6). For each: open the options page, take the NEXT trading
day's weekly options (Monday → Tuesday, Friday → Monday; `barchart_message.expiry_for`), read that week's options table
and its futures price from INSIDE the page (its own data request, the same session), cut it to near the money,
apply his rules (`barchart_levels`), convert each picked strike to the spot level on his chart (strike × spot ÷
futures, spot = our live price from the app), then post ONE message. NOTHING IS KEPT: the table lives only in memory.

THE BROWSER is the disguised one the MyFXBook scraper uses (scrapling StealthyFetcher, solve_cloudflare=True) — his
instruction, 21 Nov 2026: "disguise the browser and access it as we do with myfxbook"; Barchart support told him the
data may be accessed for non-commercial use and it is for his personal use. Ad / cookie popups are closed before
reading. If the page is still refused, the run reports BLOCKED and his DM is told — never a guess.

Usage (inside the container):  BC_APP=... BC_SECRET=... BC_RUN_ID=... BC_SLOT=asia|ln|ny python barchart_greeks.py
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import barchart_levels as L                                                    # noqa: E402
import barchart_message as M                                                   # noqa: E402
import sentry_options as S                                                     # noqa: E402
from barchart_snapshot import snapshot                                        # noqa: E402
from barchart_read import BASE, read_market                                    # noqa: E402

MARKETS = [("GOLD", "GC", "XAU/USD", 2), ("EUR/USD", "E6", "EUR/USD", 5), ("GBP/USD", "B6", "GBP/USD", 5)]


def _app(path: str, payload: dict | None = None):
    app, secret = os.getenv("BC_APP"), os.getenv("BC_SECRET")
    if not (app and secret):
        return None
    # THE DRY RUN (his order 23 Nov 2026: "Test both scrapers to ensure they collect the right data even before you save
    # the data to database"): BC_DRY=<file> — every POST is written to that file instead of sent; nothing is saved or
    # posted. GETs (the live spot price) still read the app, read-only.
    if payload is not None and os.getenv("BC_DRY"):
        with open(os.getenv("BC_DRY"), "a", encoding="utf-8") as f:
            f.write(json.dumps({"path": path, "payload": payload}, default=str) + "\n")
        return {"ok": True, "dry": True, "stored": 0}
    req = urllib.request.Request(app + path, method="POST" if payload is not None else "GET",
                                 data=None if payload is None else json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "x-admin-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except Exception as e:                                                    # noqa: BLE001
        print(f"{path}: {type(e).__name__}: {e}", file=sys.stderr)
        return None


def section(name: str, sym: str, digits: int, got: dict, expiry) -> list[str]:
    spot = (_app(f"/api/internal/barchart/spot?symbol={urllib.parse.quote(sym)}") or {}).get("mid")
    if not spot:
        return [f"<b>{name}</b> · {got['contract']} {got['futures']:.{digits}f}", "<i>no live spot price — skipped</i>"]
    note = "" if got["used"] == expiry else f"{expiry:%A} options not listed — using {got['used']:%a %d %b}"
    sides = []
    for kind, side in (("Call", L.BUY), ("Put", L.SELL)):
        ntm = L.near_the_money([r for r in got["rows"] if r["type"] == kind], got["futures"])
        sides.append(L.pick(ntm, side, got["futures"]))
    return M.format_market(name, got["contract"], got["futures"], spot, digits, sides[0], sides[1], note)


TRIES = 3                   # his order 23 Nov 2026
GAP_S = 300                 # five minutes between tries
VISIT_MS = 300_000          # one browser visit (was 120 s — his "dont time a scraper out so fast")


def _read_sentry(fetcher, markets: list[str]) -> list[dict]:
    """Investing.com's overnight tables for `markets`, one visit. Never raises — a failure returns what was read."""
    got: list[dict] = []

    def act(page):
        try:
            got.extend(S.read_all(page, markets))
        except Exception as e:                                                # noqa: BLE001
            print(f"sentry: {type(e).__name__}: {e}", file=sys.stderr)
        return page
    try:
        fetcher.fetch(S.PANEL, headless=True, network_idle=True, page_action=act, timeout=VISIT_MS)
    except Exception as e:                                                    # noqa: BLE001
        print(f"sentry visit: {type(e).__name__}: {e}", file=sys.stderr)
    return got


def _read_barchart(fetcher, root: str, expiry, out: dict):
    """One Barchart market in a FRESH browser (21 Nov 2026: one visit gets only a few full pages). The table, or None
    — and the failure is kept in `out["error"]` for the record. Never raises."""
    box: dict = {}

    def act(page):
        try:
            box["got"] = read_market(page, root, expiry)
        except Exception as e:                                                # noqa: BLE001
            box["error"] = e
        return page
    try:
        fetcher.fetch(f"{BASE}/futures/quotes/{root}*0/volatility-greeks", headless=True, solve_cloudflare=True,
                      network_idle=True, page_action=act, timeout=VISIT_MS)
    except Exception as e:                                                    # noqa: BLE001
        box["error"] = e
    if "error" in box:
        out["error"] = box["error"]
        print(f"barchart {root}: {type(box['error']).__name__}: {box['error']}", file=sys.stderr)
    return box.get("got")


def main() -> int:
    from scrapling.fetchers import StealthyFetcher                           # only the container has it
    run_id, slot = os.getenv("BC_RUN_ID") or None, os.getenv("BC_SLOT") or "ln"
    now, started = datetime.now(timezone.utc), time.time()
    expiry, out = M.expiry_for(slot, now), {}

    # THREE TRIES, FIVE MINUTES APART, PER SCRAPER (his order 23 Nov 2026: "each scraper should try atleast 3 times at an
    # interval of 5 minutes. After that if it still fails we use data provided by the scraper that dint fail"). A retry
    # re-reads ONLY the markets still missing; whatever is missing after the last try is left out, and the run stores
    # what it has (the engine maps from the source that worked). This replaces the 21 Nov "a refusal = the day skipped".
    sentry: list[dict] = []
    out["markets"] = []
    for attempt in range(1, TRIES + 1):
        miss_s = [m for m in S.MARKETS if m not in {t["market"] for t in sentry}]
        miss_b = [mk for mk in MARKETS if mk[2] not in {sym for _, sym, _, _ in out["markets"]}]
        if not miss_s and not miss_b:
            break
        if attempt > 1:
            print(f"try {attempt}: Investing.com missing {miss_s}, Barchart missing {[m[2] for m in miss_b]} — "
                  f"waiting {GAP_S // 60} min", file=sys.stderr)
            time.sleep(GAP_S)
        if miss_s:
            sentry.extend(_read_sentry(StealthyFetcher, miss_s))
        for i, (name, root, sym, digits) in enumerate(miss_b):
            if i:
                time.sleep(random.uniform(10, 25))  # a person's gap between markets, never the same (23 Nov 2026)
            got = _read_barchart(StealthyFetcher, root, expiry, out)
            if got is not None:
                out["markets"].append((name, sym, digits, got))
    took = round(time.time() - started, 1)
    # STORE BOTH TABLES (his order 23 Nov 2026) — whatever Barchart did; the engine maps and posts the dealer map.
    stored = None
    if sentry or out["markets"]:
        stored = _app("/api/internal/options/snapshot", snapshot(run_id, slot, sentry, out["markets"], _app))
    if stored and stored.get("ok"):
        _app("/api/internal/barchart/levels", {"ok": True, "mapped": True, "runId": run_id, "slot": slot,
                                               "tookS": took})
        print(f"stored {stored.get('stored')} tables; investing {len(sentry)}, barchart {len(out['markets'])}")
        return 0
    if "error" in out or len(out["markets"]) != len(MARKETS):
        e = out.get("error") or RuntimeError("the page never ran")
        _app("/api/internal/barchart/levels", {"ok": False, "runId": run_id, "slot": slot, "tookS": took,
                                               "blocked": isinstance(e, PermissionError), "error": f"{e}"})
        print(f"FAILED: {e}", file=sys.stderr)
        return 1
    blocks = [section(n, s, d, got, expiry) for n, s, d, got in out["markets"]]
    message = M.format_post(slot, now, expiry, blocks)                       # the table is discarded with `out`
    _app("/api/internal/barchart/levels", {"ok": True, "runId": run_id, "slot": slot, "tookS": took,
                                           "message": message})
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main())
