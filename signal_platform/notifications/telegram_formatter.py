"""
Pure formatting — no API calls, no bot imports.
Produces Telegram MarkdownV2-safe messages for signal events.
"""

from core.types import Signal, Direction, SignalStatus


def _esc(text: str) -> str:
    """Escape characters that MarkdownV2 treats as special."""
    for ch in r"_*[]()~`>#+-=|{}.!":
        text = text.replace(ch, f"\\{ch}")
    return text


def format_signal_confirmed(signal: Signal) -> str:
    """
    Full signal card sent when a new signal is confirmed.
    """
    arrow   = "📈" if signal.direction == Direction.BUY else "📉"
    dir_txt = "BUY" if signal.direction == Direction.BUY else "SELL"

    lines = [
        f"{arrow} *{_esc(signal.symbol)}* — {_esc(dir_txt)}",
        f"Strategy: {_esc(signal.strategy_name or signal.strategy_id)}",
        f"Timeframe: {_esc(signal.primary_timeframe or '—')}",
        "",
    ]

    if signal.entry_price:
        lines.append(f"Entry:       `{signal.entry_price:.5f}`")
    if signal.stop_loss:
        lines.append(f"Stop Loss:   `{signal.stop_loss:.5f}`")
    if signal.take_profit:
        lines.append(f"Take Profit: `{signal.take_profit:.5f}`")
    if signal.risk_reward:
        lines.append(f"R:R:         `1:{signal.risk_reward:.1f}`")

    lines.append(f"Confidence:  `{signal.confidence * 100:.0f}%`")

    if signal.technical_reasons:
        lines += ["", "*Reasons:*"]
        for r in signal.technical_reasons[:5]:
            lines.append(f"  • {_esc(r)}")

    if signal.market_context:
        lines += ["", f"_{_esc(signal.market_context)}_"]

    return "\n".join(lines)


def format_signal_closed(symbol: str, direction: str, status: str,
                          entry: float | None = None,
                          close_price: float | None = None) -> str:
    """
    Compact update sent when a signal hits TP or SL.
    """
    if status == SignalStatus.EXECUTED.value:
        emoji  = "✅"
        result = "TP HIT"
    elif status == SignalStatus.INVALIDATED.value:
        emoji  = "❌"
        result = "SL HIT"
    else:
        emoji  = "⏱"
        result = "EXPIRED"

    dir_arrow = "📈" if direction == "buy" else "📉"
    lines = [
        f"{emoji} {dir_arrow} *{_esc(symbol)}* — {_esc(result)}",
    ]
    if entry:
        lines.append(f"Entry:  `{entry:.5f}`")
    if close_price:
        lines.append(f"Close:  `{close_price:.5f}`")

    return "\n".join(lines)
