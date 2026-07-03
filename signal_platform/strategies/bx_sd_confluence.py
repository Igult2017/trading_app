"""
BX-S/D — confluence tools (Phase 4).

The two scored confirmations from the book that aren't structure/zone/liquidity:
  * PREMIUM / DISCOUNT (Ch. 9, 12) — fib the live leg; only BUY in discount, SELL in premium
    (grey/equilibrium is tolerated). Keeps us from buying tops / selling bottoms.
  * RSI DIVERGENCE (Ch. 9) — price makes a higher high while RSI makes a lower high → bearish
    (confirms a supply/sell); mirror for demand/buy.
Plus the fib TP extensions (−0.272 / −0.618) the book targets.

Reuses only the generic shared RESOURCE find_swing_points; RSI is Wilder-standard, computed locally.
"""
from core.types import Candle
from shared.swing_points import find_swing_points


def fib_pos(low: float, high: float, price: float) -> float:
    """0.0 at the leg low, 1.0 at the leg high."""
    rng = high - low
    return (price - low) / rng if rng > 0 else 0.5


def premium_discount(low: float, high: float, price: float, grey: float = 0.10) -> str:
    """'premium' (upper) / 'discount' (lower) / 'equilibrium' (grey band around 50%)."""
    p = fib_pos(low, high, price)
    if p > 0.5 + grey:
        return "premium"
    if p < 0.5 - grey:
        return "discount"
    return "equilibrium"


def pricing_aligned(low: float, high: float, price: float, direction: str) -> bool:
    """Buy only in discount/equilibrium; sell only in premium/equilibrium."""
    z = premium_discount(low, high, price)
    if direction in ("demand", "buy"):
        return z != "premium"
    return z != "discount"


def fib_target(low: float, high: float, direction: str, ratio: float = 0.272) -> float:
    """TP as a fib extension beyond the leg (book targets −0.272 then −0.618)."""
    rng = high - low
    if direction in ("demand", "buy"):
        return high + ratio * rng
    return low - ratio * rng


def rsi(closes: list[float], period: int = 14) -> list:
    """Wilder RSI aligned to `closes` indices (None until enough history)."""
    n = len(closes)
    out = [None] * n
    if n < period + 1:
        return out
    gains = [0.0] * n
    losses = [0.0] * n
    for i in range(1, n):
        d = closes[i] - closes[i - 1]
        gains[i], losses[i] = max(0.0, d), max(0.0, -d)
    ag = sum(gains[1:period + 1]) / period
    al = sum(losses[1:period + 1]) / period
    out[period] = 100.0 if al == 0 else 100 - 100 / (1 + ag / al)
    for i in range(period + 1, n):
        ag = (ag * (period - 1) + gains[i]) / period
        al = (al * (period - 1) + losses[i]) / period
        out[i] = 100.0 if al == 0 else 100 - 100 / (1 + ag / al)
    return out


def rsi_divergence(candles: list[Candle], direction: str, period: int = 14, n: int = 3) -> bool:
    """Bullish divergence (price LL, RSI HL) confirms a demand/buy; bearish (price HH, RSI LH) a supply/sell."""
    r = rsi([c.close for c in candles], period)
    pts = find_swing_points(candles, n)
    if direction in ("supply", "sell"):
        highs = [p for p in pts if p.is_high and r[p.index] is not None]
        if len(highs) < 2:
            return False
        a, b = highs[-2], highs[-1]
        return b.price > a.price and r[b.index] < r[a.index]
    lows = [p for p in pts if not p.is_high and r[p.index] is not None]
    if len(lows) < 2:
        return False
    a, b = lows[-2], lows[-1]
    return b.price < a.price and r[b.index] > r[a.index]
