"""
Investing.com stock data scraper.
Cloudflare bypass: curl_cffi iOS Safari 17.2 TLS impersonation — same technique as news_calendar.py.

Scrapes:
  indices  — major world indices (S&P 500, NASDAQ, Dow Jones, Nikkei, FTSE, DAX, VIX …)
  stocks   — individual US stock quotes from a watchlist via the search API
  all      — both (default)

Output: JSON to stdout.
Usage:
  python stocks_scraper.py              -> {"indices":[...], "stocks":[...]}
  python stocks_scraper.py indices
  python stocks_scraper.py stocks
"""

import sys
import json
import re
from bs4 import BeautifulSoup

try:
    import curl_cffi.requests as cffi_requests
    _CFFI_OK = True
except Exception:
    _CFFI_OK = False

BASE = "https://www.investing.com"

# Default watchlist — edit freely; symbols must match investing.com search
WATCHLIST = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA",
    "JPM", "V", "XOM", "UNH", "JNJ", "WMT", "HD", "PG",
]


def _session():
    s = cffi_requests.Session(impersonate="safari17_2_ios")
    s.get(BASE, timeout=15)          # prime Cloudflare cookies
    return s


# ── Indices ──────────────────────────────────────────────────────────────────

def _scrape_indices(s) -> list:
    url = f"{BASE}/indices/major-indices"
    resp = s.get(url, timeout=25)
    print(f"[stocks_scraper] indices HTTP {resp.status_code} ({len(resp.text)} bytes)", file=sys.stderr)

    if resp.status_code != 200:
        return []
    if "Just a moment" in resp.text or "cf-browser-verification" in resp.text:
        print("[stocks_scraper] indices: Cloudflare not bypassed", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    # Investing.com now uses CSS-module class names (datatable-v2_table__XXXXX).
    # Fall back through old selectors for any future reversions.
    table = (
        soup.find("table", class_=lambda c: c and "datatable-v2_table" in str(c)) or
        soup.find("table", {"id": "indicesMajorTable"}) or
        soup.find("table", class_=lambda c: c and "js-table-indices" in c) or
        soup.find("table", class_=lambda c: c and "genTbl" in str(c))
    )

    if not table:
        print("[stocks_scraper] indices: table not found in HTML", file=sys.stderr)
        return []

    results = []
    for row in table.find("tbody").find_all("tr"):
        try:
            tds = row.find_all("td")
            if len(tds) < 2:
                continue

            # td[0]: name is in the first div with mb-1.5 class (strip date/symbol suffix)
            name_div = tds[0].find("div", class_=lambda c: c and "mb-1.5" in str(c))
            name = name_div.get_text(strip=True) if name_div else tds[0].find("a").get_text(strip=True) if tds[0].find("a") else tds[0].get_text(strip=True)

            # td[1]: price in span.mb-1.5, change in span.mr-2, pct in the chg-pct span
            spans = tds[1].find_all("span")
            price      = spans[0].get_text(strip=True) if len(spans) > 0 else "-"
            change     = spans[1].get_text(strip=True) if len(spans) > 1 else "-"
            pct_change = spans[2].get_text(strip=True) if len(spans) > 2 else "-"

            if not name or not price:
                continue
            results.append({
                "name": name, "price": price,
                "change": change, "pctChange": pct_change,
                "volume": "-", "type": "index",
            })
        except Exception:
            continue

    print(f"[stocks_scraper] indices: {len(results)} rows", file=sys.stderr)
    return results


# ── Stocks (search API) ───────────────────────────────────────────────────────

def _search(s, symbol: str) -> dict | None:
    url = f"{BASE}/search/service/searchTopBar"
    resp = s.get(url, params={"q": symbol, "limit": 8}, timeout=15, headers={
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": BASE + "/",
    })
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except Exception:
        return None
    quotes = data.get("quotes", [])
    # Prefer equity type with exact symbol match
    for q in quotes:
        if q.get("symbol", "").upper() == symbol.upper() and q.get("type") == "equity":
            return q
    # Fallback: first equity result
    for q in quotes:
        if q.get("type") == "equity":
            return q
    return quotes[0] if quotes else None


def _scrape_stocks(s, symbols: list) -> list:
    results = []
    for sym in symbols:
        try:
            q = _search(s, sym)
            if not q:
                print(f"[stocks_scraper] {sym}: no result", file=sys.stderr)
                continue
            results.append({
                "symbol":    q.get("symbol",        sym),
                "name":      q.get("name",          sym),
                "price":     q.get("last",          "-"),
                "change":    q.get("change",        "-"),
                "pctChange": q.get("changePercent", "-"),
                "exchange":  q.get("exchange",      "-"),
                "type":      "stock",
            })
            print(f"[stocks_scraper] {sym}: {q.get('last', '?')}", file=sys.stderr)
        except Exception as exc:
            print(f"[stocks_scraper] {sym} error: {exc}", file=sys.stderr)
    return results


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    if not _CFFI_OK:
        print(json.dumps({"error": "curl_cffi not installed — run: pip install curl_cffi"}))
        sys.exit(1)

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    s = _session()

    if mode == "indices":
        print(json.dumps(_scrape_indices(s)))
    elif mode == "stocks":
        print(json.dumps(_scrape_stocks(s, WATCHLIST)))
    else:
        indices = _scrape_indices(s)
        stocks  = _scrape_stocks(s, WATCHLIST)
        print(json.dumps({"indices": indices, "stocks": stocks}))


if __name__ == "__main__":
    main()
