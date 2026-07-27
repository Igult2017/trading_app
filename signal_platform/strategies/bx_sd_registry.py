"""BX-S/D — the ZONE REGISTRY: mark a zone once when it qualifies, then track its life.

The old model recomputed zones from a rolling 200-bar window on every scan, so a zone's validity was
re-derived each time against whatever the window then contained. That is how a mid-waterfall candle
became a "zone" on 27 Jul: its structure break happened at lag -1 — BEFORE its own imbalance existed.
A zone judged with data that post-dates it is not a zone, it is an artefact of the query.

The model here is the book's, and the user's:

    mark the zones when they form so they stay pre-marked the moment they qualify. Then we only wait
    for price to come and mitigate them, then we wait for price to respect them, and look for
    confirmed entries in 1M or 5M.

So: FORMATION is decided once, from bars up to that moment, and the marked boundaries never change.
Everything after is a LIFECYCLE the zone moves through in bar order.

    pending      the imbalance printed; waiting to see if the impulse breaks structure
    unmitigated  it did — the zone is MARKED and waiting for price
    mitigated    price tapped it (Ch.6 p27: a tap turns unmitigated into mitigated)
    respected    after the tap, price reacted away by a full zone height
    broken       a body closed beyond the distal — dead (Ch.8 flip territory)

Zones are keyed on the IFC's TIME, never a window index: indices shift as bars arrive, times do not.

Built by replaying CLOSED bars in order, so it is a pure function of history — it rebuilds identically
after a restart, needs no table or migration, and cannot see the future by construction.
"""
from dataclasses import dataclass, field

from core.types import Candle
from shared.mtf_utils import closed_only
from strategies.bx_sd_zones import Zone, find_fvgs, mark_zone
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_liquidity import find_liquidity, swept_before

BREAK_SPAN = 6    # a slow impulse can body-close beyond the swing several bars AFTER the IFC
LIQ_WINDOW = 20   # look-back for the fuel grab that must precede the zone
REACT_MULT = 1.0  # "respected" = a body close a full zone-height away from the zone


@dataclass
class MarkedZone:
    direction: str            # "demand" | "supply"
    top:       float
    bottom:    float
    proximal:  float
    distal:    float
    eq50:      float
    kind:      str            # which book technique marked it
    ifc_time:    int          # STABLE identity — an index would shift as bars arrive
    origin_time: int
    state:       str = "pending"
    marked_at:    int | None = None
    mitigated_at: int | None = None
    respected_at: int | None = None
    broken_at:    int | None = None

    @property
    def live(self) -> bool:
        return self.state in ("unmitigated", "mitigated", "respected")

    @property
    def height(self) -> float:
        return self.top - self.bottom

    def tapped_by(self, c: Candle) -> bool:
        return (c.low <= self.top) if self.direction == "demand" else (c.high >= self.bottom)

    def broken_by(self, c: Candle) -> bool:
        """By body CLOSE beyond the distal — a wick through it is a sweep, and the book calls that a
        reason to trade the zone, not a reason to kill it."""
        return (c.close < self.bottom) if self.direction == "demand" else (c.close > self.top)

    def reacted_by(self, c: Candle) -> bool:
        away = self.top + REACT_MULT * self.height if self.direction == "demand" \
            else self.bottom - REACT_MULT * self.height
        return (c.close >= away) if self.direction == "demand" else (c.close <= away)


def _broke_structure(events, want: str, ifc_i: int) -> bool:
    """FACTOR 2 — the zone's own impulse must break structure.

    The window starts AT THE IFC. A break before the imbalance existed cannot have been led to by it;
    accepting one is exactly the 27 Jul defect (BOS at lag -1 sold a mid-waterfall candle as a zone).
    `>=` and not `>` because a close beyond the swing ON the impulse bar is caused by that impulse.
    """
    return any(e.direction == want and ifc_i <= e.index <= ifc_i + BREAK_SPAN for e in events)


def build(h4: list[Candle], pip: float = 0.0001) -> list[MarkedZone]:
    """Replay closed H4 bars in order and return every zone, with its state as of the last bar."""
    bars = closed_only(h4)
    if len(bars) < 5:
        return []
    events = map_structure(bars).events
    pools = find_liquidity(bars, pip)
    fvgs = {f.index: f for f in find_fvgs(bars)}

    zones: list[MarkedZone] = []
    pending: list[tuple[MarkedZone, int]] = []          # (zone, ifc_index)

    for i, bar in enumerate(bars):
        # 1. A new imbalance is only KNOWN once the bar after its middle candle has closed.
        m = i - 1
        if m in fvgs and m - 1 >= 0:
            f = fvgs[m]
            bull = f.direction == "bull"
            top, bottom, origin_i, kind = mark_zone(bars, m, bull)
            if top > bottom:
                z = MarkedZone(direction="demand" if bull else "supply", top=top, bottom=bottom,
                               proximal=top if bull else bottom, distal=bottom if bull else top,
                               eq50=(top + bottom) / 2.0, kind=kind,
                               ifc_time=bars[m].time, origin_time=bars[origin_i].time)
                pending.append((z, m))

        # 2. Promote or discard pending zones — factor 2 (break) + factor 3 (liquidity before it).
        still: list[tuple[MarkedZone, int]] = []
        for z, ifc_i in pending:
            want = "up" if z.direction == "demand" else "down"
            side = "sell" if z.direction == "demand" else "buy"
            if _broke_structure(events, want, ifc_i) and swept_before(pools, bars, side, ifc_i, LIQ_WINDOW):
                z.state, z.marked_at = "unmitigated", bar.time
                zones.append(z)
                # catch the state up: price may have tapped it while the break was still forming
                for c in bars[ifc_i + 1:i + 1]:
                    _advance(z, c)
            elif i <= ifc_i + BREAK_SPAN:
                still.append((z, ifc_i))               # still time for the break to print
            # else: the window closed without a break — never a zone, dropped
        pending = still

        # 3. Advance every live zone with this bar.
        for z in zones:
            if z.live and z.marked_at is not None and bar.time > z.marked_at:
                _advance(z, bar)
    return zones


def to_zone(mz: MarkedZone, bars: list[Candle]) -> Zone | None:
    """A registry zone as the plain `Zone` the rest of the cascade consumes.

    The registry keys on TIMES so a zone survives bars arriving; everything downstream
    (entry refinement, HTF backing, the card) still wants window INDICES. Resolve here, once, rather
    than teach every consumer about the registry.
    """
    idx = {c.time: i for i, c in enumerate(bars)}
    if mz.ifc_time not in idx or mz.origin_time not in idx:
        return None                      # older than the window handed to us
    return Zone(direction=mz.direction, top=mz.top, bottom=mz.bottom, proximal=mz.proximal,
                distal=mz.distal, eq50=mz.eq50, origin_index=idx[mz.origin_time],
                ifc_index=idx[mz.ifc_time], mitigated=mz.state != "unmitigated", kind=mz.kind)


def _advance(z: MarkedZone, c: Candle) -> None:
    """One bar of lifecycle. Break is checked FIRST — a bar that taps and closes through is a break."""
    if not z.live:
        return
    if z.broken_by(c):
        z.state, z.broken_at = "broken", c.time
    elif z.state == "unmitigated" and z.tapped_by(c):
        z.state, z.mitigated_at = "mitigated", c.time
    elif z.state == "mitigated" and z.reacted_by(c):
        z.state, z.respected_at = "respected", c.time
