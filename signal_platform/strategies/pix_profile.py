"""PIX — VOLUME PROFILE: where most of the trading happened, and what the busiest price is doing (18 Nov 2026).

His words: *"POC, VAL and VAH and the value area or where most trade activities took place… POC can act as support or
resistance in 1HR TF… if price breaks POC going up it becomes support and going down it becomes resistance. In a ranging
market, price is likely to break it several times… But it is a good confluence."*

  * POC (point of control) = the price row that traded the most volume.
  * VALUE AREA = the band around the POC holding `VALUE_AREA` (70%) of all volume, grown one row at a time towards the
    busier neighbour; its top is VAH, its bottom VAL.
  * POC ROLE — broke UP through it (closed below, then above) → SUPPORT; broke DOWN → RESISTANCE; crossed it
    `RANGING_CROSSES` (3) or more times in the window → RANGING (a weak level); never crossed → whichever side price held.

MARKET-AGNOSTIC: it takes candles with a volume (real volume on stocks, tick volume on CFDs) or (price, size) trades;
nothing here knows the symbol. The idea and the value-area method come from the audited mahmoud20138/OrderFlow-Analysis-Pro
(`volume_profile.py`), REWRITTEN: whole-number price rows (theirs stepped a float price and drifted), no numpy, a candle's
volume spread over its own high-low range (py-market-profile put it all at the close — rejected).
"""
from __future__ import annotations

from dataclasses import dataclass

from core.types import Candle

ROWS            = 100     # price rows across the window's range
VALUE_AREA      = 0.70
RANGING_CROSSES = 3


@dataclass
class Profile:
    poc: float
    vah: float
    val: float
    row: float
    total: float


def _rows_to_profile(vol: list[float], base: float, row: float) -> Profile | None:
    total = sum(vol)
    if total <= 0:
        return None
    top = max(vol)
    peaks = [i for i, v in enumerate(vol) if v == top]
    mid = (len(vol) - 1) / 2
    p = min(peaks, key=lambda i: abs(i - mid))             # a tie goes to the row nearest the middle
    lo = hi = p
    acc = vol[p]
    while acc < VALUE_AREA * total and (lo > 0 or hi < len(vol) - 1):
        up = vol[hi + 1] if hi < len(vol) - 1 else -1.0
        dn = vol[lo - 1] if lo > 0 else -1.0
        if up >= dn:
            hi += 1
            acc += up
        else:
            lo -= 1
            acc += dn
    centre = lambda i: base + (i + 0.5) * row  # noqa: E731
    return Profile(poc=centre(p), vah=base + (hi + 1) * row, val=base + lo * row, row=row, total=total)


def from_candles(candles: list[Candle], rows: int = ROWS) -> Profile | None:
    """Each candle's volume spread evenly over the rows its high-low range covers."""
    cs = [c for c in candles if c.volume and c.high >= c.low]
    if not cs:
        return None
    base, top = min(c.low for c in cs), max(c.high for c in cs)
    row = (top - base) / rows if top > base else max(abs(top) * 1e-6, 1e-9)
    vol = [0.0] * rows
    for c in cs:
        a = min(int((c.low - base) / row), rows - 1)
        b = min(int((c.high - base) / row), rows - 1)
        share = c.volume / (b - a + 1)
        for i in range(a, b + 1):
            vol[i] += share
    return _rows_to_profile(vol, base, row)


def from_trades(trades: list[tuple[float, float]], rows: int = ROWS) -> Profile | None:
    """(price, size) trades — exact, when a market gives them."""
    if not trades:
        return None
    base, top = min(p for p, _ in trades), max(p for p, _ in trades)
    row = (top - base) / rows if top > base else max(abs(top) * 1e-6, 1e-9)
    vol = [0.0] * rows
    for p, s in trades:
        vol[min(int((p - base) / row), rows - 1)] += s
    return _rows_to_profile(vol, base, row)


def poc_role(candles: list[Candle], poc: float) -> str:
    """"support" | "resistance" | "ranging" — from how the closes crossed the POC over the window."""
    sides = [1 if c.close > poc else -1 for c in candles if c.close != poc]
    if not sides:
        return "ranging"
    crosses = [b for a, b in zip(sides, sides[1:]) if a != b]
    if len(crosses) >= RANGING_CROSSES:
        return "ranging"
    if crosses:
        return "support" if crosses[-1] > 0 else "resistance"
    return "support" if sides[-1] > 0 else "resistance"


EDGE_SHARE = 0.25     # a level "at the zone's edge" = within a quarter of the zone's height outside it


def touching(profile: Profile | None, bottom: float, top: float) -> list[str]:
    """Which of POC / VAH / VAL sit inside the zone or at its edge — his "good confluence"."""
    if profile is None:
        return []
    pad = (top - bottom) * EDGE_SHARE
    return [n for n, v in (("POC", profile.poc), ("VAH", profile.vah), ("VAL", profile.val))
            if bottom - pad <= v <= top + pad]


def describe(profile: Profile | None, role: str, digits: int = 5) -> str:
    if profile is None:
        return "VOLUME PROFILE: no volume to read"
    return (f"VOLUME PROFILE (last day): POC {round(profile.poc, digits)} — acting as {role.upper()}; value area "
            f"{round(profile.val, digits)}–{round(profile.vah, digits)} (where 70% of the trading was)")
