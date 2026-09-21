"""VIX.1 — IS THIS MARKET RANGING OR CHOPPY? The one module that answers it, and VIX.1 obeys.

HIS INSTRUCTION, 2026-09-21:

    "It should be able to detect ranging and choppy market and then inform VIX and its decision is
     final so that VIX can no longer take trades in choppy markets. Once a confirmed ranging or
     choppy market begins to develop, it should send a message to VIX system and then it stops
     taking trades immediately."

    "Dont patch, integrate."

HIS IDEA, 2026-09-13, which is still the heart of it:

    "We mark lines at the top and bottom and then ask whether the price is just moving within those
     lines or it is moving in a particular direction ... when it goes here it comes back it doesn't
     move like would a trend."

IT REFUSES NEW ENTRIES ONLY. It never touches an open position, its stop, its ladder or its exit.

─────────────────────────────────────────────────────────────────────────────────────────────────
THREE PARTS, AND THE THIRD IS WHAT MAKES IT WORK

  1. THE BOX AND THE CROSSINGS (his idea) — over the last 24 closed hours, the highest high and the
     lowest low, counting how often price CLOSED back through the middle. Six or more comes back.

  2. THE WANDER RATIO — how long a path price walked against how big the box is:
     `100 x log10( sum of true ranges / (highest high - lowest low) ) / log10(24)`.
     This is the standard Choppiness Index. It is NOT the efficiency ratio he rejected in 2026-09-04
     — efficiency is net move / total movement, and his objection was that *"a perfectly respectable
     range can have extremely low efficiency, while a messy transition can also have low
     efficiency"*. Putting the BOX in the denominator is exactly what separates those two.

  3. THE LATCH — the part that was missing, and the reason the earlier readers were useless.
     ⚠ MEASURED, and it is why no threshold alone can work: across his own circled range the wander
     reading runs 33.3 to 67.1 and everything else runs 25.4 to 68.4, medians 52.5 against 49.2.
     Asked fresh every hour, ANY cut both misses his range and fires elsewhere — his own band
     detector went quiet for five hours in the middle of the range he circled. A range is a STATE
     with a beginning and an end, so this holds it: it turns ON when both readings agree for two
     hours running, and stays on until price CLOSES OUTSIDE THE BOX it latched onto.

THE STATE IS REPLAYED, NEVER STORED. `market_state` walks the recent bars and derives the answer
every time, which is the same choice `vix1_trend` made for its memory: recomputing is the source of
truth, so a restart, a backfill or a missed scan cannot leave a stale latch switched on.

WHERE THE NUMBERS CAME FROM, and what is still provisional. `_CAME_BACK = 6` is his, unchanged from
2026-09-14. `WANDER_ON = 58` is read off HIS marked charts, NOT borrowed: the textbook cut is 61.8,
a Fibonacci number, and on his data it catches 1% of the hours he marked. 58 with his six crossings
is where his marked ranges actually sit. **Two hours running** rather than one cut the false starts
from 16 episodes to 14 without losing his range.

MEASURED AS BUILT, 1,387 hours of EUR/USD (01 Jul - 18 Sep 2026):
  * his circled 14-16 Sep range — ON from 15 Sep 20:00, and it RELEASES AT 16 Sep 18:00, the exact
    hour of the 67.5-pip drop that ended it. The drop reads 29.7-32.0 with 1 crossing, which is the
    cleanest separation in the whole measurement.
  * his 18 Sep card (the sell at 11:08) — ON.
  * 14 episodes, 141 hours ON (10%). GBP/USD 9 episodes, 5%. XAU/USD 10 episodes, 5%. The constants
    are not fitted to one pair.

⚠ WHAT IT CANNOT DO, said plainly: it needs a day of sideways price before it can know. His range
began about 14 Sep 15:00 and this latches at 15 Sep 20:00 — 29 hours later. The two trades VIX.1
would have taken inside it (14 Sep 19:00 and 15 Sep 08:00) are BOTH TOO EARLY FOR THIS GATE. They
are refused by the liquidity-void rule instead. No detector can call a range four hours into it.

⚠ AND WHAT IS NOT MEASURED: what this costs in money. That needs his approval, because it is a
backtest. Nothing here should be read as evidence that it is profitable.
"""
from dataclasses import dataclass

import math

from core.types import Candle

LOOK = 24            # hours read. His circled bands last days; 12 could not see them, 24 can.
_CAME_BACK = 6       # crossings of the middle that make it choppy — read off his marks, not his words
WANDER_ON = 58.0     # the wander ratio that counts as sideways. NOT the textbook 61.8 — see the top
_NEED = 2            # hours running that both readings must agree before the state latches ON
_REPLAY = 240        # how far back the latch is replayed. 10 days: longer than any episode measured
                     # (longest 22h) by an order of magnitude, so the answer cannot depend on it.


@dataclass(frozen=True)
class Reading:
    """His two lines over the last `counted` candles, and what price did between them."""
    judged: bool = False     # were there enough candles to hold an opinion at all?
    choppy: bool = False
    came_back: int = 0       # times price CLOSED on the other side of the middle line
    top: float = 0.0         # the line at the top — the highest high
    bottom: float = 0.0      # the line at the bottom — the lowest low
    counted: int = 0


def read(h1: list[Candle], look: int = LOOK) -> Reading:
    """Draw his two lines over the last `look` closed candles and count how often price came back."""
    if look < 2 or len(h1) < look:
        return Reading()                    # too little to say — never a refusal
    seg = h1[-look:]
    top = max(c.high for c in seg)
    bottom = min(c.low for c in seg)
    if top <= bottom:
        return Reading(judged=True, top=top, bottom=bottom, counted=look)
    middle = (top + bottom) / 2.0
    came_back, side = 0, None
    for c in seg:
        # On CLOSES, like every other VIX.1 test — a wick poking across the middle is not a visit.
        above = c.close >= middle
        if side is not None and above != side:
            came_back += 1
        side = above
    return Reading(judged=True, choppy=came_back >= _CAME_BACK, came_back=came_back,
                   top=top, bottom=bottom, counted=look)


def market_not_choppy(h1: list[Candle], look: int = LOOK) -> str | None:
    """The refusal reason, or None to allow. NOT CALLED BY ANYTHING — see the top of this file.

    A MISSING MEASUREMENT IS NOT A REFUSAL: too few candles returns None, because refusing when nobody
    could measure is a guess.
    """
    r = read(h1, look)
    if not r.judged or not r.choppy:
        return None
    return (f"the market is choppy — over the last {r.counted} hours price crossed back through the "
            f"middle of its range {r.came_back} times: it is moving between two lines "
            f"({r.bottom:.5f} and {r.top:.5f}), not going anywhere")


@dataclass(frozen=True)
class State:
    """Is the market ranging or choppy RIGHT NOW, held as a state rather than re-asked every bar."""
    ranging: bool = False
    since: int = 0            # the bar time it latched on
    top: float = 0.0          # the box it latched onto
    bottom: float = 0.0
    came_back: int = 0        # the reading that latched it
    wander: float = 0.0


def wander(h1: list[Candle], look: int = LOOK) -> float | None:
    """How long a path price walked against how big the box is — the standard Choppiness Index.

    `100 x log10( sum of true ranges / (highest high - lowest low) ) / log10(look)`. High means
    price covered a lot of ground without going anywhere. None when it cannot be measured, which
    never refuses.
    """
    if look < 2 or len(h1) < look + 1:
        return None
    seg = h1[-look:]
    top = max(c.high for c in seg)
    bottom = min(c.low for c in seg)
    if top <= bottom:
        return None
    path = 0.0
    for k in range(len(h1) - look, len(h1)):
        prev = h1[k - 1].close
        path += max(h1[k].high - h1[k].low, abs(h1[k].high - prev), abs(h1[k].low - prev))
    if path <= 0:
        return None
    return 100.0 * math.log10(path / (top - bottom)) / math.log10(look)


def market_state(h1: list[Candle], look: int = LOOK) -> State:
    """THE ANSWER VIX.1 OBEYS. Replayed from the bars every time — never stored, so a restart or a
    missed scan cannot leave a stale latch switched on.

    ON  when the box crossings and the wander ratio BOTH agree for `_NEED` hours running.
    OFF the moment a candle CLOSES outside the box it latched onto — that is the range breaking,
        and on his own chart it releases on the exact hour of the 67.5-pip drop.
    """
    if len(h1) < look + 2:
        return State()                       # cannot measure — never a refusal
    on, box, since, seen, streak = False, (0.0, 0.0), 0, (0, 0.0), 0
    start = max(look + 1, len(h1) - _REPLAY)
    for i in range(start, len(h1)):
        upto = h1[: i + 1]
        r = read(upto, look)
        w = wander(upto, look)
        if not r.judged or w is None:
            continue
        if on:
            if upto[-1].close > box[0] or upto[-1].close < box[1]:
                on, streak = False, 0        # closed outside the box — the range is over
            continue
        streak = streak + 1 if (r.came_back >= _CAME_BACK and w >= WANDER_ON) else 0
        if streak >= _NEED:
            on, box, since, seen = True, (r.top, r.bottom), upto[-1].time, (r.came_back, w)
    return State(on, since, box[0], box[1], seen[0], seen[1]) if on else State()


def not_tradeable(h1: list[Candle], look: int = LOOK) -> str | None:
    """The message to VIX.1: a reason to stand down, or None to carry on. ITS DECISION IS FINAL —
    `vix1_bias` asks this before anything else and returns immediately on a reason."""
    st = market_state(h1, look)
    if not st.ranging:
        return None
    from datetime import datetime, timezone
    when = datetime.fromtimestamp(st.since, timezone.utc).strftime("%d %b %H:%M UTC")
    return (f"the market has been going nowhere since {when} — price is boxed between "
            f"{st.bottom:.5f} and {st.top:.5f}, crossing back through the middle {st.came_back} "
            f"times in {look} hours (wander {st.wander:.0f}). No trades until it closes out of "
            f"that box")
