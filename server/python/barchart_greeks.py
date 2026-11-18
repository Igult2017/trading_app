"""
barchart_greeks.py — fetch Barchart's futures-options Greeks & volatility (19 Nov 2026). SWITCHED OFF until he says
otherwise: the app's `BARCHART_ENABLED` (default off) refuses every claim, so the host runner never gets this far.

His rule: six fetches a day — five minutes after the Asia, London and New York opens and again 15 minutes later
(`server/scrapers/bcLimits.ts`). The shape copies the MyFXBook scraper exactly: RUNS INSIDE A SHORT-LIVED CONTAINER
THAT IS REMOVED ON EXIT (`scripts/bc/run.sh`), never inside the app, and hands its rows back to the app.

⚠ ONE DELIBERATE DIFFERENCE: NO CLOUDFLARE-CHALLENGE SOLVER. Barchart's terms forbid robots, so this opens the page
as a PLAIN browser, once. If Barchart answers with a challenge or a refusal, the run is reported BLOCKED and the app
skips the rest of the day — it never tries to get past the challenge. (A plain visit on 19 Nov returned the full
table.) If it is blocked from the server, the clean route is Barchart's paid data service.

THE DATA is the page's OWN request — `/proxies/core-api/v1/quotes/get?...list=futures.options...` — caught as the page
loads it; nothing extra is asked of Barchart.

Usage (inside the container):  BC_INGEST_URL=... BC_SECRET=... BC_RUN_ID=... BC_SLOT=... python barchart_greeks.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from barchart_parse import is_blocked, parse_options, parse_underlying      # noqa: E402

#: The pages to read. Gold (front month) now; he adds others.
PAGES = {"GC*0": "https://www.barchart.com/futures/quotes/GC*0/volatility-greeks?futuresOptionsView=merged"}
TIMEOUT_MS = 120_000          # one page; the container itself is killed at 300 s by the host runner
DATA_MARK = ("core-api/v1/quotes/get", "futures.options")


def fetch(url: str) -> dict:
    """One plain browser, one page, closed when this returns."""
    from playwright.sync_api import sync_playwright      # imported late: only the container has it

    started, caught = time.time(), {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()

            def on_response(r):
                if all(m in r.url for m in DATA_MARK) and "body" not in caught:
                    try:
                        caught["body"] = r.json()
                    except Exception as exc:                                  # noqa: BLE001
                        caught["error"] = f"unreadable data response: {exc}"

            page.on("response", on_response)
            resp = page.goto(url, timeout=TIMEOUT_MS, wait_until="domcontentloaded")
            deadline = time.time() + 60
            while "body" not in caught and "error" not in caught and time.time() < deadline:
                page.wait_for_timeout(500)
            html, title = page.content(), page.title()
            status = resp.status if resp else 0
        finally:
            browser.close()
    took = round(time.time() - started, 1)
    if status in (401, 403, 429) or is_blocked(title, html):
        raise PermissionError(f"blocked by Barchart (HTTP {status}, title {title!r}) after {took}s")
    if "body" not in caught:
        raise RuntimeError(caught.get("error") or f"page loaded (HTTP {status}) but its options data never arrived")
    rows = parse_options(caught["body"])
    if not rows:
        raise RuntimeError("options data arrived but held no usable rows")
    symbol, underlying = parse_underlying(html)
    return {"symbol": symbol or "unknown", "underlying": underlying, "rows": rows, "tookS": took}


def _post(payload: dict) -> bool | None:
    url, secret = os.getenv("BC_INGEST_URL"), os.getenv("BC_SECRET")
    if not (url and secret):
        return None
    import urllib.request
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "x-admin-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(f"posted -> HTTP {r.status}", file=sys.stderr)
        return True
    except Exception as e:                                                    # noqa: BLE001
        print(f"POST failed: {type(e).__name__}: {e}", file=sys.stderr)
        return False


def main() -> int:
    run_id, slot = os.getenv("BC_RUN_ID") or None, os.getenv("BC_SLOT") or "manual"
    rc = 0
    for key, url in PAGES.items():
        try:
            got = fetch(url)
            payload = {"ok": True, "runId": run_id, "slot": slot, **got}
        except Exception as e:                                                # noqa: BLE001
            payload = {"ok": False, "runId": run_id, "slot": slot, "page": key,
                       "blocked": isinstance(e, PermissionError), "error": f"{type(e).__name__}: {e}"}
            rc = 1
        if _post(payload) is False:
            rc = 2
        print(json.dumps({k: v for k, v in payload.items() if k != "rows"} | {"rows": len(payload.get("rows", []))}),
              flush=True)
        if not payload["ok"]:
            break                       # blocked or broken: do not go on to the next page
    return rc


if __name__ == "__main__":
    sys.exit(main())
