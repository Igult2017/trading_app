"""
VIX.1 — THE REGIME ENGINE: is this a TREND, a RANGE, or CHOP?

HIS RULE, and the numbers he locked on 2026-08-12:

    "a market that can't print stable or distinctive and directional highs and lows is ranging"

    Material HH/LL progress   0.50 x ATR
    Same-boundary tolerance   0.75 x ATR
    Minimum swing-size filter NONE
    Efficiency                removed from the decision

THE ORDER OF THE TWO TESTS IS LOAD-BEARING, not incidental. The thresholds deliberately overlap: a
high that clears the previous one by 0.6 ATR is BOTH "meaningful progress" (> 0.50) and "the same
boundary" (<= 0.75). Progression is therefore asked FIRST, and boundaries only when there is none —
exactly as his flowchart draws it. Swap the order and a shallow uptrend reads as a range.

    confirmed swings -> did BOTH sides progress by >= 0.50 ATR ?
                          yes -> TREND
                          no  -> are the two highs within 0.75 ATR of each other,
                                 AND the two lows likewise ?
                                    yes -> RANGE   (bounded, orderly — his clean-range chart)
                                    no  -> CHOP    (reversals without stable boundaries)

WHY EFFICIENCY WAS DROPPED FROM THE DECISION. It was the first attempt and it was the wrong
instrument: measured over 12 months the distribution had NO natural break to cut at, and any cut
deleted a quarter to half of all setups. His reasoning is the general form of the same finding — *"a
perfectly respectable range can have extremely low efficiency, while a messy transition can also have
low efficiency. It doesn't tell us the structure."* `efficiency()` survives as a REPORTED number on
the card, because it is information; it decides nothing.

NO MINIMUM SWING SIZE, deliberately. The confirmed swings already average ~4x ATR, so a 1-ATR size
filter would be near-redundant, and the 0.50 ATR figure here answers a DIFFERENT question — not "is
this turn a swing" but "did the second swing make enough progress to count as a new extreme".

TWO HIGHS AND TWO LOWS is what a verdict needs, and that count is deliberately NOT tuned yet — his
call: *"I would not hard-code yet the number of swings required... test the detector against actual
chart data before changing that."*
"""
from dataclasses import dataclass

from core.types import Candle

# ~One trading day of H1. Only `efficiency` uses it; it is not part of any verdict.
_WINDOW = 20

_PROGRESS_ATR = 0.50     # a new extreme must clear the old one by this to be real progress
_BOUNDARY_ATR = 0.75     # two extremes this close count as the same ceiling / floor

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
    direction: int = 0          # +1/-1 when kind is TREND, else 0
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
    if atr_value <= 0:
        return Regime(why="no volatility reading yet")
    highs = [t for t in turns if t.is_high][-2:]
    lows = [t for t in turns if not t.is_high][-2:]
    if len(highs) < 2 or len(lows) < 2:
        return Regime(why="not enough confirmed swings yet — need two highs and two lows")

    prog = _PROGRESS_ATR * atr_value
    dh = highs[-1].price - highs[-2].price
    dl = lows[-1].price - lows[-2].price

    # 1. PROGRESSION FIRST. Both sides must move together — a higher high with a lower low is price
    #    broadening out, not a trend.
    if dh > prog + _EPS and dl > prog + _EPS:
        return Regime(TREND, 1, f"higher high and higher low, both by more than "
                                f"{_PROGRESS_ATR:.2f}x ATR — the trend is progressing")
    if dh < -prog - _EPS and dl < -prog - _EPS:
        return Regime(TREND, -1, f"lower high and lower low, both by more than "
                                 f"{_PROGRESS_ATR:.2f}x ATR — the trend is progressing")

    # 2. NO PROGRESSION — so is it bounded (a range) or not (chop)?
    bound = _BOUNDARY_ATR * atr_value
    hs, ls = abs(dh), abs(dl)
    if hs <= bound + _EPS and ls <= bound + _EPS:
        return Regime(RANGE, 0, f"no structural progress, and the highs sit within "
                                f"{_BOUNDARY_ATR:.2f}x ATR of each other and the lows likewise "
                                f"— a bounded range")
    return Regime(CHOP, 0, f"no structural progress and no stable boundary — "
                           f"{'highs' if hs > bound else 'lows'} "
                           f"{'and lows ' if hs > bound and ls > bound else ''}"
                           f"are scattered wider than {_BOUNDARY_ATR:.2f}x ATR")


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
