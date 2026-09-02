"""THE ONE LADDER. Every rung, for every strategy, defined exactly once.

WHY THIS FILE EXISTS. There were two ladders for the same trade and they disagreed:

    position_tracker (the code that MOVES his stop)   breakeven at 1R, then lock +1R/+2R/+3R
    vix1_manage      (the DM that ADVISES him)        nothing below 2R, then trail 1R behind

So the message telling him what to do and the code doing it could say different things about one
position. He asked for them merged. They are merged HERE — one table, read by both paths — rather
than by deleting one of them, because they are not duplicates: `trade_watcher` (0.5s, streamed FIX
price) and `position_tracker` (30s poll) already share one rulebook deliberately, one as the fast
path and one as the safety net. Collapsing THOSE would delete the safety net.

HIS LADDER, 2026-09-02 — and this SUPERSEDES the one settled on 2026-08-21:

    0.4R  ->  BREAKEVEN, net of costs
    2.0R  ->  lock +1R
    2.5R  ->  lock +2R
    price turning against us  ->  exit (the 1M structure exit in vix1_manage)

**The 2.5R rung was explicitly WITHDRAWN on 2026-08-21 and he has now reinstated it.** That is
recorded here and in `docs/strategies/vix1.md` so the next session does not "correct" it back to the
old 3R/4R shape.

WHY PER STRATEGY, AND WHY THE DEFAULT IS UNCHANGED. A `Position` read from the broker carries NO
strategy — cTrader does not know what opened it. A single global constant therefore cannot be
changed for VIX.1 without silently re-tuning every other strategy's trades, which is exactly the
leak the independence rule forbids. Attribution comes from `execution.fill_watch`, which already
matches a broker position back to the order intent that placed it. **Anything that cannot be
attributed keeps the OLD defaults — never VIX.1's numbers.** An unknown position is not a VIX.1
position.

MEASURED, NOT ASSUMED (800k EUR/USD + 800k GBP/USD M1 bars, 2026-09-02): 0.4R on a median 2.0-pip
stop is 0.8 pips, which is under one spread on EUR/USD. `breakeven.why_not` already refuses to set a
stop that sits through the market — that refusal will fire more often at 0.4R than it did at 1R, and
it is correct when it does.
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
    # MOVE THE STOP, SAY NOTHING. The trail steps every 0.1R, which on a 5R runner is ~29 messages
    # for 29 identical events. The stop still moves on every one of them — this only decides whether
    # his phone hears about it. Breakeven, +1R, every half-R and the exit all stay loud.
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


# HIS ladder, 2026-09-02 (the upper half revised the same day — see Trail above).
#
# THE 2.5R -> lock 2R RUNG IS GONE, deliberately: the trail protects +2R from 2.1R, which is both
# earlier and higher than that rung ever was. Leaving it in would fire a second alert at 2.5R telling
# him to move the stop DOWN from 2.4R to 2.0R.
_VIX1 = (
    Rung(0.4, None, "breakeven"),
    Rung(2.0, 1.0,  "lock_1r"),
)
_VIX1_TRAIL = Trail(from_r=2.1, gap_r=0.1, step_r=0.1)

# What every other strategy — and any position we cannot attribute — keeps. This is the ladder as it
# stood before 2026-09-02, unchanged on purpose: his new numbers are VIX.1's, and nothing else was
# asked to move.
_DEFAULT = (
    Rung(1.0, None, "breakeven"),
    Rung(2.0, 1.0,  "lock_1r"),
    Rung(3.0, 2.0,  "lock_2r"),
    Rung(4.0, 3.0,  "lock_3r"),
)

_BY_STRATEGY = {"vix1": _VIX1}
# ONLY VIX.1 TRAILS. Every other strategy — and any position that cannot be attributed — keeps the
# fixed ladder it already had, which is the same rule the fixed rungs follow and the same reason:
# his numbers are VIX.1's, and nothing else was asked to move.
_TRAIL_BY_STRATEGY = {"vix1": _VIX1_TRAIL}


def ladder_for(strategy: str | None) -> tuple[Rung, ...]:
    """The rungs for this strategy, ordered by `at_r`. Unknown or None -> the old defaults.

    Matched on PREFIX so a strategy id that grows a suffix (`vix1`, `vix1_x`) still resolves, which
    is how `signal_monitor` already tests strategy ids.
    """
    s = (strategy or "").lower()
    for key, rungs in _BY_STRATEGY.items():
        if s.startswith(key):
            return rungs
    return _DEFAULT


def trail_for(strategy: str | None) -> Trail | None:
    """The trailing rule for this strategy, or None if it only has fixed rungs."""
    s = (strategy or "").lower()
    for key, trail in _TRAIL_BY_STRATEGY.items():
        if s.startswith(key):
            return trail
    return None


# Which trailing steps are worth a message. A lock landing on a half-R is announced; the tenths in
# between move the stop silently. See `Rung.quiet`.
_LOUD_EVERY_R = 0.5


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
    loud = abs((lock / _LOUD_EVERY_R) - round(lock / _LOUD_EVERY_R)) < 1e-6
    # The tag carries the level, so each step is its own alert and its own ledger entry — and a step
    # already acted on is never acted on twice.
    return Rung(at_r=steps / per, lock_r=lock, tag=f"trail_{lock:.1f}r", quiet=not loud)


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
