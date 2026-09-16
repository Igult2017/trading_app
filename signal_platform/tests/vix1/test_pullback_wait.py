"""VIX.1 — after a LONG pullback the trade comes from the third candle (his rule, 2026-09-16).

HIS WORDS:

    "after the pullback, we take trade from the 3rd candle and above if it is the momentum candle. We no
     longer take trade from the first candle (if its a momentum candle) after pullback unless the
     pullback was made of 1-3 candles. I realized most of first momentum candles after pullback are
     never successful when the pullback itself was a long word that took more than 3 candles down."

So a pullback of ONE TO THREE candles is untouched — its first momentum candle still trades. After a
longer pullback the first two candles are refused and the third onward may trade.

Counted by `vix1_retracement`, which already owns the pullback count, so the strategy still has ONE
pullback logic rather than two that can disagree.
"""
from _harness import Suite, body

from strategies.vix1_retracement import (
    _SHORT_PULLBACK, _WAIT_CANDLES, since_pullback, wait_after_pullback,
)

s = Suite("VIX.1 — the wait after a long pullback")

s.check("a short pullback is up to 3 candles (his number)", _SHORT_PULLBACK, 3)
s.check("and the trade then comes from the 3rd candle on (his number)", _WAIT_CANDLES, 3)


def market(down_candles, up_candles, start=1.1000, step=0.0010):
    """`down_candles` falling candles (the pullback in an uptrend), then `up_candles` rising ones."""
    out, price, t = [], start, 0
    for _ in range(down_candles):
        out.append(body(price, price - step, tf="H1", t=t)); price -= step; t += 1
    for _ in range(up_candles):
        out.append(body(price, price + step, tf="H1", t=t)); price += step; t += 1
    return out


print()
print("   an uptrend, counting from the candle that ends the pullback:")
s.check("a 2-candle pullback, momentum candle right after it — the count reads (1 after, 2 bars)",
        since_pullback(market(2, 1), 1), (1, 2))
s.check("...and it may trade, because the pullback was short", wait_after_pullback(market(2, 1), 1), None)

s.check("a 3-candle pullback is still short — the first candle trades",
        wait_after_pullback(market(3, 1), 1), None)

_five = wait_after_pullback(market(5, 1), 1)
s.check("a 5-candle pullback, first candle after it — REFUSED", _five is not None, True)
s.check("...and the refusal says what it is waiting for",
        _five is not None and "5 candles" in _five and "only candle 1" in _five, True)
s.check("...the second candle is still refused", wait_after_pullback(market(5, 2), 1) is not None, True)
s.check("...and the THIRD candle may trade", wait_after_pullback(market(5, 3), 1), None)
s.check("...as may the fourth", wait_after_pullback(market(5, 4), 1), None)

print()
print("   the same the other way up, and the edges:")


def down_market(up_candles, down_candles, start=1.1000, step=0.0010):
    """In a downtrend the pullback RISES, then the trend's candles fall."""
    out, price, t = [], start, 0
    for _ in range(up_candles):
        out.append(body(price, price + step, tf="H1", t=t)); price += step; t += 1
    for _ in range(down_candles):
        out.append(body(price, price - step, tf="H1", t=t)); price -= step; t += 1
    return out


s.check("a downtrend after a 6-candle pullback: the first candle is refused",
        wait_after_pullback(down_market(6, 1), -1) is not None, True)
s.check("...and the third may trade", wait_after_pullback(down_market(6, 3), -1), None)
s.check("a long pullback in the WRONG direction is not this rule's business",
        wait_after_pullback(down_market(6, 1), 1), None)

s.check("no pullback in the window at all — nothing to wait for",
        wait_after_pullback(market(0, 5), 1), None)
s.check("no direction — the rule stays silent", wait_after_pullback(market(5, 1), 0), None)
s.check("an empty window is not a refusal", wait_after_pullback([], 1), None)

s.teeth("the wait", wait_after_pullback(market(5, 1), 1) is not None
                    and wait_after_pullback(market(5, 3), 1) is None)

s.done()
