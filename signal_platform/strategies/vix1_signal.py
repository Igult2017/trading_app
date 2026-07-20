"""
VIX.1 — assemble a Signal from a resolved 1M entry (a 'pullback' or a 'fractal' path).

Kept separate so vix1.analyze() stays lean (150-line rule) and both entry kinds share ONE place
that builds the panel-labelled factors, reasons and market context. No trading logic here — pure
formatting of an already-decided entry/SL/TP.
"""
from core.types import TF, Signal, Direction
from news.news_filter import news_note

# (panel label, human blurb) per entry kind — both are the same motion (pullback at the momentum-candle
# handover, stop beyond the level it came from); they differ only in where the stop could be anchored.
_KIND = {
    "pullback": ("PULLBACK",                 "the 1M was already aligned at the line; stop beyond the one-candle pullback"),
    "fractal":  ("FRACTAL BREAK → PULLBACK", "the fractal break confirmed the 1M turned; stop beyond the pullback after it"),
}


# How each origin describes itself. 'choch' is a REVERSAL — it must never render as "clear up trend",
# because the trend it names is the one that just broke. 'trend4' = 1HR trend unclear, 4HR-backed.
# (No 'range' — VIX.1 trades trends only.)
_CTX   = {"choch": "STRUCTURE CHANGE", "trend4": "4HR-BACKED TREND"}
_SHORT = {"choch": "structure change", "trend4": "4HR-backed trend"}


def _origin_reason(origin: str, bullish: bool, mlabel: str, side: str) -> str:
    if origin == "choch":
        return (f"1HR STRUCTURE CHANGE ({side}) — the {'down' if bullish else 'up'} 1HR trend broke: "
                f"{mlabel} from the 1st closed through the swing that defined it")
    if origin == "trend4":
        return (f"4HR-BACKED TREND ({side}) — 1HR trend unclear, but the 1HR {mlabel} aligns with a "
                f"clear 4HR {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend")
    return (f"1HR clear {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend + {mlabel} "
            f"from the 1st ({side})")


def build_signal(kind, symbol, bullish, origin, vol_count, entry, sl, tp,
                 risk, pip, digits, corr, news_context, strategy_id, strategy_name,
                 alert_only=False, sl_note="") -> Signal:
    side         = "BUY" if bullish else "SELL"
    label, blurb = _KIND[kind]
    mlabel       = f"{vol_count} momentum candle{'s' if vol_count != 1 else ''}"

    reasons = [
        _origin_reason(origin, bullish, mlabel, side.lower()),
        f"1M {label} — {blurb}",
        (f"SL sits {sl_note}" if sl_note else f"SL {sl:.{digits}f}"),
    ]
    if corr:
        reasons.insert(0, f"⚠️ CORRELATED: {', '.join(corr)} already {side.lower()} (same USD direction) — size down or skip")

    smc = [
        f"CTX::TREND::{_CTX.get(origin) or ('UPTREND' if bullish else 'DOWNTREND')}",
        f"CTX::1HR MOMENTUM::{vol_count} CANDLE{'S' if vol_count != 1 else ''} (FROM 1ST)",
        f"CTX::1M ENTRY::{label}",
        f"PA::{label} STOP-ENTRY (2R)",
    ]
    if corr:
        smc.append("PA::CORRELATED USD — SIZE DOWN")

    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if bullish else Direction.SELL,
        strategy_id       = strategy_id,          # _watch → private DM (Phase 1)
        strategy_name     = strategy_name,
        entry_price       = round(entry, digits),
        stop_loss         = round(sl, digits),
        take_profit       = round(tp, digits),
        risk_reward       = 2.0,
        confidence        = 0.72,
        primary_timeframe = TF.H1,
        alert_only        = alert_only,   # FALSE for the pull-back entry -> PUBLIC CHANNEL (a real card).
                                          # The param is a passthrough; only the invalidation DM sets it True.
        technical_reasons = reasons,
        smc_factors       = smc,
        # NOT "(validating)" — this builder is only ever called for a resolved entry that ships to
        # the public channel as a full signal card (strategy_id `vix1`, alert_only False). The
        # old label described the card as provisional on the one message that is not.
        market_context    = (f"VIX.1 — {side} {symbol} 1M {label} "
                             f"[{_SHORT.get(origin, 'trend')}]"
                             f"{' correlated' if corr else ''} stop at {entry:.{digits}f}"),
        # Currencies come from the SYMBOL, not a hardcoded list. ["USD","EUR","GBP"] matched the
        # current allowed_instruments exactly, so the day USD/JPY is added (the class docstring
        # already contemplates it) every JPY event would drop off the card silently.
        news_note         = news_note(news_context, symbol.split("/")) if news_context else "",
    )
