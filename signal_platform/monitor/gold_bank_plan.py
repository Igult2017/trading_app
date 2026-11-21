"""GOLD PROFIT BANKING — the schedule, as pure maths. No network, no clock, no broker.

HIS RULE, 21 Nov 2026: *"At 0.4R lets breakeven so we dont lose. At 1R lets take enough that equals 0.5R in that trade
in dollar value. At 2R lets take another 0.5R value. Then the remaining amount ... we will be banking every 20 dollar
profit that it makes [on $100 risk] ... make it applicable in any amount we risk."* He chose READING B: after 2R, a
piece is banked each time the part STILL OPEN has earned another 0.2R. *"use it on gold only for now."*

EVERYTHING IS A SHARE OF THE TRADE, never dollars, so it holds for any risk and any lot size. To bank `b` R at level
`L`, close `b ÷ (L − k)` of the STARTING size, where `k` is the round-trip cost in R (so what lands is NET of costs):

    1R   bank 0.5R   close 0.5 ÷ (1 − k)  ≈ 50%
    2R   bank 0.5R   close 0.5 ÷ (2 − k)  ≈ 25%
    then with share f still open and the last bank at L: next level L + 0.2 ÷ f, close 0.2 ÷ (L_next − k)
         ($100 risk, k = 0: 2.8R, 3.92R, 5.49R … — the table he approved)

ROUNDING. The broker trades in whole steps (0.01 lot). Each piece rounds UP — every bank is at least what he asked
for. If what would be left is under the smallest size, that step closes everything; a trade too small to split
closes whole at 1R.

WHICH STEPS ARE DONE IS READ FROM THE TRADE'S CURRENT SIZE (`next_step`), not from a memory that a restart can lose:
each step brings the size down to a known figure, so the size itself says where the trade is.
"""
from dataclasses import dataclass

GOLD = ("XAU/USD",)
EPS = 1e-9
_MAX_STEPS = 40                       # Reading B never ends by itself; the pieces shrink to the minimum long before


def is_gold(symbol: str) -> bool:
    return symbol in GOLD


@dataclass(frozen=True)
class Step:
    level_r: float        # R reached (on the closing price) that triggers this piece
    close: int            # wire volume this step closes
    left: int             # wire volume still open after it


def _round_up(x: float, step: int) -> int:
    n = int(x // step)
    return (n + (1 if x - n * step > EPS * max(1.0, x) else 0)) * step


def schedule(start: int, k: float, min_vol: int, step_vol: int) -> list[Step]:
    """Every piece this trade will bank, in order. `start` and the result are wire volumes."""
    if start <= 0 or min_vol <= 0 or step_vol <= 0:
        return []
    k = min(max(float(k), 0.0), 0.5)          # a cost over half an R would be a broken read, not a real trade
    out: list[Step] = []
    left = int(start)

    def take(level: float, bank_r: float) -> None:
        nonlocal left
        want = _round_up(max(bank_r / (level - k), 0.0) * start, step_vol)
        want = max(want, min_vol)
        if left - want < min_vol:
            want = left                           # too little would be left to trade: this piece closes it all
        left -= want
        out.append(Step(round(level, 6), int(want), int(left)))

    take(1.0, 0.5)
    if left:
        take(2.0, 0.5)
    level = 2.0
    while left and len(out) < _MAX_STEPS:
        level = level + 0.2 / (left / start)
        take(level, 0.2)
    return out


def next_step(plan: list[Step], current: int, min_vol: int) -> tuple[Step, int] | None:
    """The first step not yet done, and how much to close for it — or None when nothing is left to bank.

    A step is done once the trade is down to that step's `left`. If he closed part by hand, the close is only what
    brings the trade back down to the schedule; a gap under the smallest size counts as done."""
    for s in plan:
        if current <= s.left:
            continue
        cut = current - s.left
        if s.left and cut < min_vol:
            continue
        return s, int(cut)
    return None


def cost_in_r(entry: float, breakeven: float | None, risk: float | None) -> float:
    """The round trip's cost as a share of 1R — `|breakeven − entry| ÷ risk`. 0 when either is unknown."""
    if breakeven is None or not risk:
        return 0.0
    return abs(breakeven - entry) / risk
