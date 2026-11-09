"""
myfxbook_calendar.py — fetch the MyFXBook economic calendar through a stealth browser.

RUNS INSIDE A SHORT-LIVED CONTAINER, NEVER INSIDE THE APP. The app's own Dockerfile forbids a
browser in its image, in its own words: on 2026-09-07 a Chrome process that failed to shut down was
started every 15 minutes, the leak built up until the box ran out of memory, and the site and
Coolify both stopped answering. A container that EXITS answers that by construction — shutdown is
unconditional because nothing outlives the process, and the host can cap memory and CPU.

Usage (inside the scrapling image):
    python myfxbook_calendar.py                 -> JSON on stdout
    MFB_INGEST_URL=... MFB_SECRET=... python myfxbook_calendar.py   -> also POSTs it to the app

WHAT WAS MEASURED, 2026-11-09, so none of the numbers here are guesses:

  from the SERVER, solve_cloudflare=True   200, 351 rows, 210s and 381s   (2 of 2)
  from the SERVER, solver off              403 "Just a moment..."         (3 of 3)
  from a HOME connection                   200, 351 rows, 12-14s, no solver needed

⚠ THE SOLVER IS NOT OPTIONAL ON A SERVER. Cloudflare serves a datacentre address two challenges in
a row — the library logs `turnstile version "interactive"` and then `"managed"` — and a home
connection gets neither. That is why this is slow there and fast here, and why the timeout below is
generous rather than tight.

⚠ NEVER USE network_idle. Measured: it turned an 18-second fetch into 339 seconds, because the page
never goes quiet.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from myfxbook_parse import parse_rows            # noqa: E402
# The SAME rule ForexFactory rows go through — one copy, in `calendar_filter`, so the two sources
# can never disagree about his "no crypto, no stock news, commodities and forex only" instruction.
from calendar_filter import categorize, keep     # noqa: E402

#: `calPeriod=17` asks for a three-month window. Measured: the page answers with ~500 rows covering
#: about 11 days and caps there. 11 days ahead is the horizon; the default page gives only 8.
CALENDAR_URL = "https://www.myfxbook.com/forex-economic-calendar?calPeriod=17"

#: A HARD CEILING ON ONE FETCH, in milliseconds. The slowest measured run was 381s; 600s leaves room
#: for a bad day and still guarantees the process ends rather than hanging a container for ever.
FETCH_TIMEOUT_MS = 600_000

_CHALLENGE = ("just a moment", "cf_chl_opt", "challenge-platform", "cdn-cgi/challenge")


def _is_challenge(title: str, html: str) -> bool:
    """A challenge page is NOT data. Returning it would look like 'the calendar is empty today'."""
    low = (title or "").lower()
    return "just a moment" in low or (len(html) < 50_000 and any(m in html.lower() for m in _CHALLENGE))


def _cells(block: str, tag: str) -> list[str]:
    return [re.sub(r"<[^>]+>", " ", c) for c in re.findall(rf"<{tag}[^>]*>(.*?)</{tag}>", block, re.S)]


def extract_table(html: str) -> tuple[list[str], list[list[str]]]:
    """Pull the header row and every body row out, KEEPING BLANK CELLS.

    ⚠ Blanks must survive. A row whose Actual has not been published yet has an empty cell there;
    dropping it shifts every later column left, and those are exactly the rows that matter most.
    """
    thead = re.search(r"<thead.*?</thead>", html, re.S)
    headers = (_cells(thead.group(0), "th") or _cells(thead.group(0), "td")) if thead else []
    starts = [m.start() for m in re.finditer(r"<tr\b", html)]
    rows: list[list[str]] = []
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else len(html)
        rows.append(_cells(html[s:e], "td"))
    return headers, rows


def fetch(url: str = CALENDAR_URL) -> dict:
    """One fetch, one browser, and the browser is gone when this returns."""
    from scrapling.fetchers import StealthyFetcher     # imported late: only the container has it

    started = time.time()
    page = StealthyFetcher.fetch(
        url,
        headless=True,
        solve_cloudflare=True,     # required from a datacentre address; see the module docstring
        google_search=False,
        timeout=FETCH_TIMEOUT_MS,
    )
    took = round(time.time() - started, 1)
    html = page.html_content or ""
    title_m = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
    title = (title_m.group(1).strip() if title_m else "")

    if _is_challenge(title, html):
        raise RuntimeError(f"blocked by Cloudflare after {took}s (title {title!r}, {len(html)} bytes)")
    if getattr(page, "status", 0) != 200:
        raise RuntimeError(f"HTTP {getattr(page, 'status', '?')} after {took}s")

    headers, rows = extract_table(html)
    parsed = parse_rows(rows, headers, fetched_at=datetime.now(timezone.utc))
    if not parsed:
        raise RuntimeError(f"page loaded ({len(html)} bytes, title {title!r}) but no event rows parsed")

    # His rule, applied HERE rather than after storage: commodities and forex only.
    events = []
    for e in parsed:
        if not keep(e["event"], e["currency"]):
            continue
        e["category"] = categorize(e["event"], e["currency"])
        events.append(e)
    if not events:
        raise RuntimeError(f"{len(parsed)} rows parsed but every one was filtered out — check the rule")

    return {
        "source":    "myfxbook",
        "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "tookS":     took,
        "bytes":     len(html),
        "title":     title,
        "parsed":    len(parsed),
        "events":    events,
    }


def _post(body: str) -> bool | None:
    """Hand the result to the app. None = nowhere to send it; False = sending failed.

    ⚠ `x-admin-secret`, NOT `Authorization: Bearer`. That is the header the app's own
    `requireAdminSecret` guard reads (server/routes.ts:2771-2776); a bearer token is simply a 401,
    and I had written the wrong one before checking the guard.
    """
    url, secret = os.getenv("MFB_INGEST_URL"), os.getenv("MFB_SECRET")
    if not (url and secret):
        return None
    import urllib.request
    req = urllib.request.Request(
        url, data=body.encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "x-admin-secret": secret},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(f"posted -> HTTP {r.status}", file=sys.stderr)
        return True
    except Exception as e:
        print(f"POST failed: {type(e).__name__}: {e}", file=sys.stderr)
        return False


def main() -> int:
    try:
        payload = fetch()
    except Exception as e:
        # ⚠ FAIL LOUDLY AND SAY WHY. A silent empty result reads as "no events today", and an empty
        # calendar is a money defect here: it starved VIX.1's two news guards once already
        # (server/services/calendarDb.ts).
        fail = {"source": "myfxbook", "ok": False, "error": f"{type(e).__name__}: {e}",
                "runId": os.getenv("MFB_RUN_ID") or None, "kind": os.getenv("MFB_KIND") or "sweep"}
        # ⚠ A FAILURE IS REPORTED TOO, not just printed. If a refusal never reached the app the
        # backoff would never engage and being blocked would cost us nothing.
        _post(json.dumps(fail))
        print(json.dumps(fail), flush=True)
        return 1

    payload["ok"] = True
    # The app handed out this id when it allowed the fetch. Sending it back is what makes one
    # fetch exactly one row in `scrape_runs` — the rate limiter counts those rows.
    payload["runId"] = os.getenv("MFB_RUN_ID") or None
    payload["kind"] = os.getenv("MFB_KIND") or "sweep"
    body = json.dumps(payload)

    if _post(body) is False:
        print(body, flush=True)           # still print, so the run is not wasted
        return 2

    print(body, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
