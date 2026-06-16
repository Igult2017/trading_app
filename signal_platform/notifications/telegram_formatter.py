"""
Telegram HTML formatter — clean, readable signal cards.
Uses HTML parse_mode (simpler and more reliable than MarkdownV2).
"""

from core.types import Signal, Direction, SignalStatus


def _h(text: str) -> str:
    """Escape HTML special chars."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_setup_alert(signal: Signal) -> str:
    """Stage 1 — H1 pullback after a volume cluster. Fired for every pullback,
    labelled QUALIFIED (entry will follow) or NOT QUALIFIED (review only)."""
    arrow = "📈" if signal.direction == Direction.BUY else "📉"
    side  = "BUY" if signal.direction == Direction.BUY else "SELL"

    if not signal.qualified:
        header = f"🔍 <b>PULLBACK — {_h(signal.symbol)} {side}</b>  <i>(not qualified)</i>"
        status = "❌ <b>NOT QUALIFIED</b> — reported for review only"
    elif "_watch" in signal.strategy_id:
        header = f"⚠️ <b>WATCH SETUP — {_h(signal.symbol)} {side}</b>"
        status = "✅ <b>QUALIFIED</b> (ADX) — D1 200 EMA not aligned"
    else:
        header = f"👁 <b>SETUP ALERT — {_h(signal.symbol)} {side}</b>"
        status = "✅ <b>QUALIFIED</b> — D1 200 EMA aligned"

    lines = [
        header,
        "──────────────────────────",
        f"{arrow} <b>H1 pullback after volume cluster</b>",
        status,
        "",
        f"📍 <b>Entry zone:</b>    <code>{signal.entry_price:.5f}</code>",
        f"🛑 <b>SL (approx):</b>  <code>{signal.stop_loss:.5f}</code>",
        f"🎯 <b>TP (approx):</b>  <code>{signal.take_profit:.5f}</code>",
        "",
    ]
    if signal.technical_reasons:
        lines += ["📝 <b>Setup details:</b>"]
        for r in signal.technical_reasons[:5]:
            lines.append(f"  • {_h(r)}")
    if not signal.qualified and signal.disqualifiers:
        lines += ["", "🚫 <b>Why not qualified:</b>"]
        for r in signal.disqualifiers[:5]:
            lines.append(f"  • {_h(r)}")
    if signal.zone_notes:
        lines += ["", "📌 <b>Nearby S/D zones:</b>"]
        for z in signal.zone_notes[:6]:
            lines.append(f"  • {_h(z)}")
    footer = (
        "⏳ <i>A second alert will follow with the exact entry if the M1 fractal forms.</i>"
        if signal.qualified else
        "🔎 <i>Shown so you can verify detection — no entry will follow.</i>"
    )
    lines += [
        "",
        "──────────────────────────",
        footer,
        "⚡️ <i>Trade&amp;Journal Signal Platform</i>",
    ]
    return "\n".join(lines)


def format_signal_confirmed(signal: Signal) -> str:
    arrow = "📈" if signal.direction == Direction.BUY else "📉"
    side  = "BUY" if signal.direction == Direction.BUY else "SELL"
    conf  = f"{signal.confidence * 100:.0f}%" if signal.confidence else "—"

    lines = [
        f"{arrow} <b>{_h(signal.symbol)}</b> — <b>{side}</b>",
        "──────────────────────────",
        f"🏷 <b>Strategy:</b> {_h(signal.strategy_name or signal.strategy_id)}",
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

    lines.append(f"📊 <b>Confidence:</b>   <code>{conf}</code>")

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

    lines += [
        "──────────────────────────",
        "⚡️ <i>Trade&amp;Journal Signal Platform</i>",
    ]

    return "\n".join(lines)


def format_signal_watch(signal: Signal) -> str:
    arrow = "📈" if signal.direction == Direction.BUY else "📉"
    side  = "BUY" if signal.direction == Direction.BUY else "SELL"

    lines = [
        f"⚠️ <b>WATCH SIGNAL — Not aligning with D1 EMA 200</b>",
        "──────────────────────────",
        f"{arrow} <b>{_h(signal.symbol)}</b> — <b>{side}</b>",
        f"🏷 <b>Strategy:</b> {_h(signal.strategy_name or signal.strategy_id)}",
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

    lines += [
        "──────────────────────────",
        "👁 <i>Monitor only — trade at your discretion</i>",
    ]

    return "\n".join(lines)


def format_signal_closed(symbol: str, direction: str, status: str,
                          entry: float | None = None,
                          close_price: float | None = None) -> str:
    if status == SignalStatus.EXECUTED.value:
        emoji, result = "✅", "TP HIT"
    elif status == SignalStatus.INVALIDATED.value:
        emoji, result = "❌", "SL HIT"
    else:
        emoji, result = "⏱", "EXPIRED"

    dir_arrow = "📈" if direction == "buy" else "📉"

    lines = [
        f"{emoji} {dir_arrow} <b>{_h(symbol)}</b> — <b>{result}</b>",
        "──────────────────────────",
    ]
    if entry:
        lines.append(f"💰 <b>Entry:</b>  <code>{entry:.5f}</code>")
    if close_price:
        lines.append(f"📌 <b>Close:</b>  <code>{close_price:.5f}</code>")

    lines.append("⚡️ <i>Trade&amp;Journal Signal Platform</i>")
    return "\n".join(lines)
