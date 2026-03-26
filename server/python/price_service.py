#!/usr/bin/env python3
"""
Price Service - Fetches real-time price data using tessa library
Supports Yahoo Finance (stocks, forex, commodities) and Coingecko (crypto)
"""

import sys
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

try:
    from tessa import Symbol
    import yfinance as yf
    from pycoingecko import CoinGeckoAPI
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}"}))
    sys.exit(1)

# Initialize CoinGecko API
cg = CoinGeckoAPI()

# Mapping of common crypto symbols to CoinGecko IDs
CRYPTO_ID_MAP = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "BNB": "binancecoin",
    "XRP": "ripple",
    "ADA": "cardano",
    "SOL": "solana",
    "DOGE": "dogecoin",
    "DOT": "polkadot",
    "MATIC": "matic-network",
    "SHIB": "shiba-inu",
    "LTC": "litecoin",
    "AVAX": "avalanche-2",
    "LINK": "chainlink",
    "UNI": "uniswap",
    "ATOM": "cosmos",
}

# Forex pairs mapping for Yahoo Finance
FOREX_MAP = {
    "EUR/USD": "EURUSD=X",
    "GBP/USD": "GBPUSD=X",
    "USD/JPY": "USDJPY=X",
    "USD/CHF": "USDCHF=X",
    "AUD/USD": "AUDUSD=X",
    "NZD/USD": "NZDUSD=X",
    "USD/CAD": "USDCAD=X",
    "EUR/GBP": "EURGBP=X",
    "EUR/JPY": "EURJPY=X",
    "GBP/JPY": "GBPJPY=X",
    "EUR/CHF": "EURCHF=X",
    "GBP/CHF": "GBPCHF=X",
    "AUD/JPY": "AUDJPY=X",
    "NZD/JPY": "NZDJPY=X",
    "CAD/JPY": "CADJPY=X",
    "CHF/JPY": "CHFJPY=X",
    "EUR/AUD": "EURAUD=X",
    "EUR/CAD": "EURCAD=X",
    "EUR/NZD": "EURNZD=X",
    "GBP/AUD": "GBPAUD=X",
    "GBP/CAD": "GBPCAD=X",
    "GBP/NZD": "GBPNZD=X",
    "AUD/CAD": "AUDCAD=X",
    "AUD/CHF": "AUDCHF=X",
    "AUD/NZD": "AUDNZD=X",
    "NZD/CAD": "NZDCAD=X",
    "NZD/CHF": "NZDCHF=X",
    "CAD/CHF": "CADCHF=X",
}

# Commodities mapping for Yahoo Finance
COMMODITIES_MAP = {
    "XAU/USD": "GC=F",      # Gold
    "XAG/USD": "SI=F",      # Silver
    "WTI": "CL=F",          # WTI Crude Oil
    "BRENT": "BZ=F",        # Brent Crude Oil
    "NGAS": "NG=F",         # Natural Gas
    "COPPER": "HG=F",       # Copper
}

# US Indices mapping for Yahoo Finance
INDEX_MAP = {
    "US100": "^NDX",        # NASDAQ 100
    "US500": "^GSPC",       # S&P 500
    "US30": "^DJI",         # Dow Jones Industrial Average
    "UK100": "^FTSE",       # FTSE 100
    "GER40": "^GDAXI",      # DAX 40
    "JP225": "^N225",       # Nikkei 225
    "AUS200": "^AXJO",      # ASX 200
    "RUSSELL2000": "^RUT",  # Russell 2000
    "VIX": "^VIX",          # Volatility Index
    "NASDAQ": "^IXIC",      # NASDAQ Composite
    "SPX": "^GSPC",         # S&P 500 alternative name
    "DJI": "^DJI",          # Dow Jones alternative name
}


def get_yahoo_price(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Fetch price from Yahoo Finance using intraday history.
    Uses 5-min bars for the last 2 days: last bar = current price,
    first bar of today = today's open, first bar of period = prev close.
    """
    try:
        ticker = yf.Ticker(symbol)
        # 5-minute bars for last 2 trading days — gives us ~current price
        hist = ticker.history(period="2d", interval="5m")
        if hist.empty:
            # Fallback to daily bars
            hist = ticker.history(period="5d", interval="1d")
        if hist.empty:
            return None

        current_price = float(hist['Close'].iloc[-1])
        # Use first bar of previous day as prev_close
        # Split by date
        import pandas as pd
        today = hist.index[-1].date()
        prev_bars = hist[hist.index.date < today]
        prev_close = float(prev_bars['Close'].iloc[-1]) if not prev_bars.empty else float(hist['Close'].iloc[0])
        change = current_price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0
        high  = float(hist['High'].iloc[-1])
        low   = float(hist['Low'].iloc[-1])
        open_p = float(hist['Open'].iloc[0])
        volume = int(hist['Volume'].sum()) if 'Volume' in hist.columns else 0
        return {
            "symbol": symbol,
            "price": current_price,
            "change": change,
            "changePercent": change_pct,
            "high": high,
            "low": low,
            "open": open_p,
            "previousClose": prev_close,
            "volume": volume,
            "timestamp": datetime.now().isoformat(),
            "source": "yahoo"
        }
    except Exception:
        pass
    return None


def get_coingecko_price(coin_id: str) -> Optional[Dict[str, Any]]:
    """Fetch price from CoinGecko"""
    try:
        data = cg.get_price(
            ids=coin_id,
            vs_currencies='usd',
            include_24hr_change=True,
            include_24hr_vol=True,
            include_market_cap=True
        )
        
        if coin_id in data:
            coin_data = data[coin_id]
            return {
                "symbol": coin_id,
                "price": coin_data.get('usd', 0),
                "change": 0,  # CoinGecko doesn't provide absolute change
                "changePercent": coin_data.get('usd_24h_change', 0),
                "volume": coin_data.get('usd_24h_vol', 0),
                "marketCap": coin_data.get('usd_market_cap', 0),
                "timestamp": datetime.now().isoformat(),
                "source": "coingecko"
            }
    except Exception as e:
        pass
    return None


def symbol_to_yf(symbol: str, asset_class: str) -> str:
    """Convert an app symbol to its Yahoo Finance ticker string."""
    if asset_class == "crypto":
        base = symbol.replace("/USDT", "").replace("/USD", "").replace("-USD", "").upper()
        return f"{base}-USD"
    elif asset_class == "forex":
        yf_sym = FOREX_MAP.get(symbol)
        if yf_sym:
            return yf_sym
        return symbol.replace("/", "") + "=X"
    elif asset_class == "commodity":
        return COMMODITIES_MAP.get(symbol, symbol)
    else:  # stock / index
        return INDEX_MAP.get(symbol.upper(), symbol)


def get_price(symbol: str, asset_class: str = "stock") -> Dict[str, Any]:
    """
    Get price for a symbol based on asset class
    
    Args:
        symbol: The trading symbol (e.g., "AAPL", "EUR/USD", "BTC/USD")
        asset_class: One of "stock", "forex", "commodity", "crypto"
    
    Returns:
        Price data dictionary
    """
    result = {"symbol": symbol, "assetClass": asset_class, "error": None}
    
    try:
        if asset_class == "crypto":
            # Use yfinance directly (BTC-USD, ETH-USD, etc.) — faster and more reliable
            base_symbol = symbol.replace("/USDT", "").replace("/USD", "").replace("-USD", "").upper()
            yahoo_symbol = f"{base_symbol}-USD"
            price_data = get_yahoo_price(yahoo_symbol)
            if price_data:
                result.update(price_data)
                result["symbol"] = symbol
            else:
                # Fallback to CoinGecko
                coin_id = CRYPTO_ID_MAP.get(base_symbol, base_symbol.lower())
                price_data = get_coingecko_price(coin_id)
                if price_data:
                    result.update(price_data)
                    result["symbol"] = symbol
                else:
                    result["error"] = f"Could not fetch crypto price for {symbol}"
                    
        elif asset_class == "forex":
            # Handle forex pairs
            yahoo_symbol = FOREX_MAP.get(symbol)
            if yahoo_symbol:
                price_data = get_yahoo_price(yahoo_symbol)
                if price_data:
                    result.update(price_data)
                    result["symbol"] = symbol
                else:
                    result["error"] = f"Could not fetch forex price for {symbol}"
            else:
                # Try constructing the Yahoo symbol
                clean_symbol = symbol.replace("/", "") + "=X"
                price_data = get_yahoo_price(clean_symbol)
                if price_data:
                    result.update(price_data)
                    result["symbol"] = symbol
                else:
                    result["error"] = f"Unknown forex pair: {symbol}"
                    
        elif asset_class == "commodity":
            # Handle commodities
            yahoo_symbol = COMMODITIES_MAP.get(symbol)
            if yahoo_symbol:
                price_data = get_yahoo_price(yahoo_symbol)
                if price_data:
                    result.update(price_data)
                    result["symbol"] = symbol
                else:
                    result["error"] = f"Could not fetch commodity price for {symbol}"
            else:
                result["error"] = f"Unknown commodity: {symbol}"
                
        else:  # stock
            # Check if it's an index first
            yahoo_symbol = INDEX_MAP.get(symbol.upper(), symbol)
            price_data = get_yahoo_price(yahoo_symbol)
            if price_data:
                result.update(price_data)
                result["symbol"] = symbol  # Keep original symbol name
            else:
                result["error"] = f"Could not fetch stock price for {symbol}"
                
    except Exception as e:
        result["error"] = str(e)
    
    return result


def get_candles(symbol: str, asset_class: str = "stock", interval: str = "5m", period: str = "5d") -> Dict[str, Any]:
    """
    Fetch OHLCV candle history for a symbol using yfinance.
    Returns list of candle dicts with optional indicator values embedded.
    Indicators are computed with pandas-ta when available.
    """
    try:
        # Resolve the Yahoo Finance symbol
        if asset_class == "crypto":
            base = symbol.replace("/USDT", "").replace("/USD", "").replace("-USD", "").upper()
            yf_symbol = f"{base}-USD"
        elif asset_class == "forex":
            yf_symbol = FOREX_MAP.get(symbol, symbol.replace("/", "") + "=X")
        elif asset_class == "commodity":
            yf_symbol = COMMODITIES_MAP.get(symbol, symbol)
        else:  # stock / index
            yf_symbol = INDEX_MAP.get(symbol.upper(), symbol)

        ticker = yf.Ticker(yf_symbol)
        hist = ticker.history(period=period, interval=interval)

        if hist.empty:
            return {"symbol": symbol, "candles": [], "error": "No data returned"}

        import pandas as pd
        df = hist[["Open", "High", "Low", "Close", "Volume"]].copy()
        df.columns = ["open", "high", "low", "close", "volume"]

        # ── Compute indicators with pandas-ta ────────────────────────────────
        try:
            import pandas_ta as ta

            def _col(frame, prefix: str):
                """Return first column whose name starts with prefix, or None."""
                if frame is None or frame.empty:
                    return None
                matches = [c for c in frame.columns if c.upper().startswith(prefix.upper())]
                return frame[matches[0]] if matches else None

            # ── TREND ──────────────────────────────────────────────────────
            for length in [9, 21, 50, 100, 200]:
                df[f"ema{length}"] = ta.ema(df["close"], length=length)
                df[f"sma{length}"] = ta.sma(df["close"], length=length)

            df["wma20"]  = ta.wma(df["close"],  length=20)
            df["hma20"]  = ta.hma(df["close"],  length=20)
            df["dema20"] = ta.dema(df["close"], length=20)
            df["tema20"] = ta.tema(df["close"], length=20)

            # Bollinger Bands — pandas-ta columns: BBL, BBM, BBU, BBB, BBP
            bb = ta.bbands(df["close"], length=20, std=2)
            if bb is not None and not bb.empty:
                df["bb_upper"] = _col(bb, "BBU")
                df["bb_lower"] = _col(bb, "BBL")
                df["bb_mid"]   = _col(bb, "BBM")
                df["bb_width"] = _col(bb, "BBB")
                df["bb_pct"]   = _col(bb, "BBP")

            # Keltner Channel — pandas-ta columns: KCLe (lower), KCBe (basis), KCUe (upper)
            kc = ta.kc(df["high"], df["low"], df["close"], length=20)
            if kc is not None and not kc.empty:
                df["kc_lower"] = _col(kc, "KCL")
                df["kc_mid"]   = _col(kc, "KCB")
                df["kc_upper"] = _col(kc, "KCU")

            # Donchian Channel — pandas-ta columns: DCL (lower), DCM (mid), DCU (upper)
            dc = ta.donchian(df["high"], df["low"], lower_length=20, upper_length=20)
            if dc is not None and not dc.empty:
                df["dc_lower"] = _col(dc, "DCL")
                df["dc_mid"]   = _col(dc, "DCM")
                df["dc_upper"] = _col(dc, "DCU")

            # VWAP
            try:
                df["vwap"] = ta.vwap(df["high"], df["low"], df["close"], df["volume"])
            except Exception:
                pass

            # Supertrend — pandas-ta columns: SUPERT_x_x (value), SUPERTd (dir), SUPERTl, SUPERTs
            try:
                st = ta.supertrend(df["high"], df["low"], df["close"], length=7, multiplier=3.0)
                if st is not None and not st.empty:
                    # Pick column that is SUPERT_ but NOT SUPERTd/l/s
                    val_cols = [c for c in st.columns
                                if c.upper().startswith("SUPERT_") and c.upper() not in
                                [x.upper() for x in st.columns if any(x.upper().startswith(p) for p in ["SUPERTD","SUPERTL","SUPERTS"])]]
                    if val_cols:
                        df["supertrend"] = st[val_cols[0]]
            except Exception:
                pass

            # Parabolic SAR — pandas-ta columns: PSARl_x_x (long), PSARs_x_x (short)
            try:
                psar_df = ta.psar(df["high"], df["low"], df["close"])
                if psar_df is not None and not psar_df.empty:
                    # Combine long + short into one series (whichever is not NaN)
                    psar_l = _col(psar_df, "PSARl")
                    psar_s = _col(psar_df, "PSARs")
                    if psar_l is not None and psar_s is not None:
                        df["psar"] = psar_l.combine_first(psar_s)
                    elif psar_l is not None:
                        df["psar"] = psar_l
            except Exception:
                pass

            # ── MOMENTUM ───────────────────────────────────────────────────
            df["rsi"]   = ta.rsi(df["close"],  length=14)
            df["cci"]   = ta.cci(df["high"], df["low"], df["close"], length=20)
            df["roc"]   = ta.roc(df["close"],  length=10)
            df["mom"]   = ta.mom(df["close"],  length=10)
            df["cmo"]   = ta.cmo(df["close"],  length=14)
            df["willr"] = ta.willr(df["high"], df["low"], df["close"], length=14)
            df["dpo"]   = ta.dpo(df["close"],  length=20)

            try:
                df["tsi"] = ta.tsi(df["close"])
            except Exception:
                pass
            try:
                df["uo"] = ta.uo(df["high"], df["low"], df["close"])
            except Exception:
                pass
            try:
                df["ao"] = ta.ao(df["high"], df["low"])
            except Exception:
                pass

            # MACD — pandas-ta columns: MACD_f_s_sig, MACDh_f_s_sig, MACDs_f_s_sig
            macd = ta.macd(df["close"], fast=12, slow=26, signal=9)
            if macd is not None and not macd.empty:
                df["macd"]        = _col(macd, "MACD_")
                df["macd_hist"]   = _col(macd, "MACDh")
                df["macd_signal"] = _col(macd, "MACDs")

            # Stochastic — pandas-ta columns: STOCHk_k_d_s, STOCHd_k_d_s
            stoch = ta.stoch(df["high"], df["low"], df["close"], k=14, d=3)
            if stoch is not None and not stoch.empty:
                df["stoch_k"] = _col(stoch, "STOCHk")
                df["stoch_d"] = _col(stoch, "STOCHd")

            # Stochastic RSI — pandas-ta columns: STOCHRSIk, STOCHRSId
            try:
                srsi = ta.stochrsi(df["close"], length=14)
                if srsi is not None and not srsi.empty:
                    df["stochrsi_k"] = _col(srsi, "STOCHRSIk")
                    df["stochrsi_d"] = _col(srsi, "STOCHRSId")
            except Exception:
                pass

            # PPO — pandas-ta column: PPO_fast_slow_sig
            try:
                ppo = ta.ppo(df["close"], fast=12, slow=26)
                if ppo is not None and not ppo.empty:
                    df["ppo"] = _col(ppo, "PPO_")
            except Exception:
                pass

            # ── VOLUME ─────────────────────────────────────────────────────
            df["obv"] = ta.obv(df["close"], df["volume"])
            df["cmf"] = ta.cmf(df["high"], df["low"], df["close"], df["volume"], length=20)
            df["mfi"] = ta.mfi(df["high"], df["low"], df["close"], df["volume"], length=14)
            df["ad"]  = ta.ad(df["high"], df["low"], df["close"], df["volume"])

            try:
                df["pvt"] = ta.pvt(df["close"], df["volume"])
            except Exception:
                pass

            try:
                df["vwma20"] = ta.vwma(df["close"], df["volume"], length=20)
            except Exception:
                pass

            try:
                df["efi"] = ta.efi(df["close"], df["volume"], length=13)
            except Exception:
                pass

            # ── VOLATILITY / STRENGTH ──────────────────────────────────────
            df["atr"] = ta.atr(df["high"], df["low"], df["close"], length=14)
            df["tr"]  = ta.true_range(df["high"], df["low"], df["close"])

            try:
                df["ui"] = ta.ui(df["close"], length=14)
            except Exception:
                pass

            # ADX + DI lines
            adx = ta.adx(df["high"], df["low"], df["close"], length=14)
            if adx is not None and not adx.empty:
                acols = adx.columns.tolist()
                df["adx"] = adx[acols[0]] if len(acols) > 0 else None
                df["dip"] = adx[acols[1]] if len(acols) > 1 else None
                df["dim"] = adx[acols[2]] if len(acols) > 2 else None

            # Aroon
            try:
                aroon = ta.aroon(df["high"], df["low"], length=14)
                if aroon is not None and not aroon.empty:
                    arcols = aroon.columns.tolist()
                    df["aroon_dn"]  = aroon[arcols[0]] if len(arcols) > 0 else None
                    df["aroon_up"]  = aroon[arcols[1]] if len(arcols) > 1 else None
                    df["aroon_osc"] = aroon[arcols[2]] if len(arcols) > 2 else None
            except Exception:
                pass

            # TRIX
            try:
                df["trix"] = ta.trix(df["close"], length=18)
            except Exception:
                pass

        except ImportError:
            pass  # pandas-ta not installed — candles returned without indicators

        # ── Build output ─────────────────────────────────────────────────────
        IND_COLS = [
            "ema9","ema21","ema50","ema100","ema200",
            "sma9","sma20","sma50","sma100","sma200",
            "wma20","hma20","dema20","tema20",
            "bb_upper","bb_lower","bb_mid","bb_width","bb_pct",
            "kc_upper","kc_lower","kc_mid",
            "dc_upper","dc_lower","dc_mid",
            "vwap","supertrend","psar",
            "rsi","cci","roc","mom","cmo","willr","dpo","tsi","uo","ao",
            "macd","macd_hist","macd_signal",
            "stoch_k","stoch_d","stochrsi_k","stochrsi_d","ppo",
            "obv","cmf","mfi","ad","pvt","vwma20","efi",
            "atr","tr","ui","adx","dip","dim",
            "aroon_dn","aroon_up","aroon_osc","trix",
        ]

        candles = []
        for ts, row in df.iterrows():
            try:
                t = int(ts.timestamp())
            except Exception:
                continue

            candle: Dict[str, Any] = {
                "time":   t,
                "open":   round(float(row["open"]),   6),
                "high":   round(float(row["high"]),   6),
                "low":    round(float(row["low"]),    6),
                "close":  round(float(row["close"]),  6),
                "volume": int(row["volume"]) if not pd.isna(row["volume"]) else 0,
            }

            for col in IND_COLS:
                if col in df.columns:
                    val = row[col]
                    if not pd.isna(val):
                        candle[col] = round(float(val), 6)

            candles.append(candle)

        return {"symbol": symbol, "interval": interval, "period": period, "candles": candles}

    except Exception as e:
        return {"symbol": symbol, "candles": [], "error": str(e)}


def get_multiple_prices(symbols: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """
    Get prices for multiple symbols using a single yf.download() call for speed.
    Falls back to sequential fetching for any symbols that fail.
    """
    if not symbols:
        return []

    # Build yfinance symbol list and reverse map
    yf_symbols: List[str] = []
    yf_to_app: Dict[str, Dict[str, str]] = {}  # yf_sym -> {symbol, assetClass}

    for item in symbols:
        sym = item.get('symbol', '')
        ac = item.get('assetClass', 'stock')
        yf_sym = symbol_to_yf(sym, ac)
        yf_symbols.append(yf_sym)
        yf_to_app[yf_sym] = {'symbol': sym, 'assetClass': ac}

    # Download all symbols in a single HTTP request
    prices_by_yf: Dict[str, Dict[str, Any]] = {}
    try:
        import pandas as pd
        unique_yf = list(dict.fromkeys(yf_symbols))  # preserve order, dedupe

        # Use daily bars for batch — one HTTP call, fast for any number of symbols.
        # Individual price calls use 5-min bars for more current data.
        data = yf.download(
            unique_yf,
            period="5d",
            interval="1d",
            progress=False,
            threads=True,
            auto_adjust=True,
        )

        if not data.empty:
            # yf.download returns MultiIndex columns when >1 ticker, flat when =1
            is_multi = isinstance(data.columns, pd.MultiIndex)

            for yf_sym in unique_yf:
                try:
                    if is_multi:
                        close_col = data['Close'][yf_sym] if yf_sym in data['Close'].columns else None
                        high_col  = data['High'][yf_sym]  if yf_sym in data['High'].columns  else None
                        low_col   = data['Low'][yf_sym]   if yf_sym in data['Low'].columns   else None
                        open_col  = data['Open'][yf_sym]  if yf_sym in data['Open'].columns  else None
                        vol_col   = data['Volume'][yf_sym] if yf_sym in data['Volume'].columns else None
                    else:
                        close_col = data['Close']
                        high_col  = data['High']
                        low_col   = data['Low']
                        open_col  = data['Open']
                        vol_col   = data['Volume']

                    if close_col is None or close_col.dropna().empty:
                        continue

                    closes = close_col.dropna()
                    current = float(closes.iloc[-1])
                    # Daily bars: iloc[-2] is the previous trading day's close
                    prev = float(closes.iloc[-2]) if len(closes) >= 2 else current
                    change  = current - prev
                    change_pct = (change / prev * 100) if prev else 0

                    prices_by_yf[yf_sym] = {
                        "price": current,
                        "previousClose": prev,
                        "change": change,
                        "changePercent": change_pct,
                        "high":   float(high_col.dropna().iloc[-1]) if high_col is not None and not high_col.dropna().empty else current,
                        "low":    float(low_col.dropna().iloc[-1])  if low_col  is not None and not low_col.dropna().empty  else current,
                        "open":   float(open_col.dropna().iloc[-1]) if open_col is not None and not open_col.dropna().empty else current,
                        "volume": int(vol_col.dropna().sum())       if vol_col  is not None and not vol_col.dropna().empty  else 0,
                        "timestamp": datetime.now().isoformat(),
                        "source": "yahoo_batch",
                    }
                except Exception:
                    continue
    except Exception:
        pass  # fall through to sequential fallback

    # Build results list in original order
    results: List[Dict[str, Any]] = []
    for i, item in enumerate(symbols):
        sym = item.get('symbol', '')
        ac  = item.get('assetClass', 'stock')
        yf_sym = yf_symbols[i]
        if yf_sym in prices_by_yf:
            entry = {"symbol": sym, "assetClass": ac, "error": None}
            entry.update(prices_by_yf[yf_sym])
            results.append(entry)
        else:
            # Sequential fallback for symbols that didn't come through the batch
            results.append(get_price(sym, ac))

    return results


def main():
    """Main entry point - reads JSON from stdin, outputs JSON to stdout"""
    try:
        # Read input from stdin
        input_data = sys.stdin.read().strip()
        
        if not input_data:
            print(json.dumps({"error": "No input provided"}))
            sys.exit(1)
        
        request = json.loads(input_data)
        
        action = request.get('action', 'get_price')
        
        if action == 'get_price':
            symbol = request.get('symbol', '')
            asset_class = request.get('assetClass', 'stock')
            result = get_price(symbol, asset_class)
            print(json.dumps(result))
            
        elif action == 'get_multiple_prices':
            symbols = request.get('symbols', [])
            results = get_multiple_prices(symbols)
            print(json.dumps(results))
            
        elif action == 'get_candles':
            symbol = request.get('symbol', '')
            asset_class = request.get('assetClass', 'stock')
            interval = request.get('interval', '5m')
            period = request.get('period', '1d')
            result = get_candles(symbol, asset_class, interval, period)
            print(json.dumps(result))

        elif action == 'ping':
            print(json.dumps({"status": "ok", "timestamp": datetime.now().isoformat()}))
            
        else:
            print(json.dumps({"error": f"Unknown action: {action}"}))
            
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
