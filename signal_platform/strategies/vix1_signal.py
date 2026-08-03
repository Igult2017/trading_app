"""
VIX.1 — assemble a Signal from a resolved 1M entry (a 'pullback' or a 'fractal' path).

Kept separate so vix1.analyze() stays lean (150-line rule) and both entry kinds share ONE place
that builds the panel-labelled factors, reasons and market context. No trading logic here — pure
formatting of an already-decided entry/SL/TP.
"""
from charting import theme
from core.types import TF, Signal, Direction
from news.news_filter import news_note

# (panel label, human blurb) per entry kind — both are the same motion (pullback at the momentum-candle
# handover, stop beyond the level it came from); they differ only in where the stop could be anchored.
_KIND = {
    "pullback": ("PULLBACK",                 "the 1M was already aligned at the line; stop beyond the one-candle pullback"),
    "fractal":  ("FRACTAL BREAK → PULLBACK", "the fractal break confirmed the 1M turned; stop beyond the pullback after it"),
}


# How each origin describes itself. 'choch'/'choch4' are REVERSALS — they must never render as "clear
# up trend", because the structure they name is the one that just broke. 'trend4' = 1HR trend unclear,
# 4HR-backed. (No 'range' — VIX.1 trades trends & CHoCH only.)
_CTX   = {"choch": "STRUCTURE CHANGE", "choch4": "4HR STRUCTURE CHANGE", "trend4": "4HR-BACKED TREND"}
_SHORT = {"choch": "structure change", "choch4": "4HR structure change", "trend4": "4HR-backed trend"}


def _origin_reason(origin: str, bullish: bool, mlabel: str, side: str) -> str:
    if origin == "choch":
        return (f"1HR STRUCTURE CHANGE ({side}) — the prior {'down' if bullish else 'up'} 1HR structure "
                f"broke: {mlabel} from the 1st closed through the swing that defined it")
    if origin == "choch4":
        return (f"4HR STRUCTURE CHANGE ({side}) — 1HR trend unclear; the prior {'down' if bullish else 'up'} "
                f"4HR structure broke: {mlabel} from the 1st closed through the 4HR swing that defined it")
    if origin == "trend4":
        return (f"4HR-BACKED TREND ({side}) — 1HR trend unclear, but the 1HR {mlabel} aligns with a "
                f"clear 4HR {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend")
    return (f"1HR clear {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend + {mlabel} "
            f"from the 1st ({side})")


def build_signal(kind, symbol, bullish, origin, vol_count, entry, sl, tp,
                 risk, pip, digits, corr, news_context, strategy_id, strategy_name,
                 grade, confidence, alert_only=False, sl_note="",
                 late=False, late_note="", rr=2.0, mc_time: int | None = None,
                 line: float | None = None) -> Signal:
    side         = "BUY" if bullish else "SELL"
    label, blurb = _KIND[kind]
    mlabel       = f"{vol_count} momentum candle{'s' if vol_count != 1 else ''}"

    # WHICH CANDLE THIS CAME FROM, in UTC. The card carried the signal's own time but never named
    # the H1 candle that produced it, so verifying a signal against a chart meant guessing — and on
    # a chart in any zone but UTC, guessing wrong. A correct EUR/USD sell (31 Jul 10:37 UTC, off a
    # RED momentum candle that closed at 09:00 UTC) was read off a green candle four hours later
    # for exactly this reason. Stated in UTC and labelled, like every other time on this platform.
    mc_line = None
    if mc_time:
        from datetime import datetime, timezone as _tz
        mc_line = ("🕯 Momentum candle  "
                   f"{datetime.fromtimestamp(mc_time, _tz.utc).strftime('%d %b %H:%M UTC')} (H1 open)")

    reasons = [
        _origin_reason(origin, bullish, mlabel, side.lower()),
        f"1M {label} — {blurb}",
        f"Momentum candle grade {grade} ({confidence:.0%} confidence) — body/wick shape, not size",
        (f"SL sits {sl_note}" if sl_note else f"SL {sl:.{digits}f}"),
    ]
    # A LATE entry still ships (>=1R remains) but must SAY SO at the top — the reader is being
    # offered a worse price than the method's own recommended one.
    if late and late_note:
        reasons.insert(0, late_note)
    if corr:
        reasons.insert(0, f"⚠️ CORRELATED: {', '.join(corr)} already {side.lower()} (same USD direction) — size down or skip")
    # Last, so it reads as the footnote it is — the fact you check the chart against.
    if mc_line:
        reasons.append(mc_line)

    smc = [
        f"CTX::TREND::{_CTX.get(origin) or ('UPTREND' if bullish else 'DOWNTREND')}",
        f"CTX::1HR MOMENTUM::{vol_count} CANDLE{'S' if vol_count != 1 else ''} (FROM 1ST)",
        f"CTX::MOMENTUM GRADE::{grade} ({confidence:.0%})",
        f"CTX::1M ENTRY::{label}",
        f"PA::{label} STOP-ENTRY ({rr:.1f}R{' — LATE' if late else ''})",
    ]
    if late:
        smc.append("PA::PAST THE RECOMMENDED ENTRY PRICE")
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
        risk_reward       = round(rr, 2),   # a LATE entry is honestly < 2R — never claim the full 2R
        confidence        = confidence,
        primary_timeframe = TF.H1,
        # THE LINE — the body close of the first momentum candle (vix1_lines.draw_line). The 1M
        # entry model is read entirely against it: which side price is on decides whether the
        # pullback is the entry or a fractal must break first, and the stop may never rest past it.
        # A card that omits it cannot be checked against a chart. Passed as a zero-height band,
        # which `price_panel` renders as a single labelled line.
        chart_bands       = ([(line, line, theme.LEVEL, "1H LINE")] if line else []),
        chart_marks       = ([(mc_time, "MOMENTUM")] if mc_time else []),
        alert_only        = alert_only,   # FALSE for the pull-back entry -> PUBLIC CHANNEL (a real card).
        # STAGE 2 — a placeable entry with a stop and a target. The stage-1 heads-up that precedes
        # it lives in vix1_building; the runner derives the order type (BUY/SELL STOP vs MARKET)
        # from the entry against live price at card time.
        stage             = "ready",
                                          # The param is a passthrough; only the invalidation DM sets it True.
        technical_reasons = reasons,
        smc_factors       = smc,
        # NOT "(validating)" — this builder is only ever called for a resolved entry that ships to
        # the public channel as a full signal card (strategy_id `vix1`, alert_only False). The
        # old label described the card as provisional on the one message that is not.
        market_context    = (f"VIX.1 — {side} {symbol} 1M {label} "
                             f"[{_SHORT.get(origin, 'trend')}]"
                             f"{' PAST-ENTRY' if late else ''}"
                             f"{' correlated' if corr else ''} stop at {entry:.{digits}f}"),
        # Currencies come from the SYMBOL, not a hardcoded list. ["USD","EUR","GBP"] matched the
        # current allowed_instruments exactly, so the day USD/JPY is added (the class docstring
        # already contemplates it) every JPY event would drop off the card silently.
        news_note         = news_note(news_context, symbol.split("/")) if news_context else "",
    )
