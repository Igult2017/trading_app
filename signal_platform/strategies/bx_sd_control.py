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
from strategies.bx_sd_zones import Zone, break_index


def control(h4: list[Candle], zones: list[Zone]) -> str:
    """Which side is in control right now: "demand", "supply", or "none" if nothing has broken yet.

    Whichever zone was broken LAST hands control to the opposite side. Ties (both sides broken on the
    same bar) resolve to "none" — genuinely contested, and the book's own "tug of war" (p81); saying
    nothing is honest where saying either side would be a coin flip.
    """
    last_at, winner = -1, None
    for z in zones:
        j = break_index(h4, z)
        if j is None or j < last_at:
            continue
        side = "demand" if z.direction == "supply" else "supply"
        if j == last_at and side != winner:
            winner = None                      # both sides broken on the same bar — contested
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
