"""
Instruments the platform will scan.

EURUSD + GBPUSD (VOCANT.1 trades both) + USDJPY (BX-S/D scans all three).
A strategy still opts in via its own allowed_instruments, so adding one here only means the
platform CAN fetch it — VOCANT.1 keeps its own narrower list.
"""

TRADEABLE_INSTRUMENTS: list[tuple[str, str, str]] = [
    # (app_symbol, base_currency, quote_currency)
    ("EUR/USD", "EUR", "USD"),
    ("GBP/USD", "GBP", "USD"),
    ("USD/JPY", "USD", "JPY"),
]

SYMBOL_TO_CURRENCIES: dict[str, tuple[str, str]] = {
    s: (base, quote) for s, base, quote in TRADEABLE_INSTRUMENTS
}

INSTRUMENTS: list[str] = [s for s, _, _ in TRADEABLE_INSTRUMENTS]
