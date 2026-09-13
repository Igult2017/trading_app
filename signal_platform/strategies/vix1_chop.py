"""VIX.1 — IS THIS MARKET CHOPPY? Can you name the group, or can't you tell what it is doing?

HIS DEFINITION, assembled from his own words (2026-09-04 and 2026-09-13) and nothing else:

    "it can be trending but prints 1 red volume candle then prints a bullish candle, meaning it has
     no specific group of candles in succession" ... "a mixture of big bodies, small bodies, long
     wicks and no wicks."

    "Just test how the candles are mixed as bullish, bearish, small body, big body and long wicks
     because a trending market that I trade if it is a downtrend will print bearish candles most of
     the time... It is a test of counting how many men do we have then we realize this group has 7
     men and 3 women and then we say that is men's group, and if we have 2 boys, three girls, 2 men
     and 2 women, that is a mixed group so you cant say it is mens group which is the same as you
     cant tell the direction and intention of the market hence choppy."

    "candles consistently closing on top of each other like in a consistent trend."

    "in those candles i have circled you cant tell there next move explicitly."

SO THE QUESTION IS A HEAD COUNT, NOT A COUNT OF CHANGES. `vix1_tradeable.choppiness` counts how often
the market CHANGES its mind — colour flips, size flips, wick flips. That is a different question and
it never separated his charts: `GRGRGRGRGR` and `GGGGGRRRRR` have the SAME head count and opposite
flip counts. Three things are counted here, all of them heads:

    DOMINANCE   do most candles go the same way?           "7 men and 3 women"
    CONSISTENCY are the ones that do a consistent size?    "a mixture of big bodies, small bodies"
    STEPPING    do they close past each other?             "closing on top of each other"

⚠ THE PULLBACK IS SET ASIDE BEFORE ANY OF IT — HIS EXPLICIT WARNING, 2026-09-13:

    "this should also consider pullback where candles can be mixed or where only [one] candle is
     considered... I know you can create something that will end up rejecting a good [move] and a
     pullback because pullback has mixed candles that dont close on each other."

He is right and it would have been the first defect. A pullback is SUPPOSED to look mixed — it runs
against the trend, its candles do not close past each other, and it is the moment VIX.1 enters. So
the live pullback is cut off the end of the window before the count, using the pullback reader the
rest of the strategy already uses (`vix1_retracement.pullback_since`) — never a second one.

WHAT THIS IS AIMED AT, and it is measured rather than asserted. Inside the five markets he circled as
untradeable, a momentum candle led nowhere: the next candle carried on 7 of 26 times (27%) against
48% over 4.3 years, and at 1.5x normal one big candle was followed by another 6 of 67 times (9%)
against a 21% base. That is the target this file exists to find.

⛔⛔ BUILT, TESTED 2026-09-13, AND IT DOES NOT FIND IT. NOT WIRED. DO NOT WIRE IT.

Across 6,798 momentum candles on both pairs, grouped by how many of the three signs this rule saw:

    signs         0     1     2     3    cannot say
    carried on   44%   52%   48%   46%      48%     (EUR/USD)
                 51%   49%   50%   47%      47%     (GBP/USD)

**Flat.** And it points the wrong way where it moves at all: demanding 2 of 3 removes 15-16% of
momentum candles, and the ones it removes carried on 50-51% while the ones it keeps carried on 48%.
It is refusing the slightly BETTER moments.

On his own marks it is also backwards. His Guarantee rally reads 3 of 3 signs — correct — but his
10 Dec circle reads 3 of 3 on nine of its readings, and his 02 Mar circle reads 2 of 3, which is
exactly what his own marked GBP/USD setups read. It abstains on 52% of moments, because his
pullbacks are routinely longer than the window.

KEPT, NOT DELETED — the same standing as `vix1_tradeable.market_not_choppy` under `docs/OPEN.md`
D42: this is the faithful build of his words and the harness that disproved it, and rebuilding it
from scratch next session would only repeat the experiment. **A future attempt must beat the table
above before it is wired.**
"""
from dataclasses import dataclass

from core.types import Candle
from shared.candle_math import body_size
from strategies.vix1_momentum import baseline_body
from strategies.vix1_retracement import pullback_since

# HIS OWN NUMBER, from his own example: "this group has 7 men and 3 women and then we say that is
# men's group". Seven of ten. It is his, not a fitted level.
_DOMINANT = 0.70

# "MORE OFTEN THAN NOT" for the other two, which is not a tuned level either — it is the point where
# a thing stops being occasional and becomes what the market normally does. The same reasoning as the
# quiet test's boundary being zero: it comes from the meaning of the words.
_USUALLY = 0.50

# Too few candles to hold an opinion. Below this the answer is "cannot say", NEVER "choppy" —
# refusing because nobody measured is a guess, and this platform has shipped that mistake before.
_MIN_CANDLES = 8


@dataclass(frozen=True)
class Reading:
    """What the candles said, once the live pullback was set aside."""
    judged: bool = False            # was there enough to hold an opinion at all?
    choppy: bool = False
    signs: int = 0                  # how many of the three a trending market shows
    dominance: float = 0.0          # share going the majority way
    consistency: float = 0.0        # share of THOSE that are a full-sized candle
    stepping: float = 0.0           # share closing past the candle before them
    counted: int = 0                # candles actually counted
    set_aside: int = 0              # candles of live pullback cut off the end first
    up: bool = True                 # which way the majority went


def _cut_pullback(window: list[Candle], direction: int, since: int | None) -> int:
    """How many candles of LIVE PULLBACK sit on the end of the window and must not be counted.

    His warning in full: a pullback is mixed by nature and a pullback can be ONE candle. Counting it
    would mark every healthy trend choppy at exactly the moment VIX.1 wants to enter it.

    Uses the strategy's OWN pullback reader so there can never be two answers to "are we pulling
    back" in one timeframe — the duplicate he rejected on 2026-09-13.
    """
    t = pullback_since(window, direction, since)
    if t is None:
        return 0
    for k in range(len(window) - 1, -1, -1):
        if window[k].time == t:
            return len(window) - k
    return 0


def read(window: list[Candle], direction: int, since: int | None, look: int) -> Reading:
    """Count the group.

    ⚠ `window` MUST BE THE SAME LIST `trend_state` WAS GIVEN, and `since` its `direction_since`.
    `direction_since` is an INDEX INTO THAT LIST, not into the full history, so handing this the
    3,000-bar momentum window instead reads the pullback from the wrong place entirely — measured,
    it cut 1,474 candles as "pullback". `vix1_bias.py:443` calls the pullback reader exactly this
    way for the same reason; this follows it rather than inventing a second convention.
    """
    if direction == 0 or len(window) < _MIN_CANDLES + 2:
        return Reading()                    # no trend to judge against; other gates own that case

    aside = _cut_pullback(window, direction, since)

    # A LONG PULLBACK LEAVES NOTHING RECENT TO READ, and the first build shipped that bug. Cutting
    # the pullback is right, but his 10 Dec market pulled back for 24 hours — so the count was being
    # taken from 24 to 36 hours BEFORE the bar being judged, which was the previous day's rally. It
    # read 83% one way, 100% full-sized: a textbook trend, inside a market he had circled as chop.
    #
    # So the reach is capped. If the live pullback is longer than the window we read, there is no
    # clean recent view of this market and the honest answer is "cannot say" — which ALLOWS. Refusing
    # because nobody could measure is a guess, and this platform has shipped that mistake before.
    if aside > look:
        return Reading(set_aside=aside)

    body = window[:len(window) - aside] if aside else window
    seg = body[-look:] if len(body) > look else body
    if len(seg) < _MIN_CANDLES:
        return Reading(set_aside=aside)     # cannot say — never a refusal

    # DOMINANCE — "7 men and 3 women and then we say that is men's group". A plain head count of
    # which way the candles went, with no reference to the trend the module was told about: if the
    # candles cannot agree among themselves, nothing can be told from them.
    green = sum(1 for c in seg if c.close > c.open)
    up = green * 2 >= len(seg)
    dominant = green if up else len(seg) - green
    dominance = dominant / len(seg)

    # CONSISTENCY — "a mixture of big bodies, small bodies". Of the candles that DO go the
    # majority way, how many are a full-sized candle rather than a stub? "Full-sized" is
    # `baseline_body` — the middle candle of the last 100 hours, the SAME yardstick the momentum
    # test measures against, so "normal" can never mean two different things in one strategy.
    #
    # NOT measured against the window's own middle candle, which was the mistake on the first
    # attempt: that forces half of any window to count as big and half as small by construction, so
    # no group could ever dominate and every market on earth read the same.
    norm = baseline_body(window, len(window) - 1)
    same = [c for c in seg if (c.close > c.open) == up]
    consistency = (sum(1 for c in same if body_size(c) >= norm) / len(same)) if same else 0.0

    # STEPPING — "candles consistently closing on top of each other like in a consistent trend".
    # Measured on CLOSES, matching the rest of the strategy: a CHoCH needs "the body of a candle"
    # and a momentum candle is a body test, so a wick poking past does not count as progress.
    steps = sum(1 for i in range(1, len(seg))
                if (seg[i].close > seg[i - 1].close if up else seg[i].close < seg[i - 1].close))
    stepping = steps / (len(seg) - 1)

    signs = sum((dominance >= _DOMINANT, consistency >= _USUALLY, stepping >= _USUALLY))
    return Reading(judged=True, choppy=False, signs=signs, dominance=dominance,
                   consistency=consistency, stepping=stepping, counted=len(seg),
                   set_aside=aside, up=up)


def market_not_choppy(window: list[Candle], direction: int, since: int | None,
                      look: int, need: int) -> str | None:
    """HIS CHOP RULE. The refusal reason, or None to allow.

    `need` is how many of the three signs a market must show before we will trade it, and it lives
    at the call site with every other number that gates a trade.

    A MISSING MEASUREMENT IS NOT A REFUSAL. Too few candles, or no trend to read against, returns
    None — refusing because nobody could measure is a guess.
    """
    r = read(window, direction, since, look)
    if not r.judged or r.signs >= need:
        return None
    parts = []
    if r.dominance < _DOMINANT:
        parts.append("only %d of %d candles went the same way"
                     % (round(r.dominance * r.counted), r.counted))
    if r.consistency < _USUALLY:
        parts.append("most of those that did were stubs, not full candles")
    if r.stepping < _USUALLY:
        parts.append("they did not close past each other")
    tail = (" (the last %d candles of pullback were not counted)" % r.set_aside) if r.set_aside else ""
    return ("the market is choppy — you cannot tell what it is doing: "
            + "; ".join(parts) + tail)
