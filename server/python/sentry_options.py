"""
sentry_options.py — INVESTING.COM'S OVERNIGHT OPTIONS TABLE (his order, 23 Nov 2026; docs/options-levels.md).

The table on https://www.investing.com/currencies/xau-usd-options is not Investing.com's own: the page embeds the Sentry
Derivatives FX-options panel (`widget2.sentryd.com`, the panel id below, read from the page on 23 Nov). The panel works
its strikes out from price and volatility for each delta, so every strike is ALREADY a level on his chart (his point —
no conversion). We open the panel as a person would (the same disguised browser as the Barchart run), click "O/N" (his
guide: overnight-expiring options only), choose each market in its list and read the table AS SHOWN — never its private
data calls.

Pure part (tested on the text captured live 23 Nov): `parse_panel`. Browser part: `read_all(page)`, called from
`barchart_greeks.py` inside the same short-lived container, before Barchart.
"""
from __future__ import annotations

import random
import re

import popups

PANEL = "https://widget2.sentryd.com/widget/#/15490A29-95E3-4296-999E-28D0B35E0D12/XAU-USD/4"
MARKETS = ("XAU/USD", "EUR/USD", "GBP/USD")
_NUM = r"(-?\d+(?:\.\d+)?)"
_ROW = re.compile(r"\s*".join([_NUM] * 5) + r"\s*(\d+(?:\.\d+)?)%")
_HEAD = re.compile(r"([A-Z]{3}/[A-Z]{3}) Options expiring (\d{4}-\d{2}-\d{2})")


def parse_panel(text: str) -> dict:
    """{"market", "expiry", "rows": [{put_delta, put_price, strike, call_price, call_delta, iv}]} from the panel's text.
    Only the table between its header ("Imp Vol.") and the chart ("Implied") is read."""
    head = _HEAD.search(text or "")
    a = text.find("Imp Vol.") if text else -1
    b = text.find("Implied", a + 1) if a >= 0 else -1
    body = text[a + len("Imp Vol."):(b if b > a else len(text))] if a >= 0 else ""
    rows = [{"put_delta": float(m[0]), "put_price": float(m[1]), "strike": float(m[2]), "call_price": float(m[3]),
             "call_delta": float(m[4]), "iv": float(m[5])} for m in _ROW.findall(body)]
    return {"market": head.group(1) if head else None, "expiry": head.group(2) if head else None, "rows": rows}


LOAD_MS = 180_000           # patient (his ask 23 Nov 2026: "sometimes the pages take time to load") — was 90 s
SHOW_MS = 90_000            # the panel drawing a market's table — was 30 s
CLICK_MS = 30_000           # a click target appearing — was 15 s


def _wait_for(page, market: str) -> None:
    page.wait_for_function("m => document.body.innerText.includes(m + ' Options expiring')", arg=market,
                           timeout=SHOW_MS)
    _pause(page)


def _pause(page) -> None:
    """A person's pause between clicks — 2 to 5 seconds, never the same twice (his ask 23 Nov 2026: do the work while
    minimising the chance of being blocked; machine-regular timing is one of the easiest things to spot)."""
    page.wait_for_timeout(random.randint(2000, 5000))


def read_all(page, markets=MARKETS) -> list[dict]:
    """The overnight table of each of `markets`, read from the open panel. A market that does not show is left out (the
    run tries it again later — `barchart_greeks`) — never guessed."""
    out = []
    page.goto(PANEL, timeout=LOAD_MS, wait_until="domcontentloaded")
    popups.install(page)                       # ads / popups closed every second while we are on the panel
    _wait_for(page, "XAU/USD")
    for market in markets:
        try:
            page.locator(f"text={market}").first.click(timeout=CLICK_MS)
            _wait_for(page, market)
            page.locator("text=O/N").first.click(timeout=CLICK_MS)        # overnight — clicked again after each switch
            _pause(page)
            popups.sweep(page)                 # once more right before reading
            got = _settled_table(page, market)
            if got is not None:
                out.append(got)
            else:
                print(f"sentry {market}: the table never settled on {ROWS} rows — left for the next try")
        except Exception as e:                                          # noqa: BLE001 — one market never stops the rest
            print(f"sentry {market}: {type(e).__name__}: {e}")
    return out


ROWS = 7                    # the panel ALWAYS shows 7 strikes (deltas 0.10 … 0.90) — checked on gold, EUR, GBP


def _settled_table(page, market: str, reads: int = 5) -> dict | None:
    """THE TABLE ONLY WHEN IT IS FULLY DRAWN (23 Nov 2026 dry run: GBP/USD was read while its rows were still redrawing
    after the switch — 3 strikes of 7). Two reads in a row, 2-5 s apart, must both be for `market` with all 7 strikes;
    the newer is kept. NOT "identical": the panel re-prices live every few seconds and its strikes move with the price
    (measured the same morning — an exact-match rule refused gold and GBP). Up to `reads` reads, else None."""
    full_before = False
    for _ in range(reads):
        got = parse_panel(page.evaluate("() => document.body.innerText"))
        full = got["market"] == market and len(got["rows"]) == ROWS
        if full and full_before:
            return got
        full_before = full
        _pause(page)
    return None
