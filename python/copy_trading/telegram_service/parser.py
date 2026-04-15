"""
Signal text parser.
Extracts trade parameters from free-form Telegram channel messages.
Supports user-configurable keywords (entry/SL/TP/symbol) or falls back
to a common pattern library.
"""
import re
import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger(__name__)

# ── Common keyword aliases ────────────────────────────────────────────────────
DIRECTION_PATTERNS = [
    (r"\b(buy\s+limit|buy\s+stop|buy)\b",  "BUY"),
    (r"\b(sell\s+limit|sell\s+stop|sell)\b", "SELL"),
    (r"\blong\b", "BUY"),
    (r"\bshort\b", "SELL"),
]
PRICE_PATTERN = r"[\d]{1,6}(?:[.,]\d{1,5})?"


@dataclass
class ParsedSignal:
    symbol:    str
    direction: str           # BUY | SELL
    entry:     Optional[float] = None
    sl:        Optional[float] = None
    tp:        Optional[float] = None
    tp2:       Optional[float] = None
    confidence: str = "Low"  # High | Medium | Low


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

    # ── Direction ────────────────────────────────────────────────────────────
    direction: Optional[str] = None
    for pat, d in DIRECTION_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            direction = d
            break
    if not direction:
        return None   # not a trade signal

    # ── Symbol — first ALL-CAPS word that looks like a forex/commodity pair ──
    symbol: Optional[str] = None
    if symbol_kw:
        m = re.search(re.escape(symbol_kw) + r"[:\s]*([A-Z]{3,10})", text, re.IGNORECASE)
        if m:
            symbol = m.group(1).upper()
    if not symbol:
        m = re.search(r"\b([A-Z]{3,6}(?:[/_]?[A-Z]{3,6})?)\b", text)
        if m:
            symbol = m.group(1).replace("/", "").replace("_", "").upper()

    if not symbol:
        return None

    # ── Prices ───────────────────────────────────────────────────────────────
    entry  = _find_after_keyword(text, entry_kw) or _find_after_keyword(text, "price") or _find_after_keyword(text, "@")
    sl     = _find_after_keyword(text, sl_kw)    or _find_after_keyword(text, "stop")
    tp_raw = _find_after_keyword(text, tp_kw)    or _find_after_keyword(text, "target") or _find_after_keyword(text, "take profit")

    # Try to find TP2
    tp2: Optional[float] = None
    if not use_first_tp_only:
        tp2_m = re.search(
            r"tp\s*2[:\s]*(" + PRICE_PATTERN + r")",
            text, re.IGNORECASE,
        )
        if tp2_m:
            tp2 = _clean_price(tp2_m.group(1))

    # Confidence scoring
    filled = sum(1 for v in [entry, sl, tp_raw] if v is not None)
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
