"""
BX-S/D — WATCH: alert when a LOCKED 4H setup (zone tapped, awaiting the LTF/entry trigger) is
invalidated before it fires, so we never silently drop a setup (mirrors the VIX.1 WATCH).

A 4H demand/supply is invalidated the moment price BODY-CLOSES beyond its distal edge (the demand
fails below its low / the supply fails above its high). Phase 1 = DM-only alert.
"""
import time

from core.types import Signal, Direction, TF
from shared.mtf_utils import closed_only

_WATCH_TTL = 3 * 24 * 3600   # drop a stale watch after 3 days (wall-clock)


def check_invalidation(locked: dict, h4: list, m15: list) -> str | None:
    """'broken' once price has body-CLOSED beyond the zone distal, 'expired' if the watch is stale,
    else None (still live).

    A break is a body CLOSE — a LEVEL determination — so it must read CLOSED bars only. The feed's
    newest M15/H4 bar is still forming: its 'close' is just live price, which can dip beyond the distal
    and recover, so reading it would fire a false 'stand down'. The last CLOSED M15 keeps this
    responsive (15-min granularity) without waiting the full 4H."""
    buy    = locked["direction"] == "buy"
    distal = locked["distal"]
    m15c, h4c = closed_only(m15), closed_only(h4)
    for c in list(m15c[-3:]) + (list(h4c[-1:]) if h4c else []):
        if buy and c.close < distal:
            return "broken"
        if (not buy) and c.close > distal:
            return "broken"
    if time.time() - locked["locked_at"] > _WATCH_TTL:
        return "expired"
    return None


def invalidation_signal(locked: dict, symbol: str, strategy_name: str, strategy_id: str) -> Signal:
    buy  = locked["direction"] == "buy"
    side = "BUY" if buy else "SELL"
    zdir = "demand" if buy else "supply"
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,          # _watch → private DM
        strategy_name     = strategy_name,
        alert_only        = True,        # heads-up, NOT a confirmed signal -> admin DM, never the channel
        qualified         = False,
        primary_timeframe = TF.H4,
        technical_reasons = [f"BX-S/D {side} setup INVALIDATED — price closed beyond the 4H {zdir} "
                             f"zone before the entry triggered; stand down"],
        smc_factors       = ["PA::4H ZONE BROKEN — SETUP VOID"],
        market_context    = f"BX-S/D {side} {symbol} — 4H {zdir} zone broken before entry; setup invalidated",
    )


def zone_broken_after_signal(locked: dict, symbol: str, strategy_name: str, strategy_id: str) -> Signal:
    """The zone a LIVE signal was based on has broken. Heads-up, NOT a retraction.

    Until 2026-07-26 the watch was switched off the instant a signal fired — `bx_sd.py` popped the
    lock with the comment "setup resolved into a signal — stop watching". The reasoning was right
    (never 'invalidate' a trade already signalled; the monitor owns its TP/SL) but the conclusion was
    wrong: the answer to "we must not retract it" is a DIFFERENT message, not silence. So a trader
    watched the zone their entry rested on break, and the platform said nothing until the stop was
    hit.

    The book's own model is why this matters: a broken institutional candle FLIPS — "the bullish
    Institutional candle will then act as resistance when price breaks below it". The level that was
    supporting the trade is now working against it. That is worth knowing while the trade is open,
    whatever the trader decides to do about it.

    Deliberately advisory: alert_only, DM-routed, and it never touches the signal's status. The
    monitor still closes the trade on its real TP/SL.
    """
    buy  = locked["direction"] == "buy"
    side = "BUY" if buy else "SELL"
    zdir = "demand" if buy else "supply"
    flip = "resistance" if buy else "support"
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,          # _watch → private DM
        strategy_name     = strategy_name,
        alert_only        = True,        # heads-up, never the channel
        qualified         = False,
        primary_timeframe = TF.H4,
        technical_reasons = [f"⚠️ BX-S/D {side} {symbol} — the 4H {zdir} zone this signal was based on "
                             f"has BROKEN (body close beyond its distal edge). The trade is still live "
                             f"and its TP/SL still stand; this is information, not a retraction.",
                             f"A broken {zdir} zone flips — expect it to act as {flip} now."],
        smc_factors       = ["PA::4H ZONE BROKEN AFTER ENTRY — LEVEL FLIPPED"],
        market_context    = (f"BX-S/D {side} {symbol} — 4H {zdir} zone broken AFTER the signal fired; "
                             f"the level that supported the entry has flipped to {flip}"),
    )
