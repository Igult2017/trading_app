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
from notifications import titles
from charting import theme   # card palette — one source of truth for band colour
from strategies.bx_sd_zones import Zone

# The 1M/5M reaction is asked for in REVERSAL form only (`reaction_on(..., reversal_only=True)`) —
# see `bx_sd_entry.reaction_on` for why continuation is not evidence at an unproven zone.
REVERSAL_ONLY = True


# `_tap_words()` stood here and is DELETED (2026-08-05). It phrased the tap kind for
# `technical_reasons`; that fact moved into `_viability` below, where "first touch" is part of WHY
# the setup qualifies. Its last caller went with the move, so the function was orphaned in the same
# change that orphaned it — swept rather than left to rot.


def _viability(is_newest: bool, mitigation_kind: str, retaps: int, method_tf: str,
               method: str) -> list[str]:
    """Why the METHOD would already call this an entry, stated only as far as it is true.

    User, 2026-08-05: *"make cheeky alert inform that it would also be viable and explain why."*
    His diagram takes the FIRST touch of the most recent valid zone once the entry TF confirms. BX
    does not trade that — it waits for the zone to be respected first — but the card should say the
    setup qualifies by the book rather than only listing what is missing.

    TWO THINGS THIS MUST NOT OVERCLAIM, because the reader may act on it:

      * "most recent valid zone" is COMPUTED upstream, not assumed. The alert picks the freshest
        *tapped* zone, which is not the same as the freshest zone — a newer one may exist and simply
        not have been touched. When it does, that line is dropped.
      * "first touch" only when the zone has never been mitigated. This alert also fires on
        wick/body-mitigated zones — return visits that never earned a reaction — and the diagram is
        about the first arrival, so a return visit says so instead of borrowing its authority.

    The three-factor line needs no guard: every zone in the registry has an imbalance, a structure
    break and a liquidity sweep before it, or `bx_sd_registry.build` would not have marked it.
    """
    out = []
    if is_newest:
        out.append("most recent valid zone on this side")
    else:
        out.append("a valid zone, though a fresher one exists on this side")
    out.append("imbalance + structure break + liquidity taken first")
    # THE TAP STATE ALWAYS SAYS SOMETHING. The first version emitted a line only for a first touch
    # or a counted retap, so a wick/body-mitigated zone with retaps=0 — touched once, never reacted —
    # produced NO tap-state line at all, and the fact had already moved out of `technical_reasons`.
    # A real rendered card is what showed it; the unit tests only exercised the two cases I wrote.
    if not mitigation_kind:
        out.append("first touch — the zone is unspent")
    elif retaps:
        out.append(f"return visit #{retaps} — worked before")
    else:
        out.append(f"{mitigation_kind} tap — touched, never reacted")
    out.append(f"confirmed on {method_tf} ({method})")
    return out


def _standing_aside(zone: Zone, extreme_at: float | None, digits: int) -> list[str]:
    """Why BX will not trade this tap. Written as a WARNING, not as a list of missing things.

    A decisional zone is not "an incomplete setup" — by the method it is a complete one that we
    deliberately refuse, because price is expected to run THROUGH it to reach the extreme. An order
    resting here is the fuel for that run. Naming the extreme's level makes that concrete: the reader
    can see where price is headed instead of being told only that we declined.
    """
    if zone.role != "decisional":
        # Defensive: the cascade only routes decisional zones here. If that ever changes, say
        # something true rather than asserting a warning that does not apply.
        return ["BX is watching this zone, not trading it"]
    # KEPT SHORT ON PURPOSE. Telegram REJECTS a photo caption over 1024 chars, and the first version
    # of these lines pushed the worst case to 1040 — the card would simply not have sent. Two lines,
    # with the extreme's level folded into the second rather than given its own.
    #
    # WHAT "DECISIONAL" NOW MEANS ON THIS CARD (2026-08-25). It used to mean "a zone further out won
    # the ranking", which is why the card could point at a perfectly good untouched zone and warn the
    # reader off it. His ruling: *"Decisional zone does not become decisional because another zone
    # won, it is based on its creation, and most of the time they are fake zones that lead to fake
    # CHOCH that later become liquidity."* So the label is now a fact about what this zone's own
    # reaction produced, and the warning below is finally true of the zone it is printed on.
    out = ["DECISIONAL zone — its last reaction was a FAKE change of character"]
    if extreme_at is not None:
        out.append(f"an order here is the fuel; the extreme at {extreme_at:.{digits}f} is the one we take")
    else:
        out.append("an order here is the liquidity that carries price to the extreme")
    return out


def tap_alert_signal(zone: Zone, symbol: str, method: str, method_tf: str, digits: int,
                     strategy_name: str, strategy_id: str, backing: list[str],
                     tap_time: int, mitigation_kind: str = "", retaps: int = 0,
                     is_newest: bool = False, extreme_at: float | None = None) -> Signal:
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
        # A THIRD, SEPARATE MESSAGE — not a stage of the unconfirmed/confirmed sequence. It fires
        # before either, on the tap plus a 1M/5M reaction, and its own voice ("ON THE RADAR") is
        # deliberate: the room has been trained that this is not a trade.
        headline          = titles.ZONE_TAPPED,
        # NOT QUALIFIED *by our rule* — and the card now says both halves: `smc_factors` is why the
        # method would already take this, `disqualifiers` is why we stand aside anyway. Listing only
        # the absence (which is all this did until 2026-08-05) told the reader the setup was
        # incomplete, when by the book it is complete and we are simply stricter.
        qualified         = False,
        primary_timeframe = TF.H4,
        # No entry / stop / target ANYWHERE. The runner stamps `ref_price` for the DB row (the
        # entry_price column is NOT NULL); nothing here fabricates a level to fill a field.
        chart_bands       = [(zone.bottom, zone.top,
                              theme.ZONE_DEMAND if buy else theme.ZONE_SUPPLY,
                              f"4H {zone.direction.upper()}")],
        chart_marks       = [(tap_time, "TAP")],
        # The tap-kind line used to sit here too. It moved into `_viability` — saying "first touch"
        # is part of WHY the setup qualifies, and repeating it in both blocks cost caption budget
        # the new section needs (Telegram REJECTS a photo caption over 1024 chars).
        technical_reasons = [
            f"4H {zone.direction} zone tapped [{zone.bottom:.{digits}f}–{zone.top:.{digits}f}]"
            f"{tag}",
            f"{method_tf} {method}",
        ],
        # WHY THE METHOD WOULD TAKE THIS. Rendered as its own block on the card, so the reader sees
        # that what is present is already a complete setup by the book — not only what is absent.
        smc_factors       = _viability(is_newest, mitigation_kind, retaps, method_tf, method),
        # ...and why BX still stands aside. This replaces a bare "what's missing" list: the same two
        # facts, but as the REASON rather than as an absence, which is what the user asked for.
        # WHY WE STAND ASIDE — the DECISIONAL warning (2026-08-15).
        #
        # These two lines used to read "the zone hasn't closed a full height away — reaction
        # unproven" and "so no 4H pullback yet, and no level for a stop". Both went stale the moment
        # the document's entry model landed: there is no `respected` requirement and no 4H pullback
        # any more, so the card was explaining a rule the strategy no longer has.
        #
        # The real reason is the document's own, and it is a WARNING rather than an absence:
        #     "we cannot place any trades based on the decisional supply zone because there is a high
        #      chance that the price will push higher to sweep the liquidity ... and trigger the
        #      stop-loss of traders who entered from the decisional supply zone."
        #     "Don't use the decisional zones, you will be a liquidity."
        disqualifiers     = _standing_aside(zone, extreme_at, digits),
        market_context    = (f"BX-S/D — {symbol} just tapped a 4H {zone.direction} zone "
                             f"({side} area) with a {method_tf} {method}{tag}. Watching, not trading."),
    )
