"""
Telegram signal parser — accuracy-focused, no LLM. Turns a free-form channel
message into a structured signal (symbol / side / entry / SL / TPs / event type)
with a confidence rating + sanity validation. Returns None when the message isn't
a tradeable signal.
"""
from dataclasses import dataclass, field
import re

from telegram_symbols import find_symbol

_PRICE = r"\d[\d,]*(?:\.\d{1,6})?"   # 1.0950 | 2350 | 1,950.50 | 1,0850 (handled by _num)
_CLOSE = re.compile(r"\b(close|exit|closed|booked|all\s*out|stopped?\s*out|"
                    r"tp\s*\d*\s*hit|sl\s*hit|target\s*hit|profit\s*hit|hit\s*tp|hit\s*sl)\b", re.I)
_MODIFY = re.compile(r"\b(move\s*sl|set\s*sl|sl\s*to|move\s*stop|break\s*even|breakeven|be\b|risk\s*free|secure\s*profit)\b", re.I)
_BUY = re.compile(r"\b(buy|long|bull(?:ish)?)\b", re.I)
_SELL = re.compile(r"\b(sell|short|bear(?:ish)?)\b", re.I)


@dataclass
class ParsedSignal:
    event_type: str                                   # OPEN | CLOSE | MODIFY
    symbol: str | None = None
    action: str | None = None                         # BUY | SELL
    entry: float | None = None                        # None = market order
    stop_loss: float | None = None
    take_profits: list[float] = field(default_factory=list)
    confidence: str = "low"                           # high | medium | low
    reason: str = ""


def _num(raw: str) -> float | None:
    s = raw.strip()
    if "," in s and "." in s:
        s = s.replace(",", "")                        # 1,085.50 -> 1085.50
    elif "," in s:
        after = s.split(",")[-1]
        s = s.replace(",", "." if len(after) >= 4 else "")  # 1,0850 -> 1.0850 ; 1,950 -> 1950
    try:
        return float(s)
    except ValueError:
        return None


def _first_after(text: str, keywords: list[str]) -> float | None:
    for kw in keywords:
        # \d? = an optional ordinal attached to the keyword (tp1, tp2) — NOT a
        # greedy \d* that would swallow the price's own digits.
        m = re.search(re.escape(kw) + r"\d?\s*[:=@\-]?\s*(" + _PRICE + r")", text, re.I)
        if m:
            return _num(m.group(1))
    return None


def _all_after(text: str, keywords: list[str]) -> list[float]:
    out: list[float] = []
    for kw in keywords:
        for m in re.finditer(re.escape(kw) + r"\d?\s*[:=@\-]?\s*(" + _PRICE + r")", text, re.I):
            v = _num(m.group(1))
            if v is not None and v not in out:
                out.append(v)
    return out


def _all_prices(text: str) -> list[float]:
    out: list[float] = []
    for m in re.finditer(r"(" + _PRICE + r")\s*(%|pips?|pts?)?", text, re.I):
        if m.group(2):                                # skip "95%", "30 pips", "10 pts"
            continue
        v = _num(m.group(1))
        if v is not None:
            out.append(v)
    return out


def parse_signal(text: str, cfg: dict | None = None) -> ParsedSignal | None:
    if not text or not text.strip():
        return None
    cfg = cfg or {}
    entry_kw = [cfg.get("entry_keyword") or "entry", "buy", "sell", "@", "price", "open", "enter", "now"]
    sl_kw    = [cfg.get("sl_keyword") or "sl", "stop loss", "stoploss", "stop", "s/l"]
    tp_kw    = [cfg.get("tp_keyword") or "tp", "take profit", "target", "tps", "t/p"]

    # ── Event type ──────────────────────────────────────────────────────────
    if _CLOSE.search(text):
        sym = find_symbol(text)
        return ParsedSignal("CLOSE", symbol=sym, confidence="high" if sym else "medium",
                            reason="close keyword")
    if _MODIFY.search(text) and not (_BUY.search(text) or _SELL.search(text)):
        return ParsedSignal("MODIFY", symbol=find_symbol(text),
                            stop_loss=_first_after(text, sl_kw), confidence="medium",
                            reason="modify keyword")

    # ── OPEN ────────────────────────────────────────────────────────────────
    symbol = find_symbol(text)
    action = "BUY" if _BUY.search(text) else "SELL" if _SELL.search(text) else None
    if not symbol or not action:
        return None                                   # not a tradeable open

    entry = _first_after(text, entry_kw)
    sl    = _first_after(text, sl_kw)
    tps   = _all_after(text, tp_kw)
    if entry is None:                                 # fallback: many signals are
        # "SYMBOL SIDE PRICE" with no entry keyword — take the first standalone
        # price that isn't the SL or a TP.
        for p in _all_prices(text):
            if p != sl and p not in tps:
                entry = p
                break
    if cfg.get("use_first_tp_only") and tps:
        tps = tps[:1]

    sig = ParsedSignal("OPEN", symbol=symbol, action=action, entry=entry,
                       stop_loss=sl, take_profits=tps)

    # ── Sanity + confidence ─────────────────────────────────────────────────
    reasons, ok = [], True
    if sl is not None and entry is not None:
        if action == "BUY" and sl >= entry:
            ok = False; reasons.append("SL not below entry for BUY")
        if action == "SELL" and sl <= entry:
            ok = False; reasons.append("SL not above entry for SELL")
    for tp in tps:
        if entry is not None and ((action == "BUY" and tp <= entry) or (action == "SELL" and tp >= entry)):
            ok = False; reasons.append("TP on wrong side of entry")
    if not sl and not cfg.get("execute_no_sl"):
        reasons.append("no SL")
    if not tps and not cfg.get("execute_no_tp"):
        reasons.append("no TP")

    filled = sum(1 for v in (entry, sl) if v is not None) + (1 if tps else 0)
    if not ok:
        sig.confidence = "low"
    elif filled >= 3:
        sig.confidence = "high"
    elif filled >= 1:
        sig.confidence = "medium"
    sig.reason = "; ".join(reasons) or "ok"
    return sig
