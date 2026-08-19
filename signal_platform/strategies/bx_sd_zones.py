"""
BX-S/D — supply/demand zones from inefficiency.

Book Ch.6, "Mitigation / Inefficiency":
  * "Supply/demand is a zone, where price rapidly pushes away from (lots of orders placed), creating
    inefficiency (IFC), and breaks structure (BOS) / changes character (CHoCH)."
  * IFC / imbalance = a 3-candle gap (fair-value gap) — the fast move skipped a price range:
      bullish IFC: candle[i-1].high < candle[i+1].low
      bearish IFC: candle[i-1].low  > candle[i+1].high
  * THE ZONE (p29, near-verbatim): "Find areas where IFC has been created. Find the LAST RECENT
    CANDLE BEFORE THE IFC. It doesn't have to be in the opposite direction! (For example: if the IFC
    was created on the long side, you can choose an upside move candle, it doesn't have to be a
    downside move candle.) Always choose the last candle that created the IFC!"

    So: ONE zone per IFC, at the candle immediately before it, WHATEVER COLOUR it is. We must not
    walk backwards hunting an opposite-coloured candle — the book rules that out in as many words,
    and doing it collapses every IFC in one impulse onto a single zone at the impulse's ORIGIN, tens
    of pips from where the inefficiency actually formed. That zone is then rarely revisited, so it
    reads "unmitigated" forever while the real zones next to price are never marked at all.
  * WICK ZONES (p33-35): if the impulse candle's own wick traded back through the candle before it,
    "there aren't any resting orders left on this candle, all of them get mitigated by this following
    candle" — the zone is then the IMPULSE candle's wick ("orders are sitting on THIS WICK!"), and
    marking the body instead is "NOT HERE!". See _wick_zone.
  * mitigated / unmitigated (p27): "When price taps into a d/s zone, that has not been tapped yet, it
    becomes mitigated from unmitigated." BX-S/D only ever trades UNMITIGATED zones.

The other two validity factors (broke structure, liquidity grabbed) are applied by bx_sd_setup;
selecting the most recent zone that carries all three is its job too (p32). Reads only raw candles.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.mtf_utils import closed_only


@dataclass
class FVG:
    direction: str    # "bull" | "bear"
    index:     int    # middle candle of the 3-candle gap
    bottom:    float  # gap low
    top:       float  # gap high


@dataclass
class Zone:
    direction:    str      # "demand" | "supply"
    top:          float
    bottom:       float
    proximal:     float    # entry edge (near price)
    distal:       float    # SL edge (far)
    eq50:         float    # mean threshold (50%)
    origin_index: int      # the zone candle (last before the IFC)
    ifc_index:    int      # the FVG that validates it
    mitigated:    bool = False
    kind:         str = "institutional"   # which BOOK technique marked it — see mark_zone
    # WHERE THIS ZONE SITS IN ITS OWN GROUP — "extreme" | "decisional" | "" (alone / unclassified).
    #
    # Smart Risk, "Double Zone Break Out": when a move leaves more than one same-side zone behind, the
    # FURTHEST one is the extreme and the nearer one is DECISIONAL — *"Don't use the decisional zones,
    # you will be a liquidity."* Price pushes past the decisional to sweep the stops resting above it
    # and to mitigate the extreme, so an order at the decisional is the fuel for that push.
    role:         str = ""
    # How many opposite-side zones the move that created this one CLOSED THROUGH. Two or more is the
    # document's strong case ("break & close below or above the two successive supply or demand
    # zones"). A label and a strength input, never a gate on its own.
    broke_through: int = 0
    group:        int = -1    # which same-move group it belongs to (see classify_roles)


def find_fvgs(candles: list[Candle]) -> list[FVG]:
    """3-candle fair-value gaps (inefficiencies), oldest first."""
    out: list[FVG] = []
    for i in range(1, len(candles) - 1):
        p, n = candles[i - 1], candles[i + 1]
        if p.high < n.low:
            out.append(FVG("bull", i, p.high, n.low))
        elif p.low > n.high:
            out.append(FVG("bear", i, n.high, p.low))
    return out


def _wick_zone(candles: list[Candle], ifc: int, bull: bool) -> tuple[float, float] | None:
    """Book p33-35 — "When should you use wicks as the zones?".

    If the impulse candle's own wick traded back THROUGH the candle before it, then (p34) "there
    aren't any resting orders left on this candle, all of them get mitigated by this following
    candle" — that candle is dead as a zone. "In this case, this is your valid supply level, orders
    are sitting on THIS WICK!" So the zone becomes the impulse candle's OWN wick; p35 marks the body
    and says "NOT HERE!". Returns (top, bottom) of the wick zone, or None when the ordinary
    candle-before rule stands. The wick must actually exist — if the BODY did the sweeping there is
    no wick to rest orders on, and we leave the normal rule in charge.
    """
    imp, zc = candles[ifc], candles[ifc - 1]
    body_hi, body_lo = max(imp.open, imp.close), min(imp.open, imp.close)
    if bull:
        if imp.low <= zc.low and imp.low < body_lo:      # lower wick swept the whole prior candle
            return body_lo, imp.low
    elif imp.high >= zc.high and imp.high > body_hi:     # upper wick swept the whole prior candle
        return imp.high, body_hi
    return None


def is_engulfed(candles: list[Candle], zi: int) -> bool:
    """p72 — the book's preferred zone: the candle to the RIGHT closes beyond the zone candle's WICK.

    > "Personally for me when picking the areas of supply and demand I like the candle to be
    >  engulfed. What I mean by this is the next candle to the right has to close above the wick of a
    >  bullish candle and below the wick of a bearish candle."

    Not a filter — the book explicitly marks HTF zones "even if they aren't engulfed" and only then
    cycles timeframes hunting an engulfed one. So this TAGS the better zone rather than dropping the
    others, and the tag is what a confluence/grade step can reward.
    """
    if zi < 0 or zi + 1 >= len(candles):
        return False
    z, nxt = candles[zi], candles[zi + 1]
    return nxt.close > z.high if z.close >= z.open else nxt.close < z.low


def mark_institutional(candle: Candle, bull: bool) -> tuple[float, float]:
    """Ch.4 — the INSTITUTIONAL CANDLE. The zone is the WHOLE CANDLE, high to low.

    READ THE BOOK'S PICTURES BEFORE CHANGING THIS. p16 (the schematic) and p19 (the live example,
    labelled "1HR Institutional candle (IC)") both draw the zone box around the ENTIRE candle. p72
    says the same in words: "Demand is the last bearish candle before a break of sub structure."

    WHY THIS IS NOT open → MTH, AND WHAT THAT MISTAKE COST. p17 says:

    > "We will then place a horizontal ray and note on the line: the timeframe the candle formed, if
    >  it is Bullish/bearish candle, then illustrate the OPEN of the candle and the MIDDLE; the
    >  middle of the candle we will caption MTH (stand for 'mean threshold'). By putting these
    >  HORIZONTAL LINES allows us to constantly MONITOR these Institutional candles."

    The open and the MTH are two reference RAYS drawn ON the candle to monitor it — they are not the
    zone's edges. From 2026-07-26 to 2026-07-30 this function returned (open, MTH), which crops the
    band to whatever happens to lie between the open and the midpoint. When a candle opens near its
    own midpoint that is nearly nothing: the smallest zone the registry produced was 0.1 pips, and
    43/192 GBP/JPY zones came out under 5 pips wide.

    THE CASE THAT EXPOSED IT (GBP/JPY H4, 15 Jul -> 29 Jul 2026). The 15 Jul 13:00 demand zone is
    217.312-217.807 (49 pips). open->MTH marked it 217.415-217.560 — 14 of the 49. On 29 Jul 01:00
    price wicked to 217.166 and CLOSED 217.319: ten pips under the cropped floor, so the zone was
    declared broken and deleted — but 0.7 pips ABOVE the real floor, so the real zone held and the
    wick beneath it was a liquidity sweep, which the book calls a reason to TRADE the zone. Four bars
    later, 29 Jul 17:00 ran 217.796 -> 218.482. The setup was missed because a sweep of a correctly
    marked zone read as a body break of an incorrectly marked one.

    A zone marked too NARROW invents breaks and misses taps. A zone marked too WIDE cannot do either;
    `refine_zone` (bx_sd_ltf) collapses it onto a tight LTF POI for the entry, which is the book's own
    Ch.9 third step. The error is not symmetric — do not "tighten" this.
    """
    return candle.high, candle.low


def mark_zone(candles: list[Candle], ifc: int, bull: bool) -> tuple[float, float, int, str]:
    """(top, bottom, origin_index, kind) — the right BOOK technique for THIS zone.

    The book does not have one way of marking a zone; it has several, chosen by what kind of zone is
    in front of you. Dispatch, in the order the book resolves them:

      wick          p33-35 — the impulse candle's own wick swept the prior candle, so that candle is
                    dead and "orders are sitting on THIS WICK". Checked FIRST: when it applies, the
                    ordinary zone candle has no orders left to mark.
      engulfed      p72    — the next candle closed beyond the zone candle's wick. Same geometry as
                    institutional, tagged as the stronger zone.
      institutional Ch.4   — the default: the candle before the IFC, any colour (p29), marked
                    open → MTH.
    """
    wick = _wick_zone(candles, ifc, bull)
    if wick is not None:
        return wick[0], wick[1], ifc, "wick"
    zi = ifc - 1
    top, bottom = mark_institutional(candles[zi], bull)
    return top, bottom, zi, ("engulfed" if is_engulfed(candles, zi) else "institutional")


def _is_mitigated(candles: list[Candle], after: int, direction: str, top: float, bottom: float) -> bool:
    """A fresh zone is mitigated the first time price taps back to its proximal edge (p27)."""
    for j in range(after + 1, len(candles)):
        c = candles[j]
        if direction == "demand" and c.low <= top:
            return True
        if direction == "supply" and c.high >= bottom:
            return True
    return False


def zone_broken(candles: list[Candle], zone: Zone, after: int | None = None) -> bool:
    """Is the zone DEAD? Price CLOSING beyond its distal — the far edge — means the orders that made
    it are gone. It is not support any more; it is a level price went through. The book calls the
    aftermath an "S/D flip" (Ch.8): a broken demand becomes supply. Either way it is finished as what
    it was, and nothing should trade it.

    By body close, never a wick — BX's rule everywhere. A wick beyond the distal is a SWEEP (the
    book's own liquidity grab, and a REASON to trade the zone); a close beyond it is a break. Reading
    wicks here would throw away exactly the setups the book wants.

    CLOSED bars only (fix 2026-07-22): a break is a body-CLOSE determination, and the feed's newest
    bar has no close yet — its "close" is live price. Reading it killed the zone intra-bar EXACTLY
    during the sweep wick below it (live price beyond the distal), i.e. at the precise moment the
    book says to prepare the entry; the zone then resurrected when the bar closed back inside. Same
    rule check_invalidation already follows.
    """
    return break_index(candles, zone, after) is not None


def break_index(candles: list[Candle], zone: Zone, after: int | None = None) -> int | None:
    """WHERE the zone broke — the first closed bar beyond its distal, else None.

    Identical rule to `zone_broken` (which delegates here, so the two cannot drift). The index is
    what "who is in control" needs: control belongs to whoever broke the OTHER side most recently
    (Ch.7 p58 — "Price broke through our last supply level, demand is in control now").
    """
    candles = closed_only(candles)
    for j in range(((zone.ifc_index if after is None else after)) + 1, len(candles)):
        if zone.direction == "demand" and candles[j].close < zone.bottom:
            return j
        if zone.direction == "supply" and candles[j].close > zone.top:
            return j
    return None


def find_zones(candles: list[Candle]) -> list[Zone]:
    """Every IFC-backed S/D zone with its mitigation state — one per IFC, most-recent last.

    The zone candle is the one immediately before the IFC and its colour is irrelevant (p29). Zones
    come out ordered because find_fvgs walks the candles in order.
    """
    # A zone is a LEVEL, so it is built from CLOSED candles only. The feed hands back the newest bar
    # while it is still forming, and a forming bar's high/low can only extend — so an IFC that exists
    # this scan can vanish the next, taking its zone with it. On the 4H that flicker lasts hours.
    # MITIGATION is the opposite case: a tap is an event happening NOW, so it reads the full series.
    # closed_only drops trailing bars only, so an index into `closed` is still valid in `candles`.
    closed = closed_only(candles)
    zones: list[Zone] = []
    for fvg in find_fvgs(closed):
        zi = fvg.index - 1
        if zi < 0:
            continue
        bull      = fvg.direction == "bull"
        direction = "demand" if bull else "supply"
        # TYPE-AWARE MARKING — the book has several techniques and picks by zone type (mark_zone).
        top, bottom, origin, kind = mark_zone(closed, fvg.index, bull)
        zones.append(Zone(
            direction    = direction,
            top          = top,
            bottom       = bottom,
            proximal     = top if bull else bottom,     # entry edge faces the market
            distal       = bottom if bull else top,     # SL edge is the far side
            eq50         = (top + bottom) / 2.0,
            origin_index = origin,
            kind         = kind,
            ifc_index    = fvg.index,
            mitigated    = _is_mitigated(candles, fvg.index, direction, top, bottom),
        ))
    return zones




def wick_dominant(candle: Candle) -> bool:
    """p50-51 — the book's EQUILIBRIUM-entry test, and it is about the candle's SHAPE.

    > "I use 50% entry if the WICK of the candle is bigger than the 50% of the WHOLE candle."
    > (worked example, p51: "the wick is 66% of the whole candle. In this case I use 50% of the
    >  candle for the limit.")

    So: total wick > half the candle's range -> enter at the 50% (MTH) instead of the proximal edge.

    THIS IS ONLY THE FIRST OF THE BOOK'S TWO EQ50 TRIGGERS — see `needs_eq50`, which is what callers
    must use. When this rule was introduced it REPLACED the pre-existing `zone width > 2 pips` test,
    described at the time as "an unrelated size threshold". That was wrong: p53-54 is the book's
    second scenario, and 2 pips is its MAX SL, not a coincidence. Removing it stopped wide zones
    getting the equilibrium entry that keeps their stop inside 2 pips.
    """
    rng = candle.high - candle.low
    if rng <= 0:
        return False
    body = abs(candle.close - candle.open)
    return (rng - body) > 0.5 * rng


_MAX_SL_PIPS = 2.0   # p53: "the maximum 2 pip SL"


def needs_eq50(zone: Zone, candle: Candle | None, pip: float) -> bool:
    """The book uses the 50% (equilibrium) entry in TWO scenarios — EITHER is sufficient.

      1. SHAPE (p51-52) — "I use 50% entry if the WICK of the candle is bigger than the 50% of the
         WHOLE candle." (worked example: "the wick is 66% of the whole candle.")
      2. WIDTH (p53-54) — "I use 50% entry in ONE MORE SCENARIO, if the maximum 2 pip SL can't fit.
         As you can see, the candle is more than 2 pips, so the SL can't cover the whole zone." /
         "In this case I also use equilibrium entry, to make sure the whole zone is covered, and my
         SL isn't bigger than 2 pips."

    Scenario 2 was the ORIGINAL implementation and was deleted when scenario 1 was added, on the
    mistaken view that a pip threshold could not be a book rule. Both are the book's; they are ORed.
    """
    if candle is not None and wick_dominant(candle):
        return True
    return (zone.top - zone.bottom) / pip > _MAX_SL_PIPS
