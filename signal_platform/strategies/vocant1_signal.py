"""
VOCANT.1 — assemble a Signal from a resolved 1M entry (a 'break' or a 'pullback').

Kept separate so vocant1.analyze() stays lean (150-line rule) and both entry kinds share ONE place
that builds the panel-labelled factors, reasons and market context. No trading logic here — pure
formatting of an already-decided entry/SL/TP.
"""
from core.types import TF, Signal, Direction
from news.news_filter import news_note

# (panel label, human blurb) per entry kind — both are the same motion (pullback at the volume-candle
# handover, stop beyond the level it came from); they differ only in where the stop could be anchored.
_KIND = {
    "pullback": ("PULLBACK",      "price past the 1HR line — one candle back, stop beyond where it came from"),
    "fractal":  ("FRACTAL BREAK", "price not past the line yet — stop beyond the fractal; the break re-aligns the 1M"),
}


def build_signal(kind, symbol, bullish, origin, vol_count, entry, sl, tp,
                 risk, pip, digits, corr, news_context, strategy_id, strategy_name,
                 alert_only=False) -> Signal:
    side         = "BUY" if bullish else "SELL"
    label, blurb = _KIND[kind]
    vlabel       = f"{vol_count} volume candle{'s' if vol_count != 1 else ''}"

    reasons = [
        (f"1HR RANGE BREAKOUT ({side.lower()}) — {vlabel} from the 1st, trend building"
         if origin == "range" else
         f"1HR clear {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend + {vlabel} from the 1st ({side.lower()})"),
        f"1M {label} — place {side} STOP at {entry:.{digits}f} ({blurb})",
        f"SL {sl:.{digits}f} | TP {tp:.{digits}f} | Risk {risk / pip:.0f} pips | RR 2:1",
    ]
    if corr:
        reasons.insert(0, f"⚠️ CORRELATED: {', '.join(corr)} already {side.lower()} (same USD direction) — size down or skip")

    smc = [
        f"CTX::1HR TREND::{'RANGE BREAKOUT' if origin == 'range' else ('UPTREND' if bullish else 'DOWNTREND')}",
        f"CTX::1HR VOLUME::{vol_count} CANDLE{'S' if vol_count != 1 else ''} (FROM 1ST)",
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
        alert_only        = alert_only,   # pull-back = DM alert (bypasses the symbol:direction dedup)
        technical_reasons = reasons,
        smc_factors       = smc,
        market_context    = (f"VOCANT.1 (validating) — {side} {symbol} 1M {label} "
                             f"[{'range breakout' if origin == 'range' else 'trend'}]"
                             f"{' correlated' if corr else ''} stop at {entry:.{digits}f}"),
        news_note         = news_note(news_context, ["USD", "EUR", "GBP"]) if news_context else "",
    )
