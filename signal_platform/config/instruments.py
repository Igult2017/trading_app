"""
All forex pairs the platform will scan.
Each entry: (app_symbol, yfinance_ticker, base_currency, quote_currency)
"""

TRADEABLE_INSTRUMENTS: list[tuple[str, str, str, str]] = [
    ("EUR/USD", "EURUSD=X", "EUR", "USD"),
    ("GBP/USD", "GBPUSD=X", "GBP", "USD"),
    ("USD/JPY", "USDJPY=X", "USD", "JPY"),
    ("USD/CHF", "USDCHF=X", "USD", "CHF"),
    ("AUD/USD", "AUDUSD=X", "AUD", "USD"),
    ("USD/CAD", "USDCAD=X", "USD", "CAD"),
    ("NZD/USD", "NZDUSD=X", "NZD", "USD"),
    ("EUR/GBP", "EURGBP=X", "EUR", "GBP"),
    ("EUR/JPY", "EURJPY=X", "EUR", "JPY"),
    ("GBP/JPY", "GBPJPY=X", "GBP", "JPY"),
    ("EUR/AUD", "EURAUD=X", "EUR", "AUD"),
    ("EUR/CAD", "EURCAD=X", "EUR", "CAD"),
    ("GBP/AUD", "GBPAUD=X", "GBP", "AUD"),
    ("GBP/CAD", "GBPCAD=X", "GBP", "CAD"),
    ("AUD/JPY", "AUDJPY=X", "AUD", "JPY"),
    ("EUR/CHF", "EURCHF=X", "EUR", "CHF"),
    ("GBP/CHF", "GBPCHF=X", "GBP", "CHF"),
    ("AUD/CAD", "AUDCAD=X", "AUD", "CAD"),
    ("AUD/CHF", "AUDCHF=X", "AUD", "CHF"),
    ("NZD/JPY", "NZDJPY=X", "NZD", "JPY"),
]

# Fast lookup: app_symbol → yfinance_ticker
SYMBOL_TO_YF: dict[str, str] = {s: yf for s, yf, _, _ in TRADEABLE_INSTRUMENTS}

# Fast lookup: app_symbol → (base, quote)
SYMBOL_TO_CURRENCIES: dict[str, tuple[str, str]] = {
    s: (base, quote) for s, _, base, quote in TRADEABLE_INSTRUMENTS
}
