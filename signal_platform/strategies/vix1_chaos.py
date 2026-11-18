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

WHAT IS MEASURED — TWO tests since 17 Nov 2026 (either one = chaotic). FIRST, read off the 12 candles BEFORE the momentum candle, never itself:
  HOW FAR PRICE GOT ÷ HOW FAR PRICE ACTUALLY TRAVELLED inside those candles, WICKS INCLUDED. His words, same day:
  *"test one is enough… Let it look at the whole candle anatomy to get the story in a move"* — *"wicks tell a
  story of the fight between buyers and sellers."* Inside one candle price went open -> one extreme -> the other
  -> close; the order is unknown, so the SHORTER of the two routes is counted (never credits a fight that may not
  have happened). Candles that stack one after another get far; up-down candles and long wicks travel a lot and
  get nowhere. CHAOTIC = under CHAOS_MAX (7.75%).
  (Until 17 Nov this read bodies only (< 30%), AND a second test — "give-back": the share of big candles half
  undone within 3 candles — had to agree. He dropped the second test after today's GBP/JPY 11:00 EAT SELL got
  through on it alone.)
  PLUS, later on 17 Nov — WHO IS IN CONTROL, candle by candle (`push_and_pull`). His words: *"we need what each
  candle mean and if what each tells is pull and push we dont take a trade"*; then *"Combine and deploy"*. Each of
  the 12 candles is read as buyers/sellers TOOK CONTROL (body over half the candle AND bigger than the median body
  of the 24 before — his "if compared to the candles around it, it has to be big"), A FIGHT PUSHED BACK (a wick at
  least twice the body — his "yes twice the body", book p.39), or NOBODY MOVED IT. Push-and-pull unless one side
  took control at least 3 times and twice as often as the other, AND someone took control in the last 5 (his
  "immediate previous move… the past 5 candles"). CHAOTIC = EITHER test says so.
  Compared before combining (counts only): his 18 marked candles — agree on 17; the 18th, his D42 chop example
  EUR/USD 5 Aug 14:00 UTC, only the push/pull reader catches (whole-candle 8.23%). 300 random trending moments:
  agree on 197; combined, 188 are held back (whole-candle alone 114).

HOW THE LINE WAS CHOSEN, 17 Nov 2026 — his own marked candles, real broker H1, counts only (not a backtest):
  * picture 2 (keep): 1.8, 22.3, 27.5, 15.8, 16.3, 8.1%     picture 1 (avoid): 0.2, 1.8, 3.1, 4.0, 4.0, 6.8, 7.4%
    EUR/USD 17 Nov 08:00 EAT 0.2%; GBP/JPY 17 Nov 11:00 EAT 4.8% (by hand: 16.3 pips got / 339.9 travelled).
  * 7.75% is halfway between his least-clean chaotic candle (7.4) and his least-clean keep candle (8.1). ⚠ That
    gap is NARROW. Thu 5 Nov 21:00 (first of picture 2) reads chaotic — its 12 candles swing +8.6/-26.2/+9.8/
    -17.6 pips; accepted with "test one is enough". Wed 11 Nov 16:00, the drop INTO the chaos, is still missed
    (16.0%): the 12 candles before it really were a clean fall, so no look-back sees it.
  * Over 7 years it holds back 44-48% of momentum candles (GBP/USD, EUR/USD, GBP/JPY); after those, the next
    candle is a momentum candle ~5% of the time and the one after ~6-7%.

⚠ IT DECIDES NOTHING SINCE 18 NOV 2026 — his order: *"it is blocking change of character and break of structure
signals. Remove it there."* (It refused the GBP/JPY 11:00 EAT break-of-structure SELL that day.) No trade decision
asks it; the DM momentum announcement only DESCRIBES every candle with it via `verdict()` (CLEAN / CHAOTIC).
`test_chaos.py` fails if any other file reads this module.
"""
from __future__ import annotations

import statistics

from core.types import Candle
from strategies.vix1_momentum import qualifies_for_trade

CLEAN_LOOK = 12          # candles read
CHAOS_MAX = 0.0775       # under this share of the distance travelled = a tug-of-war
USUAL_LOOK = 24          # "big next to the candles around it": median body of the 24 before
NEED_PUSHES = 3          # one side must take control at least this many times...
PUSH_RATIO = 2           # ...and at least twice as often as the other side
RECENT = 5               # his "immediate previous move": someone must push in the last 5
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


def _read(c: Candle, med: float) -> str:
    """What one candle says (his 17 Nov rules; Candlestick Trading Bible p.16, p.39):
    'B'/'S' buyers/sellers took control (body over half the candle AND bigger than the usual body around it),
    'r' a fight pushed back (a wick at least twice the body), '.' nobody moved it."""
    body = abs(c.close - c.open)
    rng = c.high - c.low
    if rng <= 0:
        return "."
    if max(c.high - max(c.open, c.close), min(c.open, c.close) - c.low) >= 2 * body:
        return "r"
    if body > 0.5 * rng and body > med:
        return "B" if c.close > c.open else "S"
    return "."


def story(h1: list[Candle], i: int) -> str | None:
    """The CLEAN_LOOK candles before `i`, oldest first, one letter each. 'Usual body' = the median body of the
    USUAL_LOOK candles before `i` (closed candles only). None if too little history."""
    if i < USUAL_LOOK:
        return None
    med = statistics.median(abs(c.close - c.open) for c in h1[i - USUAL_LOOK:i])
    return "".join(_read(c, med) for c in h1[i - CLEAN_LOOK:i])


def push_and_pull(h1: list[Candle], i: int) -> bool:
    """True = nobody controls the move: no side made at least NEED_PUSHES pushes and PUSH_RATIO x the other
    side's, or nobody pushed in the last RECENT candles (his 'immediate previous move')."""
    s = story(h1, i)
    if s is None:
        return False
    hi, lo = max(s.count("B"), s.count("S")), min(s.count("B"), s.count("S"))
    controlled = hi >= NEED_PUSHES and hi >= PUSH_RATIO * lo
    return not controlled or not any(ch in "BS" for ch in s[-RECENT:])


def is_chaotic(h1: list[Candle], i: int) -> bool:
    """EITHER test says tug-of-war (his 'Combine', 17 Nov 2026)."""
    ct = clean_travel(h1, i)
    return (ct is not None and ct < CHAOS_MAX) or push_and_pull(h1, i)


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
    # ONE SHORT LINE — his asks, 17 Nov: *"make it clear …"*, *"make the card less wordy but more clearer"*. Since
    # 18 Nov it is INFORMATION ONLY (his order: no trade is blocked by it), and the card says so.
    if not is_chaotic(h1, i):
        return "CLEAN MOVE", "✅ Clean move before it."
    if is_second_or_third(h1, i, bullish, symbol):
        return "CHAOTIC · 2ND/3RD CANDLE", "ℹ️ Chaotic market, and this is the 2nd/3rd momentum candle."
    return ("CHAOTIC MOVE (INFO ONLY)",
            f"ℹ️ Chaotic market — {_why(h1, i)}. Info only — trades not blocked.")


def _why(h1: list[Candle], i: int) -> str:
    """Which test called it chaotic, in plain words — one or both; short enough for the card's 120-character line."""
    ct, s = clean_travel(h1, i), story(h1, i)
    parts = []
    if ct is not None and ct < CHAOS_MAX:
        parts.append(f"{ct:.1%} progress")
    if push_and_pull(h1, i):
        parts.append(f"nobody in control (buyers {s.count('B')}, sellers {s.count('S')})")
    return ", ".join(parts)


