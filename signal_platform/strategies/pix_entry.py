"""PIX — THE 1M ENTRY: touch, reaction, pullback, stop order (his rule, 19 Nov 2026). Pure functions on CLOSED candles;
`price` is the live trigger price only (the ASK for a buy, the BID for a sell), never a level.

His words: *"Our entry is in 1M. Wait for the price to hit the zone then pullback. then give it between 2 to 3 candles in
our direction then when one candle forms the opposite way, we take a trade. Where there is no reaction to the zone we
marked, we dont enter… A zone has to prove that it has been respected for us to trade it."* His answers the same day:
entry = a STOP ORDER at the opposite candle's high (buy) / low (sell); a 4th, 5th… candle our way keeps the wait open
until the first opposite candle; the stop *"behind the pullback like VIX does it"*.

BUY at demand (a sell is the mirror):
  1 TOUCH      a closed 1M candle's low reaches the zone top (within the last `TOUCH_WINDOW_M1` candles).
  2 NOT BROKEN from the visit's first touch on, no 1M candle CLOSES below the zone bottom (the 5M is checked by the caller).
  3 REACTION   after the LAST touching candle, at least `MIN_REACTION` candles close UP, none closes down. A candle that
               closes exactly at its open neither counts nor ends the wait. The touching candle itself is not counted.
  4 PULLBACK   the first candle after that run that closes DOWN — and it must be the NEWEST closed candle, so the order
               goes out the minute it closes. A pullback that dips back into the zone is a new touch: the count restarts.
  5 ENTRY      stop order at the pullback's high + the spread (candles are bid, a buy fills on the ask — the 19 Nov fix);
               a sell at the pullback's low.
  6 STOP       behind the pullback: its low − `SL_GAP_MULT` × the 1M's average range (last `GAP_AVG_N` candles); a sell's
               stop also + the spread (it fires on the ask). Never closer than `MIN_ROOM_MULT` × that range + the spread.

What this replaced: a 5M candle closing back out of the zone counted as "respected", and the order went straight onto
the next 1M candle — no reaction, no pullback — which is how nearly every zone touch became a trade.
"""
from __future__ import annotations

from dataclasses import dataclass

from core.types import Candle
from strategies.pix_candles import closed_only

TOUCH_WINDOW_M1 = 60   # the touch must be within the last hour of 1M candles
MIN_REACTION    = 2    # "between 2 to 3 candles in our direction" — at least 2; more keeps the wait open (his A)
# THE STOP GAP — his "behind the pullback like VIX does it": the same SIZES that rule uses, written out here (PIX imports
# no other strategy's code). Every size is a multiple of what the market drew, never a pip count.
SL_GAP_MULT     = 0.5  # how far beyond the pullback's far edge, × the 1M's recent average range
GAP_AVG_N       = 14   # 1M candles in that average
MIN_ROOM_MULT   = 1.0  # the floor: a stop closer than this × the average range (+ the spread) is widened to it


@dataclass
class Entry:
    first_touch_at: int        # the visit's first candle into the zone
    touch_at:       int        # the LAST candle into the zone (the reaction starts after it)
    reaction:       list       # the candles that closed our way
    pullback:       Candle
    entry:          float
    sl:             float
    note:           str        # how the stop was placed, for the card


def _ours(x: Candle, bull: bool) -> bool:
    return x.close > x.open if bull else x.close < x.open


def _against(x: Candle, bull: bool) -> bool:
    return x.close < x.open if bull else x.close > x.open


def avg_range(c: list[Candle]) -> float:
    tail = c[-GAP_AVG_N:]
    return sum(x.high - x.low for x in tail) / len(tail) if tail else 0.0


def reaction_entry(m1: list[Candle], top: float, bottom: float, bull: bool, price: float,
                   spread: float = 0.0) -> tuple[Entry | None, str]:
    """(Entry, "") when the newest closed 1M candle is the pullback after a proven reaction, else (None, why not)."""
    c = closed_only(m1)[-TOUCH_WINDOW_M1:]
    touches = [k for k, x in enumerate(c) if (x.low <= top if bull else x.high >= bottom)]
    if not touches:
        return None, "1M: price has not touched the zone in the last hour"
    first, last = touches[0], touches[-1]
    if any((x.close < bottom if bull else x.close > top) for x in c[first:]):
        return None, "1M: a candle closed THROUGH the zone after the touch — broken, not respected"
    after = c[last + 1:]
    if not after:
        return None, "1M: touching the zone now — waiting for a reaction"
    run, pb = after[:-1], after[-1]
    if any(_against(x, bull) for x in run):
        return None, "1M: the reaction was cut short or the pullback has already passed — waiting for a new touch"
    n = sum(_ours(x, bull) for x in run)
    if not _against(pb, bull):
        return None, f"1M: reacting ({n + _ours(pb, bull)} candle(s) our way) — waiting for the pullback candle"
    if n < MIN_REACTION:
        return None, f"1M: only {n} candle(s) our way before the pullback (needs {MIN_REACTION}) — no proven reaction"
    rng = avg_range(c)
    entry = pb.high + spread if bull else pb.low
    sp = max(0.0, spread)
    sl = pb.low - SL_GAP_MULT * rng if bull else pb.high + SL_GAP_MULT * rng + sp
    note = f"stop {SL_GAP_MULT:g}× the 1M average range behind the pullback" + ("" if bull else " + the spread")
    room = MIN_ROOM_MULT * rng + sp
    if abs(entry - sl) < room:
        sl = entry - room if bull else entry + room
        note = f"stop widened to the floor: {MIN_ROOM_MULT:g}× the 1M average range + the spread"
    if (bull and price >= entry) or (not bull and price <= entry):
        return None, "1M: the market is already through the pullback's stop level — no order"
    return Entry(c[first].time, c[last].time, [x for x in run if _ours(x, bull)], pb, entry, sl, note), ""
