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


# HIS ladder, 2026-09-02.
_VIX1 = (
    Rung(0.4, None, "breakeven"),
    Rung(2.0, 1.0,  "lock_1r"),
    Rung(2.5, 2.0,  "lock_2r"),
)

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


def reached(rungs: tuple[Rung, ...], r: float) -> list[Rung]:
    """Every rung this trade has reached, lowest first.

    ORDERED AND TRUNCATED: the first rung NOT reached ends the list, so a gap can never let a higher
    rung fire while a lower one has not. The caller de-duplicates by `tag`.
    """
    out: list[Rung] = []
    for rung in rungs:
        if r < rung.at_r - EPS:
            break
        out.append(rung)
    return out


def stop_price_for(rung: Rung, entry: float, risk: float, bullish: bool) -> float | None:
    """Where this rung puts the stop. None for breakeven — only the position knows its own costs."""
    if rung.lock_r is None:
        return None
    return entry + rung.lock_r * risk if bullish else entry - rung.lock_r * risk
