"""
VIX.1 — TRADE-MANAGEMENT ALERTS (advice only; nothing here moves a broker stop).

Phase 1 is signals-only: the user places and manages the trade himself, so the ratchet in
`strategies/vix1_manage` decides WHAT TO TELL HIM and this module delivers it:

    "+3R reached — move your stop to +2R"        (a ratchet step)
    "1M structure changed — close it"            (the exit)

STATELESS BY DESIGN. Every poll re-reads the 1M bars since the entry filled and replays the whole
ratchet from scratch, so `peak_r` and the stop are DERIVED, never stored. That means a restart, a
missed poll, or a redeploy cannot corrupt the sequence — there is no state to corrupt. The only
thing persisted is WHICH ALERTS HAVE ALREADY BEEN SENT, and that rides on the existing DB-backed
delivery_ledger (at-least-once: a failed send re-fires next poll instead of being lost).

R IS PAIR-AGNOSTIC — checked against cTrader's own conventions (the ctrader-mcp-servers skill).
R is a RATIO of price distances, (price - entry) / (entry - stop), so it needs no pip size, no
contract size and no currency conversion; it is identical for EUR/USD, USD/JPY and XAU/USD. Only
the PRINTED price needs per-symbol precision, which comes from shared.pip.price_digits (corrected
2026-07-25 against cTrader's precision table — it was wrong for metals/indices/crypto).
"""
import logging

from core import delivery_ledger, event_bus
from charting import signal_card
from core.types import Signal, Direction, TF
from notifications import titles
from shared.pip import price_digits
from strategies.vix1_manage import run

log = logging.getLogger(__name__)

_MAX_BARS = 600      # 10h of 1M — comfortably past the 4.7h longest real trade


async def _emit(sig: Signal, bars, symbol: str) -> None:
    """Attach a chart, then emit.

    THE ONLY EMIT PATH THAT BYPASSED THE CHART. `strategy_runner._attach_chart` covers the two
    emits in the runner, but these management alerts are produced by the MONITOR and went out as
    bare text — an audit of every `event_bus.emit` call turned that up. The 1M bars are already in
    hand here (`check` re-reads them every poll), so the card costs nothing extra to draw, and
    "move your stop to +2R" is far easier to act on next to the price action it refers to.

    Never raises: `render_async` returns None on any failure and the dispatcher falls back to text.
    """
    try:
        digits = 3 if symbol.upper().endswith("JPY") else 5
        sig.chart_path = await signal_card.render_async(
            sig, bars, digits, list(sig.chart_bands or []), subtitle="M1",
            marks=list(sig.chart_marks or []))
    except Exception as exc:                      # noqa: BLE001 — a chart never blocks an alert
        log.warning(f"[vix1-manage] chart render failed for {symbol}: {exc}")
    await event_bus.emit(event_bus.SIGNAL_ALERT, sig)


def _alert(symbol: str, buy: bool, text: str, ctx: str, key: str, headline: str = "") -> Signal:
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = "vix1_watch",     # _watch -> admin DM, never the public channel
        strategy_name     = "VIX.1",
        # THE CATEGORY IS "VIX.1", NOT "TRADE MANAGEMENT", and the difference is real. These come
        # from VIX.1's own ratchet reading its own SIGNAL; `monitor/position_tracker` gives the same
        # advice from the BROKER's real position and is the accurate one. Two systems can say "move
        # your stop to +2R" about the same trade, so the category line is what tells him which spoke.
        headline          = headline,
        alert_only        = True,             # management advice, NOT a new signal
        qualified         = False,
        primary_timeframe = TF.M1,
        technical_reasons = [text],
        market_context    = ctx,
        dedup_key         = key,
    )


async def check(row, bars) -> None:
    """Emit any management alerts due for one live VIX.1 position.

    `row` is the trading_signals row; `bars` are 1M candles covering the trade. Only runs for a
    signal that has actually FILLED (triggered_at set) — a pending stop order has no position to
    manage, and alerting on one would be advice about a trade that does not exist.
    """
    if (row.strategy or "") != "vix1" or row.triggered_at is None:
        return
    entry = float(row.entry_price or 0)
    sl0   = float(row.stop_loss or 0)
    if entry <= 0 or sl0 <= 0:
        return
    buy = row.type == Direction.BUY.value

    # _epoch, not .timestamp(): trading_signals stores naive UTC datetimes (DateTime without
    # timezone=True), and a naive .timestamp() is read as LOCAL time — shifting this window by the
    # host's UTC offset. Invisible on a UTC host, wrong the moment one isn't.
    from monitor.signal_monitor import _epoch
    since = [c for c in bars if c.time >= _epoch(row.triggered_at)][-_MAX_BARS:]
    if len(since) < 3:
        return

    st = run(entry, sl0, buy, since)
    d  = price_digits(row.symbol)

    # 1) ratchet steps — one alert per NEW locked level, deduped so a level is announced once
    for reached_r, locked_r in st.events:
        key = f"vix1_mgmt_{row.id}_lock{locked_r:.1f}"
        if delivery_ledger.is_delivered(key):
            continue
        stop = entry + locked_r * abs(entry - sl0) if buy else entry - locked_r * abs(entry - sl0)
        sig = _alert(
            row.symbol, buy,
            f"🔒 +{reached_r:.1f}R reached — move your stop to +{locked_r:.0f}R "
            f"({stop:.{d}f}). Locking {locked_r:.0f}R and staying in while price runs.",
            f"VIX.1 MANAGE — {row.symbol} {'BUY' if buy else 'SELL'}: stop to +{locked_r:.0f}R",
            key,
            headline=titles.lock(locked_r),
        )
        await _emit(sig, bars, row.symbol)
        log.info(f"[vix1-manage] {row.symbol} ratchet {reached_r:.2f}R -> lock {locked_r:.1f}R")

    # 2) the exit — structure turned against the trade (the trailing stop itself is handled by the
    #    monitor's own SL check, which already reads the amended stop)
    if st.exited and st.exit_why == "structure":
        key = f"vix1_mgmt_{row.id}_exit"
        if not delivery_ledger.is_delivered(key):
            sig = _alert(
                row.symbol, buy,
                f"🚪 1M STRUCTURE CHANGED at +{st.exit_r:.1f}R — close it. Price closed through the "
                f"last 1M swing against the trade, which is the exit condition for the ratchet.",
                f"VIX.1 MANAGE — {row.symbol} {'BUY' if buy else 'SELL'}: structure exit "
                f"at +{st.exit_r:.1f}R",
                key,
                headline=titles.STRUCTURE_EXIT,
            )
            await _emit(sig, bars, row.symbol)
            log.info(f"[vix1-manage] {row.symbol} structure exit at {st.exit_r:.2f}R")
