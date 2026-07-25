"""
Pip size and price precision per instrument — single source of truth so all pip-based math (risk
gates, entry/SL buffers, R levels, position sizing) scales correctly for ANY instrument. A shared
platform resource: any strategy imports these instead of hardcoding 0.0001.

CORRECTED 2026-07-25 against cTrader's own precision table (the `ctrader-mcp-servers` skill ships
`assets/symbol_precision_table.json`, sourced from the live Remote API). The old rule was
"JPY -> 3 digits / 0.01, everything else -> 5 digits / 0.0001", which is right for FX majors and
WRONG for 11 of the 20 symbols cTrader lists:

    XAUUSD XAGUSD          pipDigits 3   (we said 5)   -> gold pip was 100x too small
    US30 US500 NAS100 …    pipDigits 1   (we said 5)
    USOIL UKOIL            pipDigits 2   (we said 5)
    BTCUSD ETHUSD          pipDigits 2   (we said 5)

Nothing shipped was mis-priced by this: VIX.1 trades EUR/USD + GBP/USD and BX adds USD/JPY, all of
which the old rule happened to get right. It was a live landmine for the first metal/index/crypto
instrument added, and `copy_platform/lot_calc.py` already carried its own (partial) version of the
same table — which is exactly how these drift apart.

cTrader's convention: `pipDigits` is the number of PRICE decimals; the pip is the last-but-one
decimal, so pip = 10^-(pipDigits-1) and a pipette (the final digit) is 10^-pipDigits.
"""

# pipDigits per instrument family, from cTrader's table. Matched most-specific first.
_EXACT = {
    "XAUUSD": 3, "XAGUSD": 3,
    "US30": 1, "US500": 1, "NAS100": 1, "GER40": 1, "UK100": 1, "JP225": 1, "AUS200": 1,
    "USOIL": 2, "UKOIL": 2, "BRENT": 2, "WTI": 2,
    "BTCUSD": 2, "ETHUSD": 2,
}


def _key(symbol: str) -> str:
    """Normalise 'XAU/USD', 'xau_usd', 'XAUUSD' -> 'XAUUSD'."""
    return "".join(ch for ch in (symbol or "").upper() if ch.isalnum())


def pip_digits(symbol: str) -> int:
    """Number of PRICE decimals cTrader quotes this instrument in."""
    k = _key(symbol)
    if k in _EXACT:
        return _EXACT[k]
    if k.startswith(("XAU", "XAG")):
        return 3
    if k.startswith(("BTC", "ETH", "XRP", "LTC", "SOL")):
        return 2
    if "JPY" in k:
        return 3
    return 5                      # 5-digit FX (EUR/USD, GBP/USD, …)


def pip_size(symbol: str) -> float:
    """One pip in price terms — the last-but-one decimal (10^-(pipDigits-1))."""
    return 10.0 ** -(pip_digits(symbol) - 1)


def price_digits(symbol: str) -> int:
    """Decimal places for rounding/printing a price of this instrument."""
    return pip_digits(symbol)
