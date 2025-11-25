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
