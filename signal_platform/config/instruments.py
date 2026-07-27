"""
Instruments the platform will scan.

EURUSD + GBPUSD (VIX.1 trades both) + USDJPY + GBPJPY (BX-S/D scans all four).
A strategy still opts in via its own allowed_instruments, so adding one here only means the
platform CAN fetch it — VIX.1 keeps its own narrower list.

Adding a row here is all an instrument needs: the broker symbol is derived (`GBP/JPY` -> `GBPJPY`,
resolved against cTrader's own live symbol list, no id table to maintain), pip size comes from
`shared/pip.py` (any symbol containing JPY quotes to 3 decimals, so a pip is 0.01), and the news
currency map below is generated from this table.
"""

TRADEABLE_INSTRUMENTS: list[tuple[str, str, str]] = [
    # (app_symbol, base_currency, quote_currency)
    ("EUR/USD", "EUR", "USD"),
    ("GBP/USD", "GBP", "USD"),
    ("USD/JPY", "USD", "JPY"),
    ("GBP/JPY", "GBP", "JPY"),   # BX-S/D only — added 2026-07-27 at the user's request
]

SYMBOL_TO_CURRENCIES: dict[str, tuple[str, str]] = {
    s: (base, quote) for s, base, quote in TRADEABLE_INSTRUMENTS
}

INSTRUMENTS: list[str] = [s for s, _, _ in TRADEABLE_INSTRUMENTS]
