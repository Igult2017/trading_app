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
    # VIX.1 only — added 2026-08-19 at the user's request, taking VIX.1 to three instruments.
    #
    # THE FIRST NON-FOREX INSTRUMENT ON THE PLATFORM. Verified before shipping, not after:
    #   * broker symbol   `XAUUSD`, id 41, "Gold vs US Dollar", read off the live account. There are
    #     decoys — `XAUUSD-F` is a forward, plus `GOLD-PERP` and `GoldIndex` — so the name was
    #     confirmed rather than assumed.
    #   * pip            `shared/pip.py` already has XAUUSD at pipDigits 3, so a pip is 0.01 and
    #     prices print to 3 decimals. That entry was added 2026-07-25 precisely for this case; its
    #     own note calls it "a live landmine for the first metal/index/crypto instrument added".
    #   * base currency  "XAU" is NOT a currency with an economic calendar. The news filter will
    #     therefore only ever match USD events for gold. That is defensible (gold is driven by USD
    #     data) but it IS different from the FX rows, and is recorded here rather than discovered.
    ("XAU/USD", "XAU", "USD"),
]

SYMBOL_TO_CURRENCIES: dict[str, tuple[str, str]] = {
    s: (base, quote) for s, base, quote in TRADEABLE_INSTRUMENTS
}

INSTRUMENTS: list[str] = [s for s, _, _ in TRADEABLE_INSTRUMENTS]
