"""
BX-S/D — is a candidate actually a ZONE? The book's three factors.

Book Ch.6:
  p25: "Supply/demand is a zone, where price rapidly pushes away from (lots of orders placed),
        creating inefficiency (IFC), and breaks structure (BOS) / changes character (CHoCH)."
  p26: "-Did it create IFC?  -Did it break structure, or change character? (Did it break S/D?)"
  p27: "-Did it create liquidity before the zone?"
  p29: "...this will be your valid S/D zone (don't forget that it has to break structure /
        opposite S/D zone)"
  p32: "Always use the most RECENT S/D that gives us the 3 factors."

find_zones establishes FACTOR 1 (the IFC) and nothing else — everything it returns is a CANDIDATE.
This module applies factors 2 and 3, and that is what turns a candidate into a zone. Without them it
is just a candle sitting next to a gap, and the book does not call that a zone.

One definition, used by every path: the entry cascade (bx_sd_setup) and the 4H zone reports
(bx_sd_reports) must agree on what a zone is, or we DM about zones we would never trade.
"""
from core.types import Candle
from strategies.bx_sd_zones import Zone, zone_broken
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_liquidity import find_liquidity, swept_before

LIQ_WINDOW = 20   # look-back for the fuel grab that must precede the zone
BREAK_SPAN = 6    # a slow impulse can body-close beyond the swing several bars after the IFC


def broke_structure(structure, zone: Zone, want: str) -> bool:
    """FACTOR 2 — the zone's impulse must have broken structure / changed character in its own
    direction ("did it break S/D?"). The break can lag the IFC by several bars on a slow impulse."""
    return any(e.direction == want and zone.origin_index <= e.index <= zone.ifc_index + BREAK_SPAN
               for e in structure.events)


def grabbed_liquidity(pools, h4: list[Candle], zone: Zone) -> bool:
    """FACTOR 3 — "did it create liquidity before the zone?" The opposing pool must have been swept
    before the IFC: that sweep is the fuel the move ran on."""
    side = "sell" if zone.direction == "demand" else "buy"
    return swept_before(pools, h4, side, zone.ifc_index, LIQ_WINDOW)


def is_valid(h4: list[Candle], zone: Zone, structure=None, pools=None, pip: float = 0.0001) -> bool:
    """All three factors (the IFC is implied by the candidate existing at all) — AND still alive.

    A zone price has CLOSED through is finished, whatever factors it once had (bx_sd_zones.zone_broken;
    the book's Ch.8 flip). It belongs here because this is the one place that answers "is this a zone,
    right now", and every path asks it. Measured: 52% of respected-retests were on zones price had
    already gone through — BX proposing to buy support that no longer existed.
    """
    if zone_broken(h4, zone):
        return False
    st = structure if structure is not None else map_structure(h4)
    pl = pools if pools is not None else find_liquidity(h4, pip)
    want = "up" if zone.direction == "demand" else "down"
    return broke_structure(st, zone, want) and grabbed_liquidity(pl, h4, zone)


def valid_zones(h4: list[Candle], zones: list[Zone], pip: float = 0.0001) -> list[Zone]:
    """Candidates -> real zones. Structure and pools are mapped once for the whole list."""
    st, pl = map_structure(h4), find_liquidity(h4, pip)
    return [z for z in zones if is_valid(h4, z, st, pl, pip)]
