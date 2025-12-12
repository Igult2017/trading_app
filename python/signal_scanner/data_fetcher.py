"""
Data fetcher with parallel processing, caching, and retry logic.
Fetches price data and multi-timeframe candles for instruments.
"""

import asyncio
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import threading

from .types import Candle, MultiTimeframeData, PriceResult
from .instruments import Instrument
from .config import scanner_config
from .logging_config import get_logger

logger = get_logger("data_fetcher")


@dataclass
class CacheEntry:
    """Cache entry with TTL."""
    data: Any
    timestamp: float
    ttl: float
    
    @property
    def is_valid(self) -> bool:
        return (time.time() - self.timestamp) < self.ttl


class DataCache:
    """Thread-safe in-memory cache with TTL."""
    
    def __init__(self, default_ttl: float = 60.0):
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = threading.RLock()
        self._default_ttl = default_ttl
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached value if valid."""
        with self._lock:
            entry = self._cache.get(key)
            if entry and entry.is_valid:
                return entry.data
            elif entry:
                del self._cache[key]
            return None
    
    def set(self, key: str, data: Any, ttl: Optional[float] = None) -> None:
        """Set cache value with TTL."""
        with self._lock:
            self._cache[key] = CacheEntry(
                data=data,
                timestamp=time.time(),
                ttl=ttl or self._default_ttl
            )
    
    def invalidate(self, key: str) -> None:
        """Remove key from cache."""
        with self._lock:
            self._cache.pop(key, None)
    
    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()
    
    def cleanup_expired(self) -> int:
        """Remove expired entries. Returns count of removed entries."""
        removed = 0
        with self._lock:
            keys_to_remove = [
                k for k, v in self._cache.items() 
                if not v.is_valid
            ]
            for key in keys_to_remove:
                del self._cache[key]
                removed += 1
        return removed


class RetryConfig:
    """Configuration for retry behavior."""
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 10.0
    exponential_base: float = 2.0


async def retry_async(
    func,
    *args,
    config: RetryConfig = RetryConfig(),
    **kwargs
) -> Any:
    """Execute async function with exponential backoff retry."""
    last_error = None
    
    for attempt in range(config.max_retries):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_error = e
            if attempt < config.max_retries - 1:
                delay = min(
                    config.base_delay * (config.exponential_base ** attempt),
                    config.max_delay
                )
                logger.warning(
                    f"Attempt {attempt + 1} failed: {e}. Retrying in {delay:.1f}s"
                )
                await asyncio.sleep(delay)
    
    raise last_error


class DataFetcher:
    """
    Fetches price and candle data with caching and parallel processing.
    """
    
    def __init__(self):
        self.price_cache = DataCache(default_ttl=30.0)
        self.candle_cache = DataCache(default_ttl=scanner_config.cache_ttl_seconds)
        self._executor = ThreadPoolExecutor(max_workers=scanner_config.max_concurrent_fetches)
    
    async def get_price(
        self, 
        symbol: str, 
        asset_class: str,
        use_cache: bool = True
    ) -> Optional[PriceResult]:
        """
        Get current price for an instrument.
        
        Args:
            symbol: Instrument symbol
            asset_class: Asset class (forex, stock, etc.)
            use_cache: Whether to use cached price
            
        Returns:
            PriceResult or None if fetch fails
        """
        cache_key = f"price:{symbol}"
        
        if use_cache:
            cached = self.price_cache.get(cache_key)
            if cached:
                return cached
        
        try:
            result = await self._fetch_price_internal(symbol, asset_class)
            if result:
                self.price_cache.set(cache_key, result)
            return result
        except Exception as e:
            logger.error(f"Failed to fetch price for {symbol}: {e}")
            return None
    
    async def _fetch_price_internal(
        self, 
        symbol: str, 
        asset_class: str
    ) -> Optional[PriceResult]:
        """Internal price fetching with source selection."""
        loop = asyncio.get_event_loop()
        
        try:
            if asset_class == "crypto":
                return await loop.run_in_executor(
                    self._executor,
                    self._fetch_crypto_price,
                    symbol
                )
            else:
                return await loop.run_in_executor(
                    self._executor,
                    self._fetch_yfinance_price,
                    symbol,
                    asset_class
                )
        except Exception as e:
            logger.error(f"Price fetch error for {symbol}: {e}")
            return None
    
    def _fetch_crypto_price(self, symbol: str) -> Optional[PriceResult]:
        """Fetch crypto price from CoinGecko."""
        try:
            from pycoingecko import CoinGeckoAPI
            cg = CoinGeckoAPI()
            
            coin_map = {
                "BTC/USD": "bitcoin",
                "ETH/USD": "ethereum", 
                "BNB/USD": "binancecoin"
            }
            coin_id = coin_map.get(symbol)
            if not coin_id:
                return None
            
            data = cg.get_price(
                ids=coin_id,
                vs_currencies="usd",
                include_24hr_change=True,
                include_24hr_vol=True
            )
            
            if coin_id in data:
                coin_data = data[coin_id]
                return PriceResult(
                    price=coin_data.get("usd", 0),
                    change_percent=coin_data.get("usd_24h_change", 0),
                    volume=coin_data.get("usd_24h_vol", 0),
                    timestamp=int(time.time() * 1000),
                    source="coingecko"
                )
            return None
        except Exception as e:
            logger.error(f"CoinGecko error for {symbol}: {e}")
            return None
    
    def _fetch_yfinance_price(
        self, 
        symbol: str, 
        asset_class: str
    ) -> Optional[PriceResult]:
        """Fetch price from Yahoo Finance."""
        try:
            import yfinance as yf
            
            ticker_symbol = self._get_yfinance_symbol(symbol, asset_class)
            ticker = yf.Ticker(ticker_symbol)
            
            hist = ticker.history(period="1d", interval="1m")
            if hist.empty:
                hist = ticker.history(period="5d", interval="1d")
            
            if hist.empty:
                return None
            
            latest = hist.iloc[-1]
            return PriceResult(
                price=float(latest["Close"]),
                high_24h=float(hist["High"].max()),
                low_24h=float(hist["Low"].min()),
                volume=float(latest.get("Volume", 0)),
                timestamp=int(time.time() * 1000),
                source="yfinance"
            )
        except Exception as e:
            logger.error(f"YFinance error for {symbol}: {e}")
            return None
    
    def _get_yfinance_symbol(self, symbol: str, asset_class: str) -> str:
        """Convert symbol to Yahoo Finance format."""
        symbol_map = {
            "EUR/USD": "EURUSD=X",
            "GBP/USD": "GBPUSD=X",
            "USD/JPY": "USDJPY=X",
            "USD/CHF": "USDCHF=X",
            "AUD/USD": "AUDUSD=X",
            "USD/CAD": "USDCAD=X",
            "NZD/USD": "NZDUSD=X",
            "EUR/GBP": "EURGBP=X",
            "EUR/JPY": "EURJPY=X",
            "EUR/CHF": "EURCHF=X",
            "EUR/AUD": "EURAUD=X",
            "EUR/CAD": "EURCAD=X",
            "EUR/NZD": "EURNZD=X",
            "GBP/JPY": "GBPJPY=X",
            "GBP/CHF": "GBPCHF=X",
            "GBP/AUD": "GBPAUD=X",
            "GBP/CAD": "GBPCAD=X",
            "GBP/NZD": "GBPNZD=X",
            "AUD/JPY": "AUDJPY=X",
            "CAD/JPY": "CADJPY=X",
            "CHF/JPY": "CHFJPY=X",
            "NZD/JPY": "NZDJPY=X",
            "AUD/CAD": "AUDCAD=X",
            "AUD/CHF": "AUDCHF=X",
            "AUD/NZD": "AUDNZD=X",
            "CAD/CHF": "CADCHF=X",
            "NZD/CAD": "NZDCAD=X",
            "NZD/CHF": "NZDCHF=X",
            "XAU/USD": "GC=F",
            "XAG/USD": "SI=F",
            "WTI": "CL=F",
            "BRENT": "BZ=F",
            "US100": "^NDX",
            "US500": "^GSPC",
            "US30": "^DJI",
            "RUSSELL2000": "^RUT",
            "VIX": "^VIX",
        }
        
        if symbol in symbol_map:
            return symbol_map[symbol]
        
        if asset_class == "stock":
            return symbol
        
        return symbol.replace("/", "")
    
    async def fetch_multi_timeframe_data(
        self,
        symbol: str,
        asset_class: str,
        current_price: float,
        use_cache: bool = True
    ) -> MultiTimeframeData:
        """
        Fetch candle data for all timeframes in parallel.
        
        Args:
            symbol: Instrument symbol
            asset_class: Asset class
            current_price: Current price for fallback
            use_cache: Whether to use cached data
            
        Returns:
            MultiTimeframeData with candles for all timeframes
        """
        cache_key = f"mtf:{symbol}"
        
        if use_cache:
            cached = self.candle_cache.get(cache_key)
            if cached:
                return cached
        
        try:
            result = await self._fetch_mtf_internal(symbol, asset_class, current_price)
            if result:
                self.candle_cache.set(cache_key, result)
            return result
        except Exception as e:
            logger.error(f"Failed to fetch MTF data for {symbol}: {e}")
            return MultiTimeframeData()
    
    async def _fetch_mtf_internal(
        self,
        symbol: str,
        asset_class: str,
        current_price: float
    ) -> MultiTimeframeData:
        """Fetch multi-timeframe data using yfinance."""
        loop = asyncio.get_event_loop()
        
        try:
            return await loop.run_in_executor(
                self._executor,
                self._fetch_mtf_sync,
                symbol,
                asset_class,
                current_price
            )
        except Exception as e:
            logger.error(f"MTF fetch error for {symbol}: {e}")
            return MultiTimeframeData()
    
    def _fetch_mtf_sync(
        self,
        symbol: str,
        asset_class: str,
        current_price: float
    ) -> MultiTimeframeData:
        """Synchronous MTF data fetch."""
        import yfinance as yf
        
        ticker_symbol = self._get_yfinance_symbol(symbol, asset_class)
        ticker = yf.Ticker(ticker_symbol)
        
        mtf = MultiTimeframeData()
        
        timeframe_configs = [
            ("d1", "1mo", "1d"),
            ("h4", "1mo", "1h"),
            ("h1", "5d", "1h"),
            ("m30", "5d", "30m"),
            ("m15", "5d", "15m"),
            ("m5", "1d", "5m"),
            ("m1", "1d", "1m"),
        ]
        
        for tf_name, period, interval in timeframe_configs:
            try:
                hist = ticker.history(period=period, interval=interval)
                if not hist.empty:
                    candles = []
                    for idx, row in hist.iterrows():
                        candle = Candle(
                            timestamp=int(idx.timestamp() * 1000),
                            open=float(row["Open"]),
                            high=float(row["High"]),
                            low=float(row["Low"]),
                            close=float(row["Close"]),
                            volume=float(row.get("Volume", 0))
                        )
                        candles.append(candle)
                    
                    if tf_name == "h4":
                        candles = self._aggregate_to_h4(candles)
                    elif tf_name == "h2":
                        candles = self._aggregate_to_h2(candles)
                    elif tf_name == "m3":
                        candles = self._aggregate_to_m3(candles)
                    
                    setattr(mtf, tf_name, candles)
            except Exception as e:
                logger.warning(f"Failed to fetch {tf_name} for {symbol}: {e}")
        
        mtf.h2 = self._aggregate_to_h2(mtf.h1) if mtf.h1 else []
        mtf.m3 = self._aggregate_to_m3(mtf.m1) if mtf.m1 else []
        
        return mtf
    
    def _aggregate_to_h4(self, h1_candles: List[Candle]) -> List[Candle]:
        """Aggregate 1H candles to 4H."""
        return self._aggregate_candles(h1_candles, 4)
    
    def _aggregate_to_h2(self, h1_candles: List[Candle]) -> List[Candle]:
        """Aggregate 1H candles to 2H."""
        return self._aggregate_candles(h1_candles, 2)
    
    def _aggregate_to_m3(self, m1_candles: List[Candle]) -> List[Candle]:
        """Aggregate 1M candles to 3M."""
        return self._aggregate_candles(m1_candles, 3)
    
    def _aggregate_candles(
        self, 
        candles: List[Candle], 
        period: int
    ) -> List[Candle]:
        """Aggregate candles into larger timeframe."""
        if not candles:
            return []
        
        aggregated = []
        for i in range(0, len(candles), period):
            chunk = candles[i:i + period]
            if chunk:
                agg = Candle(
                    timestamp=chunk[0].timestamp,
                    open=chunk[0].open,
                    high=max(c.high for c in chunk),
                    low=min(c.low for c in chunk),
                    close=chunk[-1].close,
                    volume=sum(c.volume for c in chunk)
                )
                aggregated.append(agg)
        
        return aggregated
    
    async def fetch_prices_parallel(
        self,
        instruments: List[Instrument]
    ) -> Dict[str, PriceResult]:
        """
        Fetch prices for multiple instruments in parallel.
        
        Args:
            instruments: List of instruments to fetch
            
        Returns:
            Dict mapping symbol to PriceResult
        """
        tasks = [
            self.get_price(inst.symbol, inst.asset_class)
            for inst in instruments
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        price_map: Dict[str, PriceResult] = {}
        for inst, result in zip(instruments, results):
            if isinstance(result, PriceResult):
                price_map[inst.symbol] = result
            elif isinstance(result, Exception):
                logger.error(f"Price fetch failed for {inst.symbol}: {result}")
        
        return price_map
    
    def cleanup(self) -> None:
        """Cleanup resources."""
        self.price_cache.cleanup_expired()
        self.candle_cache.cleanup_expired()


data_fetcher = DataFetcher()
