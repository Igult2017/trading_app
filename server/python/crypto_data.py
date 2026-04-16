"""
crypto_data.py — Aggregated crypto market data for the dashboard.

Modes (pass as first CLI argument):
  market    — top coins (price, change, market cap, volume, sparkline)
  global    — total market cap, BTC dominance, volume, active coins
  feargreed — fear & greed index (current + 7-day history)
  trending  — trending coins on CoinGecko

All responses are printed as JSON to stdout.
"""

import sys
import json
import time
import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

CG_BASE = "https://api.coingecko.com/api/v3"

TOP_COINS = [
    "bitcoin", "ethereum", "tether", "binancecoin", "solana",
    "ripple", "usd-coin", "dogecoin", "cardano", "avalanche-2",
    "chainlink", "polkadot", "tron", "shiba-inu", "litecoin",
    "bitcoin-cash", "uniswap", "near", "internet-computer", "aptos",
]

def _cg_get(path: str, params: dict = {}, retries: int = 3) -> dict | list | None:
    """CoinGecko GET with retry on 429."""
    for attempt in range(retries):
        try:
            r = requests.get(f"{CG_BASE}{path}", params=params, headers=HEADERS, timeout=20)
            if r.status_code == 429:
                wait = 12 * (attempt + 1)
                print(f"[crypto_data] CoinGecko 429 — waiting {wait}s…", file=sys.stderr)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"[crypto_data] CG request failed ({attempt+1}/{retries}): {e}", file=sys.stderr)
            if attempt < retries - 1:
                time.sleep(5)
    return None


def fetch_market() -> list:
    """Top-20 coins with price, changes, market cap, volume, sparkline."""
    data = _cg_get("/coins/markets", {
        "vs_currency":              "usd",
        "ids":                      ",".join(TOP_COINS),
        "order":                    "market_cap_desc",
        "per_page":                 20,
        "page":                     1,
        "sparkline":                "true",
        "price_change_percentage":  "1h,24h,7d",
    })
    if not data:
        return []

    result = []
    for c in data:
        spark = []
        try:
            raw = c.get("sparkline_in_7d", {}).get("price", [])
            # Sample to ~40 points to keep payload small
            step = max(1, len(raw) // 40)
            spark = [round(p, 4) for p in raw[::step]]
        except Exception:
            pass

        result.append({
            "id":             c.get("id"),
            "symbol":         (c.get("symbol") or "").upper(),
            "name":           c.get("name"),
            "image":          c.get("image"),
            "price":          c.get("current_price"),
            "marketCap":      c.get("market_cap"),
            "rank":           c.get("market_cap_rank"),
            "volume24h":      c.get("total_volume"),
            "high24h":        c.get("high_24h"),
            "low24h":         c.get("low_24h"),
            "change1h":       c.get("price_change_percentage_1h_in_currency"),
            "change24h":      c.get("price_change_percentage_24h"),
            "change7d":       c.get("price_change_percentage_7d_in_currency"),
            "circulatingSupply": c.get("circulating_supply"),
            "maxSupply":      c.get("max_supply"),
            "ath":            c.get("ath"),
            "athChangePercent": c.get("ath_change_percentage"),
            "sparkline":      spark,
            "lastUpdated":    c.get("last_updated"),
        })
    print(f"[crypto_data] market: {len(result)} coins", file=sys.stderr)
    return result


def fetch_global() -> dict:
    """Global crypto market statistics."""
    data = _cg_get("/global")
    if not data:
        return {}
    d = data.get("data", data)
    mc = d.get("market_cap_percentage", {})
    return {
        "totalMarketCap":     d.get("total_market_cap", {}).get("usd"),
        "totalVolume24h":     d.get("total_volume", {}).get("usd"),
        "btcDominance":       round(mc.get("btc", 0), 2),
        "ethDominance":       round(mc.get("eth", 0), 2),
        "activeCryptocurrencies": d.get("active_cryptocurrencies"),
        "markets":            d.get("markets"),
        "marketCapChange24h": d.get("market_cap_change_percentage_24h_usd"),
    }


def fetch_fear_greed() -> dict:
    """Fear & Greed index (current + 7-day history) from alternative.me."""
    try:
        r = requests.get(
            "https://api.alternative.me/fng/",
            params={"limit": 8},
            headers=HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        raw = r.json().get("data", [])
        history = []
        for entry in raw:
            history.append({
                "value":          int(entry.get("value", 0)),
                "classification": entry.get("value_classification", ""),
                "timestamp":      int(entry.get("timestamp", 0)),
            })
        current = history[0] if history else {}
        print(f"[crypto_data] fear/greed: {current.get('value')} ({current.get('classification')})", file=sys.stderr)
        return {"current": current, "history": history[1:]}
    except Exception as e:
        print(f"[crypto_data] fear/greed failed: {e}", file=sys.stderr)
        return {}


def fetch_trending() -> list:
    """Trending coins on CoinGecko (top 7 by search volume)."""
    data = _cg_get("/search/trending")
    if not data:
        return []
    result = []
    for item in data.get("coins", [])[:7]:
        c = item.get("item", {})
        result.append({
            "id":    c.get("id"),
            "name":  c.get("name"),
            "symbol": (c.get("symbol") or "").upper(),
            "rank":  c.get("market_cap_rank"),
            "image": c.get("small"),
            "price": c.get("data", {}).get("price"),
            "change24h": c.get("data", {}).get("price_change_percentage_24h", {}).get("usd"),
            "score": c.get("score"),
        })
    print(f"[crypto_data] trending: {len(result)} coins", file=sys.stderr)
    return result


def fetch_all() -> dict:
    """Fetch everything in one call to reduce spawning overhead."""
    market    = fetch_market()
    time.sleep(2)   # respect free-tier rate limits between calls
    global_   = fetch_global()
    time.sleep(1)
    fear_greed = fetch_fear_greed()
    time.sleep(2)
    trending  = fetch_trending()
    return {
        "market":    market,
        "global":    global_,
        "fearGreed": fear_greed,
        "trending":  trending,
    }


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode == "market":
        output = fetch_market()
    elif mode == "global":
        output = fetch_global()
    elif mode == "feargreed":
        output = fetch_fear_greed()
    elif mode == "trending":
        output = fetch_trending()
    else:
        output = fetch_all()

    print(json.dumps(output))
