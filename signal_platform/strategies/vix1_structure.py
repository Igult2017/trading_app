"""
VIX.1 — IS THIS A CONTINUATION, OR ARE WE IN A PULLBACK? The refusal that stops the wrong trades.

THE USER'S RULE, settled 2026-08-10/11 across several corrections:

    "We can only take a trade after the first HH and HL (or LL and LH). Then when a momentum candle
     comes in the same direction, we anticipate a trend and we want to ride with it. For a trend that
     has developed, it is easy because we only need the candle to qualify."

    "A momentum candle in a developing HH cannot break structure — it will only break structure if
     the HH develops fully... it is not easy for 1 candle to break structure in most cases."

    "So, we don't trade pullbacks, we don't trade ranging markets and we are always in trend."

So the momentum candle is the EARLY SIGN that the next leg is starting — never the thing that
completes it. Nothing here asks a candle to break anything.

WHAT THIS MODULE ACTUALLY DECIDES. Direction is settled entirely by vix1_trend on WIDE (48-bar)
swings. This module asks ONE question of the faster (8-bar) structure:

    is the faster structure trending the OPPOSITE way to the trend we are about to trade?

If it is, we are in a pullback — or in a reversal the slow read has not caught yet — and we stand
aside. If it is not, the trend's own direction stands and the momentum candle is the trigger.

THIS IS THE 10-AUG CASE, EXACTLY. At 09:00 UTC the 2-day trend said DOWN and the 8-hour structure
said UP — highs 1.34854 -> 1.34790 -> 1.35081 and lows 1.34396 -> 1.34336 -> 1.34788, both rising.
Not unclear: actively opposite. VIX.1 sold that, and price ran +85 pips the other way over the week.

WHY "MUST NOT CONTRADICT" AND NOT "MUST CONFIRM". The first version of this file demanded the faster
structure positively show the trend's own pattern AND that the pullback had ended. Measured, that
permitted trading only 15-18% of the time a trend existed — against his "we are always in trend", and
it refused both candles he had named as good. The weaker test still refuses 10 Aug, because there the
faster structure was not merely quiet, it pointed the other way.

WHY THE FAST READ MUST NEVER DECIDE DIRECTION. Half of all pullbacks are COMPLEX — measured over 12
months, 21 of 42 on GBP/USD and 17 of 37 on EUR/USD. A complex pullback prints its own lower highs
and lower lows inside an intact uptrend and looks exactly like a downtrend at 8 bars. Let this read
choose direction and the strategy sells the pullbacks of a rally, which is the bug it exists to stop.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.vix1_retracement import Retracement

# The faster structure's swing width. NOT the trend's (48). A swing needs `n` bars EITHER SIDE to be
# confirmed, so at 48 a pullback low is known two days and a median 92 pips later — far too late to
# say anything about the leg being entered. Measured alternatives, GBP/USD over 12 months:
#     width 5 -> confirmed 5 bars later, 15.1 higher lows/month, price already moved 25 pips
#     width 8 -> 8 bars,  9.7/month, 33 pips
#     width 12 -> 12 bars, 7.0/month, 38 pips
# HIS DECISION, 2026-08-11: "keep it at 8 hours for now. I don't want to change that at the same time
# as the trend logic. We can test 5, 8, and 12 later using the actual trading results."
_FAST_N = 8


@dataclass
class LegState:
    """May this trend be traded right now, and on what grounds?"""
    ready: bool = False
    pattern: str = "unclear"        # what the FASTER structure shows: up / down / unclear / mixed
    why: str = ""


def _distinct(points, n: int):
    """Collapse pivots that are really the SAME turn seen twice.

    `find_swing_points` marks every bar that is the extreme of its window, so a flat top prints two
    or three pivots at an identical price on consecutive bars. Comparing only the last two then reads
    "no higher high" because the last two ARE the same high — and equal highs (a double top, a level
    tested twice) are ordinary market behaviour, not a synthetic artefact.

    Keeps the most extreme of any group of same-side pivots within `n` bars of each other.
    """
    out = []
    for p in points:
        if out and out[-1].is_high == p.is_high and p.index - out[-1].index <= n:
            better = p.price > out[-1].price if p.is_high else p.price < out[-1].price
            if better:
                out[-1] = p
            continue
        out.append(p)
    return out


def fast_pattern(candles: list[Candle], n: int = _FAST_N) -> str:
    """What the faster structure is doing: 'up' (HH+HL), 'down' (LH+LL), 'mixed', or 'unclear'.

    Only swings CONFIRMED by the end of the window count — a pivot at index j needs n bars after it,
    so the last n bars can never contain one. This is a LEVEL read, and a level must come from
    settled structure (the platform-wide closed-candle rule).
    """
    pts = sorted(find_swing_points(candles, n), key=lambda p: p.index)
    pts = _distinct([p for p in pts if p.index <= len(candles) - 1 - n], n)
    highs = [p for p in pts if p.is_high]
    lows = [p for p in pts if not p.is_high]
    if len(highs) < 2 or len(lows) < 2:
        return "unclear"
    if highs[-1].price > highs[-2].price and lows[-1].price > lows[-2].price:
        return "up"
    if highs[-1].price < highs[-2].price and lows[-1].price < lows[-2].price:
        return "down"
    return "mixed"


def developing_needs_retracement(maturity: str, ret: Retracement) -> str | None:
    """A DEVELOPING trend may only be traded off a momentum candle that came AFTER a retracement.
    Returns the refusal reason, or None to allow.

    HIS RULE, 2026-08-11, in his own words: *"So the first retracement and then when a momentum
    candle builds showing the potential continuation of the price, we trade. If not, the trend is now
    confirmed and we can get any momentum candle along the trend but not in a retracement or a
    reversal or a ranging market."*

    So the sequence a NEW trend must show is: first HH + HL (or LL + LH) -> retracement -> momentum
    candle. The retracement is what makes the momentum candle evidence of CONTINUATION rather than
    just another bar in the first push. Once the trend has continued at least once — `developed` — it
    has already proved itself, and a momentum candle anywhere along it is tradeable; that case is not
    this function's business.

    MEASURED over 12 months on setups the leg gate already allows: this refuses **24.9% of GBP/USD
    and 14.0% of EUR/USD**, and **0 developed setups on either pair** — the rule cannot touch a trend
    it does not apply to, which is asserted in the tests rather than assumed.

    `maturity` MUST be read at the momentum candle, not at the latest bar. Measured, the two differ
    on 0.9% (GBP/USD) / 1.8% (EUR/USD) of setups, because the candle can be up to LOOKBACK=12 bars
    old (median 5) and a swing's confirmation can land inside that window. Small, but the question is
    causal — "had this trend already continued when the candle formed?" — and the caller passes the
    at-the-candle read.
    """
    if maturity != "developing" or ret.active:
        return None
    return ("the trend has only just formed (developing) and this momentum candle did not come "
            "after a retracement — a new trend must show its first pullback before it is traded")


def leg_state(candles: list[Candle], direction: int, n: int = _FAST_N) -> LegState:
    """May we ride this trend right now?

    `direction` MUST come from vix1_trend — this function never infers it, by design. Refusals carry
    a stated reason rather than a bare False: a refusal nobody can explain is how the last round of
    defects survived so long, and it is what made the 10-Aug signal take an hour to diagnose.
    """
    if direction == 0:
        return LegState(why="no established trend — nothing may be traded")
    pattern = fast_pattern(candles, n)
    opposite = "down" if direction == 1 else "up"
    if pattern == opposite:
        way = "up" if direction == 1 else "down"
        return LegState(pattern=pattern,
                        why=f"the faster structure is trending {pattern} against the {way}trend "
                            f"— this is a pullback, not a continuation")
    return LegState(True, pattern,
                    f"the faster structure ({pattern}) does not contradict the trend "
                    f"— ride the continuation")
