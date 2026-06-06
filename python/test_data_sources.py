"""
Data source candidates for 1M / 1H / 1D candles.
Run: python python/test_data_sources.py
"""
import sys, traceback
from datetime import datetime, timezone

PASS = "[OK]"
FAIL = "[FAIL]"
WARN = "[WARN]"

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def row(label, value):
    print(f"  {label:<28} {value}")

# ─────────────────────────────────────────────────────────────
# 1. YFINANCE
# ─────────────────────────────────────────────────────────────
section("1. yfinance  (already installed, no key)")

try:
    import yfinance as yf

    results = {}
    tests = [
        ("EURUSD=X",  "forex",   ["1m", "1h", "1d"]),
        ("BTC-USD",   "crypto",  ["1m", "1h", "1d"]),
        ("AAPL",      "stock",   ["1m", "1h", "1d"]),
    ]

    for symbol, kind, tfs in tests:
        for tf in tfs:
            period = "5d" if tf == "1m" else ("60d" if tf == "1h" else "1y")
            try:
                df = yf.download(symbol, period=period, interval=tf,
                                 progress=False, auto_adjust=True)
                n = len(df)
                status = PASS if n > 0 else FAIL
                row(f"{symbol} {tf}", f"{status}  {n} bars")
            except Exception as e:
                row(f"{symbol} {tf}", f"{FAIL}  {e}")

    print()
    row("API key required",     "No")
    row("1M lookback limit",    "7 days")
    row("1H lookback limit",    "730 days")
    row("1D lookback limit",    "Unlimited (adj)")
    row("Assets",               "Forex, Crypto, Stocks, Indices, Commodities")
    row("Rate limit",           "~2000 req/hour (unofficial)")
    row("Reliability",          f"{WARN}  Scrapes Yahoo — breaks occasionally")

except Exception as e:
    print(f"  {FAIL}  Import failed: {e}")

# ─────────────────────────────────────────────────────────────
# 2. CCXT + BINANCE  (crypto, no API key for public data)
# ─────────────────────────────────────────────────────────────
section("2. ccxt + Binance  (no key for public OHLCV)")

try:
    import ccxt

    exchange = ccxt.binance({"enableRateLimit": True})

    tests = [
        ("BTC/USDT", "1m",  100),
        ("BTC/USDT", "1h",  100),
        ("BTC/USDT", "1d",  100),
        ("ETH/USDT", "1m",  100),
        ("XRP/USDT", "1h",  100),
    ]

    for symbol, tf, limit in tests:
        try:
            ohlcv = exchange.fetch_ohlcv(symbol, tf, limit=limit)
            n = len(ohlcv)
            last_ts = datetime.fromtimestamp(ohlcv[-1][0]/1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
            row(f"{symbol} {tf}", f"{PASS}  {n} bars  last={last_ts} UTC")
        except Exception as e:
            row(f"{symbol} {tf}", f"{FAIL}  {e}")

    # Show all available timeframes
    tfs = list(exchange.timeframes.keys())
    print()
    row("API key required",     "No (public endpoints)")
    row("Available timeframes", " ".join(tfs))
    row("1M lookback",          "Unlimited (1000 bars per request, pageable)")
    row("Assets",               "Crypto only (500+ pairs on Binance)")
    row("Rate limit",           "1200 req/min (weight-based)")
    row("Reliability",          f"{PASS}  Very stable — official exchange API")
    row("Other exchanges",      "Bybit, OKX, Kraken, Coinbase, 100+ more via ccxt")

except Exception as e:
    print(f"  {FAIL}  {e}")

# ─────────────────────────────────────────────────────────────
# 3. OANDA  (forex + indices, needs demo account)
# ─────────────────────────────────────────────────────────────
section("3. OANDA  (forex + indices, free demo account)")

try:
    import oandapyV20
    import oandapyV20.endpoints.instruments as instruments
    import os

    token = os.getenv("OANDA_API_TOKEN", "")
    account_id = os.getenv("OANDA_ACCOUNT_ID", "")

    if not token:
        print(f"  {WARN}  OANDA_API_TOKEN not set in .env — skipping live test")
        print(f"       Get a free demo token at: https://developer.oanda.com")
    else:
        client = oandapyV20.API(access_token=token, environment="practice")
        tests = [
            ("EUR_USD", "M1",  50),
            ("EUR_USD", "H1",  50),
            ("EUR_USD", "D",   50),
            ("GBP_USD", "M1",  50),
            ("XAU_USD", "H1",  50),
        ]
        for instrument, granularity, count in tests:
            try:
                r = instruments.InstrumentsCandles(
                    instrument,
                    params={"granularity": granularity, "count": count}
                )
                client.request(r)
                candles = r.response["candles"]
                n = len([c for c in candles if c["complete"]])
                row(f"{instrument} {granularity}", f"{PASS}  {n} complete bars")
            except Exception as e:
                row(f"{instrument} {granularity}", f"{FAIL}  {e}")

    print()
    row("API key required",     "Yes — free demo at developer.oanda.com")
    row("OANDA granularities",  "S5 S10 S15 S30 M1 M2 M4 M5 M10 M15 M30 H1 H2 H3 H4 H6 H8 H12 D W M")
    row("1M lookback",          "~5000 candles per request (pageable)")
    row("Assets",               "Forex (70+ pairs), Indices, Commodities, Bonds")
    row("Rate limit",           "100 req/sec")
    row("Reliability",          f"{PASS}  Institutional broker, very reliable")
    row("Env vars needed",      "OANDA_API_TOKEN, OANDA_ACCOUNT_ID")

except Exception as e:
    print(f"  {FAIL}  {e}")

# ─────────────────────────────────────────────────────────────
# 4. TWELVE DATA  (multi-asset, free tier)
# ─────────────────────────────────────────────────────────────
section("4. Twelve Data  (stocks + forex + crypto, free tier)")

try:
    from twelvedata import TDClient
    import os

    key = os.getenv("TWELVE_DATA_API_KEY", "")

    if not key:
        print(f"  {WARN}  TWELVE_DATA_API_KEY not set — skipping live test")
        print(f"       Free at: https://twelvedata.com  (800 credits/day)")
    else:
        td = TDClient(apikey=key)
        tests = [
            ("EUR/USD", "1min",    "forex",   50),
            ("EUR/USD", "1h",      "forex",   50),
            ("EUR/USD", "1day",    "forex",   50),
            ("BTC/USD", "1min",    "crypto",  50),
            ("AAPL",    "1min",    "stock",   50),
        ]
        for symbol, interval, kind, n in tests:
            try:
                ts = td.time_series(symbol=symbol, interval=interval, outputsize=n).as_pandas()
                row(f"{symbol} {interval}", f"{PASS}  {len(ts)} bars")
            except Exception as e:
                row(f"{symbol} {interval}", f"{FAIL}  {e}")

    print()
    row("API key required",     "Yes — free tier: 800 credits/day")
    row("Available intervals",  "1min 5min 15min 30min 1h 2h 4h 1day 1week 1month")
    row("1M lookback",          "Unlimited on paid; 30 days free tier")
    row("Assets",               "Stocks, Forex, Crypto, ETFs, Indices")
    row("Rate limit",           "8 req/min on free tier")
    row("Reliability",          f"{PASS}  Reliable, well-documented API")
    row("Env var needed",       "TWELVE_DATA_API_KEY")

except Exception as e:
    print(f"  {FAIL}  {e}")

# ─────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────
section("SUMMARY")
print("""
  Source          Key?  1M  1H  1D  Assets              Best for
  -------------------------------------------------------------------
  yfinance        No    OK  OK  OK  Forex/Crypto/Stock  Quick prototyping
  ccxt+Binance    No    OK  OK  OK  Crypto only         Crypto strategies
  OANDA           Free  OK  OK  OK  Forex/Indices       Forex strategies *
  Twelve Data     Free  OK  OK  OK  All assets          Multi-asset *

  Recommendation for your signal platform:
  -------------------------------------------------------------------
  - Forex strategies  -> OANDA (already in CLAUDE.md plan, oandapyV20 installed)
  - Crypto strategies -> ccxt + Binance (free, no key, very reliable)
  - Stocks/indices    -> Twelve Data free tier or keep yfinance as fallback
""")
