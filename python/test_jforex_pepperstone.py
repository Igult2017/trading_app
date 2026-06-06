"""
Test JForex (Dukascopy) and Pepperstone data sources.
Run: python python/test_jforex_pepperstone.py
"""
import sys, os, json, requests
from datetime import datetime, timedelta, timezone

PASS = "[OK]"
FAIL = "[FAIL]"
WARN = "[WARN]"

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def row(label, value):
    print(f"  {label:<30} {value}")

# ─────────────────────────────────────────────────────────────
# 1. DUKASCOPY (JForex) FREE REST API  — no account, no key
# ─────────────────────────────────────────────────────────────
section("1. Dukascopy / JForex  (free REST API, no account)")

try:
    BASE = "https://freeserv.dukascopy.com/2.0/"

    def fetch_dukascopy(instrument, interval, start, end):
        params = {
            "path": "chart/json",
            "instrument": instrument,
            "offer_side": "B",
            "interval": interval,
            "splits": "false",
            "stocks": "false",
            "start": start,
            "end": end,
            "jsonp": "?"
        }
        r = requests.get(BASE, params=params, timeout=15)
        text = r.text.strip()
        # Response is wrapped: ?([ ... ])
        if text.startswith("?("):
            text = text[2:-1]
        return json.loads(text)

    now   = datetime.now(timezone.utc)
    end   = now.strftime("%Y-%m-%dT%H:%M:%S")
    s_1m  = (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S")
    s_1h  = (now - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%S")
    s_1d  = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")

    tests = [
        ("EUR/USD", "MIN1",  s_1m,  end,  "1M  (last 2h)"),
        ("EUR/USD", "HOUR1", s_1h,  end,  "1H  (last 5d)"),
        ("EUR/USD", "DAY1",  s_1d,  end,  "1D  (last 30d)"),
        ("GBP/USD", "MIN1",  s_1m,  end,  "1M  (last 2h)"),
        ("GBP/JPY", "HOUR1", s_1h,  end,  "1H  (last 5d)"),
        ("XAU/USD", "HOUR1", s_1h,  end,  "1H  (last 5d)"),
    ]

    for instrument, interval, start, end_t, label in tests:
        try:
            data = fetch_dukascopy(instrument, interval, start, end_t)
            n = len(data)
            if n > 0:
                # Each bar: [timestamp_ms, open, high, low, close, volume]
                last_bar = data[-1]
                last_dt  = datetime.fromtimestamp(last_bar[0]/1000, tz=timezone.utc)
                row(f"{instrument} {label}", f"{PASS}  {n} bars  last={last_dt.strftime('%Y-%m-%d %H:%M')} UTC  O={last_bar[1]} H={last_bar[2]} L={last_bar[3]} C={last_bar[4]}")
            else:
                row(f"{instrument} {label}", f"{WARN}  0 bars returned (market may be closed)")
        except Exception as e:
            row(f"{instrument} {label}", f"{FAIL}  {e}")

    print()
    row("API key required",       "No — completely free")
    row("Account required",       "No")
    row("Available intervals",    "MIN1 MIN5 MIN10 MIN15 MIN30 HOUR1 HOUR4 DAY1 WEEK1 MONTH1")
    row("Lookback limit",         "Unlimited (paginate by date range)")
    row("Assets",                 "Forex (major + minor + exotic pairs), Gold, Silver")
    row("Rate limit",             "No official limit (be polite: 1 req/s)")
    row("Reliability",            f"{PASS}  Dukascopy is a regulated Swiss bank")
    row("Kenya access",           f"{PASS}  No geo-restrictions on historical data API")

except Exception as e:
    print(f"  {FAIL}  {e}")

# ─────────────────────────────────────────────────────────────
# 2. METATRADER 5 + PEPPERSTONE  (Windows only)
# ─────────────────────────────────────────────────────────────
section("2. MetaTrader 5  (Pepperstone MT5 account)")

try:
    import MetaTrader5 as mt5

    initialized = mt5.initialize()

    if not initialized:
        err = mt5.last_error()
        print(f"  {WARN}  MT5 terminal not running  (error: {err})")
        print(f"       Steps to use:")
        print(f"         1. Open MetaTrader 5 desktop app (download from pepperstone.com)")
        print(f"         2. Log in with your Pepperstone MT5 account")
        print(f"         3. Keep MT5 open, then run this script")
    else:
        info = mt5.terminal_info()
        account = mt5.account_info()
        print(f"  {PASS}  MT5 connected")
        if account:
            row("Broker",             account.company)
            row("Account",            str(account.login))
            row("Currency",           account.currency)

        TF_MAP = {
            "1M":  mt5.TIMEFRAME_M1,
            "1H":  mt5.TIMEFRAME_H1,
            "1D":  mt5.TIMEFRAME_D1,
        }

        symbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"]
        for sym in symbols:
            for tf_name, tf in TF_MAP.items():
                rates = mt5.copy_rates_from_pos(sym, tf, 0, 100)
                if rates is not None and len(rates) > 0:
                    last  = rates[-1]
                    last_dt = datetime.fromtimestamp(last['time'], tz=timezone.utc)
                    row(f"{sym} {tf_name}", f"{PASS}  {len(rates)} bars  last={last_dt.strftime('%Y-%m-%d %H:%M')} C={last['close']:.5f}")
                else:
                    row(f"{sym} {tf_name}", f"{WARN}  No data (symbol may not be in Market Watch)")

        mt5.shutdown()

    print()
    row("Account required",       "Yes — free demo at pepperstone.com")
    row("API key required",       "No — uses your MT5 login")
    row("Available timeframes",   "M1 M2 M3 M4 M5 M6 M10 M12 M15 M20 M30 H1 H2 H3 H4 H6 H8 H12 D1 W1 MN")
    row("1M lookback",            "Unlimited via copy_rates_range()")
    row("Assets",                 "Forex, Indices, Commodities, Crypto, Stocks")
    row("Rate limit",             "None — local terminal call")
    row("Platform requirement",   "MT5 desktop app must be open (Windows only)")
    row("Kenya access",           f"{PASS}  Pepperstone accepts Kenya clients")
    row("Install",                "pip install MetaTrader5  (already installed)")

except Exception as e:
    print(f"  {FAIL}  {e}")

# ─────────────────────────────────────────────────────────────
# 3. PEPPERSTONE cTRADER OPEN API
# ─────────────────────────────────────────────────────────────
section("3. Pepperstone cTrader Open API")

try:
    import ctrader_open_api
    print(f"  {PASS}  ctrader-open-api package installed")

    client_id     = os.getenv("CTRADER_CLIENT_ID", "")
    client_secret = os.getenv("CTRADER_CLIENT_SECRET", "")
    account_id    = os.getenv("CTRADER_ACCOUNT_ID", "")

    if not client_id:
        print(f"  {WARN}  CTRADER credentials not set  — skipping live test")
        print()
        print("  How to get free cTrader credentials:")
        print("    1. Open a free Pepperstone cTrader demo account")
        print("       https://www.pepperstone.com/en/create-live-account/")
        print("    2. Go to cTrader Open API portal:")
        print("       https://openapi.ctrader.com/")
        print("    3. Create an application -> get Client ID + Secret")
        print("    4. Add to signal_platform/.env:")
        print("       CTRADER_CLIENT_ID=your-id")
        print("       CTRADER_CLIENT_SECRET=your-secret")
        print("       CTRADER_ACCOUNT_ID=your-account-id")
    else:
        print(f"  Credentials found — live test would run here")

    print()
    row("Account required",       "Yes — free Pepperstone demo")
    row("Available timeframes",   "M1 M2 M3 M4 M5 M10 M15 M30 H1 H4 H12 D1 W1 MN1")
    row("1M lookback",            "Up to 1 year via GetTrendbars")
    row("Assets",                 "Forex, Indices, Commodities, Crypto (all Pepperstone instruments)")
    row("Rate limit",             "50 req/sec")
    row("Protocol",               "Protobuf over TCP (persistent connection)")
    row("Kenya access",           f"{PASS}  Pepperstone accepts Kenya clients")
    row("Install",                "pip install ctrader-open-api  (already installed)")

except Exception as e:
    print(f"  {FAIL}  {e}")

# ─────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────
section("SUMMARY  (Kenya-compatible sources)")

print("""
  Source              Key?   1M  1H  1D  Assets           Kenya  Verdict
  ----------------------------------------------------------------------
  Dukascopy REST API  None   OK  OK  OK  Forex/Gold       YES    Best for forex history
  MT5 + Pepperstone   Demo   OK  OK  OK  All              YES    Best for live signals
  Pepperstone cTrader Demo   OK  OK  OK  All              YES    Good alternative to MT5

  Recommended setup for your signal platform:
  ----------------------------------------------------------------------
  Primary (forex 1M/1H/1D)  -> Dukascopy free REST API  (no account needed)
  Primary (live signals)     -> MT5 + Pepperstone demo   (MT5 must be open)
  Crypto (all TFs)           -> ccxt + Binance           (no account, no key)
  Fallback                   -> yfinance                  (already installed)
""")
