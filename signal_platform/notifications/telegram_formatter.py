"""
Telegram DM cards — admin heads-ups: unconfirmed setups and watch signals.

These go to ONE person who already knows the system, so they carry every diagnostic field. The
public channel cards live in telegram_cards.py and are deliberately leaner.
"""
from core.types import Signal, Direction

def _h(text: str) -> str:
    """Escape HTML special chars."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")



def format_setup_alert(signal: Signal) -> str:
    """Unconfirmed setup / heads-up (admin DM). STRATEGY-AGNOSTIC: every line is built from the
    signal's OWN fields — the strategy supplies its own reasons/context. No hardcoded indicator or
    setup-type text (e.g. no 'D1 200 EMA' / 'ADX' / 'H1 pullback' — those belong only to whichever
    strategy actually uses them, via its own technical_reasons)."""
    arrow = "📈" if signal.direction == Direction.BUY else "📉"
    side  = "BUY" if signal.direction == Direction.BUY else "SELL"
    name  = signal.strategy_name or signal.strategy_id or "—"

    if signal.qualified:
        header = f"👁 <b>SETUP ALERT — {_h(signal.symbol)} {side}</b>"
        status = "✅ <b>QUALIFIED</b>"
    else:
        header = f"🔍 <b>SETUP — {_h(signal.symbol)} {side}</b>  <i>(not qualified)</i>"
        status = "❌ <b>NOT QUALIFIED</b> — reported for review only"

    lines = [header]
    if signal.label:
        lines.append(f"🏷 <b>{_h(signal.label)}</b>")
    lines += [
        "──────────────────────────",
        f"{arrow} <b>Strategy:</b> {_h(name)}",
        f"⏱ <b>Timeframe:</b> {_h(signal.primary_timeframe or '—')}",
        status,
    ]
    if signal.entry_price:
        lines += ["", f"📍 <b>Entry:</b>  <code>{signal.entry_price:.5f}</code>"]
        if signal.stop_loss:
            lines.append(f"🛑 <b>SL:</b>     <code>{signal.stop_loss:.5f}</code>")
        if signal.take_profit:
            lines.append(f"🎯 <b>TP:</b>     <code>{signal.take_profit:.5f}</code>")
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
    arrow = "📈" if signal.direction == Direction.BUY else "📉"
    side  = "BUY" if signal.direction == Direction.BUY else "SELL"

    lines = [f"⚠️ <b>WATCH SIGNAL — {_h(signal.symbol)} {side}</b>"]
    if signal.label:
        lines.append(f"🏷 <b>{_h(signal.label)}</b>")
    lines += [
        "──────────────────────────",
        f"{arrow} <b>{_h(signal.symbol)}</b> — <b>{side}</b>",
        f"🏷 <b>Strategy:</b> {_h(signal.strategy_name or signal.strategy_id or '—')}",
        f"⏱ <b>Timeframe:</b> {_h(signal.primary_timeframe or '—')}",
        "",
    ]

    if signal.entry_price is not None:
        lines.append(f"💰 <b>Entry:</b>        <code>{signal.entry_price:.5f}</code>")
    if signal.stop_loss is not None:
        lines.append(f"🛑 <b>Stop Loss:</b>    <code>{signal.stop_loss:.5f}</code>")
    if signal.take_profit is not None:
        lines.append(f"🎯 <b>Take Profit:</b>  <code>{signal.take_profit:.5f}</code>")
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


