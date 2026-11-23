"""
barchart_snapshot.py — what the scraper run sends to be STORED (his order 23 Nov 2026: "you scrape data from both
platforms and store in the database"): Investing.com's overnight tables (`sentry_options`) and Barchart's near-the-money
rows with its judged picks, each pick converted to the level on his chart. The engine maps them (docs/options-levels.md).
"""
from __future__ import annotations

import urllib.parse

import barchart_levels as L


def picks_for(got: dict, spot: float) -> list[dict]:
    """Barchart's judged strikes for the PIX options map (23 Nov 2026): every full qualifier and near miss, both sides,
    each converted to the level on his chart (strike × spot ÷ futures). `fails` empty = a full qualifier."""
    out = []
    for kind, side in (("Call", L.BUY), ("Put", L.SELL)):
        ntm = L.near_the_money([r for r in got["rows"] if r["type"] == kind], got["futures"])
        full, near = L.pick(ntm, side, got["futures"])
        out += [{"side": side, "strike": r["strike"], "spot": round(L.spot_level(r["strike"], got["futures"], spot), 6),
                 "fails": r["fails"]} for r in full + near]
    return out


def snapshot(run_id, slot, sentry: list[dict], markets: list, app) -> dict:
    """Both tables of this open for `/api/internal/options/snapshot` — his order 23 Nov 2026: store them."""
    snaps = []
    for t in sentry:
        spot = (app(f"/api/internal/barchart/spot?symbol={urllib.parse.quote(t['market'])}") or {}).get("mid")
        snaps.append({"source": "investing", "market": t["market"], "expiry": t["expiry"], "spot": spot,
                      "futures": None, "rows": t["rows"], "picks": None})
    for _name, sym, _digits, got in markets:
        spot = (app(f"/api/internal/barchart/spot?symbol={urllib.parse.quote(sym)}") or {}).get("mid")
        ntm = [r for kind in ("Call", "Put")                     # the guide's "near the money": 10 strikes each side
               for r in L.near_the_money([x for x in got["rows"] if x["type"] == kind], got["futures"])]
        snaps.append({"source": "barchart", "market": sym, "expiry": f"{got['used']}", "spot": spot,
                      "futures": got["futures"], "rows": ntm, "picks": picks_for(got, spot) if spot else None})
    return {"runId": run_id, "slot": slot, "snapshots": snaps}
