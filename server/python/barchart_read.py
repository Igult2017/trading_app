"""
barchart_read.py — READING ONE MARKET'S OPTIONS TABLE from Barchart's page (split out of `barchart_greeks.py` on
23 Nov 2026, which had passed the 200-line limit). His procedure (`docs/barchart-levels-plan.md`): the NEXT trading day's
expiry — that weekday's "Weekly Options", the week of that month — or, when the MONTHLY options expire that very day,
the monthly (found in the 23 Nov dry run: gold's December monthly expired Tue 24 Nov, so Tuesday's weekly menu jumped to
1 Dec). The data is the page's own request (`/proxies/core-api/v1/quotes/get?…list=futures.options…`), read inside it.
"""
from __future__ import annotations

import json

import barchart_levels as L
from barchart_parse import is_blocked, parse_options

BASE = "https://www.barchart.com"
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


def _fetch(page, root: str, code: str, fut_symbol: str, used) -> dict:
    got = page.evaluate(FETCH, [code, fut_symbol, FIELDS])
    if got["opt"][0] != 200 or got["fut"][0] != 200:
        raise PermissionError(f"{root}: Barchart answered {got['opt'][0]} / {got['fut'][0]}")
    rows = parse_options(json.loads(got["opt"][1]))
    futures = float(json.loads(got["fut"][1])["data"][0]["raw"]["lastPrice"])
    return {"rows": rows, "futures": futures, "contract": fut_symbol, "used": used}


def read_market(page, root: str, expiry) -> dict:
    """One market's chosen-expiry table + its futures price, read inside the open page."""
    page.goto(f"{BASE}/futures/quotes/{root}*0/volatility-greeks", timeout=90_000, wait_until="domcontentloaded")
    _settle(page, "Weekly Options")
    if is_blocked(page.title(), page.content()):
        raise PermissionError(f"blocked by Barchart on {root} (title {page.title()!r})")
    weekday = expiry.weekday()
    # The first page IS the monthly ("… expiration on 11/24/26"): when its date is the target day, read its own table.
    if L.monthly_expiry(page.evaluate("() => document.body.innerText")) == expiry:
        fut_symbol = page.url.split("/futures/quotes/")[1].split("/")[0].split("?")[0]
        return _fetch(page, root, fut_symbol, fut_symbol, expiry)
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
    return _fetch(page, root, parts[-1], parts[2], used)
