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
from dataclasses import dataclass

from core.types import Candle
from shared.mtf_utils import closed_only
from strategies.bx_sd_zones import Zone, find_fvgs, mark_zone
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_liquidity import find_liquidity, swept_before

# NOTE: there is deliberately NO break-window constant here any more. `BREAK_SPAN = 6` used to
# require structure to break within 6 bars AFTER the IFC. It appears nowhere in the book (167 pages
# searched, zero mentions of any candle count on the break) and it discarded pullback-origin zones,
# which are the most common kind there is. See `_broke_structure`.
LIQ_WINDOW = 20   # look-back for the fuel grab that must precede the zone

# A zone is finished only when its distal is BODY-CLOSED through. Everything else is still tradeable,
# including a zone that has already been mitigated — the user's rule: a zone can be retapped, and an
# unmitigated zone stays unmitigated however long it takes ("even in the next 10 years").
LIVE_STATES = ("unmitigated", "wick_mitigated", "body_mitigated", "respected")
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

    # Set when the zone is tapped again after it had already been mitigated. The card must say so —
    # a retap of a zone that was properly (body) mitigated is a CAUTION, not a fresh setup.
    #
    # A RETAP IS A RETURN VISIT, NOT A BAR. This counted every bar price spent inside the zone until
    # 2026-07-30, so a zone price consolidated in for 17 bars reported `retaps=16` when it had been
    # visited twice. That is not a cosmetic slip: `bx_sd_strength` rewards retaps as evidence the zone
    # is respected, and grinding sideways inside a zone is the OPPOSITE of respecting it — the count
    # was strongest exactly where the zone was weakest. `in_zone` remembers whether the PREVIOUS bar
    # was inside, so only a fresh entry increments.
    retaps: int = 0
    last_tap_at: int | None = None
    in_zone: bool = False        # was the previous CLOSED bar inside? (visit-edge detection)

    # EXTREME vs DECISIONAL — see `classify_roles`. "" while a zone stands alone in its group.
    role: str = ""
    broke_through: int = 0       # opposite-side zones this zone's move closed through

    # HOW the zone was FIRST mitigated: "wick" | "body" | "" (never tapped). Set once, never
    # overwritten.
    #
    # This exists because `state` cannot carry it. When a zone reacts away, `state` is overwritten
    # wick_mitigated/body_mitigated -> "respected", and the wick-vs-body fact was simply lost. Since
    # the cascade only ever fires on `respected` zones, that meant the card could never report it —
    # `mitigation_note` fell through every branch to "Fresh — never tapped." and said so on a zone
    # the user had watched get wicked. He caught it on 2026-08-03. A state machine that destroys
    # information on a transition needs a field, not a better message.
    mitigation_kind: str = ""

    @property
    def live(self) -> bool:
        return self.state in LIVE_STATES

    @property
    def wick_only(self) -> bool:
        """Tapped by a wick but never by a body — the sweep case. The user: 'where a wick mitigates a
        zone, chances are that it's gonna be retapped.' The orders were never filled, so the zone is
        still loaded and price is expected back."""
        return self.state == "wick_mitigated"

    @property
    def spent(self) -> bool:
        """A body traded the zone. Still tradeable on a retap, but flagged with caution."""
        return self.state in ("body_mitigated", "respected") or self.retaps > 0

    def live_visit(self) -> int:
        """Which VISIT a tap by the FORMING bar belongs to — the dedup unit for the heads-up.

        The registry ages zones from CLOSED bars, so at the moment a live tap happens the counters
        have not moved yet. Without this, `bx_sd_reports` keyed its mitigation heads-up on the zone
        alone and therefore sent exactly ONE per zone for its entire life — every later retap was
        silently swallowed, which contradicts the rule that a wick tap signals AND its later retap
        signals again. Returns a number that is stable for the duration of one visit and increments
        on the next.
        """
        if self.state == "unmitigated" or self.in_zone:
            return self.retaps
        return self.retaps + 1

    def body_in(self, c: Candle) -> bool:
        """Did the candle's BODY enter the zone? Mitigation is by wick OR body (the user's rule); this
        separates the two so the card can say which happened."""
        hi, lo = max(c.open, c.close), min(c.open, c.close)
        return lo <= self.top and hi >= self.bottom

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


def _broke_structure(events, want: str, ifc_i: int, upto_i: int | None = None) -> bool:
    """FACTOR 2 — the zone must belong to a leg that broke structure IN ITS OWN DIRECTION.

    THE RULE, and why it is not a candle count. The book asks only *"Did it create IFC? Did it break
    structure, or change character?"* (p26) and *"don't forget that it has to break structure"* (p29).
    Searched all 167 pages: there is NO bar or candle count attached to the break anywhere. The
    previous `ifc_i <= e.index <= ifc_i + BREAK_SPAN` window was invented, and it silently destroyed
    the most ordinary zone there is — a PULLBACK ORIGIN inside an already-broken leg.

    THE CASE THAT EXPOSED IT (GBP/JPY H4, 2026-07-15). Structure broke UP at 01:00. Price pulled back,
    printed its imbalance at 09:00 and 13:00, and left the zone by 160 pips. The break was two bars
    BEFORE the IFC, the window only looked forward, and both candidates were dropped. Price returned
    on 29 Jul, launched 100+ pips, and no signal existed because the zone had never been written down.

    So the test is now about the LEG, not the clock:
      * the most recent structure event at or before the IFC is already in the zone's direction
        (the pullback-origin case), OR
      * a break in that direction prints after the IFC.

    IT STILL REJECTS THE 27 JUL DEFECT (a BOS at lag -1 selling a mid-waterfall candle as a zone),
    because there the prevailing structure ran AGAINST the zone: the latest event before that IFC was
    a DOWN break while the candidate was demand, so neither arm passes. That is asserted as a
    regression test, not assumed.

    `upto_i` — THE BAR BEING REPLAYED. A break that has not printed yet cannot qualify anything, and
    without this bound the second arm below searched the WHOLE event list, matching breaks from the
    future. See the note in `build` for what that cost. None means unbounded, kept only so the
    pullback-origin arm can still be reasoned about in isolation by a test.
    """
    prior = [e for e in events if e.index <= ifc_i]
    if prior and prior[-1].direction == want:
        return True                                  # the zone sits inside a leg already broken its way
    return any(e.direction == want and ifc_i < e.index
               and (upto_i is None or e.index <= upto_i) for e in events)


def classify_roles(zones: list[MarkedZone], events, bar_index: dict[int, int]) -> None:
    """Label each live zone EXTREME or DECISIONAL within its own group. Mutates in place.

    SMART RISK, "Double Zone Break Out" — the rule this exists for, in his document's own words:

        "the upper supply zone is the extreme one and the second supply zone located a bit lower is
         called the decisional zone. Please consider that we cannot place any trades based on the
         decisional supply zone because there is a high chance that the price will push higher to
         sweep the liquidity accumulated above the double tops and trigger the stop-loss of traders
         who entered from the decisional supply zone."

        "Don't use the decisional zones, you will be a liquidity."

    WHAT A GROUP IS. Same-side zones left behind by ONE move — so a group ends at the first structure
    event AGAINST that side, because that is a different move. Within a group the zone furthest from
    where price went is the EXTREME (highest supply / lowest demand) and every other is DECISIONAL.

    ORDER DOES NOT DECIDE IT, PRICE DOES. The extreme is not "the first one formed": a later zone can
    print higher than an earlier one inside the same leg, and it is then the extreme. Reading it off
    formation order would label by accident of sequence rather than by where the liquidity sits.

    A zone ALONE in its group keeps role "" — not "extreme". There is no decisional zone to be
    preferred over, so calling it extreme would claim a distinction the market never drew.

    ONLY LIVE ZONES ARE GROUPED. A broken zone is dead and cannot be traded, so including it could
    hand `extreme` to a corpse and demote the one zone actually on offer.
    """
    for z in zones:
        z.role = ""

    live = [z for z in zones if z.live and z.marked_at in bar_index]
    for side in ("supply", "demand"):
        same = sorted((z for z in live if z.direction == side),
                      key=lambda z: bar_index[z.marked_at])
        if not same:
            continue
        # a break the OTHER way ends the move that was leaving these zones behind
        against = "up" if side == "supply" else "down"
        cuts = sorted(e.index for e in events if e.direction == against)

        group: list[MarkedZone] = []
        for z in same:
            zi = bar_index[z.marked_at]
            if group and any(bar_index[group[-1].marked_at] < c <= zi for c in cuts):
                _label(group, side)
                group = []
            group.append(z)
        _label(group, side)


def count_breakthroughs(zones: list[MarkedZone], events, bar_index: dict[int, int]) -> None:
    """How many OPPOSITE zones the move that follows each zone closed through. Mutates in place.

    SMART RISK, criterion 3: *"Price should break & close below or above the two successive supply or
    demand zones along its path."* Two or more is the document's strong case — it means the move left
    real inefficiency behind it rather than drifting through one level.

    THE DIRECTION OF TIME HERE IS EASY TO GET BACKWARDS. A supply zone is marked at the TOP, and the
    demand zones it breaks are broken AFTERWARDS, as price falls away from it. So the count looks
    FORWARD from `marked_at`, not back — and it stops at the first structure event the other way,
    because that is a different move.

    A LABEL AND A STRENGTH INPUT, NEVER A GATE ON ITS OWN. The document offers it as confluence
    ("this pattern will be a strong confluence and confirmation"), not as a veto, and the standing
    rule here is that setup frequency is a market output rather than something to tune toward.
    """
    idx_of = bar_index
    for z in zones:
        z.broke_through = 0
    for z in zones:
        if z.marked_at not in idx_of:
            continue
        start = idx_of[z.marked_at]
        against = "up" if z.direction == "supply" else "down"
        later = [e.index for e in events if e.direction == against and e.index > start]
        end = min(later) if later else None
        opp = "demand" if z.direction == "supply" else "supply"
        z.broke_through = sum(
            1 for o in zones
            if o.direction == opp and o.broken_at in idx_of
            and idx_of[o.broken_at] > start and (end is None or idx_of[o.broken_at] <= end))


def _label(group: list[MarkedZone], side: str) -> None:
    """Furthest-from-price zone in the group is the extreme; the rest are decisional."""
    if len(group) < 2:
        return                              # alone: no distinction exists, so none is claimed
    best = max(group, key=lambda z: z.proximal) if side == "supply" \
        else min(group, key=lambda z: z.proximal)
    for z in group:
        z.role = "extreme" if z is best else "decisional"


def build(h4: list[Candle], pip: float = 0.0001,
          session_candles: list[Candle] | None = None) -> list[MarkedZone]:
    """Replay closed H4 bars in order and return every zone, with its state as of the last bar.

    `session_candles` is a FINER feed (M15/M30). Without it `find_liquidity` cannot isolate a
    session boundary, so Asia/London/NY highs and lows are simply absent from the pool set — and
    factor 3 below (`swept_before`: did this zone's move grab liquidity first?) was therefore blind
    to every session level. It stayed blind for as long as this parameter did not exist, while the
    entry-time defensive check two modules away had been fed the same levels all along.

    Optional, defaulting to None, so tests and standalone harnesses keep working unchanged.
    """
    bars = closed_only(h4)
    if len(bars) < 5:
        return []
    events = map_structure(bars).events
    pools = find_liquidity(bars, pip, session_candles=session_candles)
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
            # A ZONE IS MARKED ON THE BAR ITS QUALIFYING BREAK PRINTS — NOT BEFORE IT (2026-08-15).
            #
            # HIS RULE: "zones dont form immediately but as its features develop along the way. For
            # example BOS is not instant so we cant make it instantly."
            #
            # `_broke_structure` used to search the WHOLE event list, so a break 10 or 100 bars in
            # the future qualified a zone on the bar right after its imbalance. MEASURED over 3,500
            # real broker H4 bars: 247 of 720 GBP/USD zones (34%) and 236 of 724 EUR/USD (33%) were
            # marked before their break had printed — median 10 bars early, worst 111 (18.5 days).
            #
            # It is not a cosmetic timestamp. `marked_at` starts the zone's clock (see step 3 below),
            # so a zone marked early is AGED across bars on which it was not yet a zone: taps,
            # mitigations and "respected" all accrue from price action that predates its existence —
            # and `respected` is exactly what the cascade selects on.
            #
            # It survived because REPLAY DETERMINISM could not see it: a short build and a long build
            # both mark on the same early bar, so N vs N+1 agreed. `test_zones` now checks the real
            # property instead — a zone is never marked before its qualifying break.
            if (_broke_structure(events, want, ifc_i, i)
                    and swept_before(pools, bars, side, ifc_i, LIQ_WINDOW)):
                z.state, z.marked_at = "unmitigated", bar.time
                zones.append(z)
                # NO catch-up replay from the IFC. The bars between the IFC and here ARE the impulse
                # that created the zone — it is moving AWAY from it. Replaying them made the zone
                # "mitigated" by its own creation candle (whose high still touches the zone) and then
                # "respected" by the next impulse bar closing a zone-height away. Measured: it put
                # EVERY zone straight into respected/broken and `mitigated` never occurred at all.
                # Mitigation is price COMING BACK (Ch.6 p27), so the clock starts once the zone is
                # marked. Same trap as an FVG's own creation candle counting as a tap.
            elif not z.tapped_by(bar):
                # KEEP WAITING — with no candle count, the bound is STRUCTURAL, not a clock: the zone
                # must break structure BEFORE price comes back to it. A zone price returns to without
                # ever having launched a break never launched anything, so it was never a zone. That
                # replaces the invented 6-bar window with the thing the window was standing in for.
                still.append((z, ifc_i))
            # else: price came back before any break — never a zone, dropped
        pending = still

        # 3. Advance every live zone with this bar.
        for z in zones:
            if z.live and z.marked_at is not None and bar.time > z.marked_at:
                _advance(z, bar)

    # 4. EXTREME vs DECISIONAL, once, over the finished book. Roles are a property of the CURRENT
    #    picture (which zones are still live and where they sit), not of formation, so they are read
    #    at the end rather than frozen per zone — a zone that was decisional becomes the extreme the
    #    moment the one above it breaks, and that is the market changing its mind, not a re-judgement
    #    of the zone itself. Its boundaries, marking and lifecycle are untouched by this.
    bar_index = {c.time: i for i, c in enumerate(bars)}
    classify_roles(zones, events, bar_index)
    count_breakthroughs(zones, events, bar_index)
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
                ifc_index=idx[mz.ifc_time], mitigated=mz.state != "unmitigated", kind=mz.kind,
                role=mz.role, broke_through=mz.broke_through)


def _advance(z: MarkedZone, c: Candle) -> None:
    """One bar of lifecycle. Break is checked FIRST — a bar that taps and closes through is a break.

    MITIGATION IS BY WICK **OR** BODY, AND THE TWO ARE NOT THE SAME EVENT (the user's rule):
      wick only  — price reached in, took the liquidity and left. The orders were never filled, so the
                   zone is still loaded and a return is EXPECTED. Signals, and says it was only wicked.
      body       — the zone actually traded. It is spent; a later retap still signals but with caution.

    A tap NEVER ends the zone. Only a body close beyond the distal does. That is what makes premarking
    worth anything: the zone sits on the book until price does something decisive to it.
    """
    if not z.live:
        return
    if z.broken_by(c):
        z.state, z.broken_at = "broken", c.time
        return
    if not z.tapped_by(c):
        z.in_zone = False                  # the visit (if any) has ended
        # Away from the zone — a body close a full zone-height clear counts as respected.
        if z.state in ("wick_mitigated", "body_mitigated") and z.reacted_by(c):
            z.state, z.respected_at = "respected", c.time
        return

    # --- price is IN the zone on this bar -------------------------------------------------------
    # Count the EDGE of a visit, not its duration. `z.in_zone` is the previous closed bar's answer,
    # so this fires once when price comes back and stays silent while it lingers.
    if z.state != "unmitigated" and not z.in_zone:
        z.retaps += 1                      # a return visit; the card reports it
    z.in_zone = True
    z.last_tap_at = c.time

    # ONCE RESPECTED, ALWAYS RESPECTED (until broken). A zone that reacted a full height away has
    # PROVEN it holds, and that fact does not un-happen when price comes back to it — coming back is
    # the retest, which is the whole point of the state.
    #
    # THE REGRESSION THIS PREVENTS: letting a body retap demote `respected` to `body_mitigated` moved
    # the zone out of the RETEST path (bx_sd_reports ②, which demands grade B/A) and into the fresh
    # cascade (C+). A zone with a track record would have been traded at a LOWER bar than a zone
    # without one, which is backwards. Before the wick/body split, `respected` simply had no outgoing
    # transition and the retest path kept it by default; the split broke that silently.
    if z.state == "respected":
        return

    if z.body_in(c):
        z.state = "body_mitigated"
        z.mitigated_at = z.mitigated_at or c.time
        # A body ALWAYS upgrades the record: a zone first wicked and later body-traded is spent, and
        # the card must say so. This is the one case where mitigation_kind changes after being set.
        z.mitigation_kind = "body"
    elif z.state == "unmitigated":
        z.state, z.mitigated_at = "wick_mitigated", c.time
        z.mitigation_kind = z.mitigation_kind or "wick"
