"""THE ONE LADDER. Every rung, for every strategy, defined exactly once.

WHY THIS FILE EXISTS. There were two ladders for the same trade and they disagreed:

    position_tracker (the code that MOVES his stop)   breakeven at 1R, then lock +1R/+2R/+3R
    vix1_manage      (the DM that ADVISES him)        nothing below 2R, then trail 1R behind

So the message telling him what to do and the code doing it could say different things about one
position. He asked for them merged. They are merged HERE — one table, read by both paths — rather
than by deleting one of them, because they are not duplicates: `trade_watcher` (0.5s, streamed FIX
price) and `position_tracker` (30s poll) already share one rulebook deliberately, one as the fast
path and one as the safety net. Collapsing THOSE would delete the safety net.

HIS LADDER, 2026-09-03 — and this supersedes the numbers of 02 Sep:

    0.2R   ->  BREAKEVEN, net of costs
    1.5R   ->  lock +1R
    2.1R+  ->  TRAIL, keeping the stop 0.1R behind in 0.1R steps, until it is hit

His words: *"move breakeven to 0.2R and lock 1R when we are at R1.5. Then when we get to R2.1, we
lock 2R and start locking after every 0.1R away until we get knocked out."*

The last sentence needed no code change — the trail already locked 2.0R at 2.1R, 2.4R at 2.5R and
2.9R at 3.0R. Only the two fixed rungs moved: **0.4R -> 0.2R** and **2.0R -> 1.5R**.

THERE IS ONE LADDER AND NO FALLBACK. It used to be chosen per strategy from a map held in memory, so
a restart handed every open position the OLD numbers instead — see the note above `_LADDER` for the
full R that cost. His ruling: *"There is no fallback, the change was that we use this new ladder and
delete the other one."*

BREAKEVEN AT 0.2R IS INSIDE THE SPREAD ON A TIGHT STOP, and that is worth knowing before it surprises
anyone. Measured on 800k EUR/USD + 800k GBP/USD M1 bars (02 Sep): the median VIX.1 stop is 2.0 pips,
so 0.2R of it is **0.4 pips** — less than half a typical EUR/USD spread. `breakeven.why_not` already
refuses to set a stop that sits through the market, and it will now refuse far more often than it did
at 0.4R, let alone 1R. **That refusal is correct when it fires**: a stop placed the wrong side of the
market closes the position instantly, which `execution/breakeven.py` records happening for real on a
demo position on 2026-08-21. The rung is reached; whether the stop can legally go there is the
broker's answer, not ours.
"""
from dataclasses import dataclass

# A TRADE SITTING EXACTLY ON A MILESTONE MUST TRIGGER IT. R is a ratio of differences between
# 5-decimal prices, so a true 1.000R lands at 0.999999999999778 and `r >= 1.0` is False — the rung
# would never fire on the boundary, silently. Same guard, same reason, as vix1_momentum's A-grade.
EPS = 1e-9


@dataclass(frozen=True)
class Rung:
    """One step of the ladder. `lock_r=None` means BREAKEVEN — the net-zero price, not the entry.

    Breakeven is the only rung whose price is COMPUTED rather than given: it comes from
    `Position.breakeven()`, which reads the real commission off the position and doubles it (the
    field is the opening half; closing costs the same). His definition, twice over: *"when the market
    takes us out we lose nothing and gain nothing"*.
    """
    at_r:   float          # R reached
    lock_r: float | None   # R to protect; None = breakeven, net of costs
    tag:    str            # dedup key — one alert per rung per position
    # MOVE THE STOP, SAY NOTHING.
    #
    # HIS RULE, 2026-09-02: *"Locking Rs should only be announced when we move to breakeven and when
    # we are out of the market... We dont need to get all the messages like 1R locked in the DM."*
    # So EVERY locking rung is quiet — the fixed +1R and every trailing tenth. Breakeven speaks, the
    # exit speaks, and nothing in between does.
    #
    # QUIET IS ABOUT ROUTINE SUCCESS, NEVER ABOUT FAILURE. `position_tracker._auto_move` still
    # speaks — loudly — whenever a stop does NOT reach the broker, however quiet the rung. A silent
    # lock that failed is the exact thing his other instruction ("make sure whatever is locked is
    # never taken by the market") is protecting against.
    quiet:  bool = False


@dataclass(frozen=True)
class Trail:
    """A stop that follows the price up in steps, rather than stopping at a fixed rung.

    HIS MATH, 2026-09-02, in his own words: *"when price moves to 2.1R lock 2R and when it moves to
    2.5R lock 2.4R and when it moves to 2.6R lock 2.5R and go with that math until we are stopped
    out"*. Every one of those is the same rule — **keep the stop one tenth of an R behind** — so it
    is written once as a rule, not as a table that would have to guess where he wanted the rungs to
    stop.
    """
    from_r: float      # start trailing once this R is reached
    gap_r:  float      # how far behind the peak to keep the stop
    step_r: float      # only move in whole steps of this size


# HIS LADDER. THE ONLY ONE — there is no second ladder and no fallback.
#
# His ruling, 2026-09-02: *"There is no fallback, the change was that we use this new ladder and
# delete the other one."*
#
# WHY THE SECOND LADDER IS GONE, AND WHAT IT COST. Until now an OLD set of rungs (breakeven at 1.0R)
# was kept for "any position we cannot attribute", on my reasoning that it "fails in the safe
# direction: a later breakeven, never another strategy's numbers". That reasoning was wrong, and it
# was expensive.
#
# Attribution lived in a dict in memory, so a restart made every open position unattributed. His
# EUR/USD trade of 01 Sep then peaked at +0.50R — ABOVE this ladder's 0.4R breakeven, BELOW the old
# one's 1.0R — and fell straight through the gap between them. Replayed over the real minute bars:
#
#     this ladder     breakeven fires at 0.4R   ->  exits  +0.00R
#     the old one     nothing fires below 1.0R  ->  exits  -1.00R
#     what happened                                 exited -1.05R
#
# A whole R, lost to the existence of a second table of numbers. Deleting it removes the failure
# mode outright rather than making the attribution that selected between them more reliable — which
# is what I had done instead, and it would have left the same trap for the next thing that lost the
# link.
#
# THE 2.5R -> lock 2R RUNG IS GONE, deliberately: the trail protects +2R from 2.1R, which is both
# earlier and higher than that rung ever was. Leaving it in would fire a second alert at 2.5R telling
# him to move the stop DOWN from 2.4R to 2.0R.
# HIS NUMBERS, 2026-09-03: *"move breakeven to 0.2R and lock 1R when we are at R1.5. Then when we get
# to R2.1, we lock 2R and start locking after every 0.1R away until we get knocked out."*
#
# The last sentence needed no change — the trail below already locks 2.0R at 2.1R, 2.4R at 2.5R and
# 2.9R at 3.0R. Only the two fixed rungs moved: breakeven 0.4R -> 0.2R, and the +1R lock 2.0R -> 1.5R.
_LADDER = (
    Rung(0.2, None, "breakeven"),
    Rung(1.5, 1.0,  "lock_1r", quiet=True),      # moves the stop; says nothing — his rule above
)
_TRAIL = Trail(from_r=2.1, gap_r=0.1, step_r=0.1)


def ladder() -> tuple[Rung, ...]:
    """The rungs, for every position. One ladder, no strategy argument, nothing to select.

    This took a `strategy` and could return a different table. See the note above `_LADDER` for what
    that cost: a position whose strategy was forgotten got numbers he never asked for, and the trade
    that fell in the gap lost a full R instead of scratching.
    """
    return _LADDER


def trail() -> Trail:
    """The trailing rule, for every position."""
    return _TRAIL


def trailing_rung(trail: Trail | None, r: float) -> Rung | None:
    """The one trailing step this trade has earned, or None.

    ONLY THE HIGHEST STEP, never the ones below it. If price runs from 2.1R to 3.0R between two
    checks the stop belongs at 2.9R; sending the nine steps in between would be nine messages and
    nine broker amends to arrive at the same place.

    COUNTED IN WHOLE TENTHS, NOT IN FLOATING POINT. R is a ratio of differences between 5-decimal
    prices, so a true 2.5 arrives as 2.4999999999997 — and `int(r * 10)` reads that as 24 and locks
    2.3R, one step low, silently, on exactly the boundary he named. The same trap `EPS` exists for.
    """
    if trail is None or r < trail.from_r - EPS:
        return None
    per   = int(round(1.0 / trail.step_r))          # steps in 1R: 10 when the step is 0.1
    steps = int(round(r * per + EPS))               # whole steps price has actually reached
    gap   = int(round(trail.gap_r * per))           # how many steps to stay behind
    lock  = (steps - gap) / per
    if lock <= 0:
        return None
    # EVERY trailing step is quiet. This used to announce each half-R; he asked for none of them.
    # The tag carries the level, so each step is still its own ledger entry — and a step already
    # acted on is never acted on twice.
    return Rung(at_r=steps / per, lock_r=lock, tag=f"trail_{lock:.1f}r", quiet=True)


def reached(rungs: tuple[Rung, ...], r: float, trail: Trail | None = None) -> list[Rung]:
    """Every rung this trade has reached, lowest first, with the trailing step last.

    ORDERED AND TRUNCATED: the first rung NOT reached ends the list, so a gap can never let a higher
    rung fire while a lower one has not. The caller de-duplicates by `tag`.
    """
    out: list[Rung] = []
    for rung in rungs:
        if r < rung.at_r - EPS:
            break
        out.append(rung)
    step = trailing_rung(trail, r)
    # THE TRAIL MUST NEVER PULL THE STOP BACKWARDS. If a fixed rung already protects as much or more,
    # the trailing step has nothing to add and is dropped rather than issued as a lower target.
    if step is not None and not any(x.lock_r is not None and x.lock_r >= step.lock_r for x in out):
        out.append(step)
    return out


def stop_price_for(rung: Rung, entry: float, risk: float, bullish: bool) -> float | None:
    """Where this rung puts the stop. None for breakeven — only the position knows its own costs."""
    if rung.lock_r is None:
        return None
    return entry + rung.lock_r * risk if bullish else entry - rung.lock_r * risk
