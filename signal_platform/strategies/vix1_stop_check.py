"""
VIX.1 — A SETUP WHOSE STOP HAS ALREADY BEEN TRADED THROUGH IS DEAD BEFORE ANY ORDER IS SENT.

THE ROOT CAUSE OF THE WITHDRAWN ORDERS (docs/OPEN.md B30, found 19 Sep 2026). The entry checked its ENTRY
price against the market and never its STOP. The level comes from the first pullback after the cross
(`vix1_cross.decide`) and nothing looked at the candles after it, so orders went out whose stop price had
already been traded through. Both watchers judge only candles from the signal's creation onward, so that
earlier death stayed invisible until price touched the stop a second time — and the order was withdrawn.
Reproduced exactly through the real `m1_signals` on the broker's candles:

    EUR/USD sell 10 Sep   cross 20:00   through the stop 20:02          sent 20:06   withdrawn
    EUR/USD sell 14 Sep   cross 10:01   through the stop 10:11-10:21    sent 10:23   withdrawn
    GBP/USD buy  16 Sep   cross 06:00   through the stop 06:03          sent 06:05   (refused, would lose)
    GBP/USD sell 16 Sep   cross 15:00   through the stop 15:02          sent 15:03   filled, -$125 in 1.2 s

HIS RULINGS, 19 Sep 2026:
  Q1 (a) — every candle AFTER the cross candle counts. His note: *"I hope this means when the price goes
     outside the SL band."* So: price PAST the stop — a sell's high above it, a buy's low below it. An exact
     touch does not count. A WICK counts, the same yardstick as the existing "stop touched before entry"
     rule (`signal_monitor`, `vix1_watch`). The cross candle itself cannot count: a sell crosses DOWN
     through the line from above, and the stop sits 0.5-1 pip above the line.
  Q2 (a) — the setup is dead: no order; wait for the next momentum candle.
"""
from core.types import Candle

# The switch exists so the evidence test can show what the entry did without this check.
_ENFORCE = True


def stop_already_hit(wcl: list[Candle], cross_idx: int, bullish: bool, sl: float) -> Candle | None:
    """The first CLOSED candle after the cross whose price went PAST the stop, or None."""
    if not _ENFORCE:
        return None
    for c in wcl[cross_idx + 1:]:
        if (c.low < sl) if bullish else (c.high > sl):
            return c
    return None


def why(c: Candle, sl: float, bullish: bool, digits: int) -> str:
    import datetime as dt
    past = c.low if bullish else c.high
    at = dt.datetime.fromtimestamp(c.time, dt.timezone.utc).strftime("%H:%M")
    return (f"price went past the stop {sl:.{digits}f} ({past:.{digits}f} at {at} UTC) after the cross "
            f"and before any order — the setup is dead; no order, waiting for the next momentum candle")
