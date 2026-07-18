"""
BX-S/D — WATCH: alert when a LOCKED 4H setup (zone tapped, awaiting the LTF/entry trigger) is
invalidated before it fires, so we never silently drop a setup (mirrors the VOCANT.1 WATCH).

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
        alert_only        = True,
        to_channel        = True,        # everything about BX goes to the channel, not a DM
        qualified         = False,
        primary_timeframe = TF.H4,
        technical_reasons = [f"BX-S/D {side} setup INVALIDATED — price closed beyond the 4H {zdir} "
                             f"zone before the entry triggered; stand down"],
        smc_factors       = ["PA::4H ZONE BROKEN — SETUP VOID"],
        market_context    = f"BX-S/D {side} {symbol} — 4H {zdir} zone broken before entry; setup invalidated",
    )
