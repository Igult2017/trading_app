"""PIX — the 5M respect test and the 1M stop-order price (split out of `pix_skeleton.py`, 18 Nov 2026, to keep it under
200 lines). Pure functions on CLOSED candles; `price` is the live trigger price only, never a level."""
from __future__ import annotations

from core.types import Candle
from strategies.pix_candles import closed_only

TAP_WINDOW_M5 = 12     # the tap must be within the last hour of 5M candles


def respected_5m(m5: list[Candle], top: float, bottom: float, bull: bool) -> int | None:
    """Time of the tap if the LAST closed 5M candle is the FIRST close back out of the band the trade's way.

    The tap is the most recent candle within `TAP_WINDOW_M5` that reached into the band; from it on nothing may
    close beyond the far edge, and nothing before the last candle may already have closed back out (that respect
    was earlier — this one is stale)."""
    c = closed_only(m5)[-TAP_WINDOW_M5:]
    if not c:
        return None
    taps = [k for k, x in enumerate(c) if (x.low <= top if bull else x.high >= bottom)]
    if not taps:
        return None
    # THE VISIT starts at the FIRST of the run of candles that reached into the band. Starting at the latest touch
    # let a candle that closed THROUGH the zone be forgotten the moment the next candle dipped in and closed back out.
    t = taps[-1]
    while t - 1 >= 0 and (t - 1) in taps:
        t -= 1
    seg = c[t:]
    if any((x.close < bottom if bull else x.close > top) for x in seg):
        return None
    if any((x.close > top if bull else x.close < bottom) for x in seg[:-1]):
        return None
    last = seg[-1]
    return c[t].time if (last.close > top if bull else last.close < bottom) else None


def entry_1m(m1: list[Candle], bull: bool, sl: float, price: float, spread: float = 0.0) -> float | None:
    """Stop-order price off the last CLOSED 1M candle, or None if it would not be a valid stop order now.

    `price` is the side the order fills on: the ASK for a buy, the BID for a sell.

    ⚠ A BUY IS AT THE CANDLE HIGH + THE SPREAD (fixed 19 Nov 2026). Candles are drawn from the BID, and a buy stop fills
    on the ASK (bid + spread). With the entry at the bare bid high, every 1M candle that closed within one spread of its
    high read as "the market is already through the entry" and the buy was dropped — for Bitcoin that is $34, often
    most of a 1M candle, and exactly when price is leaving demand strongly. A sell fills on the BID at the candle low,
    so it was only dropped when the candle closed AT its low. Found by the 2-year backtest: 11,649 sells to 2,774 buys
    on Bitcoin, sells outnumbering buys even in months the 4H read mostly UP. Now both sides trigger on a real break."""
    c = closed_only(m1)
    if not c:
        return None
    e = c[-1].high + spread if bull else c[-1].low
    if (bull and (e <= sl or price >= e)) or (not bull and (e >= sl or price <= e)):
        return None                    # stop on the wrong side, or the market is already through the entry
    return e
