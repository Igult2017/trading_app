"""
Signal text parser.
Extracts trade parameters from free-form Telegram channel messages.

Fixes applied:
  - Symbol extraction uses a known-symbol whitelist first before falling
    back to a regex pattern, preventing common English words (BUY, SELL,
    HIGH, STOP, USD) from being misidentified as symbols.
  - PRICE_PATTERN tightened to require at least 2 digits before the decimal
    separator to avoid single-digit false positives.
  - Confidence scoring unchanged.
"""
import re
import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger(__name__)

# ── Known trading symbols whitelist ──────────────────────────────────────────
# The parser checks this first.  Unknown symbols still pass through via regex
# so niche instruments are not blocked.
KNOWN_SYMBOLS: set[str] = {
    # Forex majors
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
    # Forex crosses
    "EURGBP", "EURJPY", "EURAUD", "EURCAD", "EURCHF", "EURNZD",
    "GBPJPY", "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD",
    "AUDJPY", "AUDCAD", "AUDCHF", "AUDNZD",
    "CADJPY", "CADCHF", "CHFJPY", "NZDJPY", "NZDCAD", "NZDCHF",
    # Commodities
    "XAUUSD", "XAGUSD", "GOLD", "SILVER", "XPTUSD", "XPDUSD",
    "USOIL", "UKOIL", "WTI", "BRENT", "NGAS", "NATGAS",
    # Indices
    "US30", "US100", "US500", "UK100", "GER40", "GER30", "JPN225",
    "AUS200", "FRA40", "ESP35", "NAS100", "SPX500", "DJ30",
    # Crypto
    "BTCUSD", "ETHUSD", "XRPUSD", "LTCUSD", "BNBUSD", "ADAUSD",
    "SOLUSD", "DOTUSD", "DOGEUSD", "MATICUSD",
    "BTCUSDT", "ETHUSDT", "XRPUSDT", "BNBUSDT", "SOLUSDT",
    "BTC", "ETH", "XRP", "SOL", "BNB", "ADA", "DOT",
}

# Words that look like symbols but are common English / trading terms
_SYMBOL_BLOCKLIST: set[str] = {
    "BUY", "SELL", "LONG", "SHORT", "STOP", "LIMIT", "ENTRY", "TARGET",
    "HIGH", "LOW", "CLOSE", "OPEN", "PRICE", "LOSS", "PROFIT", "TAKE",
    "TRADE", "SIGNAL", "ALERT", "NEWS", "UPDATE", "MARKET", "ORDER",
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
    "TP", "SL", "RR", "PIP", "LOT", "PAIR",
}

# ── Common direction patterns ─────────────────────────────────────────────────
DIRECTION_PATTERNS = [
    (r"\b(buy\s+limit|buy\s+stop|buy)\b",   "BUY"),
    (r"\b(sell\s+limit|sell\s+stop|sell)\b", "SELL"),
    (r"\blong\b",  "BUY"),
    (r"\bshort\b", "SELL"),
]

# Tightened: require at least 2 digits before the decimal point
PRICE_PATTERN = r"\d{2,6}(?:[.,]\d{1,5})?"


@dataclass
class ParsedSignal:
    symbol:     str
    direction:  str            # BUY | SELL
    entry:      Optional[float] = None
    sl:         Optional[float] = None
    tp:         Optional[float] = None
    tp2:        Optional[float] = None
    confidence: str = "Low"    # High | Medium | Low


def _clean_price(raw: str) -> Optional[float]:
    try:
        return float(raw.replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _find_after_keyword(text: str, keyword: str) -> Optional[float]:
    """Find the first price-like number that appears after `keyword`."""
    pattern = re.compile(
        re.escape(keyword) + r"[:\s@at]*(" + PRICE_PATTERN + r")",
        re.IGNORECASE,
    )
    m = pattern.search(text)
    return _clean_price(m.group(1)) if m else None


def _extract_symbol(text: str, symbol_kw: str = "") -> Optional[str]:
    """
    Extract the trading symbol from the message.

    Strategy:
      1. If a symbol_keyword is configured, look immediately after it.
      2. Search the known-symbol whitelist for an exact match (fastest, most accurate).
      3. Fall back to a regex for unlisted instruments, filtering out blocklisted words.
    """
    # Step 1: user-configured keyword
    if symbol_kw:
        m = re.search(re.escape(symbol_kw) + r"[:\s]*([A-Z]{3,10})", text, re.IGNORECASE)
        if m:
            candidate = m.group(1).upper()
            if candidate not in _SYMBOL_BLOCKLIST:
                return candidate

    # Step 2: whitelist scan — find any known symbol in the text
    upper_text = text.upper()
    # Prefer longer matches (BTCUSDT over BTC, EURUSD over EUR)
    for sym in sorted(KNOWN_SYMBOLS, key=len, reverse=True):
        # Use word-boundary-like check: preceded/followed by non-alphanumeric or start/end
        if re.search(r"(?<![A-Z])" + re.escape(sym) + r"(?![A-Z])", upper_text):
            return sym

    # Step 3: regex fallback — first all-caps word that looks like an FX/commodity pair
    for m in re.finditer(r"\b([A-Z]{3,6}(?:[/_]?[A-Z]{3,6})?)\b", text):
        candidate = m.group(1).replace("/", "").replace("_", "").upper()
        if candidate not in _SYMBOL_BLOCKLIST and len(candidate) >= 3:
            return candidate

    return None


def parse_message(
    text: str,
    entry_kw:  str = "entry",
    sl_kw:     str = "sl",
    tp_kw:     str = "tp",
    symbol_kw: str = "",
    use_first_tp_only: bool = True,
) -> Optional[ParsedSignal]:
    """
    Parse a Telegram signal message.
    Returns None if the message does not look like a trade signal.
    """
    text = text.strip()

    # ── Direction ─────────────────────────────────────────────────────────────
    direction: Optional[str] = None
    for pat, d in DIRECTION_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            direction = d
            break
    if not direction:
        return None

    # ── Symbol ────────────────────────────────────────────────────────────────
    symbol = _extract_symbol(text, symbol_kw)
    if not symbol:
        return None

    # ── Prices ────────────────────────────────────────────────────────────────
    entry  = _find_after_keyword(text, entry_kw) or _find_after_keyword(text, "price") or _find_after_keyword(text, "@")
    sl     = _find_after_keyword(text, sl_kw)    or _find_after_keyword(text, "stop")
    tp_raw = _find_after_keyword(text, tp_kw)    or _find_after_keyword(text, "target") or _find_after_keyword(text, "take profit")

    tp2: Optional[float] = None
    if not use_first_tp_only:
        tp2_m = re.search(r"tp\s*2[:\s]*(" + PRICE_PATTERN + r")", text, re.IGNORECASE)
        if tp2_m:
            tp2 = _clean_price(tp2_m.group(1))

    filled     = sum(1 for v in [entry, sl, tp_raw] if v is not None)
    confidence = "High" if filled == 3 else "Medium" if filled == 2 else "Low"

    log.debug(
        "[Parser] %s %s entry=%s sl=%s tp=%s confidence=%s",
        direction, symbol, entry, sl, tp_raw, confidence,
    )

    return ParsedSignal(
        symbol=symbol,
        direction=direction,
        entry=entry,
        sl=sl,
        tp=tp_raw,
        tp2=tp2,
        confidence=confidence,
    )
