"""
BX-S/D — the TAP ALERT ("cheeky one"): the first signal, fired BEFORE the pullback.

User's rule, 2026-08-04: *"For price taps into 4HR zone and there is a confirmation in 5M or 1M a
cheeky signal should be sent. … in BX, signal is sent when price mitigates 4HR zone, and starts
moving and then signal is fired in the first 4HR pullback after the price has respected the zone and
that has a confirmation in 1m or 5M. So I am asking for the first signal before the pullback."*

So BX now publishes TWO moments, and they can never describe the same one:

  THIS ONE   zone TAPPED + a 1M/5M reaction, while the zone is still UNPROVEN (not `respected`).
             No entry, no stop, no target — there is nothing to place. It goes to the channel to
             give the room something to watch, and it says outright that it is not a trade.
  THE ENTRY  zone RESPECTED -> price moved away -> first 4H pullback -> 1M/5M confirmation.
             (`bx_sd_setup.detect_setup` + `bx_sd_confirm`.) Untouched by this module.

The `respected` state is the divider: this alert requires NOT-respected, the entry requires
respected. That is what makes "which message means place a trade" unambiguous.

This module produces FACTS ONLY. The voice — the headline, the quips, the disclaimer — lives in
`notifications/telegram_tap_alert.py`, so the tone can be rewritten without touching the strategy.
"""
from core.types import Signal, Direction, TF
from charting import theme   # card palette — one source of truth for band colour
from strategies.bx_sd_zones import Zone

# The 1M/5M reaction is asked for in REVERSAL form only (`reaction_on(..., reversal_only=True)`) —
# see `bx_sd_entry.reaction_on` for why continuation is not evidence at an unproven zone.
REVERSAL_ONLY = True


def _tap_words(mitigation_kind: str, retaps: int) -> str:
    """How the zone was touched, in the reader's words. `mitigation_kind` is the registry's retained
    fact (`bx_sd_registry.MarkedZone`) and survives the `respected` transition; empty means this is
    the first touch and the book has not closed a bar on it yet."""
    kind = {"wick": "wick tap — only the wick is in so far",
            "body": "body tap — price has traded into it"}.get(mitigation_kind, "first touch")
    return f"{kind}, return visit #{retaps}" if retaps else kind


def tap_alert_signal(zone: Zone, symbol: str, method: str, method_tf: str, digits: int,
                     strategy_name: str, strategy_id: str, backing: list[str],
                     tap_time: int, mitigation_kind: str = "", retaps: int = 0) -> Signal:
    """The cheeky alert. `method` / `method_tf` come from `bx_sd_entry.reaction_on` — the SAME
    confirmation definition the real entry uses, never a second one."""
    buy  = zone.direction == "demand"
    side = "BUY" if buy else "SELL"
    tag  = f" — backed by {', '.join(backing)}" if backing else ""
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,
        strategy_name     = strategy_name,
        # alert_only + to_channel: the dispatcher's PUBLIC alert path. `to_channel` has existed and
        # gone unused since the two-stage split; this is its first caller.
        alert_only        = True,
        to_channel        = True,
        # STAGE 1. Levels are absent, not provisional — the card must not imply a tradeable setup.
        stage             = "building",
        # NOT QUALIFIED, and that is the whole message. `disqualifiers` below is the honest list of
        # what is still missing, and the formatter renders it as "WHAT'S MISSING" rather than hiding
        # it. A reader who acts on this alert should be able to see exactly what it does not have.
        qualified         = False,
        primary_timeframe = TF.H4,
        # No entry / stop / target ANYWHERE. The runner stamps `ref_price` for the DB row (the
        # entry_price column is NOT NULL); nothing here fabricates a level to fill a field.
        chart_bands       = [(zone.bottom, zone.top,
                              theme.ZONE_DEMAND if buy else theme.ZONE_SUPPLY,
                              f"4H {zone.direction.upper()}")],
        chart_marks       = [(tap_time, "TAP")],
        technical_reasons = [
            f"4H {zone.direction} zone tapped [{zone.bottom:.{digits}f}–{zone.top:.{digits}f}]"
            f"{tag}",
            _tap_words(mitigation_kind, retaps),
            f"{method_tf} {method}",
        ],
        disqualifiers     = [
            "the zone has NOT been respected yet — no close a full zone-height away",
            "no 4H pullback, so there is no level to hang a stop off",
        ],
        market_context    = (f"BX-S/D — {symbol} just tapped a 4H {zone.direction} zone "
                             f"({side} area) with a {method_tf} {method}{tag}. Watching, not trading."),
    )
