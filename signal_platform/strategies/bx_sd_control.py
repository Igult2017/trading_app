"""BX-S/D — "who is in control" (the book's Ch.7), replacing the swing-structure trend.

The book has no pro-trend / counter-trend. It asks which SIDE is in control, and control is decided
by which zone was mitigated — broken through — to propel the current move:

  p38  "We broke through the minor supply, FORCING DEMAND TO BE IN CONTROL. After, the price was
        rejected on the major supply, causing the supply to be in control again."
  p58  "Price broke through our last supply level, DEMAND IS IN CONTROL NOW, so we can look for
        long entries on the 1m."

So: break a SUPPLY zone -> demand is in control. Break a DEMAND zone -> supply is in control. The
side in control is the one that most recently went through the other's level.

WHAT CONTROL IS FOR — and what it is NOT for.

Control does NOT forbid a direction. It sets the price of admission. p35:

  "You want to trade the controlling side of the market. If you're waiting for a demand trade to go
   long, but the price comes from an unmitigated supply zone, SUPPLY IS IN CONTROL, YOU CAN'T TRADE
   DEMAND WITHOUT A CONFIRMATION."

...and the book then takes that very trade, p57: "supply is in control, but we expect a Flip or CHoCH
after we tapped in H4 demand." The only thing control actually forbids is the unconfirmed RISK entry
— the limit order: "We do not place a limit order here!" (p38).

BX has no risk-entry path: every signal goes through the MANDATORY 1M/5M confirmation in bx_sd.py
STAGE 2-3. So BX already pays what the book charges for an against-control trade, and control here is
REPORTED, never used to reject. If an unconfirmed limit path is ever added, p35 binds it and this is
the function that decides.
"""
from core.types import Candle
from strategies.bx_sd_freshness import _first_tap
from strategies.bx_sd_zones import Zone, break_index


def control(h4: list[Candle], zones: list[Zone]) -> str:
    """Which side is in control right now: "demand", "supply", or "none" if nothing has happened yet.

    TWO mechanisms, and the LATEST event of either kind wins:

      MITIGATION — price taps a zone that had not been tapped -> THAT zone's side takes control.
        p36: "the price mitigated an unmitigated supply zone, SO NOW SUPPLY IS IN CONTROL"
        p38: "the price was rejected on the major supply, causing the supply to be in control again"
        Ch.6 p26 defines the word: "When price taps into a d/s zone, that has not been tapped yet, it
        becomes MITIGATED from unmitigated." Mitigated = tapped.

      BREAK — price closes through a zone -> the OPPOSITE side takes control.
        p38: "We broke through the minor supply, forcing demand to be in control"
        p58: "Price broke through our last supply level, demand is in control now"

    No separate "reaction" test, though p36 mentions a rejection: the two mechanisms already resolve
    it. Tap a supply zone and turn away -> the tap is the latest event and supply holds control.
    Tap it and drive straight through -> the break lands LATER and demand takes control. Latest wins
    is self-correcting, so this needs no threshold constant of its own.

    Ties (both sides on the same bar) resolve to "none" — genuinely contested, the book's own "tug of
    war" (p81); saying nothing is honest where naming either side would be a coin flip.
    """
    last_at, winner = -1, None
    for z in zones:
        events = []
        tap = _first_tap(h4, z)
        brk = break_index(h4, z)
        # A tap only confers control if the zone HELD — p36's "rejection/reaction". Price cannot
        # break a zone without passing through it, so on a bar that closes beyond the distal the
        # touch is part of the break, not a separate mitigation. Counting both would tie the two
        # sides on one bar and report "none" for what is simply a break.
        if tap is not None and not (brk is not None and brk <= tap):
            events.append((tap, z.direction))                # mitigation -> this zone's own side
        if brk is not None:                                  # break -> the opposite side
            events.append((brk, "demand" if z.direction == "supply" else "supply"))
        for j, side in events:
            if j < last_at:
                continue
            if j == last_at and side != winner:
                winner = None                                # contested on the same bar
                continue
            last_at, winner = j, side
    return winner or "none"


def describe(side: str, zone_direction: str) -> dict:
    """Control as it travels onto the card: which side holds it, and whether this trade goes with it.

    `with_control` is None when nothing is in control — that is not the same as being against it, and
    a card that said "against control" on an untested market would be asserting something false.
    """
    return {"side": side,
            "with_control": None if side == "none" else side == zone_direction}


def phrase(side: str, zone_direction: str) -> str:
    """One line for the signal card, in the book's own vocabulary."""
    if side == "none":
        return f"No side in control yet — {zone_direction} entry"
    if side == zone_direction:
        return f"{side.capitalize()} in control — with-control {zone_direction} entry"
    return (f"{side.capitalize()} in control — against-control {zone_direction} entry, "
            f"allowed on confirmation (p35/p57)")
