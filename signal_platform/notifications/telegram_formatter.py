"""
Telegram HTML formatter — clean, readable signal cards.
Uses HTML parse_mode (simpler and more reliable than MarkdownV2).
"""

from core.types import Signal, Direction, SignalStatus


def _h(text: str) -> str:
    """Escape HTML special chars."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


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

    lines += [
        "──────────────────────────",
        "⚡️ <i>TradeJournal Signal Platform</i>",
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

    lines.append("⚡️ <i>TradeJournal Signal Platform</i>")
    return "\n".join(lines)
