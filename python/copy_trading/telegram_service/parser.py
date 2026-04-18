"""
Signal text parser.
Extracts trade parameters from free-form Telegram channel messages.

Supported event types:
  OPEN   — BUY/SELL signal with entry, SL, TP
  CLOSE  — explicit close / TP-hit / SL-hit messages
  MODIFY — SL or TP update messages

Event type is detected first; direction/prices are extracted on a
best-effort basis depending on what the message contains.
"""
import re
import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger(__name__)

# ── Known trading symbols whitelist ──────────────────────────────────────────
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

_SYMBOL_BLOCKLIST: set[str] = {
    "BUY", "SELL", "LONG", "SHORT", "STOP", "LIMIT", "ENTRY", "TARGET",
    "HIGH", "LOW", "CLOSE", "OPEN", "PRICE", "LOSS", "PROFIT", "TAKE",
    "TRADE", "SIGNAL", "ALERT", "NEWS", "UPDATE", "MARKET", "ORDER",
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
    "TP", "SL", "RR", "PIP", "LOT", "PAIR",
}

# ── Event-type patterns (checked BEFORE direction) ────────────────────────────

# A message matches CLOSE if it contains any of these patterns.
_CLOSE_PATTERNS: list[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    r"\b(close\s+all|close\s+trade|close\s+position|trade\s+closed|position\s+closed)\b",
    r"\b(exit\s+all|exit\s+trade|exit\s+now|exit\s+signal)\b",
    r"\b(sl\s+hit|stop\s+hit|stop\s+loss\s+hit|stopped\s+out)\b",
    r"\b(tp\s*\d*\s*hit|target\s+hit|take\s+profit\s+hit|profit\s+hit)\b",
    r"\b(manually?\s+clos|force\s+clos|close\s+(?:buy|sell))\b",
    r"^[🔴🔒❌⛔🚫]\s*(?:close|exit|clos)",               # emoji-prefixed close
    r"\b(market\s+closed|trade\s+over|signal\s+closed)\b",
]]

# A message matches MODIFY if it contains any of these patterns.
_MODIFY_PATTERNS: list[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    r"\b(move|adjust|update|shift|change|set)\s+sl\b",
    r"\b(move|adjust|update|shift|change|set)\s+tp\b",
    r"\bsl\s+(moved?|adjusted?|updated?|changed?|now|to)\b",
    r"\btp\s+(moved?|adjusted?|updated?|changed?|now|to)\b",
    r"\bbreak\s*even\b",                                   # "move to break even"
    r"\bnew\s+(?:sl|stop|tp|target)\b",
    r"\bpartial\s+(close|take)\b",                         # partial close = MODIFY
]]

# ── Direction patterns ────────────────────────────────────────────────────────
DIRECTION_PATTERNS = [
    (r"\b(buy\s+limit|buy\s+stop|buy)\b",   "BUY"),
    (r"\b(sell\s+limit|sell\s+stop|sell)\b", "SELL"),
    (r"\blong\b",  "BUY"),
    (r"\bshort\b", "SELL"),
]

PRICE_PATTERN = r"\d{2,6}(?:[.,]\d{1,5})?"


@dataclass
class ParsedSignal:
    symbol:     str
    direction:  str               # BUY | SELL
    event_type: str = "OPEN"      # OPEN | CLOSE | MODIFY
    entry:      Optional[float] = None
    sl:         Optional[float] = None
    tp:         Optional[float] = None
    tp2:        Optional[float] = None
    confidence: str = "Low"       # High | Medium | Low


def _clean_price(raw: str) -> Optional[float]:
    try:
        return float(raw.replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _find_after_keyword(text: str, keyword: str) -> Optional[float]:
    pattern = re.compile(
        re.escape(keyword) + r"[:\s@at]*(" + PRICE_PATTERN + r")",
        re.IGNORECASE,
    )
    m = pattern.search(text)
    return _clean_price(m.group(1)) if m else None


def _extract_symbol(text: str, symbol_kw: str = "") -> Optional[str]:
    if symbol_kw:
        m = re.search(re.escape(symbol_kw) + r"[:\s]*([A-Z]{3,10})", text, re.IGNORECASE)
        if m:
            candidate = m.group(1).upper()
            if candidate not in _SYMBOL_BLOCKLIST:
                return candidate

    upper_text = text.upper()
    for sym in sorted(KNOWN_SYMBOLS, key=len, reverse=True):
        if re.search(r"(?<![A-Z])" + re.escape(sym) + r"(?![A-Z])", upper_text):
            return sym

    for m in re.finditer(r"\b([A-Z]{3,6}(?:[/_]?[A-Z]{3,6})?)\b", text):
        candidate = m.group(1).replace("/", "").replace("_", "").upper()
        if candidate not in _SYMBOL_BLOCKLIST and len(candidate) >= 3:
            return candidate

    return None


def _detect_event_type(text: str) -> str:
    """Return CLOSE, MODIFY, or OPEN based on message content."""
    for pat in _CLOSE_PATTERNS:
        if pat.search(text):
            return "CLOSE"
    for pat in _MODIFY_PATTERNS:
        if pat.search(text):
            return "MODIFY"
    return "OPEN"


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
    Returns None if no trading intent is detected at all.

    For CLOSE/MODIFY the direction requirement is relaxed — providers
    often omit BUY/SELL in their close messages, so the parser tries to
    infer it and falls back to 'BUY' as a neutral placeholder.  The worker
    will match the actual open position from the database regardless.
    """
    text = text.strip()
    event_type = _detect_event_type(text)

    # ── Direction ─────────────────────────────────────────────────────────────
    direction: Optional[str] = None
    for pat, d in DIRECTION_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            direction = d
            break

    # For OPEN signals direction is mandatory; for CLOSE/MODIFY it is optional.
    if event_type == "OPEN" and not direction:
        return None

    direction = direction or "BUY"  # neutral placeholder for CLOSE/MODIFY

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
        "[Parser] %s %s %s entry=%s sl=%s tp=%s confidence=%s",
        event_type, direction, symbol, entry, sl, tp_raw, confidence,
    )

    return ParsedSignal(
        symbol=symbol,
        direction=direction,
        event_type=event_type,
        entry=entry,
        sl=sl,
        tp=tp_raw,
        tp2=tp2,
        confidence=confidence,
    )
