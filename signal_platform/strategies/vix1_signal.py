"""
VIX.1 — assemble a Signal from a resolved 1M entry (a 'pullback' or a 'fractal' path).

Kept separate so vix1.analyze() stays lean (150-line rule) and both entry kinds share ONE place
that builds the panel-labelled factors, reasons and market context. No trading logic here — pure
formatting of an already-decided entry/SL/TP.
"""
from charting import theme
from core.types import TF, Signal, Direction
from notifications import titles
from news.news_filter import news_note
from strategies.vix1_retracement import Retracement
from strategies.vix1_regime import Regime
from strategies.vix1_state import state_line

# (panel label, human blurb) per entry kind — both are the same motion (pullback at the momentum-candle
# handover, stop beyond the level it came from); they differ only in where the stop could be anchored.
#
# THE "ASSUMED" PAIR EXISTS BECAUSE HE ASKED FOR IT TO BE VISIBLE, 2026-08-20: *"If there is no
# pullback where we expect it, we assume it is there and enter but report that in the signal."* The
# reader is being shown a retrace that has not actually happened, and must be told so on the card's
# face rather than in a footnote.
_KIND = {
    "pullback":         ("PULLBACK",                 "price crossed the line and pulled back; order one tick beyond how far it got"),
    "returned":         ("RETURNED TO THE LINE",     "no pullback formed in the first 3 candles, so the order waited for price to come BACK to the line and rests one tick beyond the bar that touched it"),
    "fractal_pullback": ("FRACTAL BREAK → PULLBACK", "the fractal break confirmed the 1M turned, then price crossed and pulled back"),
    "fractal_assumed":  ("FRACTAL BREAK → ASSUMED",  "the fractal break confirmed the 1M turned; price crossed but did NOT pull back — the pullback is assumed"),
}


# How each origin describes itself. 'trend4' = 1HR trend unclear, 4HR-backed.
#
# 'choch' RETURNED 2026-08-15, and it is NOT the old one. The 2026-07-26 origins fired on a bare
# structure break; this one is his rule and needs momentum to have developed the new way, out of a
# trending market, while the turn is still unconfirmed (vix1_choch). The old 'choch4' stays deleted.
_CTX   = {"trend4": "4HR-BACKED TREND", "choch": "CHANGE OF CHARACTER"}
_SHORT = {"trend4": "4HR-backed trend", "choch": "change of character"}


def _origin_reason(origin: str, bullish: bool, mlabel: str, side: str) -> str:
    if origin == "trend4":
        return (f"4HR-BACKED TREND ({side}) — 1HR trend unclear, but the 1HR {mlabel} aligns with a "
                f"clear 4HR {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend")
    if origin == "choch":
        return (f"CHANGE OF CHARACTER ({side}) — price closed through the level protecting the old "
                f"trend and the {mlabel} developed {'up' if bullish else 'down'} after it; taken "
                f"without waiting for a pullback, which applies again once this trend confirms")
    return (f"1HR clear {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend + {mlabel} "
            f"from the 1st ({side})")


def build_signal(kind, symbol, bullish, origin, vol_count, entry, sl, tp,
                 risk, pip, digits, corr, news_context, strategy_id, strategy_name,
                 grade, confidence, alert_only=False, sl_note="",
                 late=False, late_note="", rr=2.0, mc_time: int | None = None,
                 line: float | None = None, bias_reason: str = "",
                 retracement: Retracement | None = None,
                 efficiency: float | None = None,
                 regime: Regime | None = None) -> Signal:
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
        # VIX.1'S OWN WORKING, in structure terms — which BOS or CHoCH put the trend where it is, and
        # which leg permits this trade. Added 2026-08-11: verifying the 10-Aug signal against his
        # chart took an hour precisely because the card asserted a direction and never said why.
        *( [f"Structure — {bias_reason}"] if bias_reason else [] ),
        # THE MARKET STATE THIS WAS TAKEN IN — how far into a retracement, and how directional the
        # market still is. Added 2026-08-11 and it DECIDES NOTHING (Phase A): it is here so the real
        # values can be read off real signals before any threshold is chosen. Picking one from a
        # year of two pairs is how two earlier changes looked right on the day and were worse over
        # four years.
        *( [state_line(retracement, efficiency, pip, regime)] if retracement is not None else [] ),
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
    if retracement is not None:
        # THE DEPTH BELONGS TO THE STALL, NOT TO THE RETRACEMENT — they are separate facts and the
        # first version of this panel ran them together as "1 CANDLE · 235.8 PIPS", which reads as a
        # 235-pip one-candle pullback. The candle count is the pullback; the pips are how far below
        # the trend's own extreme price now sits.
        smc.insert(3, f"CTX::RETRACEMENT::{retracement.bars} CANDLE"
                      f"{'S' if retracement.bars != 1 else ''}"
                  if retracement.active else "CTX::RETRACEMENT::NONE BEFORE THIS CANDLE")
        smc.insert(4, f"CTX::BELOW THE TREND EXTREME::{retracement.pips / pip:.1f} PIPS "
                      f"({retracement.atr:.2f}x ATR) · {retracement.stall_bars} CANDLES OLD")
        if regime is not None and regime.kind:
            smc.insert(3, f"CTX::REGIME::{regime.kind.upper()}")
        smc.insert(6 if regime is not None and regime.kind else 5,
                   f"CTX::DIRECTIONAL EFFICIENCY::"
                      f"{'—' if efficiency is None else f'{efficiency:.2f}'}")
    if late:
        smc.append("PA::PAST THE RECOMMENDED ENTRY PRICE")
    if corr:
        smc.append("PA::CORRELATED USD — SIZE DOWN")

    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if bullish else Direction.SELL,
        strategy_id       = strategy_id,          # _watch → private DM (Phase 1)
        strategy_name     = strategy_name,
        # THE KIND GOES ON THE CARD'S FACE, not only into the caption. His instruction for the
        # assumed case, 2026-08-20: *"we assume it is there and enter but report that in the
        # signal."* A card headed "CONFIRMED ENTRY" while the pullback has NOT happened is the one
        # thing that message must never look like — and that default wording is another strategy's
        # vocabulary anyway, which the panel used to put on every card in the platform.
        # NAMES THE MESSAGE TYPE *AND* THE FLAVOUR: "ENTRY SIGNAL — PULLBACK ASSUMED". It used to be
        # "BUY — PULLBACK ASSUMED", which said the direction (already on the card twice) but never
        # that this was the entry rather than one of VIX.1's four other message types.
        headline          = f"{titles.ENTRY_SIGNAL} — {label}",
        # ...and the captions under the three numbers, for the same reason. The renderer's generic
        # fallback reads "Confirmed entry", which is exactly wrong on an assumed one. Supplying them
        # here keeps `charting/` strategy-agnostic, which is the standing rule.
        level_notes       = [
            "Returned to the line" if "returned" in kind else "One tick beyond the reach",
            (sl_note.split("—", 1)[-1].strip() if "—" in sl_note else "Beyond the invalidation"),
            f"{rr:.0f}R — ride the momentum",
        ],
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
