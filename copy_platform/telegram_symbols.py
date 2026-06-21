"""
Symbol normalization for Telegram signals — turns free-form text into a canonical
broker symbol (e.g. 'eur/usd' -> 'EURUSD', 'gold' -> 'XAUUSD'). Pure functions, no
network. The follower-side executor maps this canonical name to the account's
numeric symbolId, so we aim for the most common broker spelling.
"""
import re

_CCY = {
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
    "SGD", "HKD", "ZAR", "MXN", "TRY", "NOK", "SEK", "PLN", "CNH", "DKK",
}
_CRYPTO = {"BTC", "ETH", "XRP", "SOL", "BNB", "ADA", "DOGE", "DOT", "LTC", "AVAX", "LINK", "MATIC", "TRX"}

# Free-form name -> canonical. Indices are broker-dependent; we pick the common form.
_ALIASES = {
    "GOLD": "XAUUSD", "XAU": "XAUUSD",
    "SILVER": "XAGUSD", "XAG": "XAGUSD",
    "OIL": "XTIUSD", "WTI": "XTIUSD", "USOIL": "XTIUSD", "CRUDE": "XTIUSD",
    "BRENT": "XBRUSD", "UKOIL": "XBRUSD",
    "DOW": "US30", "DJ30": "US30", "WALLSTREET": "US30", "WS30": "US30",
    "NASDAQ": "NAS100", "US100": "NAS100", "USTEC": "NAS100", "NDX": "NAS100",
    "SP500": "US500", "SPX500": "US500", "SPX": "US500", "SP": "US500",
    "DAX": "GER40", "DE40": "GER40", "GER30": "GER40", "GDAXI": "GER40",
    "FTSE": "UK100", "UK100": "UK100", "NIKKEI": "JP225", "JP225": "JP225",
    "BITCOIN": "BTCUSD", "ETHEREUM": "ETHUSD",
}
_INDEX = re.compile(r"^(US30|US500|NAS100|GER40|UK100|JP225|AUS200|US2000|HK50|FRA40|ESP35)$")
_SUFFIX_RE = re.compile(r"(\.(raw|ecn|pro|r|s|m|c|z|sb))$|[+#!]+$", re.IGNORECASE)


def _clean(tok: str) -> str:
    return _SUFFIX_RE.sub("", tok.strip().upper())


def canon_token(tok: str) -> str | None:
    """Canonicalize a single token, or None if it isn't a recognizable symbol."""
    t = _clean(tok)
    if not t or len(t) < 2:
        return None
    if t in _ALIASES:
        return _ALIASES[t]
    if _INDEX.match(t):
        return t
    # XXX/YYY or XXX-YYY forex
    m = re.fullmatch(r"([A-Z]{3})[/\-]([A-Z]{3})", t)
    if m and m.group(1) in _CCY and m.group(2) in _CCY:
        return m.group(1) + m.group(2)
    # 6-letter forex pair
    if re.fullmatch(r"[A-Z]{6}", t) and t[:3] in _CCY and t[3:] in _CCY:
        return t
    # metals already in 6-letter form (XAUUSD / XAGUSD)
    if re.fullmatch(r"(XAU|XAG)(USD|EUR|GBP)", t):
        return t
    # crypto pair e.g. BTCUSD / BTCUSDT / ETH/USDT
    m = re.fullmatch(r"([A-Z]{2,5})[/\-]?(USDT|USD)", t)
    if m and m.group(1) in _CRYPTO:
        return m.group(1) + m.group(2)
    # bare crypto ticker -> +USD
    if t in _CRYPTO:
        return t + "USD"
    return None


def find_symbol(text: str) -> str | None:
    """Scan a message and return the first recognizable canonical symbol."""
    for raw in re.split(r"[\s,;:|()\[\]]+", text or ""):
        c = canon_token(raw)
        if c:
            return c
    return None
