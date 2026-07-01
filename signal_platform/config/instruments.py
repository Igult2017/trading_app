"""
Instruments the platform will scan.
EURUSD (EURUSD Pullback) + GBPUSD (added for VOCANT.1, which trades both).
"""

TRADEABLE_INSTRUMENTS: list[tuple[str, str, str]] = [
    # (app_symbol, base_currency, quote_currency)
    ("EUR/USD", "EUR", "USD"),
    ("GBP/USD", "GBP", "USD"),
]

SYMBOL_TO_CURRENCIES: dict[str, tuple[str, str]] = {
    s: (base, quote) for s, base, quote in TRADEABLE_INSTRUMENTS
}

INSTRUMENTS: list[str] = [s for s, _, _ in TRADEABLE_INSTRUMENTS]
