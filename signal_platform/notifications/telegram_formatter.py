"""
Telegram HTML formatter — clean, readable signal cards.
Uses HTML parse_mode (simpler and more reliable than MarkdownV2).
"""

from core.types import Signal, Direction, SignalStatus
from shared.pip import pip_size, price_digits


def _h(text: str) -> str:
    """Escape HTML special chars."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _digits(symbol: str) -> int:
    """Decimals for THIS instrument. Never hardcode 5: USD/JPY prices are 3-decimal, so a .5f
    JPY signal renders as 150.12300 — a price that does not exist."""
    return price_digits(symbol)


def _tick(reason: str) -> str:
    """Tick a reason — unless it already carries its own marker. A line starting with an emoji is
    saying something for itself (⚠️ CORRELATED …), and stamping a green tick on the one line that
    means "careful" tells the reader the opposite of what it says."""
    return f"✅ {reason}" if reason[:1].isascii() else reason


def _risk_pips(signal: Signal) -> float | None:
    """Entry-to-stop distance in pips — what actually sizes the trade."""
    if not signal.entry_price or not signal.stop_loss:
        return None
    return abs(signal.entry_price - signal.stop_loss) / pip_size(signal.symbol)


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


def format_signal_confirmed(signal: Signal) -> str:
    """THE entry card — what a trader acts on. Read top-down: side, the three prices, the maths,
    then why. Nothing else competes for attention.

    Telegram HTML has no text colour (no <font>, no CSS), so colour comes from deliberate emoji:
    🟢/🔴 carry the side, and it is the first thing on screen. Prices sit in <code>, which Telegram
    tints and renders monospace, so the three numbers line up as a block and read as one unit.
    Nothing is space-padded — Telegram's body font is proportional, so padding only looks aligned in
    the editor and arrives ragged.
    """
    buy   = signal.direction == Direction.BUY
    dot   = "🟢" if buy else "🔴"
    side  = "BUY" if buy else "SELL"
    d     = _digits(signal.symbol)
    rule  = "━━━━━━━━━━━━━━━━━━━"

    # 1. WHAT + WHICH WAY — the whole point of the message, first line, nothing else on it.
    head = f"{dot} <b>{side}</b>  ·  <b>{_h(signal.symbol)}</b>"
    if signal.label:
        head += f"  ·  <b>{_h(signal.label)}</b>"
    lines = [head, f"<i>{_h(signal.strategy_name or signal.strategy_id)}"
                   f" · {_h(signal.primary_timeframe or '—')}</i>", rule]

    # 2. THE THREE PRICES — the only things you type into a broker. Kept adjacent and uninterrupted.
    if signal.entry_price:
        lines.append(f"📍 Entry    <code>{signal.entry_price:.{d}f}</code>")
    if signal.stop_loss:
        lines.append(f"🛑 Stop     <code>{signal.stop_loss:.{d}f}</code>")
    if signal.take_profit:
        lines.append(f"🎯 Target   <code>{signal.take_profit:.{d}f}</code>")

    # 3. THE MATHS — one line, not four. Risk in pips is what sizes the trade, so it earns its place.
    bits = []
    if signal.risk_reward:
        bits.append(f"<b>1:{signal.risk_reward:.1f}</b>")
    risk = _risk_pips(signal)
    if risk is not None:
        bits.append(f"{risk:.1f} pips risk")
    if signal.confidence:
        bits.append(f"{signal.confidence * 100:.0f}%")
    if bits:
        lines += [rule, "⚖️ " + "  ·  ".join(bits)]

    # 4. WHY — ticks, no heading. A heading called "Reasons:" above a list of reasons is a wasted line.
    if signal.technical_reasons:
        lines.append("")
        lines += [_tick(_h(r)) for r in signal.technical_reasons[:5]]

    # market_context is a prose restatement of the reasons above — dropped rather than repeated.
    if signal.zone_notes:
        lines += [""] + [f"📌 {_h(z)}" for z in signal.zone_notes[:4]]
    if signal.news_note:
        lines += ["", f"📰 {_h(signal.news_note)}"]

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


def format_signal_closed(symbol: str, direction: str, status: str,
                          entry: float | None = None,
                          close_price: float | None = None,
                          strategy: str = "") -> str:
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
    name = (strategy or "").removesuffix("_watch").removesuffix("_setup")   # drop routing suffix
    if name:
        lines.append(f"🏷 <b>Strategy:</b> {_h(name)}")
    if entry:
        lines.append(f"💰 <b>Entry:</b>  <code>{entry:.5f}</code>")
    if close_price:
        lines.append(f"📌 <b>Close:</b>  <code>{close_price:.5f}</code>")

    lines.append("⚡️ <i>Trade&amp;Journal Signal Platform</i>")
    return "\n".join(lines)
