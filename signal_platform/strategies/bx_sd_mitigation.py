"""
BX-S/D — Report ①: 4H supply/demand mitigation heads-up.

When price FIRST-TAPS (mitigates) a previously-unmitigated 4H S/D zone, DM a heads-up — any
direction, informational, independent of the trend/entry cascade. Enriched with HTF confluence:
a 4H zone that falls within a Daily/Weekly/Monthly zone is tagged premium and prioritised.
"""
from core.types import Candle, Signal, Direction, TF
from strategies.bx_sd_zones import find_zones, Zone
from strategies.bx_sd_setup import _first_tap

_RECENT = 6   # first tap within the last N 4H bars = "just mitigated"


def newly_mitigated_zones(h4: list[Candle], recent: int = _RECENT,
                          zones: list[Zone] | None = None) -> list[Zone]:
    """4H zones whose FIRST tap (mitigation) landed within the last `recent` bars — any direction.
    Pass `zones` to restrict to the book-valid ones (3 factors); defaults to every IFC candidate."""
    out: list[Zone] = []
    for z in (find_zones(h4) if zones is None else zones):
        ft = _first_tap(h4, z)
        if ft is not None and ft >= len(h4) - recent:
            out.append(z)
    return out


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
