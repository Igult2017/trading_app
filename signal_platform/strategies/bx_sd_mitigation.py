"""
BX-S/D — the MITIGATION heads-up card.

`newly_mitigated_zones` used to live here and is gone: "which zones were just tapped" is a lifecycle
question the zone book answers (the `wick_mitigated` / `body_mitigated` states), not something to
recompute from candles. This file is now only the card.
"""
from core.types import Signal, Direction, TF
from strategies.bx_sd_zones import Zone


def mitigation_signal(zone: Zone, symbol: str, backing: list[str], digits: int,
                      strategy_name: str, strategy_id: str) -> Signal:
    buy  = zone.direction == "demand"
    side = "BUY" if buy else "SELL"
    tag  = f" — backed by {', '.join(backing)}" if backing else ""
    prio = "🔥 premium (HTF-backed)" if backing else "⚡ standard"
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,
        strategy_name     = strategy_name,
        alert_only        = True,        # heads-up, NOT a confirmed signal -> admin DM, never the channel
        qualified         = True,
        primary_timeframe = TF.H4,
        technical_reasons = [
            f"Fresh 4H {zone.direction} zone MITIGATED "
            f"[{zone.bottom:.{digits}f}–{zone.top:.{digits}f}]{tag}",
            f"Priority: {prio} — watching for a reaction, then a 1M/5M-aligned retest entry",
        ],
        market_context    = (f"BX-S/D heads-up — {symbol} tapped a fresh 4H {zone.direction} "
                             f"({side} area){tag}"),
    )
