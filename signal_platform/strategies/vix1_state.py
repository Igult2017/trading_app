"""
VIX.1 — what the 1HR hands downstream: the decision, and the market state it was made in.

Split out of `vix1_bias.py` on 2026-08-11 when that file passed 200 lines. The seam is a real one:
`vix1_bias` DECIDES (trend first, then momentum, then the leg gate); this is the RECORD of what it
decided, which the card, the heads-up DM and the log all read. Keeping the record here also means the
two display modules import one thing instead of three.

THE MARKET STATE IS MEASURED, NOT ENFORCED (Phase A, 2026-08-11). Neither number gates anything yet.
They are carried and printed so their real values can be read off real signals before any threshold
is chosen — picking one from a year of two pairs is how two earlier changes looked right on the day
they were tried and were worse over four years.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.pip import pip_size
from strategies import vix1_regime
from strategies.vix1_retracement import Retracement, measure


@dataclass(frozen=True)
class Bias:
    """What the 1HR decided, and the market state it decided it in.

    A 5-ITEM TUPLE UNTIL 2026-08-11. Two more measurements had to reach the card, and a 7-item tuple
    is not readable. It is unpacked in exactly one place (`vix1.analyze`), so this cost one line and
    stops the next addition making it worse.
    """
    bullish: bool
    mc_idx: int                  # indexes into H1 — the FIRST candle of the freshest momentum run
    origin: str                  # 'trend' | 'trend4'
    run_len: int
    reason: str                  # the BOS/CHoCH and the leg that justify the trade
    retracement: Retracement = Retracement()
    efficiency: float | None = None


def market_state(window: list[Candle], tstate, symbol: str) -> tuple[Retracement, float | None, str]:
    """How far into a retracement we are, and how directional the market still is.

    Returns the two measurements plus one sentence naming both, for the log and the card.

    MEASURED ONCE, PRINTED ON EVERY PATH — the refusals as well as the pass. Phase A exists to show
    what these numbers look like on real signals, and printing them only on the setups that got
    through would show half the picture: the refused ones are exactly the comparison group.

    The retracement is measured from the trend's own extreme (`TrendState.direction_since`), not from
    the start of whatever window was passed — a peak belonging to the PREVIOUS trend is not this
    trend's high-water mark.
    """
    ret = measure(window, tstate.direction, tstate.direction_since)
    eff = vix1_regime.efficiency(window)
    return ret, eff, f"{ret.describe(pip_size(symbol))}; {vix1_regime.describe(eff)}"


def state_line(retracement: Retracement | None, efficiency: float | None, pip: float) -> str:
    """The card's own wording for the same two numbers. Empty when there is nothing measured, so a
    caller can splat it into a reasons list without a branch."""
    if retracement is None:
        return ""
    return f"Market state — {retracement.describe(pip)}; {vix1_regime.describe(efficiency)}"
