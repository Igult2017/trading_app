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

        # Fetch extra history so indicators have enough candles to compute
        # (EMA200 needs 200 bars min). We trim back to the requested period after.
        _EXTRA = {
            "1m": "5d", "2m": "5d", "5m": "5d", "15m": "60d",
            "30m": "60d", "60m": "730d", "1h": "730d",
            "1d": "max", "1wk": "max", "1mo": "max",
        }
        fetch_period = _EXTRA.get(interval, "5d")
        hist = ticker.history(period=fetch_period, interval=interval)

        if hist.empty:
            # Try the original period as fallback
            hist = ticker.history(period=period, interval=interval)
        if hist.empty:
            return {"symbol": symbol, "candles": [], "error": "No data returned"}

        import pandas as pd
        df = hist[["Open", "High", "Low", "Close", "Volume"]].copy()
        df.columns = ["open", "high", "low", "close", "volume"]
        # Trim to last 500 rows before computing indicators — most indicators
        # (including EMA-200) only need ~200 bars of warmup; keeping 500 gives
        # a safe buffer while avoiding loading years of history into memory.
        df = df.tail(500)


        # ── Compute indicators using `ta` library + manual numpy/pandas ────────
        try:
            import numpy as np
            from ta.trend import (EMAIndicator, SMAIndicator, WMAIndicator,
                                  MACD, PSARIndicator, ADXIndicator,
                                  AroonIndicator, TRIXIndicator, DPOIndicator,
                                  CCIIndicator)
            from ta.momentum import (RSIIndicator, StochasticOscillator,
                                     StochRSIIndicator, WilliamsRIndicator,
                                     ROCIndicator, TSIIndicator,
                                     UltimateOscillator, AwesomeOscillatorIndicator,
                                     PercentagePriceOscillator)
            from ta.volatility import (BollingerBands, DonchianChannel,
                                       AverageTrueRange, UlcerIndex,
                                       KeltnerChannel)
            from ta.volume import (OnBalanceVolumeIndicator,
                                   ChaikinMoneyFlowIndicator, MFIIndicator,
                                   AccDistIndexIndicator,
                                   VolumeWeightedAveragePrice,
                                   VolumePriceTrendIndicator,
                                   ForceIndexIndicator)

            c = df["close"]; h = df["high"]; l = df["low"]; v = df["volume"]

            # ── TREND ──────────────────────────────────────────────────────
            for n in [9, 21, 50, 100, 200]:
                df[f"ema{n}"] = EMAIndicator(c, window=n, fillna=False).ema_indicator()
            for n in [9, 20, 50, 100, 200]:
                df[f"sma{n}"] = SMAIndicator(c, window=n, fillna=False).sma_indicator()

            df["wma20"] = WMAIndicator(c, window=20, fillna=False).wma()

            # HMA = WMA(2*WMA(n/2) - WMA(n), sqrt(n))
            try:
                half = WMAIndicator(c, window=10, fillna=False).wma()
                full = WMAIndicator(c, window=20, fillna=False).wma()
                raw_hma = 2 * half - full
                df["hma20"] = raw_hma.rolling(int(np.sqrt(20))).mean()
            except Exception:
                pass

            # DEMA = 2*EMA - EMA(EMA)
            try:
                e1 = EMAIndicator(c, window=20, fillna=False).ema_indicator()
                e2 = EMAIndicator(e1, window=20, fillna=False).ema_indicator()
                df["dema20"] = 2 * e1 - e2
            except Exception:
                pass

            # TEMA = 3*EMA - 3*EMA(EMA) + EMA(EMA(EMA))
            try:
                e1 = EMAIndicator(c, window=20, fillna=False).ema_indicator()
                e2 = EMAIndicator(e1, window=20, fillna=False).ema_indicator()
                e3 = EMAIndicator(e2, window=20, fillna=False).ema_indicator()
                df["tema20"] = 3 * e1 - 3 * e2 + e3
            except Exception:
                pass

            # Bollinger Bands
            bb = BollingerBands(c, window=20, window_dev=2, fillna=False)
            df["bb_upper"] = bb.bollinger_hband()
            df["bb_lower"] = bb.bollinger_lband()
            df["bb_mid"]   = bb.bollinger_mavg()
            df["bb_width"] = bb.bollinger_wband()
            df["bb_pct"]   = bb.bollinger_pband()

            # Keltner Channel
            kc = KeltnerChannel(h, l, c, window=20, fillna=False)
            df["kc_upper"] = kc.keltner_channel_hband()
            df["kc_lower"] = kc.keltner_channel_lband()
            df["kc_mid"]   = kc.keltner_channel_mband()

            # Donchian Channel
            dc = DonchianChannel(h, l, c, window=20, fillna=False)
            df["dc_upper"] = dc.donchian_channel_hband()
            df["dc_lower"] = dc.donchian_channel_lband()
            df["dc_mid"]   = dc.donchian_channel_mband()

            # VWAP
            try:
                df["vwap"] = VolumeWeightedAveragePrice(h, l, c, v, fillna=False).volume_weighted_average_price()
            except Exception:
                pass

            # Supertrend (manual)
            try:
                atr14 = AverageTrueRange(h, l, c, window=14, fillna=False).average_true_range()
                hl2   = (h + l) / 2
                upper = hl2 + 3.0 * atr14
                lower = hl2 - 3.0 * atr14
                st    = pd.Series(np.nan, index=c.index)
                trend = pd.Series(1,      index=c.index)
                for i in range(1, len(c)):
                    prev_upper = upper.iloc[i - 1] if not pd.isna(upper.iloc[i - 1]) else upper.iloc[i]
                    prev_lower = lower.iloc[i - 1] if not pd.isna(lower.iloc[i - 1]) else lower.iloc[i]
                    upper.iloc[i] = min(upper.iloc[i], prev_upper) if c.iloc[i - 1] > prev_upper else upper.iloc[i]
                    lower.iloc[i] = max(lower.iloc[i], prev_lower) if c.iloc[i - 1] < prev_lower else lower.iloc[i]
                    if trend.iloc[i - 1] == 1:
                        trend.iloc[i] = -1 if c.iloc[i] < lower.iloc[i] else 1
                    else:
                        trend.iloc[i] = 1  if c.iloc[i] > upper.iloc[i] else -1
                    st.iloc[i] = lower.iloc[i] if trend.iloc[i] == 1 else upper.iloc[i]
                df["supertrend"] = st
            except Exception:
                pass

            # Parabolic SAR
            try:
                psar_ind = PSARIndicator(h, l, c, step=0.02, max_step=0.2, fillna=False)
                df["psar"] = psar_ind.psar()
            except Exception:
                pass

            # ── MOMENTUM ───────────────────────────────────────────────────
            df["rsi"]   = RSIIndicator(c, window=14, fillna=False).rsi()
            df["willr"] = WilliamsRIndicator(h, l, c, lbp=14, fillna=False).williams_r()
            df["roc"]   = ROCIndicator(c, window=10, fillna=False).roc()

            # CCI
            try:
                df["cci"] = CCIIndicator(h, l, c, window=20, fillna=False).cci()
            except Exception:
                pass

            # Momentum
            try:
                df["mom"] = c.diff(10)
            except Exception:
                pass

            # CMO (manual)
            try:
                diff = c.diff()
                up   = diff.clip(lower=0).rolling(14).sum()
                dn   = (-diff.clip(upper=0)).rolling(14).sum()
                df["cmo"] = 100 * (up - dn) / (up + dn)
            except Exception:
                pass

            # DPO
            try:
                df["dpo"] = DPOIndicator(c, window=20, fillna=False).dpo()
            except Exception:
                pass

            # TSI
            try:
                df["tsi"] = TSIIndicator(c, window_slow=25, window_fast=13, fillna=False).tsi()
            except Exception:
                pass

            # Ultimate Oscillator
            try:
                df["uo"] = UltimateOscillator(h, l, c, window1=7, window2=14, window3=28, fillna=False).ultimate_oscillator()
            except Exception:
                pass

            # Awesome Oscillator
            try:
                df["ao"] = AwesomeOscillatorIndicator(h, l, window1=5, window2=34, fillna=False).awesome_oscillator()
            except Exception:
                pass

            # MACD
            macd_ind = MACD(c, window_fast=12, window_slow=26, window_sign=9, fillna=False)
            df["macd"]        = macd_ind.macd()
            df["macd_signal"] = macd_ind.macd_signal()
            df["macd_hist"]   = macd_ind.macd_diff()

            # Stochastic
            stoch_ind = StochasticOscillator(h, l, c, window=14, smooth_window=3, fillna=False)
            df["stoch_k"] = stoch_ind.stoch()
            df["stoch_d"] = stoch_ind.stoch_signal()

            # Stochastic RSI
            try:
                srsi_ind = StochRSIIndicator(c, window=14, smooth1=3, smooth2=3, fillna=False)
                df["stochrsi_k"] = srsi_ind.stochrsi_k()
                df["stochrsi_d"] = srsi_ind.stochrsi_d()
            except Exception:
                pass

            # PPO
            try:
                ppo_ind = PercentagePriceOscillator(c, window_slow=26, window_fast=12, window_sign=9, fillna=False)
                df["ppo"] = ppo_ind.ppo()
            except Exception:
                pass

            # ── VOLUME ─────────────────────────────────────────────────────
            df["obv"] = OnBalanceVolumeIndicator(c, v, fillna=False).on_balance_volume()
            df["cmf"] = ChaikinMoneyFlowIndicator(h, l, c, v, window=20, fillna=False).chaikin_money_flow()
            df["mfi"] = MFIIndicator(h, l, c, v, window=14, fillna=False).money_flow_index()
            df["ad"]  = AccDistIndexIndicator(h, l, c, v, fillna=False).acc_dist_index()

            # PVT
            try:
                df["pvt"] = VolumePriceTrendIndicator(c, v, fillna=False).volume_price_trend()
            except Exception:
                pass

            # VWMA (manual)
            try:
                df["vwma20"] = (c * v).rolling(20).sum() / v.rolling(20).sum()
            except Exception:
                pass

            # Elder Force Index
            try:
                df["efi"] = ForceIndexIndicator(c, v, window=13, fillna=False).force_index()
            except Exception:
                pass

            # ── VOLATILITY / STRENGTH ──────────────────────────────────────
            atr_ind = AverageTrueRange(h, l, c, window=14, fillna=False)
            df["atr"] = atr_ind.average_true_range()

            # True Range (manual)
            try:
                prev_c = c.shift(1)
                df["tr"] = pd.concat([h - l, (h - prev_c).abs(), (l - prev_c).abs()], axis=1).max(axis=1)
            except Exception:
                pass

            # Ulcer Index
            try:
                df["ui"] = UlcerIndex(c, window=14, fillna=False).ulcer_index()
            except Exception:
                pass

            # BB Width and %B (already set above from BollingerBands)

            # ADX + DI
            adx_ind = ADXIndicator(h, l, c, window=14, fillna=False)
            df["adx"] = adx_ind.adx()
            df["dip"] = adx_ind.adx_pos()
            df["dim"] = adx_ind.adx_neg()

            # Aroon
            try:
                aroon_ind = AroonIndicator(h, l, window=14, fillna=False)
                df["aroon_up"]  = aroon_ind.aroon_up()
                df["aroon_dn"]  = aroon_ind.aroon_down()
                df["aroon_osc"] = aroon_ind.aroon_indicator()
            except Exception:
                pass

            # TRIX
            try:
                df["trix"] = TRIXIndicator(c, window=18, fillna=False).trix()
            except Exception:
                pass

        except Exception:
            pass  # ta not available or error computing — candles returned without indicators

        # ── Trim to requested period ──────────────────────────────────────────
        # We fetched extra history for indicator warmup; now trim to what was asked.
        _PERIOD_BARS = {
            "1d": 390, "2d": 780, "5d": 1950, "7d": 2730,
            "1mo": 500, "3mo": 1500, "6mo": 3000,
            "1y": 6000, "2y": 12000, "5y": 30000, "max": len(df),
        }
        max_bars = _PERIOD_BARS.get(period, 500)
        if len(df) > max_bars:
            df = df.iloc[-max_bars:]

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
            period="2d",
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
    """Main entry point - reads JSON from sys.argv[1] or stdin, outputs JSON to stdout"""
    try:
        # Prefer command-line argument (Node.js passes JSON as argv[1])
        if len(sys.argv) > 1:
            input_data = sys.argv[1].strip()
        else:
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
