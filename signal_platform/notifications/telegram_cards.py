"""
Telegram CHANNEL cards — the entry, and its outcome. What the public actually sees.

The two are deliberately the same shape so an entry and its close read as one story.

Telegram HTML has NO text colour (no <font>, no CSS), so colour is carried by emoji and it leads:
🟢/🔴 is the side, ✅/❌ the result. Prices sit in <code>, which Telegram tints and renders
monospace so they align as a block. Nothing is space-padded — the body font is proportional, so
padding only looks aligned in the editor and arrives ragged on a phone.

Split from telegram_formatter (the DM cards): different audience, different job — these are read by
strangers deciding whether to take a trade.
"""
from datetime import timezone

from core.types import Signal, Direction, SignalStatus
from shared.pip import pip_size, price_digits


def _h(text: str) -> str:
    """Escape HTML special chars."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _digits(symbol: str) -> int:
    """Decimals for THIS instrument. Never hardcode 5: USD/JPY prices are 3-decimal, so a .5f
    JPY signal renders as 150.12300 — a price that does not exist."""
    return price_digits(symbol)


def _stamp(dt) -> str:
    """WHEN this happened, in UTC — added 2026-07-26; the cards carried no time at all, so a reader
    could not tell a signal fired a minute ago from one that fired overnight.

    Two accuracy rules, both easy to get wrong:
      * NAIVE means UTC. `trading_signals` declares its DateTime columns without `timezone=True`, so
        Postgres hands back naive values even though every writer stores UTC. Formatting one without
        pinning the tz would print the right clock but compare wrong everywhere else, and
        `.astimezone()` on a naive value silently assumes LOCAL time.
      * It is the time of the EVENT, not of the message. The monitor replays candles, so it can
        detect a fill or a close minutes after the fact; the repo stamps the BAR's time and the card
        prints that. A `now()` here would quietly re-introduce the lag the replay exists to remove.
    UTC because every other message on this platform says UTC (telegram_system_formatter).
    """
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%d %b %H:%M UTC")


def _tick(reason: str) -> str:
    """Tick a reason — unless it already carries its own marker. A line starting with an emoji is
    saying something for itself (⚠️ CORRELATED …), and stamping a green tick on the one line that
    means "careful" tells the reader the opposite of what it says."""
    return f"✅ {reason}" if reason[:1].isascii() else reason


# Ids that are no longer registered but are still stored on historical signal rows. Without this a
# trade opened under the old id closes months later, finds nothing in the registry, and the card
# falls back to the bare id — the exact "same trade, two names" problem this function exists to stop.
_LEGACY_IDS = {"vocant1": "VIX.1"}     # renamed 2026-07-19 (VOCANT.1 -> VIX.1)


def _strategy_name(strategy_id: str) -> str:
    """Display name for a strategy id. The DB stores the ID, so a close card would otherwise say
    "vix1" under an entry card that said "VIX.1" — same trade, same channel, two names.
    The registry already knows; ask it, then fall back to the legacy map, then to the bare id."""
    base = (strategy_id or "").removesuffix("_watch").removesuffix("_setup")
    try:
        from core import strategy_registry
        for st in strategy_registry.get_enabled():
            if st.id == base:
                return st.name
    except Exception:
        pass
    return _LEGACY_IDS.get(base, base)


def _risk_pips(signal: Signal) -> float | None:
    """Entry-to-stop distance in pips — what actually sizes the trade."""
    if not signal.entry_price or not signal.stop_loss:
        return None
    return abs(signal.entry_price - signal.stop_loss) / pip_size(signal.symbol)



def format_signal_confirmed(signal: Signal) -> str:
    """THE entry card — what a trader acts on. Read top-down: side, the three prices, the maths,
    then why. Nothing else competes for attention. (Module docstring covers the colour rules.)"""
    buy   = signal.direction == Direction.BUY
    dot   = "🟢" if buy else "🔴"
    side  = "BUY" if buy else "SELL"
    d     = _digits(signal.symbol)
    rule  = "━━━━━━━━━━━━━━━━━━━"

    # 1. WHAT + WHICH WAY — the whole point of the message, first line, nothing else on it.
    head = f"{dot} <b>{side}</b>  ·  <b>{_h(signal.symbol)}</b>"
    if signal.label:
        head += f"  ·  <b>{_h(signal.label)}</b>"
    sub = f"{_h(signal.strategy_name or signal.strategy_id)} · {_h(signal.primary_timeframe or '—')}"
    when = _stamp(signal.created_at)          # when the SETUP fired, not when the message was built
    if when:
        sub += f" · {when}"
    lines = [head, f"<i>{sub}</i>", rule]

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



def format_signal_closed(symbol: str, direction: str, status: str,
                          entry: float | None = None,
                          close_price: float | None = None,
                          strategy: str = "",
                          take_profit: float | None = None,
                          stop_loss: float | None = None,
                          closed_at=None,
                          opened_at=None) -> str:
    """The outcome card — the other half of an entry the channel already saw. Same shape as the
    entry card so the pair reads as one story, and it leads with the ONE thing a follower wants:
    did it win, and by how much."""
    d = _digits(symbol)
    buy = direction == "buy"
    if status == SignalStatus.EXECUTED.value:
        emoji, result = "✅", "TP HIT"
    elif status == SignalStatus.INVALIDATED.value:
        emoji, result = "❌", "SL HIT"
    else:
        emoji, result = "⏱", "EXPIRED"

    # R is what the outcome MEANS — "TP HIT" alone does not say whether it paid for two losses.
    # Computed from the signal's own prices rather than assumed to be 2R: BX's TP is a real zone.
    tag = ""
    if entry and stop_loss:
        risk = abs(entry - stop_loss)
        if risk:
            if status == SignalStatus.EXECUTED.value and take_profit:
                tag = f"  ·  <b>+{abs(take_profit - entry) / risk:.1f}R</b>"
            elif status == SignalStatus.INVALIDATED.value:
                tag = "  ·  <b>-1R</b>"

    lines = [f"{emoji} <b>{result}</b>  ·  <b>{_h(symbol)}</b> {'BUY' if buy else 'SELL'}{tag}"]
    # WHEN it closed — and when it opened, because "how long was this trade on?" is the first thing
    # asked of an outcome and the pair of times answers it without a second message.
    sub = _strategy_name(strategy)
    when = _stamp(closed_at)
    if when:
        sub = f"{sub} · {when}" if sub else when
    if (opened := _stamp(opened_at)):
        sub += f"  (opened {opened})"
    if sub:
        lines.append(f"<i>{_h(sub)}</i>")
    lines.append("━━━━━━━━━━━━━━━━━━━")
    if entry:
        lines.append(f"📍 Entry    <code>{entry:.{d}f}</code>")
    # The close price is the level that triggered it — the TP on a win, the SL on a loss.
    close = close_price or (take_profit if status == SignalStatus.EXECUTED.value else
                            stop_loss if status == SignalStatus.INVALIDATED.value else None)
    if close:
        lines.append(f"🏁 Close    <code>{close:.{d}f}</code>")
    return "\n".join(lines)
