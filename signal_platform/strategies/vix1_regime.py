"""
VIX.1 — THE REGIME ENGINE: is this a TREND, a RANGE, or CHOP?

HIS RULE, and it is a test of DIRECTION, not of size (2026-09-04):

    "A trend should be detected by swings... until we confirm a CHOCH, we are in a trend."
    "a ranging market does not make HH and HL or LL and LH. We don't need ATR for this; we just
     need the code."

    higher high AND higher low   -> TREND
    lower  high AND lower  low   -> TREND
    otherwise                    -> not tradeable

ATR NO LONGER DECIDES ANYTHING HERE. It survives only to NAME a refusal — "range" when both extremes
sit within 0.75x ATR of each other, "chop" when they are scattered wider. Both refuse, so the name
changes no outcome. That is what makes this a genuine disable rather than a re-tuning.

WHY THE SIZE BAR WENT (`_PROGRESS_ATR`, kept below and no longer consulted — see the note there).
It demanded that BOTH sides also move at least 0.50x ATR, which his rule does not ask for. On his
disputed EUR/USD chart the highs fell 0.26x ATR and the lows 2.68x ATR — lower highs and lower lows,
a downtrend by his rule — and this file called it CHOP because the highs edged down slowly. His
words: *"we can't say a trending volatile market is choppy."*

WHY IT MATTERED SO MUCH. This engine keeps only the LAST TWO highs and LAST TWO lows. In a strong
trend with small swings inside it, those two are the small swings — so a size bar applied to them is
a test of the noise, not of the trend. `vix1_trend` reads the SAME turning points
(`vix1_bias.py:151-152` computes them once and passes them to both) but replays ALL of them through
establish / break / change-of-character, which is why it correctly saw the trend this engine missed.

MEASURED before the change, 4 years of real cTrader H1, both pairs, through production's own call
path: 2,123 setups, 1,091 refused (51.4%) -> 628 (29.6%). 463 recovered, 0 newly refused. Of the
old refusals 57.0% had the highs and lows moving in OPPOSITE directions — not a trend by his rule
either — and those still refuse.

WHY EFFICIENCY IS NOT IN THE DECISION EITHER. Measured over 12 months the distribution had NO
natural break to cut at, and any cut deleted a quarter to half of all setups. His reasoning is the
general form — *"a perfectly respectable range can have extremely low efficiency, while a messy
transition can also have low efficiency. It doesn't tell us the structure."* `efficiency()` survives
as a REPORTED number on the card; it decides nothing.

TWO HIGHS AND TWO LOWS is what a verdict needs, and that count is deliberately NOT tuned — his call:
*"I would not hard-code yet the number of swings required... test the detector against actual chart
data before changing that."*
"""
from dataclasses import dataclass

from core.types import Candle

# ~One trading day of H1. Only `efficiency` uses it; it is not part of any verdict.
_WINDOW = 20

# ─────────────────────────────────────────────────────────────────────────────────────────────────
# DISABLED 2026-09-04 ON HIS INSTRUCTION — KEPT DELIBERATELY, DO NOT DELETE.
#
#     "we should just disable ATR for now and document why we did then lets see how things go
#      before we decide on whether to delete it or not"
#
# THIS OVERRIDES THE STANDING "DELETE DEAD CODE" RULE, and that is his call, not an oversight. It is
# unreferenced by `classify` on purpose: he wants the option to put it back after watching live
# results, and deleting it would destroy that option while looking like tidying up.
#
# It used to require that BOTH the last two highs and the last two lows moved by at least this much
# before the market counted as trending. `test_regime.py` asserts it is NOT consulted, so switching
# it back on has to be a deliberate act rather than a drift.
_PROGRESS_ATR = 0.50     # DISABLED — see above. Not read by any decision.
# ─────────────────────────────────────────────────────────────────────────────────────────────────

_BOUNDARY_ATR = 0.75     # two extremes this close count as the same ceiling / floor — NAMING ONLY:
                         # it separates "range" from "chop", and both of those refuse.

# A COMPARISON ON FLOATS NEEDS A TOLERANCE, and this codebase has been bitten before: his own
# 11.3-pip momentum candle computes as 11.30000000000075, so `vix1_momentum` carries the same guard.
# Here 1.1000 + 0.75 * 0.0010 subtracts back to 0.0007500000000000284 and a boundary that should hold
# reads as broken. A tenth of a millionth of a pip — far below any price the feed can send.
_EPS = 1e-9

TREND, RANGE, CHOP, UNCERTAIN = "trend", "range", "chop", "uncertain"


@dataclass(frozen=True)
class Regime:
    """What kind of market this is, and why — the card records the verdict, not just 'stand aside'."""
    kind: str = UNCERTAIN
    why: str = ""

    @property
    def tradeable(self) -> bool:
        """Only a trend is. A range and chop both mean the same thing to a trend strategy."""
        return self.kind == TREND


def classify(turns, atr_value: float) -> Regime:
    """Read the last two confirmed highs and lows and name the regime.

    `turns` — confirmed turning points from `vix1_swings`, oldest first. `atr_value` in PRICE.
    Never raises; returns UNCERTAIN when there is not enough structure or no volatility to scale by.
    """
    highs = [t for t in turns if t.is_high][-2:]
    lows = [t for t in turns if not t.is_high][-2:]
    if len(highs) < 2 or len(lows) < 2:
        return Regime(why="not enough confirmed swings yet — need two highs and two lows")

    dh = highs[-1].price - highs[-2].price
    dl = lows[-1].price - lows[-2].price

    # 1. DIRECTION, AND ONLY DIRECTION. His rule: "a ranging market does not make HH and HL or LL
    #    and LH." Both sides must move TOGETHER — a higher high with a lower low is price broadening
    #    out, not a trend. There is deliberately NO size test here: how big the move is, is the
    #    momentum candle's question, and that is asked separately (and without ATR) in
    #    `vix1_momentum`. Asking it twice is what refused his trending market as chop.
    if dh > 0 and dl > 0:
        return Regime(TREND, "higher high and higher low — the trend is progressing")
    if dh < 0 and dl < 0:
        return Regime(TREND, "lower high and lower low — the trend is progressing")

    # 2. THE HIGHS AND LOWS DISAGREE, so this is not a trend by his rule. The only thing left is to
    #    NAME it for the card — bounded (a range) or not (chop). BOTH REFUSE, so this choice cannot
    #    change an outcome; it only makes the refusal readable.
    #
    # THE VOLATILITY CHECK LIVES HERE, NOT AT THE TOP OF THE FUNCTION, and that placement is the
    # point. Above, it meant a missing ATR reading REFUSED a market whose highs and lows were plainly
    # stepping the same way — i.e. ATR could still veto a trend, which is exactly what he ruled out.
    # Below, it can only affect the NAME of a refusal that has already been decided by direction.
    if atr_value <= 0:
        return Regime(CHOP, "the highs and lows disagree, and there is no volatility reading yet "
                            "to say whether they are bounded")
    # THE REFUSAL IS ALREADY DECIDED — ONLY THE NAME IS BEING CHOSEN, AND THE WORDING MUST SAY SO.
    #
    # This text used to lead with "scattered wider than 0.75x ATR", which reads as though an ATR
    # test had refused the trade. It had not: the refusal happened above, purely on the highs and
    # lows moving in opposite directions, and ATR only picks between the words "range" and "chop".
    # On 2026-09-07 that wording sent him — and me — hunting an ATR veto he had explicitly disabled
    # three days earlier. A message naming a threshold that decided nothing is a trap, so the fact
    # goes first and the label second.
    way = lambda d: "up" if d > 0 else "down"
    disagree = f"the highs are moving {way(dh)} and the lows {way(dl)}"
    bound = _BOUNDARY_ATR * atr_value
    hs, ls = abs(dh), abs(dl)
    if hs <= bound + _EPS and ls <= bound + _EPS:
        return Regime(RANGE, f"not a trend — {disagree}, so there is no structural progress; "
                             f"both are inside {_BOUNDARY_ATR:.2f}x ATR, which is what makes it a "
                             f"bounded range rather than chop")
    return Regime(CHOP, f"not a trend — {disagree}, so there is no structural progress; "
                        f"{'both are' if hs > bound and ls > bound else 'the ' + ('highs are' if hs > bound else 'lows are')} "
                        f"further apart than {_BOUNDARY_ATR:.2f}x ATR, which is what names it chop "
                        f"rather than a range")


def market_permits(regime) -> str | None:
    """Is the market in a state worth trading? The refusal reason, or None to allow.

    ONE QUESTION: only a TREND is tradeable. A range and chop mean the same thing to a trend
    strategy, but they are named separately because they ARE different — his diagram lists both and
    his two charts show why: a range respects its ceiling and floor, chop stabs through them.

    MOVED HERE FROM `vix1_structure` ON 2026-09-07 — a pure move, not a rewrite. It reads a `Regime`
    and wraps `Regime.tradeable`, so it belongs beside them; `vix1_structure` owns the PULLBACK
    question and nothing else. His instruction: *"make sure a question is only answered by one
    module so that if something goes wrong we know where to go."*

    ⚠ THIS GATE IS LOAD-BEARING — MEASURED, so nobody removes it as "a duplicate". It refuses a
    trend that `vix1_trend` accepts 37.2% of the time, and of those refusals only 24% (EUR/USD) /
    33% (GBP/USD) are also refused by another gate. Removing it would newly allow **~21% of all
    setups on both pairs** (222 of 1,059 and 237 of 1,100, real bars, 2022-2026). Whether those are
    good trades is UNKNOWN and answering it is a backtest — his call.

    ⚠ AND IT IS ONE OF TWO ANSWERS TO "IS THERE A TREND", which is the open design question, not a
    tidy-up: `vix1_trend` replays every swing through break-of-structure and change-of-character,
    while `classify` above keeps only the last two highs and lows. After a change of character the
    lows turn first and the highs are the last to turn, so this refuses exactly the setups he wants.
    See `docs/strategies/vix1-architecture.md`, "ONE QUESTION, ONE MODULE".
    """
    if regime is None or regime.tradeable:
        return None
    return f"the market is not trending — {regime.kind.upper()}: {regime.why}"


def efficiency(candles: list[Candle], n: int = _WINDOW) -> float | None:
    """How efficiently price travelled over the last `n` CLOSED bars: net move / distance walked.

    REPORTED, NEVER DECIDED ON (2026-08-12). It was the first range detector and it was the wrong
    instrument — the measured distribution has no natural break, so every candidate cut was arbitrary
    and an arbitrary cut removed 26-50% of all setups. It stays because it is a useful thing to see on
    a card next to the regime, not because anything asks it a question.

    Returns None when there is too little history: "cannot tell yet" and "went nowhere" are opposite
    facts, and a caller seeing 0.0 for both would read a fresh instrument's first hours as dead.
    """
    if len(candles) < n + 1:
        return None
    seg = candles[-(n + 1):]
    path = sum(abs(b.close - a.close) for a, b in zip(seg, seg[1:]))
    if path <= 0:
        return 0.0
    return abs(seg[-1].close - seg[0].close) / path


def describe(er: float | None) -> str:
    """One line for the card and the log. A DECIMAL on purpose — `vix1_log.shape` collapses decimals,
    so this value moving does not make the log line look new on every scan."""
    if er is None:
        return "efficiency unknown (not enough history)"
    return f"efficiency {er:.2f} over the last {_WINDOW} bars"
