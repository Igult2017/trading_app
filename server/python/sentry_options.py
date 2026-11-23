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

import re

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


def _wait_for(page, market: str) -> None:
    page.wait_for_function("m => document.body.innerText.includes(m + ' Options expiring')", arg=market,
                           timeout=30_000)
    page.wait_for_timeout(1500)


def read_all(page) -> list[dict]:
    """Every market's overnight table, read from the open panel. A market that does not show is left out (the engine
    then says "could not be read" for it) — never guessed."""
    out = []
    page.goto(PANEL, timeout=90_000, wait_until="domcontentloaded")
    _wait_for(page, "XAU/USD")
    for market in MARKETS:
        try:
            page.locator(f"text={market}").first.click(timeout=15_000)
            _wait_for(page, market)
            page.locator("text=O/N").first.click(timeout=15_000)          # overnight — clicked again after each switch
            page.wait_for_timeout(1500)
            got = parse_panel(page.evaluate("() => document.body.innerText"))
            if got["market"] == market and len(got["rows"]) >= 3:
                out.append(got)
        except Exception as e:                                          # noqa: BLE001 — one market never stops the rest
            print(f"sentry {market}: {type(e).__name__}: {e}")
    return out
