"""
VIX.1 — the bias: WHICH WAY, and on what grounds. TREND on 4HR, MOMENTUM candle on 1HR.

This module is the ROUTER. What counts as a momentum candle lives in vix1_momentum (1HR); the trend
rules (HH+HL / LH+LL, and CHoCH) live in vix1_trend and now run on the **4HR** — the higher timeframe
is more reliable and is established sooner relative to the 1HR, so an aligned 1HR momentum candle is
caught EARLIER instead of waiting for 1HR structure to form. Here we only decide which of the three
tradeable situations we are in, all three momentum-led and none using an indicator:

  'trend' — an ESTABLISHED 4HR trend (HH+HL up / LH+LL down) with a 1HR momentum candle running WITH it.
  'range' — NO 4HR trend, and a 1HR momentum candle CLOSES beyond the recent 1HR range: a range
            breaking into a trend.
  'choch' — a 4HR trend, and the freshest 1HR momentum candle runs AGAINST it AND closes beyond the
            H4 swing that defined it. The market is CHANGING DIRECTION (bull -> bear or bear -> bull).
            Without that break it is only a deep pullback and we stand aside.

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
    candle of the run; VIX.1 operates from it and its close opens the 1M watch. `origin` is 'trend',
    'range' or 'choch'. Logs the exact reason at INFO when it returns None, so a miss stays diagnosable.

    TREND is read on the **4HR** (`clear_trend(h4)`), the MOMENTUM candle on the **1HR** (`momentum_run
    (h1)`). The 4HR trend is slower and more reliable, and it is established sooner *relative to the
    1HR*, so an aligned 1HR momentum candle qualifies EARLIER (it does not wait for 1HR structure to
    print). CHoCH tests the 1HR momentum candle's close against the H4 swings.
    """
    trend = clear_trend(h4)                     # 4HR trend

    if trend != 0:
        with_trend = trend > 0
        vr  = momentum_run(h1, with_trend)      # 1HR momentum
        opp = momentum_run(h1, not with_trend)
        last     = (vr[0] + vr[1] - 1) if vr else -1
        opp_last = (opp[0] + opp[1] - 1) if opp else -1

        if vr is not None and last > opp_last:
            return (with_trend, vr[0], "trend", vr[1])

        if opp is not None:
            # The freshest 1HR momentum runs AGAINST the 4HR trend. That is a CHANGE OF DIRECTION only
            # if the 1HR candle CLOSED beyond the 4HR swing that defined the trend — otherwise it is a
            # deep pullback inside a trend that still stands, and trading it would be fading the trend.
            if broke_structure(h4, h1[opp_last].close, not with_trend):
                log.info(f"[vix1] {symbol} 4HR STRUCTURE CHANGE: "
                         f"{'up' if with_trend else 'down'} 4HR trend broken by a "
                         f"{'down' if with_trend else 'up'} 1HR momentum candle closing through its "
                         f"defining H4 swing — bias flips to {'SELL' if with_trend else 'BUY'}")
                return (not with_trend, opp[0], "choch", opp[1])
            log.info(f"[vix1] {symbol} bias=NONE: 1HR momentum runs against the "
                     f"{'up' if with_trend else 'down'} 4HR trend but has NOT closed through the H4 "
                     f"swing — a deep pullback, not a change of direction; standing aside")
            return None

        log.info(f"[vix1] {symbol} bias=NONE: clear 4HR {'up (HH+HL)' if with_trend else 'down (LH+LL)'} "
                 f"trend, but {veto_reason(h1, with_trend)}")
        return None

    # No established trend — accept a RANGE BREAKING INTO A TREND (momentum-led, playbook-valid).
    # Take the FRESHEST qualifying run, never "whichever we test first". In a range BOTH directions
    # routinely qualify inside the lookback, and returning the bullish one traded a STALE move
    # against the live one in ~68% of the contested bars — the same wrong-direction bug already fixed
    # in the trend branch above. Freshest momentum wins, in every branch.
    best: tuple[int, bool, tuple[int, int]] | None = None
    for bullish in (True, False):
        vr = momentum_run(h1, bullish)
        if vr is not None and _run_breaks_range(h1, vr[0], vr[1], bullish):
            last = vr[0] + vr[1] - 1                     # index of the run's LAST candle = freshness
            if best is None or last > best[0]:
                best = (last, bullish, vr)
    if best is not None:
        _, bullish, vr = best
        return (bullish, vr[0], "range", vr[1])

    log.info(f"[vix1] {symbol} bias=NONE: no clear 4HR HH+HL/LH+LL trend and no momentum-led 1HR range "
             f"breakout (up: {veto_reason(h1, True)})")
    return None
