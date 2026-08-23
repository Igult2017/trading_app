"""BX-S/D — IS A PULLBACK RUNNING, AND HAS IT STARTED ENDING?

HIS RULE, 2026-08-23, and the reason this module exists:

    "if it is a zone use the existing entry model. if it is a pullback report it when its started
     ending and advice trader to check and set entry. If we dont have a system that detects a
     pullback accurately you can build one."

BX DID NOT HAVE ONE. `bx_sd_signal1.pullback_zone` is named for a pullback but detects nothing about
one — it returns the nearest ZONE the forming bar happens to be touching. BX's own `pullback_4h` was
deleted on 2026-08-15 with the old entry model and nothing replaced it.

AND THE SHARED ONE CANNOT ANSWER HIS QUESTION. `shared/pullback_detector.py` classifies a pullback as
forming / complete / failed, and "complete" requires a NEW CONFIRMED SWING past the pullback
(`detect_pullbacks`). A swing needs bars on both sides to confirm, so by the time it says complete the
move has already gone — that is "it ended", not "it has started ending". Nothing imports it but a
generic feature plugin, so nothing is orphaned by not using it here.

WHAT "STARTED ENDING" MEANS, and it is BX's own existing definition of a turn rather than a new one:
the finer timeframe has printed its FIRST BREAK OF STRUCTURE BACK IN THE TRADE DIRECTION since the
pullback's furthest point. `bx_sd_structure.map_structure` already emits exactly that event, by BODY
CLOSE and never a wick, which is BX's rule everywhere else.

WHY THAT MOMENT AND NOT THE TURN ITSELF. A turn is only visible after it has happened; the earliest
HONEST statement is "structure has broken back your way". It is deliberately not a prediction — the
message it feeds says go and look, and he sets his own entry.

THIS MODULE PRICES NOTHING. No entry, no stop, no target. That is the whole point of the no-zone path
— *"advice trader to check and set entry"* — and a helper that returned a level would invite one.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.mtf_utils import closed_only
from strategies.bx_sd_structure import map_structure

# How deep the retrace is, in plain words for the card. Fractions of the reaction leg.
_DEPTH = ((0.382, "shallow"), (0.618, "about halfway"), (0.786, "deep"))

# Enough bars for BX's structure engine to confirm a swing on BOTH the reaction leg and the pullback
# leg. `bx_sd_structure._SWING_N` is 3, so a swing needs 3 bars either side; below this the answer is
# "not enough history", never "no pullback".
_MIN_BARS = 12


@dataclass
class PullbackState:
    running:      bool  = False   # price is retracing back toward the zone
    ending:       bool  = False   # structure has broken back in the trade direction
    extreme:      float = 0.0     # the furthest point the pullback reached (its turning point)
    leg_extreme:  float = 0.0     # the furthest point the reaction reached before pulling back
    retrace:      float = 0.0     # how much of the reaction leg has been given back, 0.0-1.0+
    depth:        str   = ""      # "shallow" / "about halfway" / "deep" / "very deep"
    turn_at:      int   = 0       # time of the bar whose close broke structure back our way


def _depth_label(retrace: float) -> str:
    for limit, label in _DEPTH:
        if retrace <= limit:
            return label
    return "very deep"


def pullback_state(candles: list[Candle], direction: str, since: int) -> PullbackState:
    """Where the pullback stands on this feed, from `since` onward. `direction` is "buy" or "sell".

    `since` is the time the zone was RESPECTED — the moment the reaction was confirmed
    (`bx_sd_registry.REACT_BARS`). Everything before it belongs to the approach, not the reaction, so
    measuring from the start of the feed would find the wrong leg entirely.

    CLOSED BARS ONLY. The whole test is a body close beyond a swing, and the newest bar the feed
    returns has not closed — its "close" is just the current price, so a break could confirm and then
    un-confirm as price ticks. That is the standing rule across both strategies: a LEVEL comes from a
    closed candle. (`bx_sd_structure.map_structure` also applies `closed_only`; it is applied here as
    well so the indices this function slices with match the ones that function reasons about.)
    """
    bars = [c for c in closed_only(candles) if c.time >= since]
    if len(bars) < _MIN_BARS:
        return PullbackState()

    buy  = direction == "buy"
    want = "up" if buy else "down"

    # THE REACTION MUST BE A REAL MOVE, and this is a structure test rather than a threshold. BX's
    # own engine must have seen a break in the trade direction; in a flat market it sees nothing,
    # which is the honest answer. Without this a market oscillating two pips reported a "pullback"
    # that had retraced 200% — caught by `test_pullback_advisory`, not by reading the code.
    if not any(e.direction == want for e in map_structure(bars).events):
        return PullbackState()

    # THE REACTION LEG: from where the reaction started to the furthest it got our way.
    start = bars[0].close
    if buy:
        leg_i = max(range(len(bars)), key=lambda i: bars[i].high)
        leg_extreme = bars[leg_i].high
    else:
        leg_i = min(range(len(bars)), key=lambda i: bars[i].low)
        leg_extreme = bars[leg_i].low
    leg = abs(leg_extreme - start)
    if leg <= 0 or leg_i >= len(bars) - 1:
        return PullbackState()          # nothing has come back yet — the leg is still being made

    # THE PULLBACK is its OWN leg, with its own bars and its own structure. Everything from the
    # reaction's furthest point onward.
    seg = bars[leg_i:]
    if buy:
        pb_i = min(range(len(seg)), key=lambda i: seg[i].low)
        pb_extreme = seg[pb_i].low
        given_back = leg_extreme - pb_extreme
    else:
        pb_i = max(range(len(seg)), key=lambda i: seg[i].high)
        pb_extreme = seg[pb_i].high
        given_back = pb_extreme - leg_extreme
    if given_back <= 0:
        return PullbackState()

    retrace = given_back / leg
    if retrace > 1.0:
        # Price is back past where the reaction began. The reaction is dead, so there is no pullback
        # to report the end of — saying otherwise would send him to a chart where nothing is left.
        return PullbackState()

    st = PullbackState(running=True, extreme=pb_extreme, leg_extreme=leg_extreme,
                       retrace=round(retrace, 4), depth=_depth_label(retrace))

    # HAS IT STARTED ENDING? A body close beyond the PULLBACK'S OWN last unbroken swing, back in the
    # trade direction.
    #
    # ON THE PULLBACK'S SCALE, NOT THE REACTION'S — and getting this wrong made the first version
    # self-contradictory. Asked of the whole window, the last unbroken swing low (on a sell) IS the
    # reaction's own extreme, so "structure broke back down" could only be true once price had
    # already gone PAST that extreme — by which point `running` is false, because the leg has
    # extended. The two conditions could never both hold. A pullback is a leg in its own right and
    # its first structural crack is a break of its own minor swing, which is what this asks.
    #
    # The break must come after the pullback's furthest point; one before it belongs to the reaction.
    for e in map_structure(seg).events:
        if e.direction == want and e.index > pb_i:
            st.ending, st.turn_at = True, seg[e.index].time
            break
    return st


def describe(st: PullbackState, direction: str, digits: int) -> list[str]:
    """The advisory's own lines. Reader-facing, so it says what happened and what to do — never a
    level to enter at, because BX has not worked one out and must not imply it has."""
    way = "back up" if direction == "buy" else "back down"
    return [
        f"The pullback has STARTED ENDING — structure just broke {way} on 15M.",
        f"It gave back {st.retrace * 100:.0f}% of the move ({st.depth}), turning at "
        f"{st.extreme:.{digits}f}.",
        "No zone here, so BX has no entry to give you — check the chart and set your own.",
    ]
