"""
BX-S/D — the MITIGATION heads-up card.

`newly_mitigated_zones` used to live here and is gone: "which zones were just tapped" is a lifecycle
question the zone book answers (the `wick_mitigated` / `body_mitigated` states), not something to
recompute from candles. This file is now only the card.
"""
from core.types import Signal, Direction, TF
from charting import theme   # card palette — one source of truth for band colour
from strategies.bx_sd_zones import Zone


def mitigation_signal(zone: Zone, symbol: str, backing: list[str], digits: int,
                      strategy_name: str, strategy_id: str,
                      note: str = "", retaps: int = 0) -> Signal:
    """`note` is `bx_sd_strength.mitigation_note` — HOW the zone was mitigated.

    It is not optional in practice. Until 2026-07-30 this card said only "zone MITIGATED" for every
    case, so a WICK-ONLY sweep (orders unfilled, price expected back) and a full body mitigation
    (zone spent) were indistinguishable to the reader — while a comment in `bx_sd_reports` claimed
    "the card distinguishes them". The default is empty so the signature stays back-compatible for
    tests, never because a caller should omit it.
    """
    buy  = zone.direction == "demand"
    side = "BUY" if buy else "SELL"
    tag  = f" — backed by {', '.join(backing)}" if backing else ""
    prio = "🔥 premium (HTF-backed)" if backing else "⚡ standard"
    extra = ([note] if note else []) + ([f"Return visit #{retaps} to this zone"] if retaps else [])
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,
        strategy_name     = strategy_name,
        alert_only        = True,        # heads-up, NOT a confirmed signal -> admin DM, never the channel
        qualified         = True,
        primary_timeframe = TF.H4,
        # The zone that was just tapped — the whole subject of this heads-up, so it is what the
        # card must show. Generic (low, high, colour, label); the renderer stays zone-unaware.
        chart_bands       = [(zone.bottom, zone.top,
                              theme.ZONE_DEMAND if buy else theme.ZONE_SUPPLY,
                              f"4H {zone.direction.upper()}")],
        technical_reasons = [
            f"4H {zone.direction} zone MITIGATED "
            f"[{zone.bottom:.{digits}f}–{zone.top:.{digits}f}]{tag}",
            *extra,
            f"Priority: {prio} — watching for a reaction, then a 1M/5M-aligned retest entry",
        ],
        market_context    = (f"BX-S/D heads-up — {symbol} tapped a fresh 4H {zone.direction} "
                             f"({side} area){tag}"),
    )
