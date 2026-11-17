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

WHAT IS MEASURED — ONE test since 17 Nov 2026, read off the 12 candles BEFORE the momentum candle, never itself:
  HOW FAR PRICE GOT ÷ HOW FAR PRICE ACTUALLY TRAVELLED inside those candles, WICKS INCLUDED. His words, same day:
  *"test one is enough… Let it look at the whole candle anatomy to get the story in a move"* — *"wicks tell a
  story of the fight between buyers and sellers."* Inside one candle price went open -> one extreme -> the other
  -> close; the order is unknown, so the SHORTER of the two routes is counted (never credits a fight that may not
  have happened). Candles that stack one after another get far; up-down candles and long wicks travel a lot and
  get nowhere. CHAOTIC = under CHAOS_MAX (7.75%).
  (Until 17 Nov this read bodies only (< 30%), AND a second test — "give-back": the share of big candles half
  undone within 3 candles — had to agree. He dropped the second test after today's GBP/JPY 11:00 EAT SELL got
  through on it alone.)

HOW THE LINE WAS CHOSEN, 17 Nov 2026 — his own marked candles, real broker H1, counts only (not a backtest):
  * picture 2 (keep): 1.8, 22.3, 27.5, 15.8, 16.3, 8.1%     picture 1 (avoid): 0.2, 1.8, 3.1, 4.0, 4.0, 6.8, 7.4%
    EUR/USD 17 Nov 08:00 EAT 0.2%; GBP/JPY 17 Nov 11:00 EAT 4.8% (by hand: 16.3 pips got / 339.9 travelled).
  * 7.75% is halfway between his least-clean chaotic candle (7.4) and his least-clean keep candle (8.1). ⚠ That
    gap is NARROW. Thu 5 Nov 21:00 (first of picture 2) reads chaotic — its 12 candles swing +8.6/-26.2/+9.8/
    -17.6 pips; accepted with "test one is enough". Wed 11 Nov 16:00, the drop INTO the chaos, is still missed
    (16.0%): the 12 candles before it really were a clean fall, so no look-back sees it.
  * Over 7 years it holds back 44-48% of momentum candles (GBP/USD, EUR/USD, GBP/JPY); after those, the next
    candle is a momentum candle ~5% of the time and the one after ~6-7%.

⚠ IT DECIDES, SINCE 17 NOV 2026 — his words: "Just switch it on already. I am losing money."
`refusal()` is asked in `vix1_bias.detect_bias`'s MAIN (trend) refusal list only. The change-of-character
route is EXEMPT — his option A, same day: *"Lets do A and see how it goes."* Asked there it refused his own
marked trade (EUR/USD 28 Jul 17:00 BUY); a turn is the end of a trend, and the candles before a turn always
stall. The DM announcement still DESCRIBES every candle via `verdict()`.
`test_chaos.py` fails if any other file reads this module.
"""
from __future__ import annotations

from core.types import Candle
from strategies.vix1_momentum import qualifies_for_trade

CLEAN_LOOK = 12          # candles read
CHAOS_MAX = 0.0775       # under this share of the distance travelled = a tug-of-war
WAIT_CANDLES = 2         # the trade may come from the 2nd or 3rd candle: look this many back


def _travelled(c: Candle) -> float:
    """The least distance price can have covered inside `c`: open -> one extreme -> the other -> close."""
    return (c.high - c.low) + min(abs(c.open - c.low) + abs(c.high - c.close),
                                  abs(c.high - c.open) + abs(c.close - c.low))


def clean_travel(h1: list[Candle], i: int) -> float | None:
    """Over the CLEAN_LOOK candles before `i`: |net move| / distance travelled, wicks included.
    None if too little history."""
    if i < CLEAN_LOOK:
        return None
    seg = h1[i - CLEAN_LOOK:i]
    went = sum(_travelled(c) for c in seg)
    return abs(seg[-1].close - seg[0].open) / went if went > 0 else None


def is_chaotic(h1: list[Candle], i: int) -> bool:
    ct = clean_travel(h1, i)
    return ct is not None and ct < CHAOS_MAX


def is_second_or_third(h1: list[Candle], i: int, bullish: bool, symbol: str) -> bool:
    """Was one of the WAIT_CANDLES candles before `i` itself a qualifying momentum candle the same way?
    Each is asked on the bars up to and including it — never with sight of what came after."""
    return any(j >= 1 and qualifies_for_trade(h1[:j + 1], j, bullish, symbol)
               for j in range(i - WAIT_CANDLES, i))


def verdict(h1: list[Candle], i: int, bullish: bool, symbol: str) -> tuple[str, str]:
    """(short tag for line 2 of the DM card, full sentence for its details)."""
    ct = clean_travel(h1, i)
    if ct is None:
        return "CHAOS CHECK: NOT JUDGED", "➖ Chaotic market — not judged (too little history)."
    # ONE SHORT LINE, ✅ / ❌ FIRST — his asks, 17 Nov: *"make it clear so that i can easily understand if a
    # signal has passed it or not"*, then *"make the card less wordy but more clearer"*. The full numbers are
    # in `refusal()`, which the server log records.
    if not is_chaotic(h1, i):
        return "CLEAN MOVE", "✅ Clean move before it."
    if is_second_or_third(h1, i, bullish, symbol):
        return "CHAOTIC · 2ND/3RD CANDLE", "✅ Chaotic market, but this is the 2nd/3rd momentum candle."
    return ("CHAOTIC MOVE · WAIT FOR 2ND/3RD",
            f"❌ Chaotic market — tug-of-war before it ({ct:.1%} progress). "
            f"No trade unless one of the next 2 candles is momentum too.")


def refusal(h1: list[Candle], bullish: bool, symbol: str) -> str | None:
    """THE GATE (switched on 17 Nov 2026 — *"Just switch it on already. I am losing money."*).
    Asked about the NEWEST closed candle — the one the trend route in `vix1_bias.detect_bias` trades.
    -> why it is refused, or None (clean move, too little history, or it IS the 2nd/3rd candle)."""
    i = len(h1) - 1
    if i < 1 or not is_chaotic(h1, i) or is_second_or_third(h1, i, bullish, symbol):
        return None
    ct = clean_travel(h1, i)
    return (f"chaotic move — tug-of-war candles before this momentum candle (price got {ct:.1%} of the distance "
            f"it travelled over {CLEAN_LOOK} candles, wicks included; chaotic under {CHAOS_MAX:.2%}); waiting for "
            f"the next or the one after to be a momentum candle too")
