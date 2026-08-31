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
    # GOLD IS 2, NOT 3 — and being wrong here broke autotrade twice over, silently.
    #
    # THE BROKER SAID SO ITSELF, refusing a real order on 31 Aug 2026 13:17 UTC:
    #     "Order price = 4433.959 has more digits than symbol allows. Allowed 2 digits"
    # Confirmed independently against its live quote the same day: XAU/USD came back as 4436.69,
    # two decimals, while EUR/USD came back with five and USD/JPY with three — so only gold was
    # wrong, and the other four in this file are right.
    #
    # IT ALSO FIXES THE SIZE, which is the part that would never have shown up as an error. This
    # number sets `pip_size` too, and `sizing.size_lots` assumes $10 per pip per lot — true for a
    # 100 oz gold contract only when a pip is $0.10, i.e. at 2 digits. At 3 digits a "pip" was
    # $0.01, so a stop measured 10x too many pips and every gold position came out **10x too
    # small**. The refused order is the proof: 0.5% of $9,999 over a $3.429 stop is 0.146 lots, and
    # it went out at the 0.01 minimum.
    #
    # XAGUSD IS LEFT AT 3 AND IS UNVERIFIED — silver is not traded here and nothing has told us its
    # precision. Do not "fix" it to match gold on the assumption that metals agree; ask the broker.
    "XAUUSD": 2, "XAGUSD": 3,
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
        return 3          # UNVERIFIED for anything but XAUUSD, which the broker told us is 2 (above)
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
