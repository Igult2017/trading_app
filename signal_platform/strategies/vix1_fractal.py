"""
VIX.1 — the 1M fractal: proof that a counter-move has ended.

A fractal is a pullback of 1 to 4 candles against the way price is currently running, after which
price CONTINUES. That continuation is what makes it a fractal rather than a reversal, so a fractal is
only ever read in hindsight: it is a completed shape, and its job is to mark a level.

Its level is the group's extreme — the furthest the pullback reached. When price later CLOSES beyond
that level in the OTHER direction, the move that formed it is finished.

We use it in exactly one place: the 1M is running AGAINST the 1HR bias, and we need to know when that
counter-move has died so price is lining up with us again. So the group is 1-4 candles in OUR
direction, and the break is a close beyond its extreme in OUR direction.

A fractal and an entry pullback are the same kind of shape in different roles, and what separates
them is what has to follow:
  fractal  — 1 to 4 candles, and price MUST have continued afterwards. It marks a level (here).
  pullback — the FIRST candle of a live retrace, and nothing has to follow it, because the stop order
             is the test: continue and it fills us, reverse and we were never in (vix1_pullback).

This is NOT the Williams 5-bar fractal. That shape needs a bar to be the extreme of its 2 neighbours
either side, which a spike-and-return rarely produces — it found no fractal at all in half of the
long-wick cases, so the 1M never lined up and real entries were dropped.
"""
from core.types import Candle
from shared.candle_math import is_bullish, is_bearish

MAX_FRACTAL = 4   # a counter-move longer than this is a move in its own right, not a pullback


def _ours(c: Candle, bullish: bool) -> bool:
    """A candle in the BIAS direction — the thing a fractal is made of."""
    return is_bullish(c) if bullish else is_bearish(c)


def _against(c: Candle, bullish: bool) -> bool:
    """A candle carrying the counter-move on — the continuation that proves the fractal."""
    return is_bearish(c) if bullish else is_bullish(c)


def fractals(win: list[Candle], bullish: bool) -> list[tuple[int, float]]:
    """Every fractal in the window, oldest first, as (index after the group, level).

    A doji is neither ours nor against: it cannot form a fractal and cannot prove a continuation, so
    it simply stays inside whatever run it lands in rather than cutting it in two.
    """
    out: list[tuple[int, float]] = []
    i, n = 0, len(win)
    while i < n:
        if not _ours(win[i], bullish):
            i += 1
            continue
        j = i + 1
        while j < n and not _against(win[j], bullish):   # dojis do not end the run
            j += 1
        group = [c for c in win[i:j] if _ours(c, bullish)]
        # j is the first candle carrying the counter-move on — the continuation. No continuation
        # (we are at the live edge) means this is not a fractal yet; it may be a reversal.
        if 1 <= len(group) <= MAX_FRACTAL and j < n:
            lvl = max(c.high for c in group) if bullish else min(c.low for c in group)
            out.append((j, lvl))
        i = j
    return out


def fractal_broken(win: list[Candle], bullish: bool) -> tuple[bool, float | None]:
    """Has the LAST fractal been broken — has price CLOSED beyond it in the bias direction?

    That close is the counter-move being declared over, and the 1M lining up with the 1HR. Returns
    (broken, level) so the caller can say which level it was. Only the last fractal is consulted: it
    is the one formed just before price turned, and it is what "the last fractal" means.
    """
    frs = fractals(win, bullish)
    if not frs:
        return False, None
    j, lvl = frs[-1]
    broke = any((c.close > lvl) if bullish else (c.close < lvl) for c in win[j:])
    return broke, lvl
