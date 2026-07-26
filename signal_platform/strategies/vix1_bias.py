"""
VIX.1 — the bias: WHICH WAY, and on what grounds. MOMENTUM-LED, then confirmed by trend or by a
change of character.

This module is the ROUTER. The momentum candle lives in vix1_momentum (always 1HR); the trend rule
(the leg's slope) and the CHoCH rule (structure reversal) live in vix1_trend. We trade TRENDS ONLY —
never a bare breakout with no confirmed direction. The freshest 1HR MOMENTUM candle leads (p1: the
trend must be the thing CARRYING the momentum, so the freshest momentum is the truth). We then ask, in
order, on what grounds we may take it:

  'trend'  — the momentum runs WITH a clear 1HR trend.
  'trend4' — the 1HR trend is UNCLEAR, but the momentum runs WITH a clear 4HR trend (the fallback).
  'choch'  — the momentum CLOSED through the 1HR structure the OTHER way (a lower high broken up / a
             higher low broken down): the market is CHANGING DIRECTION. Decoupled from clear_trend on
             purpose — a reversal is exactly when the slope reads flat, so gating CHoCH behind a clear
             trend made every such reversal escape (fixed 2026-07-20).
  'choch4' — the 1HR trend is unclear and the momentum closed through the 4HR structure the other way.

If none hold — momentum with no confirmed trend and no structure break — we DO NOT TRADE. Logs the exact
reason at INFO when it returns None. Structure is read from CLOSED candles only; the 1M uses none of
this (there the LINE says whether price is with us — vix1_entry — because swing structure cannot read a
spike-and-return inside a single hour).
"""
import logging

from core.types import Candle
from strategies.vix1_momentum import momentum_run, veto_reason
from strategies.vix1_trend import clear_trend   # is_choch no longer used: the trend itself now flips on a CHoCH

log = logging.getLogger(__name__)


def detect_bias(h1: list[Candle], h4: list[Candle], symbol: str = "") -> tuple[bool, int, str, int] | None:
    """
    Returns (bullish, mc_idx, origin, run_len) or None. `mc_idx` indexes into H1 — the FIRST candle of
    the freshest momentum run; VIX.1 operates from it and its close opens the 1M watch.

    The freshest 1HR momentum candle decides which way we are reasoning; trend/CHoCH then decide whether
    there are grounds to take it. `origin` is one of trend / trend4 / choch / choch4 (see module doc).
    """
    up = momentum_run(h1, True)
    dn = momentum_run(h1, False)
    up_last = (up[0] + up[1] - 1) if up else -1
    dn_last = (dn[0] + dn[1] - 1) if dn else -1
    if up_last < 0 and dn_last < 0:
        log.info(f"[vix1] {symbol} bias=NONE: no 1HR momentum candle either way — {veto_reason(h1, True)}")
        return None

    # The FRESHEST momentum candle is the truth — never reach past it for an older, aligned one.
    bullish, run = (True, up) if up_last > dn_last else (False, dn)
    mc_idx  = run[0]
    close   = h1[run[0] + run[1] - 1].close          # the breaking/leading candle's CLOSED price
    want    = 1 if bullish else -1
    t1 = clear_trend(h1)
    t4 = clear_trend(h4)

    # 1) momentum WITH a clear 1HR trend.
    if t1 == want:
        return (bullish, mc_idx, "trend", run[1])

    # 2) 1HR trend UNCLEAR, momentum WITH a clear 4HR trend (the fallback). Preferred over a 1HR CHoCH:
    #    if the 4HR is already trending our way, the 1HR is catching up to it, not reversing.
    if t1 == 0 and t4 == want:
        log.info(f"[vix1] {symbol} 4HR-BACKED TREND: 1HR trend unclear, 1HR momentum aligns with a clear "
                 f"4HR {'up' if bullish else 'down'} trend")
        return (bullish, mc_idx, "trend4", run[1])

    # PRO-TREND ONLY (user 2026-07-25/26: "Only trade pro trend"). The `choch` and `choch4` origins are
    # REMOVED — they took a reversal against the prevailing trend, which is by definition not
    # pro-trend. They are also redundant now: since 2026-07-26 the trend is STRUCTURE THAT PERSISTS
    # and flips on exactly the event `is_choch` was testing for (a body close through the protected
    # swing), so the moment a genuine change of character completes, clear_trend has ALREADY turned
    # and the next momentum candle that way qualifies as plain `trend`. Taking the reversal candle
    # itself was the strategy front-running its own trend rule.
    log.info(f"[vix1] {symbol} bias=NONE: {'up' if bullish else 'down'} momentum but it is NOT with the "
             f"trend (1HR={t1}, 4HR={t4}) — pro-trend only, standing aside")
    return None
