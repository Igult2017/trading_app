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
from barchart_parse import is_blocked, parse_options                          # noqa: E402

BASE = "https://www.barchart.com"
MARKETS = [("GOLD", "GC", "XAU/USD", 2), ("EUR/USD", "E6", "EUR/USD", 5), ("GBP/USD", "B6", "GBP/USD", 5)]
FIELDS = ("strikePrice,optionType,lastPrice,optImpliedVolatility,delta,gamma,theta,vega,impliedVolatilitySkew,"
          "tradeTime")
CLOSE_POPUPS = """() => { for (const el of document.querySelectorAll('button, a')) {
    const t = (el.textContent || '').trim().toLowerCase();
    if (['accept', 'accept all', 'i agree', 'close', 'no thanks', 'not now', 'dismiss', '×', 'x'].includes(t)) {
      try { el.click(); } catch (e) {} } }
  for (const el of document.querySelectorAll('[class*="modal"], [class*="overlay"], [id*="modal"], [class*="popup"]'))
    { try { el.remove(); } catch (e) {} } }"""
MENUS = """() => Object.fromEntries([...document.querySelectorAll('select')].map((s, i) =>
    [i + ':' + (s.className || s.name || ''), [...s.options].map(o => [o.textContent.trim(), o.value])]))"""
FETCH = """async ([code, fut, fields]) => {
  const get = async (u) => { const r = await fetch(u, {credentials: 'include'}); return [r.status, await r.text()]; };
  return { opt: await get(`/proxies/core-api/v1/quotes/get?symbol=${code}&list=futures.options&fields=${encodeURIComponent(fields)}&groupBy=optionType&orderBy=strikePrice&orderDir=asc&raw=1`),
           fut: await get(`/proxies/core-api/v1/quotes/get?symbols=${fut}&fields=symbol,lastPrice&raw=1`) }; }"""


def _menu(menus: dict, part: str) -> list:
    """The menu whose CHOICES contain `part` ("Weekly Options", "Week "). Matched on what it offers, not on its name:
    the same menu came back under two different names on two loads of the same page (21 Nov 2026)."""
    return next((v for v in menus.values() if any(part in t for t, _ in v)), [])


def _settle(page, text: str) -> None:
    """Wait until the page has drawn the menu we read (it is built by the page's own script after load, so a fixed
    pause was too short), then close any ad / cookie popup over it. A menu that never appears is not an error here —
    the next step reports exactly what is missing, and a block page is caught by `is_blocked`."""
    # ONE RELOAD IF IT NEVER APPEARS (21 Nov 2026): the euro's weekly page came back with NO menus on a second visit in
    # the same session, yet drew all of them when opened on its own — a late draw, not a dead link.
    for attempt in (1, 2):
        try:
            page.wait_for_function(
                "t => [...document.querySelectorAll('select option')].some(o => o.textContent.includes(t))",
                arg=text, timeout=45_000)
            break
        except Exception:                                                       # noqa: BLE001
            if attempt == 1:
                page.reload(timeout=90_000, wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    page.evaluate(CLOSE_POPUPS)


def read_market(page, root: str, expiry) -> dict:
    """One market's chosen-expiry table + its futures price, read inside the open page."""
    page.goto(f"{BASE}/futures/quotes/{root}*0/volatility-greeks", timeout=90_000, wait_until="domcontentloaded")
    _settle(page, "Weekly Options")
    if is_blocked(page.title(), page.content()):
        raise PermissionError(f"blocked by Barchart on {root} (title {page.title()!r})")
    weekday = expiry.weekday()
    kinds = _menu(page.evaluate(MENUS), "Weekly Options")
    link = next((v for t, v in kinds if t.startswith(L.WEEKDAYS[weekday])), None)
    if not link:
        raise RuntimeError(f"{root}: no '{L.WEEKDAYS[weekday]} Weekly Options' on the page")
    page.goto(BASE + link, timeout=90_000, wait_until="domcontentloaded")
    _settle(page, "Week ")
    weeks = _menu(page.evaluate(MENUS), "Week ")
    chosen = L.choose_week(weeks, weekday, expiry)
    if not chosen:
        raise RuntimeError(f"{root}: no {L.WEEKDAYS[weekday]} options on or after {expiry:%d %b}")
    path, used = chosen
    parts = path.strip("/").split("/")                    # futures / quotes / GCZ26 / volatility-greeks / IY4X26
    fut_symbol, code = parts[2], parts[-1]
    got = page.evaluate(FETCH, [code, fut_symbol, FIELDS])
    if got["opt"][0] != 200 or got["fut"][0] != 200:
        raise PermissionError(f"{root}: Barchart answered {got['opt'][0]} / {got['fut'][0]}")
    rows = parse_options(json.loads(got["opt"][1]))
    futures = float(json.loads(got["fut"][1])["data"][0]["raw"]["lastPrice"])
    return {"rows": rows, "futures": futures, "contract": fut_symbol, "used": used}


def _app(path: str, payload: dict | None = None):
    app, secret = os.getenv("BC_APP"), os.getenv("BC_SECRET")
    if not (app and secret):
        return None
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


def main() -> int:
    from scrapling.fetchers import StealthyFetcher                           # only the container has it
    run_id, slot = os.getenv("BC_RUN_ID") or None, os.getenv("BC_SLOT") or "ln"
    now, started = datetime.now(timezone.utc), time.time()
    expiry, out = M.expiry_for(slot, now), {}

    # A FRESH BROWSER PER MARKET (21 Nov 2026): in one session the 4th page came back with no menus at all (the euro's
    # weekly page), while the same page opened fresh drew everything — Barchart gives one visit only a few full pages.
    # Each market needs two (its options page, then its weekday's page), so each gets its own visit.
    # INVESTING.COM FIRST (23 Nov 2026): its overnight table, three markets, one visit (`sentry_options`). A failure here
    # never stops Barchart — the engine then says the table could not be read.
    sentry: list[dict] = []

    def read_sentry(page):
        try:
            sentry.extend(S.read_all(page))
        except Exception as e:                                                # noqa: BLE001
            print(f"sentry: {type(e).__name__}: {e}", file=sys.stderr)
        return page

    try:
        StealthyFetcher.fetch(S.PANEL, headless=True, network_idle=True, page_action=read_sentry, timeout=120_000)
    except Exception as e:                                                    # noqa: BLE001
        print(f"sentry visit: {type(e).__name__}: {e}", file=sys.stderr)

    out["markets"] = []
    for name, root, sym, digits in MARKETS:
        if "error" in out:
            break

        def act(page, root=root, name=name, sym=sym, digits=digits):
            try:
                out["markets"].append((name, sym, digits, read_market(page, root, expiry)))
            except Exception as e:                                            # noqa: BLE001
                out["error"] = e
            return page

        StealthyFetcher.fetch(f"{BASE}/futures/quotes/{root}*0/volatility-greeks", headless=True,
                              solve_cloudflare=True, network_idle=True, page_action=act, timeout=120_000)
    took = round(time.time() - started, 1)
    # STORE BOTH TABLES (his order 23 Nov 2026) — whatever Barchart did; the engine maps and posts the dealer map.
    stored = _app("/api/internal/options/snapshot", snapshot(run_id, slot, sentry, out["markets"], _app))         if (sentry or out["markets"]) else None
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
