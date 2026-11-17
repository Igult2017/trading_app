"""VIX.1 — THE CHAOTIC-MOVE CHECK: in a tug-of-war market, a momentum candle waits for the 2nd or 3rd.

HIS RULE, 17 Nov 2026, in his words:
    "A market that is trending with no volume is costing me money."
    "Whenever a momentum candle has qualified, it runs one last test which looks back to see the candles
     that dominated that move. If they are not aligned like in image 2 which shows directional and
     intentional candles, we wait for the second momentum candle to take a trade."
    "Tag of war is shown when in a move one candle is big, the next one is small, the one is bullish, the
     next one is bearish, the next one has a wick that shows the struggle to the opposite side and once in
     a while we have one volume candle that we can't predict will be followed by another one."
    "The test is about how to stop trading in such markets because they aint profitable."
His picture 1 (GBP/USD 11-17 Nov 2026) is the market to avoid; picture 2 (5-10 Nov) is the one to keep.

WHAT IS MEASURED — both read off the candles BEFORE the momentum candle, never the candle itself:
  1. CLEAN TRAVEL over the last 12 candles: how far price got, divided by how far all the candle bodies
     travelled added together. Bodies that stack one after another (his picture 2) get far; bodies that
     cancel out — big then small, up then down — get almost nowhere.
  2. GIVE-BACK over the last 24 candles: of the BIG candles (body over twice the stretch's median body),
     the share that was half given back within the next 3 candles — his "one volume candle that we can't
     predict will be followed by another one".
CHAOTIC = clean travel under 30% AND at least a third of the big candles given back.

HOW THE NUMBERS WERE CHOSEN, 17 Nov 2026, on real GBP/USD H1 and the strategy's own `qualifies_for_trade`
(counts only — nothing simulated, nothing scored, not a backtest):
  * His 14 momentum candles: 13 right. All 6 in picture 2 read CLEAN. 7 of 8 in picture 1 read CHAOTIC; the
    miss is Wed 11 Nov 16:00 (UTC+3), the drop INTO the chaos straight after a clean fall — the 12 candles
    before it really were clean, so no look-back can see the chaos coming.
  * In his chaotic move the next candle was a momentum candle 0 of 8 times, the one after 0 of 8. In the 7
    years' moves that most resemble it, 4.1-4.7% and 3.5-7.7%. So waiting = almost always no trade there.
  * Over 7 years it reads 37% of momentum candles as CHAOTIC; after those, the next candle is a momentum
    candle 4.2% of the time and the one after 6.1%.

⚠ IT DECIDES, SINCE 17 NOV 2026 — his words: "Just switch it on already. I am losing money."
`refusal()` is asked in `vix1_bias.detect_bias`'s MAIN (trend) refusal list only. The change-of-character
route is EXEMPT — his option A, same day: *"Lets do A and see how it goes."* Asked there it refused his own
marked trade (EUR/USD 28 Jul 17:00 BUY); a turn is the end of a trend, and the candles before a turn always
stall. The DM announcement still DESCRIBES every candle via `verdict()`.
`test_chaos.py` fails if any other file reads this module.
"""
from __future__ import annotations

import statistics as st

from core.types import Candle
from strategies.vix1_momentum import qualifies_for_trade

CLEAN_LOOK = 12          # candles read for clean travel
CLEAN_MAX = 0.30         # under this share = the bodies cancelled out
GIVE_LOOK = 24           # candles read for give-back
BIG_MULT = 2.0           # a BIG candle: body over 2x the stretch's median body
GIVE_WITHIN = 3          # ... half given back within this many candles
GIVE_MIN = 1 / 3         # at least this share of the big candles given back
MIN_BIG = 2              # fewer big candles than this = nothing to judge give-back by
WAIT_CANDLES = 2         # the trade may come from the 2nd or 3rd candle: look this many back


def _body(c: Candle) -> float:
    return abs(c.close - c.open)


def clean_travel(h1: list[Candle], i: int) -> float | None:
    """Over the CLEAN_LOOK candles before `i`: |net move| / sum of bodies. None if too little history."""
    if i < CLEAN_LOOK:
        return None
    seg = h1[i - CLEAN_LOOK:i]
    bodies = sum(_body(c) for c in seg)
    return abs(seg[-1].close - seg[0].open) / bodies if bodies > 0 else None


def give_back(h1: list[Candle], i: int) -> tuple[float, int] | None:
    """Over the GIVE_LOOK candles before `i`: (share of big candles half given back, how many big)."""
    if i < GIVE_LOOK:
        return None
    a = i - GIVE_LOOK
    med = st.median(_body(c) for c in h1[a:i])
    if med <= 0:
        return None
    # a big candle needs GIVE_WITHIN candles after it, all strictly before `i` (never the candle judged)
    big = [k for k in range(a, i - GIVE_WITHIN) if _body(h1[k]) > BIG_MULT * med]
    if not big:
        return 0.0, 0
    gave = 0
    for k in big:
        c = h1[k]
        half = (c.open + c.close) / 2
        up = c.close > c.open
        if any((x.close < half) if up else (x.close > half) for x in h1[k + 1:k + 1 + GIVE_WITHIN]):
            gave += 1
    return gave / len(big), len(big)


def is_chaotic(h1: list[Candle], i: int) -> bool:
    ct, gb = clean_travel(h1, i), give_back(h1, i)
    return ct is not None and gb is not None and ct < CLEAN_MAX and gb[1] >= MIN_BIG and gb[0] >= GIVE_MIN


def is_second_or_third(h1: list[Candle], i: int, bullish: bool, symbol: str) -> bool:
    """Was one of the WAIT_CANDLES candles before `i` itself a qualifying momentum candle the same way?
    Each is asked on the bars up to and including it — never with sight of what came after."""
    return any(j >= 1 and qualifies_for_trade(h1[:j + 1], j, bullish, symbol)
               for j in range(i - WAIT_CANDLES, i))


def verdict(h1: list[Candle], i: int, bullish: bool, symbol: str) -> tuple[str, str]:
    """(short tag for line 2 of the DM card, full sentence for its details)."""
    ct, gb = clean_travel(h1, i), give_back(h1, i)
    if ct is None or gb is None:
        return "CHAOS CHECK: NOT JUDGED", "➖ Chaotic market — not judged (too little history)."
    # ONE SHORT LINE, ✅ / ❌ FIRST — his asks, 17 Nov: *"make it clear so that i can easily understand if a
    # signal has passed it or not"*, then *"make the card less wordy but more clearer"*. The full numbers are
    # in `refusal()`, which the server log records.
    if not is_chaotic(h1, i):
        return "CLEAN MOVE", "✅ Clean move before it."
    if is_second_or_third(h1, i, bullish, symbol):
        return "CHAOTIC · 2ND/3RD CANDLE", "✅ Chaotic market, but this is the 2nd/3rd momentum candle."
    return ("CHAOTIC MOVE · WAIT FOR 2ND/3RD",
            f"❌ Chaotic market — tug-of-war before it (clean travel {ct:.0%}). "
            f"No trade unless one of the next 2 candles is momentum too.")


def refusal(h1: list[Candle], bullish: bool, symbol: str) -> str | None:
    """THE GATE (switched on 17 Nov 2026 — *"Just switch it on already. I am losing money."*).
    Asked about the NEWEST closed candle — the one the trend route in `vix1_bias.detect_bias` trades.
    -> why it is refused, or None (clean move, too little history, or it IS the 2nd/3rd candle)."""
    i = len(h1) - 1
    if i < 1 or not is_chaotic(h1, i) or is_second_or_third(h1, i, bullish, symbol):
        return None
    ct, gb = clean_travel(h1, i), give_back(h1, i)
    return (f"chaotic move — tug-of-war candles before this momentum candle (clean travel {ct:.0%} over "
            f"{CLEAN_LOOK}; {gb[0]:.0%} of {gb[1]} big candles given back in {GIVE_LOOK}); waiting for the "
            f"next or the one after to be a momentum candle too")
