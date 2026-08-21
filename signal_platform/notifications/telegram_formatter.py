"""
Telegram DM cards — admin heads-ups: unconfirmed setups and watch signals.

These go to ONE person who already knows the system, so they carry every diagnostic field. The
public channel cards live in telegram_cards.py and are deliberately leaner.
"""
from core.types import Signal, Direction
# One implementation of "what precision does this instrument quote in" and "when did this happen",
# shared with the channel cards. Duplicating either is how they drift apart.
from notifications.telegram_cards import _digits, _stamp
from notifications import titles


def _h(text: str) -> str:
    """Escape HTML special chars."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")



def format_setup_alert(signal: Signal) -> str:
    """Unconfirmed setup / heads-up (admin DM). STRATEGY-AGNOSTIC: every line is built from the
    signal's OWN fields — the strategy supplies its own reasons/context. No hardcoded indicator or
    setup-type text (e.g. no 'D1 200 EMA' / 'ADX' / 'H1 pullback' — those belong only to whichever
    strategy actually uses them, via its own technical_reasons)."""
    side  = "BUY" if signal.direction == Direction.BUY else "SELL"
    status = ("✅ <b>QUALIFIED</b>" if signal.qualified
              else "❌ <b>NOT QUALIFIED</b> — reported for review only")

    # THE TITLE COMES FROM THE SIGNAL'S OWN `headline` (notifications/titles). This used to be a
    # hardcoded "👁 SETUP ALERT — EUR/USD BUY", which said neither which strategy produced it nor
    # which of that strategy's messages it was — the same header covered a pre-close notification,
    # a heads-up and a zone reaction. `headline` already existed and the card already drew it; only
    # this side ignored it, which is why the picture and the text disagreed.
    lines = [titles.for_signal(signal)]
    if signal.label:
        lines.append(f"🏷 <b>{_h(signal.label)}</b>")
    lines += [
        "──────────────────────────",
        f"🕐 <b>Fired:</b>     {_stamp(signal.created_at)}",
        status,
    ]
    if signal.entry_price:
        d = _digits(signal.symbol)
        lines += ["", f"📍 <b>Entry:</b>  <code>{signal.entry_price:.{d}f}</code>"]
        if signal.stop_loss:
            lines.append(f"🛑 <b>SL:</b>     <code>{signal.stop_loss:.{d}f}</code>")
        if signal.take_profit:
            lines.append(f"🎯 <b>TP:</b>     <code>{signal.take_profit:.{d}f}</code>")
    if signal.technical_reasons:
        lines += ["", "📝 <b>Details:</b>"]
        for r in signal.technical_reasons[:5]:
            lines.append(f"  • {_h(r)}")
    if not signal.qualified and signal.disqualifiers:
        lines += ["", "🚫 <b>Why not qualified:</b>"]
        for r in signal.disqualifiers[:5]:
            lines.append(f"  • {_h(r)}")
    if signal.market_context:
        lines += ["", f"<i>{_h(signal.market_context)}</i>"]
    if signal.zone_notes:
        lines += ["", "📌 <b>Nearby S/D zones:</b>"]
        for z in signal.zone_notes[:6]:
            lines.append(f"  • {_h(z)}")
    if signal.news_note:
        lines += ["", _h(signal.news_note)]
    lines += [
        "",
        "──────────────────────────",
        "👁 <i>Heads-up only — trade at your discretion</i>",
        "⚡️ <i>Trade&amp;Journal Signal Platform</i>",
    ]
    return "\n".join(lines)



def format_signal_watch(signal: Signal) -> str:
    # Same story as above: this was a flat "⚠️ WATCH SIGNAL", used for an invalidation and a watch
    # alike. The strategy, the symbol, the side and the timeframe are all in the title now.
    lines = [titles.for_signal(signal)]
    if signal.label:
        lines.append(f"🏷 <b>{_h(signal.label)}</b>")
    lines += [
        "──────────────────────────",
        f"🕐 <b>Fired:</b>     {_stamp(signal.created_at)}",
        "",
    ]

    d = _digits(signal.symbol)
    if signal.entry_price is not None:
        lines.append(f"💰 <b>Entry:</b>        <code>{signal.entry_price:.{d}f}</code>")
    if signal.stop_loss is not None:
        lines.append(f"🛑 <b>Stop Loss:</b>    <code>{signal.stop_loss:.{d}f}</code>")
    if signal.take_profit is not None:
        lines.append(f"🎯 <b>Take Profit:</b>  <code>{signal.take_profit:.{d}f}</code>")
    if signal.risk_reward is not None:
        lines.append(f"⚖️ <b>R:R:</b>          <code>1:{signal.risk_reward:.1f}</code>")

    if signal.technical_reasons:
        lines += ["", "📝 <b>Reasons:</b>"]
        for r in signal.technical_reasons[:5]:
            lines.append(f"  • {_h(r)}")

    if signal.market_context:
        lines += ["", f"<i>{_h(signal.market_context)}</i>"]

    if signal.zone_notes:
        lines += ["", "📌 <b>Nearby S/D zones:</b>"]
        for z in signal.zone_notes[:6]:
            lines.append(f"  • {_h(z)}")

    if signal.news_note:
        lines += ["", _h(signal.news_note)]

    lines += [
        "──────────────────────────",
        "👁 <i>Monitor only — trade at your discretion</i>",
    ]

    return "\n".join(lines)


