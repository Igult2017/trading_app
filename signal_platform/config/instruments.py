"""
All forex pairs the platform will scan.

app_symbol:    internal name used throughout the platform ("EUR/USD")
ctrader_name:  symbol as it appears in cTrader / Pepperstone ("EURUSD")
               Derived by stripping the slash: symbol.replace("/", "")
               so no explicit mapping column is needed.
"""

TRADEABLE_INSTRUMENTS: list[tuple[str, str, str]] = [
    # (app_symbol, base_currency, quote_currency)
    ("EUR/USD", "EUR", "USD"),
    ("GBP/USD", "GBP", "USD"),
    ("USD/JPY", "USD", "JPY"),
    ("USD/CHF", "USD", "CHF"),
    ("AUD/USD", "AUD", "USD"),
    ("USD/CAD", "USD", "CAD"),
    ("NZD/USD", "NZD", "USD"),
    ("EUR/GBP", "EUR", "GBP"),
    ("EUR/JPY", "EUR", "JPY"),
    ("GBP/JPY", "GBP", "JPY"),
    ("EUR/AUD", "EUR", "AUD"),
    ("EUR/CAD", "EUR", "CAD"),
    ("GBP/AUD", "GBP", "AUD"),
    ("GBP/CAD", "GBP", "CAD"),
    ("AUD/JPY", "AUD", "JPY"),
    ("EUR/CHF", "EUR", "CHF"),
    ("GBP/CHF", "GBP", "CHF"),
    ("AUD/CAD", "AUD", "CAD"),
    ("AUD/CHF", "AUD", "CHF"),
    ("NZD/JPY", "NZD", "JPY"),
]

# Fast lookup: app_symbol → (base, quote)
SYMBOL_TO_CURRENCIES: dict[str, tuple[str, str]] = {
    s: (base, quote) for s, base, quote in TRADEABLE_INSTRUMENTS
}

# All app symbols as a list — used by scanner / instrument_filter
INSTRUMENTS: list[str] = [s for s, _, _ in TRADEABLE_INSTRUMENTS]
