"""
Pure formatting — no API calls, no imports of bot libraries.
Takes a Signal and returns a Telegram message string.
"""

from core.types import Signal, Direction


def format_signal(signal: Signal) -> str:
    direction_emoji = "📈" if signal.direction == Direction.BUY else "📉"
    dir_label = signal.direction.value.upper()

    lines = [
        f"{direction_emoji} *{signal.symbol}* — {dir_label}",
        f"Strategy: {signal.strategy_name or signal.strategy_id}",
        "",
        f"Entry:      `{signal.entry_price:.5f}`" if signal.entry_price else "",
        f"Stop Loss:  `{signal.stop_loss:.5f}`"   if signal.stop_loss   else "",
        f"Take Profit:`{signal.take_profit:.5f}`"  if signal.take_profit  else "",
        f"R:R:        `1:{signal.risk_reward:.1f}`" if signal.risk_reward  else "",
        f"Confidence: `{signal.confidence * 100:.0f}%`",
        "",
    ]

    if signal.technical_reasons:
        lines.append("*Reasons:*")
        for r in signal.technical_reasons[:4]:
            lines.append(f"  • {r}")
        lines.append("")

    if signal.market_context:
        lines.append(f"_{signal.market_context}_")

    return "\n".join(l for l in lines if l is not None)
