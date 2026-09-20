"""WHERE A STOP MAY GO — one rule, applied to both sides of the market (his ruling, 2026-09-20).

`rungs.py` says WHEN a stop should move and how much it protects. This says WHERE that stop is allowed
to sit. They were the same arithmetic until now, and that is what broke the trail.

THE DEFECT THIS FIXES. A buy is closed by SELLING, and a buy's stop also fires on the sell price (bid) —
the number on his chart. So a stop "0.1R behind" really had 0.1R of room. A sell is closed by BUYING
BACK, and its stop fires on the BUY price (ask), one spread further on, while the ladder reads the chart
price. The stop price was worked out from the ENTRY (`rungs.stop_price_for`), so on a sell the spread came
straight out of the gap: on his 18 Sep EUR/USD sell the stop was 5.3 pips and the spread 1.0 pip, which is
0.19R of a 0.2R gap. The stop landed ~0.01R from the buy price, `breakeven.why_not` refused it as through
the market **135 times on that one trade**, and the trail never moved once.

HIS QUESTION, 20 Sep 2026: *"how can we move SL in sell the same way we do in buy?"* — this file is the
answer. A trailing stop is measured from the price that FIRES it, so both sides get the same real room,
and a trailing move can no longer be refused: it is placed beyond the firing price by construction.

MEASURED, over all 7 real fills, through the real monitor loop on the broker's own bid and ask ticks
(`tests/vix1/test_ladder_live_loop.py`):

    live before this change (0.1R behind, from 2.1R)   18 Sep +0.98R    7 trades -2.16R
    his full new ladder                                18 Sep +0.70R    7 trades -2.44R
    0.2R from the firing price, from 2.2R  (BUILT)     18 Sep +1.83R    7 trades -1.31R

WHY 0.2R AND NOT TIGHTER. On the way to its best price (+2.77R at 15:26) that trade dipped 1.26R — from
+2.32R back to +1.06R at 15:04:58. Anything closer behind the price is taken by the trade's own breathing
before it finishes running, and every tighter or earlier variant measured worse: 0.3R from 2.2R -1.42R,
0.2R from 1.6R -1.59R, 0.5R from 1.6R -1.67R, 0.3R from 1.3R -2.05R, 0.5R from 1.0R -2.27R.
"""
import math

# THE SMALLEST GAP ANY STOP MAY LEAVE, as a share of the trade's starting risk.
#
# It is the trailing gap AND the floor under every fixed lock, deliberately: a lock that lands inside the
# spread is a market close wearing a stop's name. On his tight-stop sells the spread alone is 0.36R
# (17 Sep, 2.8 pips) and 0.60R (16 Sep, 2.5 pips), so without this floor every step on them is refused
# outright and the stop simply never moves.
MIN_GAP_R = 0.2


def on_grid(price: float, digits: int, bullish: bool) -> float:
    """`price` snapped to the pair's real price steps, ALWAYS AWAY FROM THE MARKET.

    A buy's stop sits below the price and a sell's above it, so rounding down for a buy and up for a
    sell can only ever leave MORE room, never less. Plain rounding would sometimes shave half a step
    off the gap — harmless on a 5-pip stop, not something to leave to luck on a 2-pip one.

    The `round(..., 6)` is the float-error guard: 1.1464 * 100000 is 114640.00000000001 in binary, and
    a bare `ceil` on that would push a perfectly exact price a whole step further out.
    """
    q = 10 ** digits
    v = round(price * q, 6)
    return (math.floor(v) if bullish else math.ceil(v)) / q


def trail_stop(fire: float, risk: float, bullish: bool, gap_r: float = MIN_GAP_R,
               digits: int | None = None) -> float | None:
    """The trailing stop price: `gap_r` of the STARTING risk away from the price that fires it.

    `fire` is that firing price — the bid for a buy, the ask for a sell (`position_tracker._prices_now`
    returns it as the GUARD, and the fast watcher as the second half of `_prices_for`). Never the price
    the rung was read on: reading and firing are the same number for a buy and a spread apart for a sell,
    which is the whole defect above.
    """
    if not risk or fire is None:
        return None
    out = fire - gap_r * risk if bullish else fire + gap_r * risk
    return out if digits is None else on_grid(out, digits, bullish)


def no_closer_than(target: float | None, fire: float, risk: float, bullish: bool,
                   gap_r: float = MIN_GAP_R, digits: int | None = None) -> float | None:
    """`target`, pushed out to the minimum gap if it sits nearer the market than that.

    A FIXED LOCK IS DELAYED, NEVER SKIPPED. +1R at 1.5R leaves 0.5R of room, which is fine at a 1-pip
    spread and impossible at 0.6R of one. Refusing it meant the stop stayed where it was; pushing it out
    protects slightly less than the rung's name and is strictly better than protecting nothing. The
    ratchet in `breakeven.move_stop_to` still refuses it if it is no improvement on the stop in place.

    BREAKEVEN NEVER COMES THROUGH HERE. Breakeven is defined by his costs — *"when the market takes us
    out we lose nothing and gain nothing"* — not by a distance, and pushing it out would turn it into a
    small loss with his name on it. It keeps the old behaviour: refused, and retried on the next pass.
    """
    if target is None or not risk or fire is None:
        return target
    floor = trail_stop(fire, risk, bullish, gap_r, digits)
    # THE RUNG'S OWN PRICE IS RETURNED UNTOUCHED when it already leaves enough room — including its
    # exact decimals, so "+1R" stays exactly one risk from the entry on every ordinary trade.
    return min(target, floor) if bullish else max(target, floor)
