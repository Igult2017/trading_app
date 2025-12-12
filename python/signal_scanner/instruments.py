"""
Tradeable instruments definitions.
Contains all 62 instruments organized by asset class.
"""

from dataclasses import dataclass
from typing import List, Optional, Literal

AssetClass = Literal["forex", "index", "stock", "commodity", "crypto"]


@dataclass
class Instrument:
    """Represents a tradeable instrument."""
    symbol: str
    asset_class: AssetClass
    default_price: float
    pip_size: float = 0.0001
    min_lot: float = 0.01
    
    def __post_init__(self):
        if self.asset_class == "forex":
            if "JPY" in self.symbol:
                self.pip_size = 0.01
            else:
                self.pip_size = 0.0001
        elif self.asset_class in ("index", "stock"):
            self.pip_size = 0.01
        elif self.asset_class == "commodity":
            if "XAU" in self.symbol:
                self.pip_size = 0.1
            elif "XAG" in self.symbol:
                self.pip_size = 0.01
            else:
                self.pip_size = 0.01
        elif self.asset_class == "crypto":
            self.pip_size = 1.0


FOREX_MAJORS: List[Instrument] = [
    Instrument("EUR/USD", "forex", 1.0850),
    Instrument("GBP/USD", "forex", 1.2650),
    Instrument("USD/JPY", "forex", 149.50),
    Instrument("USD/CHF", "forex", 0.8750),
    Instrument("AUD/USD", "forex", 0.6580),
    Instrument("USD/CAD", "forex", 1.3550),
    Instrument("NZD/USD", "forex", 0.6150),
]

FOREX_EUR_CROSSES: List[Instrument] = [
    Instrument("EUR/GBP", "forex", 0.8580),
    Instrument("EUR/JPY", "forex", 162.00),
    Instrument("EUR/CHF", "forex", 0.9500),
    Instrument("EUR/AUD", "forex", 1.6500),
    Instrument("EUR/CAD", "forex", 1.4700),
    Instrument("EUR/NZD", "forex", 1.7650),
]

FOREX_GBP_CROSSES: List[Instrument] = [
    Instrument("GBP/JPY", "forex", 185.50),
    Instrument("GBP/CHF", "forex", 1.1050),
    Instrument("GBP/AUD", "forex", 1.9250),
    Instrument("GBP/CAD", "forex", 1.7150),
    Instrument("GBP/NZD", "forex", 2.0550),
]

FOREX_JPY_CROSSES: List[Instrument] = [
    Instrument("AUD/JPY", "forex", 98.50),
    Instrument("CAD/JPY", "forex", 110.50),
    Instrument("CHF/JPY", "forex", 170.75),
    Instrument("NZD/JPY", "forex", 92.00),
]

FOREX_OTHER_CROSSES: List[Instrument] = [
    Instrument("AUD/CAD", "forex", 0.8920),
    Instrument("AUD/CHF", "forex", 0.5750),
    Instrument("AUD/NZD", "forex", 1.0700),
    Instrument("CAD/CHF", "forex", 0.6450),
    Instrument("NZD/CAD", "forex", 0.8340),
    Instrument("NZD/CHF", "forex", 0.5380),
]

INDICES: List[Instrument] = [
    Instrument("US100", "index", 21200.00),
    Instrument("US500", "index", 5950.00),
    Instrument("US30", "index", 43800.00),
    Instrument("RUSSELL2000", "index", 2350.00),
    Instrument("VIX", "index", 14.50),
]

STOCKS_TECH: List[Instrument] = [
    Instrument("AAPL", "stock", 175.50),
    Instrument("MSFT", "stock", 378.25),
    Instrument("GOOGL", "stock", 140.85),
    Instrument("AMZN", "stock", 152.30),
    Instrument("NVDA", "stock", 495.75),
    Instrument("TSLA", "stock", 245.60),
    Instrument("META", "stock", 485.20),
    Instrument("NFLX", "stock", 475.80),
    Instrument("AMD", "stock", 155.40),
    Instrument("ORCL", "stock", 115.25),
]

STOCKS_FINANCE: List[Instrument] = [
    Instrument("JPM", "stock", 165.70),
    Instrument("BAC", "stock", 32.85),
    Instrument("GS", "stock", 385.40),
    Instrument("V", "stock", 265.30),
    Instrument("MA", "stock", 425.60),
    Instrument("JNJ", "stock", 158.90),
    Instrument("UNH", "stock", 512.75),
    Instrument("WMT", "stock", 165.40),
    Instrument("PG", "stock", 152.30),
    Instrument("DIS", "stock", 95.85),
]

COMMODITIES: List[Instrument] = [
    Instrument("XAU/USD", "commodity", 2035.00),
    Instrument("XAG/USD", "commodity", 24.50),
    Instrument("WTI", "commodity", 82.50),
    Instrument("BRENT", "commodity", 86.75),
]

CRYPTO: List[Instrument] = [
    Instrument("BTC/USD", "crypto", 43200),
    Instrument("ETH/USD", "crypto", 2280),
    Instrument("BNB/USD", "crypto", 315.50),
]

TRADEABLE_INSTRUMENTS: List[Instrument] = (
    FOREX_MAJORS +
    FOREX_EUR_CROSSES +
    FOREX_GBP_CROSSES +
    FOREX_JPY_CROSSES +
    FOREX_OTHER_CROSSES +
    INDICES +
    STOCKS_TECH +
    STOCKS_FINANCE +
    COMMODITIES +
    CRYPTO
)


def get_instrument_by_symbol(symbol: str) -> Optional[Instrument]:
    """Get instrument by symbol."""
    for inst in TRADEABLE_INSTRUMENTS:
        if inst.symbol == symbol:
            return inst
    return None


def get_instruments_by_class(asset_class: AssetClass) -> List[Instrument]:
    """Get all instruments for an asset class."""
    return [inst for inst in TRADEABLE_INSTRUMENTS if inst.asset_class == asset_class]


def get_forex_instruments() -> List[Instrument]:
    """Get all forex instruments."""
    return get_instruments_by_class("forex")


def get_stock_instruments() -> List[Instrument]:
    """Get all stock instruments."""
    return get_instruments_by_class("stock")
