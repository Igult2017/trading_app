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
    "RUSSELL2000": "^RUT",  # Russell 2000
    "VIX": "^VIX",          # Volatility Index
    "NASDAQ": "^IXIC",      # NASDAQ Composite
    "SPX": "^GSPC",         # S&P 500 alternative name
    "DJI": "^DJI",          # Dow Jones alternative name
}


def get_yahoo_price(symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch price from Yahoo Finance"""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        
        # Try different price fields
        price = info.get('regularMarketPrice') or info.get('currentPrice') or info.get('previousClose')
        
        if price is None:
            # Try to get from history
            hist = ticker.history(period="1d")
            if not hist.empty:
                price = float(hist['Close'].iloc[-1])
        
        if price is not None:
            return {
                "symbol": symbol,
                "price": float(price),
                "change": info.get('regularMarketChange', 0),
                "changePercent": info.get('regularMarketChangePercent', 0),
                "high": info.get('regularMarketDayHigh', price),
                "low": info.get('regularMarketDayLow', price),
                "open": info.get('regularMarketOpen', price),
                "previousClose": info.get('previousClose', price),
                "volume": info.get('regularMarketVolume', 0),
                "timestamp": datetime.now().isoformat(),
                "source": "yahoo"
            }
    except Exception as e:
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
            # Handle crypto symbols
            base_symbol = symbol.replace("/USD", "").replace("-USD", "").upper()
            coin_id = CRYPTO_ID_MAP.get(base_symbol, base_symbol.lower())
            price_data = get_coingecko_price(coin_id)
            
            if price_data:
                result.update(price_data)
                result["symbol"] = symbol
            else:
                # Try Yahoo as fallback for crypto
                yahoo_symbol = f"{base_symbol}-USD"
                price_data = get_yahoo_price(yahoo_symbol)
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


def get_candles(symbol: str, asset_class: str = "stock", interval: str = "5m", period: str = "1d") -> Dict[str, Any]:
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

            # ── TREND ──────────────────────────────────────────────────────
            for length in [9, 21, 50, 100, 200]:
                df[f"ema{length}"]  = ta.ema(df["close"], length=length)
                df[f"sma{length}"]  = ta.sma(df["close"], length=length)

            df["wma20"]  = ta.wma(df["close"],  length=20)
            df["hma20"]  = ta.hma(df["close"],  length=20)
            df["dema20"] = ta.dema(df["close"], length=20)
            df["tema20"] = ta.tema(df["close"], length=20)

            # Bollinger Bands
            bb = ta.bbands(df["close"], length=20, std=2)
            if bb is not None and not bb.empty:
                df["bb_upper"] = bb.get("BBU_20_2.0")
                df["bb_lower"] = bb.get("BBL_20_2.0")
                df["bb_mid"]   = bb.get("BBM_20_2.0")
                df["bb_width"] = bb.get("BBB_20_2.0")
                df["bb_pct"]   = bb.get("BBP_20_2.0")

            # Keltner Channel
            kc = ta.kc(df["high"], df["low"], df["close"], length=20)
            if kc is not None and not kc.empty:
                cols = kc.columns.tolist()
                df["kc_upper"] = kc[cols[0]] if len(cols) > 0 else None
                df["kc_mid"]   = kc[cols[1]] if len(cols) > 1 else None
                df["kc_lower"] = kc[cols[2]] if len(cols) > 2 else None

            # Donchian Channel
            dc = ta.donchian(df["high"], df["low"], lower_length=20, upper_length=20)
            if dc is not None and not dc.empty:
                dcols = dc.columns.tolist()
                df["dc_lower"] = dc[dcols[0]] if len(dcols) > 0 else None
                df["dc_mid"]   = dc[dcols[1]] if len(dcols) > 1 else None
                df["dc_upper"] = dc[dcols[2]] if len(dcols) > 2 else None

            # VWAP
            try:
                df["vwap"] = ta.vwap(df["high"], df["low"], df["close"], df["volume"])
            except Exception:
                pass

            # Supertrend
            try:
                st = ta.supertrend(df["high"], df["low"], df["close"], length=7, multiplier=3.0)
                if st is not None and not st.empty:
                    st_cols = [c for c in st.columns if "SUPERT_" in c and "d" not in c and "l" not in c and "s" not in c]
                    if st_cols:
                        df["supertrend"] = st[st_cols[0]]
            except Exception:
                pass

            # Parabolic SAR
            try:
                psar = ta.psar(df["high"], df["low"], df["close"])
                if psar is not None and not psar.empty:
                    psar_cols = [c for c in psar.columns if "PSARl" in c]
                    if psar_cols:
                        df["psar"] = psar[psar_cols[0]]
            except Exception:
                pass

            # ── MOMENTUM ───────────────────────────────────────────────────
            df["rsi"]  = ta.rsi(df["close"], length=14)
            df["cci"]  = ta.cci(df["high"], df["low"], df["close"], length=20)
            df["roc"]  = ta.roc(df["close"], length=10)
            df["mom"]  = ta.mom(df["close"], length=10)
            df["cmo"]  = ta.cmo(df["close"], length=14)
            df["willr"]= ta.willr(df["high"], df["low"], df["close"], length=14)
            df["dpo"]  = ta.dpo(df["close"],  length=20)

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

            # MACD
            macd = ta.macd(df["close"], fast=12, slow=26, signal=9)
            if macd is not None and not macd.empty:
                mcols = macd.columns.tolist()
                df["macd"]        = macd[mcols[0]] if len(mcols) > 0 else None
                df["macd_hist"]   = macd[mcols[1]] if len(mcols) > 1 else None
                df["macd_signal"] = macd[mcols[2]] if len(mcols) > 2 else None

            # Stochastic
            stoch = ta.stoch(df["high"], df["low"], df["close"], k=14, d=3)
            if stoch is not None and not stoch.empty:
                scols = stoch.columns.tolist()
                df["stoch_k"] = stoch[scols[0]] if len(scols) > 0 else None
                df["stoch_d"] = stoch[scols[1]] if len(scols) > 1 else None

            # Stochastic RSI
            try:
                srsi = ta.stochrsi(df["close"], length=14)
                if srsi is not None and not srsi.empty:
                    srcols = srsi.columns.tolist()
                    df["stochrsi_k"] = srsi[srcols[0]] if len(srcols) > 0 else None
                    df["stochrsi_d"] = srsi[srcols[1]] if len(srcols) > 1 else None
            except Exception:
                pass

            # PPO
            try:
                ppo = ta.ppo(df["close"], fast=12, slow=26)
                if ppo is not None and not ppo.empty:
                    df["ppo"] = ppo[ppo.columns[0]]
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
    Get prices for multiple symbols
    
    Args:
        symbols: List of dicts with 'symbol' and 'assetClass' keys
    
    Returns:
        List of price data dictionaries
    """
    results = []
    for item in symbols:
        symbol = item.get('symbol', '')
        asset_class = item.get('assetClass', 'stock')
        result = get_price(symbol, asset_class)
        results.append(result)
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
