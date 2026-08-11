"""
VIX.1 — IS THIS STILL A TREND, OR HAS THE MARKET STOPPED GOING ANYWHERE?

THE HOLE THIS FILLS. Nothing in VIX.1 has ever detected a range. Measured over 12 months of real H1
on both pairs, the trend reader **never once said "no trend"** — the only time it reports no
direction is while a reversal is pending. So a market that stops making progress keeps its last
direction indefinitely and its momentum candles keep being traded as continuations of a trend that
has quietly stopped existing.

And we do trade that chop. The momentum candles VIX.1 currently allows sit at a median efficiency of
0.250 (GBP/USD) and 0.237 (EUR/USD) against a whole-market median of 0.206 / 0.217 — statistically
the same market. 17.0% / 23.8% of the trades taken sit in the choppiest tenth there is. The momentum
candle does nothing to avoid a range, because nothing asks.

THE MEASURE. Directional efficiency: how far price actually GOT, over how far it WALKED getting
there.

    efficiency = |close now - close N bars ago| / sum of every bar-to-bar close move over those N

    1.0  a straight line — every step went the same way
    0.5  it walked twice the distance it covered
    ~0   it went up, down, up, down and ended where it started

Chosen because it needs no pivots and therefore has NO CONFIRMATION DELAY — the same reason the
retracement tracker measures from the extreme rather than from a swing. It says nothing about
direction and must never be asked to; direction is vix1_trend's job alone.

PHASE A: THIS DECIDES NOTHING. It is reported on the card and in the log so real values can be seen
on real signals first. There is deliberately no threshold constant in this file yet — the measured
distribution is perfectly smooth, with no natural break to cut at, so any number chosen today would
be fitted to one year of two pairs. For reference, cutting at 0.20 would call ~47% of ALL time
"ranging" and remove ~41% of current trades; at 0.15, ~37% of time and ~26% of trades. That decision
is his, from real signals, in Phase B.

CLOSED CANDLES ONLY, like everything else on the 1HR side.
"""
from core.types import Candle

# ~One trading day of H1. Short enough to notice a market going quiet, long enough that a single
# violent bar cannot swing it. Not tuned — no threshold uses it yet.
_WINDOW = 20


def efficiency(candles: list[Candle], n: int = _WINDOW) -> float | None:
    """How efficiently price travelled over the last `n` CLOSED bars. None when there are too few.

    Returns None rather than 0.0 on a short window: "we cannot tell yet" and "the market went
    nowhere" are opposite facts, and a caller that saw 0.0 for both would read a fresh instrument's
    first hours as a dead range.
    """
    if len(candles) < n + 1:
        return None
    seg = candles[-(n + 1):]
    path = sum(abs(b.close - a.close) for a, b in zip(seg, seg[1:]))
    if path <= 0:                       # a completely still market: it went nowhere, perfectly
        return 0.0
    return abs(seg[-1].close - seg[0].close) / path


def describe(er: float | None) -> str:
    """One line for the card and the log. A DECIMAL on purpose — `vix1_log.shape` collapses decimals,
    so this value moving does not make the log line look new on every scan."""
    if er is None:
        return "efficiency unknown (not enough history)"
    return f"efficiency {er:.2f} over the last {_WINDOW} bars"
