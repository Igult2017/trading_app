"""VIX.1 — WHEN MAY A MOMENTUM CANDLE TRADE? One rule, three branches, all his.

HIS WORDS:

    "after the pullback, we take trade from the 3rd candle and above if it is the momentum candle. We no
     longer take trade from the first candle (if its a momentum candle) after pullback unless the
     pullback was made of 1-3 candles. I realized most of first momentum candles after pullback are
     never successful when the pullback itself was a long word that took more than 3 candles down."

So a pullback of ONE TO THREE candles is untouched — its first momentum candle still trades.

⚠ A 3 -> 2 CHANGE TO THIS BRANCH WAS BUILT AND REVERTED ON 2026-10-04. He asked for it, and the
premise it rested on was mine and was wrong: the pullback he described turned out to be the RANGE BAND
refusing (`vix1_chop`), not this branch at all. He read the measurement and said revert. The rule below
is unchanged. See the note above the constants in `vix1_retracement.py` before re-opening it.

AND THE THIRD BRANCH, added 2026-09-29 in his words:

    "in a breakout, after the price has come out of the band, we count the first 2 candles and fire
     signal when the 3rd candle closes if it is a momentum candle and we haven't had a pullback yet."
    "in a CHOCH, we wait for a pullback to take a trade but the band issue has proven to us that
     sometimes price can move for a very long time without a pullback. so that 3 candle rule also
     applies in a CHOCH scenario if we have not had a pullback."

THE BREAK CANDLE IS CANDLE 1 — his ruling when asked directly. So with nothing pulled back, the third
candle counting the break as the first is the earliest that may trade.

Counted by `vix1_retracement`, which owns the pullback count, so the strategy has ONE timing rule
rather than two that can disagree.
"""
from _harness import Suite, body

from strategies.vix1_retracement import (
    _BREAK_CANDLES, _SHORT_PULLBACK, _WAIT_CANDLES, entry_timing, since_pullback,
)

s = Suite("VIX.1 — the wait after a long pullback")

s.check("a short pullback is up to 3 candles (his number)", _SHORT_PULLBACK, 3)
s.check("and the trade then comes from the 3rd candle on (his number)", _WAIT_CANDLES, 3)
s.check("with NO pullback the trade comes from the 3rd candle after the break (his number, unchanged)",
        _BREAK_CANDLES, 3)


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
s.check("...and it may trade, because the pullback was short", entry_timing(market(2, 1), 1), None)

s.check("a 3-candle pullback is still short — the first candle trades",
        entry_timing(market(3, 1), 1), None)

_five = entry_timing(market(5, 1), 1)
s.check("a 5-candle pullback, first candle after it — REFUSED", _five is not None, True)
s.check("...and the refusal says what it is waiting for",
        _five is not None and "5 candles" in _five and "only candle 1" in _five, True)
# 2026-10-04: a 3 -> 2 change was built here and REVERTED the same day — the case it was asked for
# turned out to be the range band, not this branch. The second candle is refused again.
s.check("...the second candle is still refused", entry_timing(market(5, 2), 1) is not None, True)
s.check("...and the THIRD candle may trade", entry_timing(market(5, 3), 1), None)
s.check("...as may the fourth", entry_timing(market(5, 4), 1), None)

# TEETH — the number is the whole rule, so the test has to be able to tell 2 from 3. If this ever reads
# None, the first candle after a long pullback has started trading and his 16 Sep finding has been lost.
s.teeth("the FIRST candle after a long pullback is still refused",
        entry_timing(market(5, 1), 1) is not None)

# AND THE REFUSAL MUST READ CORRECTLY. The text used to glue "rd" on by hand, so the moment his number
# moved off 3 it printed "2rd" — and this string is what HE reads when a trade is refused.
_one = entry_timing(market(5, 1), 1)
# THE ORDINAL FIX IS KEPT. The text used to glue "rd" on by hand and printed "2rd" the moment the
# number moved — a real bug in what HE reads, independent of which number wins.
s.check("the refusal builds a real ordinal, so it can never print '2rd' or '1rd'",
        _one is not None and "3rd candle on" in _one, True)

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
        entry_timing(down_market(6, 1), -1) is not None, True)
s.check("...and the third may trade", entry_timing(down_market(6, 3), -1), None)
s.check("a long pullback in the WRONG direction is not this rule's business",
        entry_timing(down_market(6, 1), 1), None)

s.check("no pullback in the window at all — nothing to wait for",
        entry_timing(market(0, 5), 1), None)
s.check("no direction — the rule stays silent", entry_timing(market(5, 1), 0), None)
s.check("an empty window is not a refusal", entry_timing([], 1), None)

s.teeth("the wait", entry_timing(market(5, 1), 1) is not None
                    and entry_timing(market(5, 3), 1) is None)

print()
print("   THE BREAKOUT BRANCH (2026-09-29) — no pullback yet, so count from the break:")


def run_only(n, start=1.1000, step=0.0010):
    """`n` rising candles and nothing against them — a move that has not pulled back at all."""
    out, price, t = [], start, 0
    for _ in range(n):
        out.append(body(price, price + step, tf="H1", t=t)); price += step; t += 1
    return out


# THE BREAK CANDLE IS CANDLE 1 — his ruling, asked directly on 2026-09-29. So a two-candle-old break
# is still candle 2 and must wait; the third may go.
_b = run_only(1)
s.check("the break candle itself is candle 1 — refused",
        entry_timing(_b, 1, break_time=_b[0].time) is not None, True)
s.check("  ...and the refusal counts in candles, not price",
        "1 candle ago" in (entry_timing(_b, 1, break_time=_b[0].time) or ""), True)
_b2 = run_only(2)
s.check("candle 2 is still refused", entry_timing(_b2, 1, break_time=_b2[0].time) is not None, True)
_b3 = run_only(3)
s.check("candle 3 MAY TRADE — his 3-candle rule", entry_timing(_b3, 1, break_time=_b3[0].time), None)
_b6 = run_only(6)
s.check("...and so may later ones while nothing pulls back",
        entry_timing(_b6, 1, break_time=_b6[0].time), None)

# ...AND THE MOMENT SOMETHING PULLS BACK, THE PULLBACK BRANCHES OWN IT AGAIN — his Q2 answer,
# 2026-09-29: "the moment a pullback starts the pullback rules take over".
_pb = run_only(2) + [body(1.1020, 1.1010, tf="H1", t=2)] + [body(1.1010, 1.1020, tf="H1", t=3)]
s.check("a 1-candle pullback inside the window hands over to the short-pullback rule",
        entry_timing(_pb, 1, break_time=_pb[0].time), None)

# A BREAK THAT IS NOT IN THIS WINDOW CANNOT BE COUNTED FROM. Guessing where it fell would be worse
# than not applying the branch, so it degrades to the pullback branches alone rather than refusing.
s.check("a break time that is not in the window is not a refusal",
        entry_timing(run_only(1), 1, break_time=999999999), None)
s.check("no break time at all leaves today's behaviour",
        entry_timing(run_only(1), 1), None)

s.teeth("the breakout count — candle 2 and candle 3 give opposite answers",
        entry_timing(_b2, 1, break_time=_b2[0].time) is not None
        and entry_timing(_b3, 1, break_time=_b3[0].time) is None)

s.done()
