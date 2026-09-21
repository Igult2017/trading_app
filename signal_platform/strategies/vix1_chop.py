"""VIX.1 — IS THE MARKET RANGING? His rule, and there is not a single tuned number in it.

HIS RULE, 2026-09-21, after he rejected two of my versions for exactly this fault — *"You are still
hardcoding numbers. This rule is simpler. We cant guess at how many candles the price will start
ranging."*:

    "The price needs to get out of the two lines and be moving in a direction. Until the price gets
     out of the two lines which I have drawn, we are in a range. The price goes up and we expect it
     to be breaking the higher levels it forms. The moment it stops breaking them and starts
     travelling within a line, it is ranging."

    "if the price moves six, three, 4, 5 or whatever candles at the beginning and then it comes back
     and starts moving within that range, it is ranging until it breaks that range. The whole thing
     by the way works with CHOCH and BOS, it is nothing new."

HE IS RIGHT THAT IT IS NOTHING NEW, AND THAT IS THE WHOLE DESIGN. The two lines are already in the
code and are already maintained by the trend engine:

    the ceiling   `TrendState.bos_price`  — the extreme the last move actually reached
    the floor     `TrendState.protected`  — the level whose break ends that move

A close outside either one is already a break of structure or a change of character; `vix1_trend`
detects both and nothing here re-derives them. So the question is one comparison:

    price still between the two lines  ->  the last move has neither extended nor broken  ->  RANGING
    price closed outside them          ->  it is going somewhere  ->  tradeable
    either line missing                ->  cannot say  ->  never a refusal

NO WINDOW, NO THRESHOLD, NO COUNTER. The box is however big the last move was — six candles or four
or twenty — because the trend engine sized it from the market, not from a constant.

WHAT WAS DELETED TO GET HERE, so nobody rebuilds it: a 24-hour band, a crossings count, a "wander
ratio" (the Choppiness Index) and a two-hour latch. All measured, all mine, all rejected by him as
complication — and the measurements agreed with him: across his own circled range the wander reading
ran 33.3 to 67.1 while ordinary market ran 25.4 to 68.4, so no cut through it could ever separate
them. His version needs no cut at all.

MEASURED ON HIS OWN CHART, the range he circled on 14-16 Sep 2026 (EUR/USD):

    14 Sep 15:00 -> 16 Sep 15:00   INSIDE the box 1.15225-1.16150, every hour, ~50 hours
    16 Sep 18:00                   the 67.5-pip drop closes at 1.14701 -> BROKEN OUT, on the bar
    17 Sep 00:00                   a new box, price inside it again

It refuses the two trades inside that range that nothing else catches (14 Sep 19:00 and 15 Sep
08:00) and allows the drop's own sell. Price is inside the box 64% of hours (EUR/USD) and 69%
(GBP/USD), and 3 of the 14 trades in his 09-18 Sep window survive it.

⚠ AND THAT IS THE POINT, NOT A FAULT — his instruction when he approved it: *"Dont worry about low
number of trades. VIX is meant to trade trends and we all know the market ranges most of the time
and trends less, so low number of trades like 3, 4 or 5 per pair per month is expected. We are only
trying to remove range and to trade trends only."*

IT REFUSES NEW ENTRIES ONLY. An open position, its stop, its ladder and its exit are untouched.
"""
from dataclasses import dataclass

from core.types import Candle


@dataclass(frozen=True)
class State:
    """Where price sits against the two lines the last move drew."""
    judged: bool = False      # were both lines available at all?
    ranging: bool = False
    top: float = 0.0
    bottom: float = 0.0


def box_state(h1: list[Candle], tstate) -> State:
    """Is price still inside the box the last move made?

    `tstate` is the `TrendState` the caller has already computed — it is never recomputed here, so
    this module and the trend engine can never disagree about where the two lines are.
    """
    if not h1 or tstate is None:
        return State()
    ceiling, floor = tstate.bos_price, tstate.protected
    if ceiling is None or floor is None:
        return State()                       # no move on record yet — cannot say, so never refuse
    low, high = (floor, ceiling) if floor <= ceiling else (ceiling, floor)
    return State(True, low <= h1[-1].close <= high, high, low)


def not_tradeable(h1: list[Candle], tstate, bullish: bool | None = None,
                  symbol: str = "") -> str | None:
    """The message to VIX.1: a reason to stand down, or None to carry on.

    HIS SCOPE, given with the rule: *"this idea does not apply when liquidity void is filling because
    we have a rule for that. It only works in the case where the price has not gone back to fill the
    void... and when the price has filled liquidity and broken it so we are no longer in the
    liquidity void zone."* So while price is working back into a void, `vix1_void` owns the decision
    and this module says nothing — one question, one owner, never two rules answering at once.
    """
    if bullish is not None and symbol:
        from strategies import vix1_void          # imported here: `vix1_void` reads `vix1_momentum`
        void = vix1_void.state(h1, len(h1) - 1, bullish, symbol)
        if void.kind in ("filling", "filled"):
            return None
    st = box_state(h1, tstate)
    if not st.judged or not st.ranging:
        return None
    return (f"the market is ranging — price is still inside the {st.bottom:.5f}-{st.top:.5f} box the "
            f"last move drew, so it has neither extended nor broken it. No trades until it closes "
            f"out of that box")
