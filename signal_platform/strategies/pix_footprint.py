"""PIX — THE FOOTPRINT: who bought and who sold AT EACH PRICE inside one candle (18 Nov 2026).

His words: footprint candles *"to find volume delta difference and to know whether the price is going to respect those
zones or not."* The candle's total buying vs selling (its delta) says WHO won the candle; the footprint says WHERE.

READING IT — the standard DIAGONAL comparison (from the audited tape-and-book, `orderflow.py`): a buyer who lifts the
offer at a price meets the seller one row BELOW, so buying at row r is compared with selling at row r−1. Buying
`IMB_RATIO` (3×) or more of that selling = a BUY IMBALANCE at r; the mirror is a sell imbalance at r−1. `STACK` (3) or more
imbalances of one side in consecutive rows = a STACKED imbalance: one side pushing through several prices in a row.
(mahmoud20138/OrderFlow-Analysis-Pro compares buy and sell at the SAME price — not how the two sides meet; not used.)

MARKET-AGNOSTIC: input is {price: (bought, sold)} for one candle — from exchange trades (crypto) or a tick count
(broker-streamed markets) or any trade feed (stocks). Rows are a share of the candle's own range (`ROWS`), so the same
reading fits any price scale.
"""
from __future__ import annotations

from dataclasses import dataclass, field

ROWS      = 20
IMB_RATIO = 3.0
STACK     = 3


@dataclass
class Footprint:
    rows:        list[tuple[float, float, float]]          # (row low price, bought, sold), lowest first
    buy_stacks:  list[tuple[float, float]] = field(default_factory=list)   # (low, high) of each stacked buy run
    sell_stacks: list[tuple[float, float]] = field(default_factory=list)

    @property
    def bought(self) -> float:
        return sum(b for _, b, _ in self.rows)

    @property
    def sold(self) -> float:
        return sum(s for _, _, s in self.rows)


def _runs(flags: list[bool], lows: list[float], highs: list[float]) -> list[tuple[float, float]]:
    out, start = [], None
    for i, f in enumerate(flags + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            if i - start >= STACK:
                out.append((lows[start], highs[i - 1]))
            start = None
    return out


def build(prints: dict[float, tuple[float, float]], rows: int = ROWS) -> Footprint | None:
    if not prints:
        return None
    prices = sorted(prints)
    if len(prices) <= rows:
        # FEW PRICES TRADED: each is its own row, so "one row below" is the next price that actually traded. Equal-width
        # rows here left empty rows between the prints, and the diagonal then compared with nothing (found 18 Nov).
        lows = highs = prices
        buy = [float(prints[p][0]) for p in prices]
        sell = [float(prints[p][1]) for p in prices]
        n = len(prices)
    else:
        lo, hi = prices[0], prices[-1]
        row = (hi - lo) / rows
        n = rows
        buy, sell = [0.0] * n, [0.0] * n
        for p, (b, s) in prints.items():
            i = min(int((p - lo) / row), n - 1)
            buy[i] += b
            sell[i] += s
        lows = [lo + i * row for i in range(n)]
        highs = [x + row for x in lows]
    buy_imb, sell_imb = [False] * n, [False] * n
    for r in range(1, n):
        if buy[r] > 0 and buy[r] >= IMB_RATIO * sell[r - 1]:
            buy_imb[r] = True
        if sell[r - 1] > 0 and sell[r - 1] >= IMB_RATIO * buy[r]:
            sell_imb[r - 1] = True
    return Footprint([(lows[i], buy[i], sell[i]) for i in range(n)],
                     _runs(buy_imb, lows, highs), _runs(sell_imb, lows, highs))


def merge(parts: list[dict[float, tuple[float, float]]]) -> dict[float, tuple[float, float]]:
    """Several 1M prints into one 5M candle's prints."""
    out: dict[float, list[float]] = {}
    for d in parts:
        for p, (b, s) in d.items():
            row = out.setdefault(p, [0.0, 0.0])
            row[0] += b
            row[1] += s
    return {p: (v[0], v[1]) for p, v in out.items()}
