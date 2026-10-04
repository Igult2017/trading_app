"""
VIX.1 — HOW FAR BACK HAS PRICE COME, AND FOR HOW LONG? The retracement, counted in real time.

HIS RULE, 2026-08-11: *"A pullback can be from 1 candle or more so it should count candles... After a
rally we start counting retracement candles and if a momentum candle comes after them we trade."*

WHY THIS EXISTS. The 1HR had no notion of a retracement's LENGTH at all. It asked one question — are
the last two swing highs and the last two swing lows (8 bars either side) both moving against the
trend — and that instrument is wrong for the job in three ways, all measured over 12 months of real
H1 on both pairs:

  * it is 8 HOURS LATE by construction. A turn needs 8 bars after it before it can be confirmed.
  * it is BLIND TO SHORT RETRACEMENTS. 99% of retracements run under 8 candles (48% are a single
    candle, 26% are two), so it never sees the ones he actually means.
  * it fires on the WRONG SIZE of move. It refuses at a median 58 pips / 43 bars and allows at
    19 pips / 14 bars — it is catching two-day counter-legs, not pullbacks. Counter candles
    immediately before the momentum candle: 0 when it allows, 1 when it refuses. No signal at all.

This module answers the question directly and with no delay: from the trend's best CLOSED price,
count the bars and measure the distance.

LENGTH NEVER DISQUALIFIES ANYTHING — his instruction, and he is right. A 12-candle retracement inside
an intact trend is healthy; a 5-candle one that breaks structure is not, and counting cannot tell
them apart. So this module DECIDES NOTHING. It reports. The reversal reader (vix1_trend) and the
range reader (vix1_regime) are what disqualify, and they work with these numbers rather than being
replaced by them.

AS OF PHASE A THIS GATES NOTHING AT ALL — the numbers go on the card and in the log so their real
values can be seen on real signals before any threshold is chosen. Choosing one from a year of two
pairs is how two earlier "improvements" looked right on the day and were worse over four years.

CLOSED CANDLES ONLY. The extreme is a LEVEL, and a level read from the still-forming bar drifts every
tick (the platform-wide rule). Callers pass the same `closed_only` list the rest of the 1HR side
uses; there is no live-price argument here and there must never be one.

TWO NUMBERS, BECAUSE THERE ARE TWO QUESTIONS — and conflating them is the mistake this module was
built to fix, so it must not repeat it one level down.

  bars       THE RETRACEMENT HE MEANS. The run of candles right now that are not carrying the trend
             on. "After a rally we start counting retracement candles." Typically 1-3 (48% of all
             retracements are a single candle, 26% are two). It resets when a candle goes the
             trend's way, which is exactly how the 1M side has always read one.
  stall_bars HOW LONG SINCE THE TREND LAST MADE PROGRESS — candles since its own extreme. A
             different fact entirely, and NOT a retracement: a trend that has not made a new high in
             156 candles has stalled, and whether that is a range or a reversal is answered by
             vix1_regime and vix1_trend, not here.

MEASURED, AND THIS IS WHY BOTH ARE CARRIED (2026-08-11). The first version of this module reported
only the second and called it "the retracement". Over 12 months the median came out at 156 candles —
which is a true statement about the trend and a useless answer to "how many candles is this
pullback". The distance from the extreme is still worth showing; it just is not what he asked to be
counted.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.candle_math import atr, is_bearish, is_bullish

_ATR_N = 14


@dataclass(frozen=True)
class Retracement:
    """The pullback the latest candle came after, and — separately — how long the trend has gone
    without making progress."""
    active: bool = False        # did the latest candle follow a retracement at all?
    bars: int = 0               # HIS COUNT: how many candles that retracement ran for
    stall_bars: int = 0         # candles since the trend last made a new extreme (a different fact)
    pips: float = 0.0           # how far back from that extreme, in price
    atr: float = 0.0            # ...and the same distance as a multiple of ATR(14)
    extreme: float | None = None
    extreme_index: int | None = None
    # WAS ANYTHING ACTUALLY MEASURED? Everything above defaults to "nothing", and those defaults used
    # to be reported as a FINDING: "no retracement before this candle; 0.0 pips (0.00x ATR) below the
    # trend extreme, which is 0 candles old". That reads as "I looked and there was no pullback" when
    # it means "I never looked" — `measure` returns early, before touching a single candle, whenever
    # there is no confirmed trend direction.
    #
    # WHAT THAT COST, 2026-09-29. He asked why VIX.1 took nothing from gold's fall on 28 Sep and
    # pointed at a small green pullback candle. Production's record carried that same sentence,
    # IDENTICAL, for 22 hours while XAU/USD fell ~$200, bounced and fell again — because the trend sat
    # at "reversal proposed, not confirmed" the whole time, so the retracement was never measured. It
    # read as a verdict on his pullback. It was a placeholder, and it sent the investigation the wrong
    # way for two rounds before the early return was found.
    #
    # ⚠ AND IT MUST NOT CLAIM THERE IS NO TREND. The first version of this note said "no confirmed
    # trend", and he corrected it: *"trend is and was confirmed only pullback was not"*. He is right.
    # When a turn is pending the direction IS held — `TrendState.pending` was -1 (down) and the level
    # it broke, 4254.45, was recorded — what `measure` lacks is the LEG to measure a pullback from,
    # because `vix1_trend` clears `direction_since` at the change of character. So the note names the
    # missing measurement, never a missing market.
    measured: bool = False
    note: str = "no leg to measure from"    # why not, when `measured` is False

    def describe(self, pip: float) -> str:
        """One line for the card and the log. Decimals ON PURPOSE — `vix1_log.shape` collapses
        decimals but keeps integers, so only the BAR COUNTS changing mark the line as new. That is
        the intent: one line an hour per instrument, not one per 60-second scan."""
        # NOT MEASURED SAYS SO, AND PRINTS NO NUMBERS. The zeros are not readings — quoting them
        # alongside "no retracement" is what made this line look like a verdict. The whole clause is
        # replaced rather than just the wording, so no figure here can ever be cited as evidence
        # about a market the code did not look at.
        if not self.measured:
            return f"pullback not measured ({self.note})"
        n = self.bars
        head = (f"came after a retracement of {n} candle{'s' if n != 1 else ''}" if self.active
                else "no retracement before this candle")
        return (f"{head}; {self.pips / pip:.1f} pips ({self.atr:.2f}x ATR) below the trend extreme, "
                f"which is {self.stall_bars} candles old")


def pullback_since(candles: list[Candle], direction: int,
                   since: int | None = None) -> int | None:
    """When did the pullback that is running RIGHT NOW begin? Its bar time, or None if none is.

    HIS COMPLETE RULE (2026-08-19). A pullback ends in exactly three ways, and the first IS the trade:

        1. a MOMENTUM candle the trend's way  — "momentum candle is a proof of the continuation of
                                                 the trend", so it ends the pullback and is taken
        2. the trend RESUMES past the extreme the pullback began from
        3. a CHoCH — the body closes through the protected level, and `vix1_trend` already sets the
           trend to NONE there, so nothing downstream trades that direction anyway

    Measured over 1500 bars, every pullback ended by (1)-(3) and nothing else: XAU/USD 102 episodes,
    EUR/USD 63, GBP/USD 69, with 19-33% ending in a CHoCH and the rest in the trend resuming. His
    model tiles the space completely — there is no fourth case and so no separate "complex pullback"
    detector is needed. (An earlier run reported 0% ending in a CHoCH; that was a bug in the
    measurement, which discarded exactly those episodes because a CHoCH sets `direction` to 0.)

    WHY IT IS NOT A COUNT OF THE TRAILING COUNTER CANDLES. That was tried first and deleted: a single
    trend-way candle INSIDE a retracement resets such a count to zero — on the 19 Aug gold bounce it
    read 0 while price was still $22 above the low. This anchors to the trend's extreme instead: once
    price has turned away from it, the pullback is running until price closes beyond it again,
    whatever colour the candles in between happen to be.

    STATELESS ON PURPOSE. Derived from the window every scan rather than held on the strategy, so a
    restart cannot lose a running pullback and a replay behaves exactly like production.
    """
    if direction == 0 or not candles:
        return None
    start = 0 if since is None else max(0, min(since, len(candles) - 1))
    seg = candles[start:]
    if len(seg) < 2:
        return None

    up = direction == 1
    # MEASURED ON CLOSES, NOT WICKS, and that is the whole difference on the case this was built for.
    # The 19 Aug gold bar wicked to a NEW LOW at 4324.54 and then closed at 4356.46, $32 higher — a
    # violent rejection. Read by the wick the downtrend "resumed" and the pullback ended; read by the
    # close it plainly did not. His framework is body-based everywhere it matters — a CHoCH needs
    # "the body of a candle", and a momentum candle is a body test — so a wick poking through an
    # extreme is not the trend carrying on.
    best = max(c.close for c in seg) if up else min(c.close for c in seg)
    e = max(i for i, c in enumerate(seg) if c.close == best)
    after = seg[e + 1:]
    if not after:
        return None                      # the newest bar set the extreme — the trend is running

    # A pullback only exists once price has actually turned, not merely failed to extend. The first
    # candle after the extreme that goes against the trend is where it began.
    trend_way = is_bullish if up else is_bearish
    first = next((i for i, c in enumerate(after) if not trend_way(c)), None)
    return None if first is None else after[first].time


def measure(candles: list[Candle], direction: int, since: int | None = None,
            pending: int = 0) -> Retracement:
    """Measure the live retracement. `candles` must be CLOSED bars; `direction` +1 up / -1 down.

    `since` is the bar the trend's current direction was established on (`TrendState.direction_since`)
    — the extreme is the best price the trend has managed FROM THERE, not from the start of whatever
    window happened to be passed in. Falls back to the whole list when it is unknown, which is only
    the case before a direction exists.

    `bars` counts back from the LAST candle while each one fails to carry the trend on, and stops at
    the first that does — a doji counts as part of the retracement, the same reading `vix1_pullback`
    uses on the 1M. `stall_bars` counts from the trend's own extreme instead, and answers a
    different question; see the module docstring for why both are here.
    """
    # NOTHING TO MEASURE FROM — and it is reported as that, not as "no retracement" (see `describe`).
    #
    # `pending` CHANGES ONLY THE WORDING, never the measurement. A turn that is proposed but not yet
    # confirmed still has a direction and a level; what it does not have is a leg, because
    # `vix1_trend` clears `direction_since` there. Saying "no trend" in that state is simply false,
    # and on XAU/USD it was said for 22 unbroken hours on 28 Sep 2026 while the market trended hard.
    if not candles:
        return Retracement(note="no candles")
    if direction == 0:
        return Retracement(note="turn pending — no leg to measure from" if pending
                           else "no trend direction")
    start = 0 if since is None else max(0, min(since, len(candles) - 1))
    seg = candles[start:]
    # `seg` cannot be empty here: `candles` is non-empty and `start` is clamped to its last index, so
    # the slice always keeps at least that candle. The guard that used to sit here could never run.

    up = direction == 1
    # The extreme is the FIRST bar to reach the best price, not the last. A flat top printed over
    # three bars stopped making progress at the first of them; taking the last would under-count.
    best = max(c.high for c in seg) if up else min(c.low for c in seg)
    off = next(i for i, c in enumerate(seg) if (c.high if up else c.low) == best)

    # HIS COUNT — the retracement the LAST CANDLE CAME AFTER. Walk back while price is not carrying
    # the trend on, having first stepped over the last candle if it IS carrying it on.
    #
    # THAT STEP IS THE WHOLE POINT AND IT WAS MISSING (found by measuring, 2026-08-11). Callers pass
    # a window ending at the momentum candle, and a momentum candle by definition goes the trend's
    # way — so a walk-back straight from the end hit it immediately and reported 0 at every single
    # setup, on both pairs, 100% of the time. His rule is "a momentum candle comes AFTER a
    # retracement", so the candle itself is stepped over and the run behind it is what is counted.
    #
    # Only ONE candle is stepped over. Two or more trend-way candles before the end means this
    # candle followed a rally, not a retracement, and 0 is the correct and honest answer.
    trend_way = (lambda c: is_bullish(c)) if up else (lambda c: is_bearish(c))
    i = len(candles) - 1
    if trend_way(candles[i]):
        i -= 1
    bars = 0
    while i >= 0 and not trend_way(candles[i]):
        bars += 1
        i -= 1

    # NON-NEGATIVE BY CONSTRUCTION, so there is no clamp here. `seg` always contains the last
    # candle, so on an uptrend best >= that candle's high >= its close, and the mirror holds on a
    # downtrend. A `max(0.0, ...)` guard sat here until it was broken on purpose and every test
    # still passed — the sign of a branch that can never run.
    last = candles[-1].close
    depth = (best - last) if up else (last - best)
    a = atr(candles, _ATR_N)
    return Retracement(active=bars > 0, bars=bars, stall_bars=len(seg) - 1 - off, pips=depth,
                       atr=(depth / a if a > 0 else 0.0),
                       extreme=best, extreme_index=start + off, measured=True)


# ── WHEN MAY A MOMENTUM CANDLE TRADE? ONE RULE, THREE BRANCHES — all his ────────────────────────────
#
# 2026-09-16:  "after the pullback, we take trade from the 3rd candle and above if it is the momentum
#               candle... unless the pullback was made of 1-3 candles."
# 2026-09-29:  "in a breakout, after the price has come out of the band, we count the first 2 candles
#               and fire signal when the 3rd candle closes if it is a momentum candle and we haven't
#               had a pullback yet."
# 2026-09-29:  "in a CHOCH, we wait for a pullback to take a trade but the band issue has proven to us
#               that sometimes price can move for a very long time without a pullback. so that 3
#               candle rule also applies in a CHOCH scenario if we have not had a pullback."
#
# 2026-10-04:  BUILT AND THEN REVERTED THE SAME DAY — THE WAIT IS STILL 3. He asked for 3 -> 2 on this
#   branch, I built it, and then the measurement showed the case he asked it for was never an instance
#   of this branch at all. He read that and said revert. **Do not re-apply it without new evidence.**
#
#   WHAT HE ASKED FOR: *"After a pullback that took more than 3 candles, we count the first candle, then
#   if the second candle is a momentum candle, we enter when it closes."*
#
#   WHY IT CAME BACK OUT — the premise was MINE and it was wrong. He said the pullback before the
#   30 Sep GBP/USD move "took more than 3 candles"; I built on that instead of measuring it. Measured
#   afterwards against production's own record and the real broker bars:
#     * the cluster he circled was never a pullback to this strategy — it was the RANGE BAND
#       (`vix1_chop`: *"price is still inside the 1.32228-1.32302 box"*), his own rule, working;
#     * after the box broke there was a ONE-candle pullback, so this branch never ran;
#     * the "3rd candle" wording in the 07:00 refusal came from the NO-PULLBACK branch
#       (`_BREAK_CANDLES`), not this one. I matched on the words and not on the branch that printed them.
#
#   AND IT WOULD HAVE REVERSED HIS 16 SEP RULING, which he made from watching real trades, and which
#   `vix1-measured.md` §7 mildly supports (group B: 35 entries, 4W/9L, -2.0R). If it is ever revisited,
#   split group B into 1st-candle vs 2nd-candle first — that is a backtest and needs his say-so.
#   He set it to 3 himself, deliberately: *"most of first momentum candles after pullback are never
#   successful when the pullback itself was a long word that took more than 3 candles down."* He was
#   told that before approving, and told what the measurement says:
#   `docs/strategies/vix1-measured.md` §7 scored group B — a longer pullback's **1st OR 2nd** candle —
#   at 35 entries, 4W/9L, -2.0R across both pairs. **That measurement does NOT score this rule**: it
#   lumps the 1st and 2nd candle together and he is admitting only the 2nd. Nothing we have separates
#   them, and splitting it is a backtest that needs his say-so.
#
#   WHAT PROMPTED IT — GBP/USD 30 Sep, from production's own record, not a reconstruction:
#   at 07:00 UTC the refusal was *"the move broke out 2 candles ago ... the trade comes from the 3rd
#   candle after the break"*. That is this exact count.
#
# THE THREE BRANCHES ARE ONE QUESTION, which is why they are one function. "How long since the move
# committed, and has it pulled back yet" — a pullback of 1-3 candles trades its first momentum candle,
# a longer one waits TWO, and NO pullback at all waits three from the break. Split across two
# functions they would drift, and the middle branch would be asked in one place and not the other.
#
# THE MOMENTUM REQUIREMENT IS NOT HERE, AND DELIBERATELY SO. "if the second candle is a momentum
# candle" is already guaranteed by every caller: the main path asks this on the window truncated AT the
# momentum candle (`vix1_bias.py:500`), and the change-of-character route demands `momentum_run` on the
# very next check (`vix1_choch.py:170`). Re-testing it here would be a second enforcement point that
# can drift from those two — the thing this one-function design exists to prevent.
_SHORT_PULLBACK = 3     # a pullback of this many candles or fewer is SHORT: its first momentum candle trades
_WAIT_CANDLES   = 3     # after a longer one, the trade may only come from this candle onward
_BREAK_CANDLES  = 3     # with NO pullback at all, the trade comes from this candle after the break


def _ordinal(n: int) -> str:
    """1 -> '1st', 2 -> '2nd', 3 -> '3rd'. Built because the refusal text used to glue "rd" on by hand,
    which printed "2rd" the moment his number moved off 3 — and that text is what HE reads when a trade
    is refused, so a number that reads wrong is a rule that looks wrong."""
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    return f"{n}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th') }"


def since_pullback(candles: list[Candle], direction: int) -> tuple[int, int]:
    """(candles since the last pullback ended, how long that pullback ran).

    1 = the candle right after the pullback, so a momentum candle that ENDS a pullback reads 1. Counted
    exactly the way `measure` counts — trend-way or not, a doji counting as part of the pullback — so
    there is still one pullback logic and not two answers that can disagree. (0, 0) = no pullback in the
    window at all.
    """
    if direction == 0 or not candles:
        return 0, 0
    trend_way = is_bullish if direction == 1 else is_bearish
    i = len(candles) - 1
    after = 0
    while i >= 0 and trend_way(candles[i]):
        after += 1
        i -= 1
    bars = 0
    while i >= 0 and not trend_way(candles[i]):
        bars += 1
        i -= 1
    return after, bars


def entry_timing(candles: list[Candle], direction: int,
                 break_time: int | None = None) -> str | None:
    """May the NEWEST candle trade? The refusal in his words, or None to go ahead.

    `direction` is the way the move is going — the CONFIRMED trend where there is one, otherwise the
    direction the break committed to. It is passed in rather than read off a trend state, so this
    answers during a change of character too, which is the whole point of the 2026-09-29 rules.

    `break_time` is the BAR TIME of the candle the move broke out on — the change of character, or
    the break of structure that left the band. **THAT CANDLE IS CANDLE 1**, his ruling 2026-09-29.
    Without it the first branch cannot apply and only the pullback branches run, which is exactly
    today's behaviour for a trend that is merely continuing.

    ⚠ A TIME AND NOT AN INDEX, deliberately. VIX.1 carries several windows of the same bars — the
    trend window, the same window truncated at the momentum candle, the full history — and a trend
    state's indexes belong to whichever one built it. Translating between them is arithmetic that
    fails silently when a window changes length, and it has cost this platform before. A bar time is
    the same number in every window, so there is nothing to translate and nothing to get wrong.

    THE THREE BRANCHES:

      no pullback since the break   ->  the trade comes from the 3rd candle, counting the break
                                        candle as the 1st
      a pullback of 1-3 candles     ->  its FIRST momentum candle trades (unchanged, 2026-09-16)
      a longer pullback             ->  the trade comes from the 3rd candle after it (unchanged)

    WHY THE FIRST BRANCH HAD TO EXIST, in his words: *"the band issue has proven to us that sometimes
    price can move for a very long time without a pullback"*. Waiting for a pullback that never comes
    is how a move runs its whole length untraded — measured on XAU/USD 28 Sep 2026, six momentum
    candles qualified across 22 hours and none could be taken.
    """
    bi = None
    if break_time is not None:
        bi = next((k for k, c in enumerate(candles) if c.time == break_time), None)
    # A break that is not in this window cannot be counted from, and guessing where it fell would be
    # worse than not applying the branch — so it degrades to the pullback branches alone.
    seg = candles if bi is None else candles[bi:]
    after, bars = since_pullback(seg, direction)

    if bars == 0:
        # NOTHING HAS PULLED BACK YET. Before the break is known this is simply "no reason to wait",
        # which is what shipped before and is right for a trend already under way.
        if bi is None:
            return None
        n = len(candles) - bi                   # the break candle itself is candle 1
        if n >= _BREAK_CANDLES:
            return None
        return (f"the move broke out {n} candle{'s' if n != 1 else ''} ago and has not pulled back yet "
                f"— with no pullback the trade comes from the {_ordinal(_BREAK_CANDLES)} candle "
                f"after the break")

    if bars <= _SHORT_PULLBACK or after >= _WAIT_CANDLES:
        return None
    return (f"the pullback ran {bars} candles and this is only candle {after} after it — after a pullback "
            f"longer than {_SHORT_PULLBACK} candles the trade comes from the {_ordinal(_WAIT_CANDLES)} "
            f"candle on")


def swings(candles: list[Candle], direction: int, since: int | None) -> tuple[list[float], list[float]]:
    """The trend's highs and lows, marked where a PULLBACK says a leg ended.

    ADDED 2026-09-13 ON HIS RULING, and the reason is the point of it:

        *"Use the fine grained pullback. Implement it because it is how we identify setups. What is
         the point of having it if decisions are made elsewhere and it is used as decoration."*

    WHAT WAS WRONG. The trend's shape test — his own rule, *"Uptrend -> HH + HL. Downtrend -> LL +
    LH"* — read its highs and lows from the SWING detector (`vix1_swings`), which marks a turn only
    when price closes back through the candle that made the extreme. Measured on 3,000 real bars per
    instrument, **82-86% of ONE-CANDLE pullbacks never became a swing at all**: a single candle had
    to reach back a median 1.05-1.19x ATR before it registered. So the shape test could not see the
    pullbacks this module is written about — and 48% of his retracements are a single candle.

    HIS GOLD CANDLE IS THE CASE. XAU/USD 10 Sep 2026 18:00 UTC, a $19.87 sell after a $123 fall. The
    swing detector's last two highs (4412.89 -> 4434.14) and last two lows (4341.13 -> 4386.09) were
    BOTH RISING and both from the previous day, because the fall never paused long enough to print a
    turn — so the shape test called a collapsing market an uptrend and refused the sell. Read this
    way the last two highs are 4435.09 -> 4376.64 and the last two lows 4405.62 -> 4323.84, both
    FALLING, both from hours earlier, and the downtrend is in shape.

    THE RULE, and it has no tuned number in it: walking forward from where the trend began, track the
    running extreme the trend's way; **the moment ONE candle closes against the trend that extreme is
    a turning point** and the counter-leg starts. Same sensitivity `pullback_since` already has —
    *"A pullback can be from 1 candle or more so it should count candles"*.

    ⚠⚠ NOTHING CALLS THIS. IT IS BUILT, PROVEN, AND NOT WIRED IN — and the two paragraphs that used
    to sit here said the opposite ("He chose it anyway", "ONLY THE SHAPE QUESTION USES THIS"). They
    described a state that was tried on 2026-09-13 and REVERTED the same day, and they stood here
    misdescribing the code for sixteen days. He asked on 2026-09-29 whether it works and why it was
    off; the honest answer is below.

    DOES IT WORK? YES — measured on real broker H1, 3,000 bars: it marks 991 turning points on
    EUR/USD and 978 on XAU/USD where `vix1_swings` marks 442 and 465. About 2.2x as many, which is
    the point of it: it sees the one-candle pullbacks the detector misses 93% of the time
    (`tools/pullback_vs_swings.py`).

    WHY IT IS OFF, AND IT IS NOT BECAUSE IT IS WRONG. It was wired into the SHAPE test — "do the last
    two highs AND the last two lows both step the trend's way". Fine swings zigzag, so that question
    gets HARDER on them, not easier: refusals went 34/39/9 to 52/63/13 across the three instruments,
    **19 setups freed and 65 newly refused**, and four test files went red including his own
    2026-08-25 bearish proof. The fault was the QUESTION, not the swings: his pullback rule never
    compares two swings, it asks "did a pullback run, and has this candle ended it".

    WHAT ANSWERS THAT QUESTION NOW is `since_pullback` and `entry_timing` above, which count candles
    and are wired into both routes. So this function is kept for the shape question if he ever rules
    on it, and for nothing else. If that ruling does not come, it should be deleted rather than left
    sitting here looking live.
    """
    highs: list[float] = []
    lows: list[float] = []
    if direction == 0 or since is None or not candles:
        return highs, lows
    start = max(0, min(since, len(candles) - 1))
    ext_i, leg = start, direction          # leg: +1 running up (tracking a high), -1 running down
    for k in range(start + 1, len(candles)):
        c = candles[k]
        if leg == -1:
            if c.low < candles[ext_i].low:
                ext_i = k
            elif is_bullish(c):            # ONE candle against the run ends the leg
                lows.append(candles[ext_i].low)
                leg, ext_i = 1, k
        else:
            if c.high > candles[ext_i].high:
                ext_i = k
            elif is_bearish(c):
                highs.append(candles[ext_i].high)
                leg, ext_i = -1, k
    return highs, lows
