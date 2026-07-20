"""
VIX.1 — the bias: WHICH WAY, and on what grounds. TREND CASCADE: 1HR first, 4HR only as a fallback.

This module is the ROUTER. The momentum candle lives in vix1_momentum (always 1HR); the trend rules
(HH+HL / LH+LL, and CHoCH) live in vix1_trend. We trade TRENDS ONLY — never ranging markets. The 1HR
trend is PRIMARY; ONLY WHEN THE 1HR TREND IS UNCLEAR do we consult the 4HR ("is this 1HR momentum
because of a 4HR trend?"). If NEITHER timeframe shows a confirmed trend, we DO NOT TRADE — a
range->trend transition is taken only once the trend is CONFIRMED. Three momentum-led origins:

  'trend'  — clear 1HR trend + a 1HR momentum candle running WITH it.
  'choch'  — clear 1HR trend, the freshest 1HR momentum runs AGAINST it and CLOSES beyond the 1HR
             swing that defined it: the market is CHANGING DIRECTION. No break = a deep pullback, skip.
  'trend4' — the FALLBACK: 1HR trend UNCLEAR, but the 1HR momentum aligns with a clear 4HR trend, so
             the momentum IS trend-driven (just on the higher timeframe). No 4HR trend either -> None.

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

    # 1HR TREND UNCLEAR — go to the 4HR. We trade TRENDS ONLY (user 2026-07-20: "we are not trading
    # ranging markets; if we don't see a trend in 1HR we go to 4HR, but if we don't see it there either
    # we don't take the trade"). A range->trend transition is valid, but ONLY once the trend is
    # CONFIRMED (a clear HH+HL / LH+LL) on the 1HR or the 4HR. A bare momentum breakout with no
    # confirmed trend on either TF is NOT taken.
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

    log.info(f"[vix1] {symbol} bias=NONE: no confirmed trend on 1HR or 4HR — we trade trends only, "
             f"standing aside (up: {veto_reason(h1, True)})")
    return None
