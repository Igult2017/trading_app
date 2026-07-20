"""
VIX.1 — the bias: WHICH WAY, and on what grounds. TREND CASCADE: 1HR first, 4HR only as a fallback.

This module is the ROUTER. The momentum candle lives in vix1_momentum (always 1HR); the trend rules
(HH+HL / LH+LL, and CHoCH) live in vix1_trend. The 1HR trend is PRIMARY — when a 1HR momentum candle
forms and the 1HR trend is clear, we go with it. ONLY WHEN THE 1HR TREND IS UNCLEAR do we consult the
4HR, to ask "is this 1HR momentum because of a 4HR trend?". Four momentum-led situations, no indicator:

  'trend'  — clear 1HR trend + a 1HR momentum candle running WITH it.
  'choch'  — clear 1HR trend, the freshest 1HR momentum runs AGAINST it and CLOSES beyond the 1HR
             swing that defined it: the market is CHANGING DIRECTION. No break = a deep pullback, skip.
  'trend4' — the FALLBACK: 1HR trend UNCLEAR, but the 1HR momentum aligns with a clear 4HR trend, so
             the momentum IS trend-driven (just on the higher timeframe).
  'range'  — no 1HR trend, no backing 4HR trend, and a 1HR momentum candle CLOSES beyond the recent
             1HR range: a range breaking into a trend.

The trend must be the thing CARRYING the momentum (p1). So when structure and momentum disagree we
never reach back past the opposing candle for an aligned one from hours ago — the freshest momentum
is the truth. Before 'choch' existed that case was simply dropped; now it is read for what it is.

Structure is read from CLOSED candles only. The 1M does NOT use any of this: there the LINE says
whether price is with us (vix1_entry), because swing structure cannot read a spike-and-return
inside a single hour.
"""
import logging

from core.types import Candle
from strategies.vix1_momentum import momentum_run, veto_reason
from strategies.vix1_trend import broke_structure, clear_trend

log = logging.getLogger(__name__)

_RANGE_LOOKBACK = 8   # bars before the breakout that define the range being broken


def _run_breaks_range(h1: list[Candle], first_idx: int, run_len: int, bullish: bool) -> bool:
    """True if the momentum RUN closes beyond the range set by the bars BEFORE it started — a real
    break out of a range, not a wiggle inside it. Checks the run's furthest close (any candle in the
    run), so a breakout completing on the 2nd/3rd candle still counts, not only the first."""
    prior = h1[max(0, first_idx - 1 - _RANGE_LOOKBACK): first_idx - 1]
    if len(prior) < 3:
        return False
    run = h1[first_idx: first_idx + run_len]
    if bullish:
        return max(c.close for c in run) > max(c.high for c in prior)
    return min(c.close for c in run) < min(c.low for c in prior)


def detect_bias(h1: list[Candle], h4: list[Candle], symbol: str = "") -> tuple[bool, int, str, int] | None:
    """
    Returns (bullish, mc_idx, origin, run_len) or None. `mc_idx` indexes into H1 — the FIRST momentum
    candle of the run; VIX.1 operates from it and its close opens the 1M watch. Logs the exact reason
    at INFO when it returns None, so a miss stays diagnosable.

    TREND CASCADE (user 2026-07-20): the **1HR** trend is PRIMARY. If a 1HR momentum candle forms and
    the 1HR trend is clear, we go with it. ONLY WHEN THE 1HR TREND IS UNCLEAR do we consult the 4HR —
    "is this 1HR momentum because of a 4HR trend?" — and if it aligns with a clear 4HR trend we take it.
    The MOMENTUM candle is always the 1HR. `origin`:
      'trend'  — clear 1HR trend + aligned 1HR momentum
      'choch'  — clear 1HR trend, 1HR momentum AGAINST it, closing through the 1HR swing that defined it
      'trend4' — 1HR trend UNCLEAR, but the 1HR momentum aligns with a clear 4HR trend (the fallback)
      'range'  — no 1HR trend, no backing 4HR trend, 1HR momentum breaks the recent 1HR range
    """
    t1 = clear_trend(h1)                          # 1HR trend — PRIMARY

    if t1 != 0:
        with_trend = t1 > 0
        vr  = momentum_run(h1, with_trend)
        opp = momentum_run(h1, not with_trend)
        last     = (vr[0] + vr[1] - 1) if vr else -1
        opp_last = (opp[0] + opp[1] - 1) if opp else -1

        if vr is not None and last > opp_last:
            return (with_trend, vr[0], "trend", vr[1])   # 1HR trend

        if opp is not None:
            # The freshest 1HR momentum runs AGAINST the 1HR trend. A CHANGE OF DIRECTION only if the
            # 1HR candle CLOSED beyond the 1HR swing that defined the trend — else a deep pullback.
            if broke_structure(h1, h1[opp_last].close, not with_trend):
                log.info(f"[vix1] {symbol} 1HR STRUCTURE CHANGE: {'up' if with_trend else 'down'} 1HR "
                         f"trend broken by a {'down' if with_trend else 'up'} momentum candle closing "
                         f"through its defining swing — bias flips to {'SELL' if with_trend else 'BUY'}")
                return (not with_trend, opp[0], "choch", opp[1])
            log.info(f"[vix1] {symbol} bias=NONE: 1HR momentum against the {'up' if with_trend else 'down'} "
                     f"1HR trend, no structure break — a deep pullback; standing aside")
            return None

        log.info(f"[vix1] {symbol} bias=NONE: clear 1HR {'up (HH+HL)' if with_trend else 'down (LH+LL)'} "
                 f"trend, but {veto_reason(h1, with_trend)}")
        return None

    # 1HR TREND UNCLEAR — go to the 4HR to see if the 1HR momentum is backed by a 4HR trend.
    t4 = clear_trend(h4)
    if t4 != 0:
        with4 = t4 > 0
        vr  = momentum_run(h1, with4)
        opp = momentum_run(h1, not with4)
        last     = (vr[0] + vr[1] - 1) if vr else -1
        opp_last = (opp[0] + opp[1] - 1) if opp else -1
        if vr is not None and last > opp_last:
            log.info(f"[vix1] {symbol} 4HR-BACKED TREND: 1HR trend unclear, but the 1HR momentum aligns "
                     f"with a clear 4HR {'up (HH+HL)' if with4 else 'down (LH+LL)'} trend")
            return (with4, vr[0], "trend4", vr[1])       # 4HR-backed trend
        # 1HR momentum is not aligned with the 4HR trend — fall through to the range test.

    # No trend backing on either TF — a RANGE BREAKING INTO A TREND (1HR momentum + 1HR range break).
    # Take the FRESHEST qualifying run, never "whichever we test first" (both directions routinely
    # qualify in a range; returning the stale one is the wrong-direction bug fixed in the trend branch).
    best: tuple[int, bool, tuple[int, int]] | None = None
    for bullish in (True, False):
        vr = momentum_run(h1, bullish)
        if vr is not None and _run_breaks_range(h1, vr[0], vr[1], bullish):
            last = vr[0] + vr[1] - 1
            if best is None or last > best[0]:
                best = (last, bullish, vr)
    if best is not None:
        _, bullish, vr = best
        return (bullish, vr[0], "range", vr[1])

    log.info(f"[vix1] {symbol} bias=NONE: no clear 1HR trend, no backing 4HR trend, no 1HR range "
             f"breakout (up: {veto_reason(h1, True)})")
    return None
