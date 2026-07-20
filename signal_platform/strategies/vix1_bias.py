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
from strategies.vix1_trend import clear_trend, is_choch

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

    # 3) CHoCH on the 1HR — momentum closed through the 1HR structure the other way. Independent of
    #    clear_trend: this is the reversal case, where the slope is ambiguous BY DEFINITION.
    if is_choch(h1, close, bullish):
        log.info(f"[vix1] {symbol} 1HR CHoCH: {'up' if bullish else 'down'} momentum closed through the "
                 f"opposite 1HR structure — bias {'BUY' if bullish else 'SELL'}")
        return (bullish, mc_idx, "choch", run[1])

    # 4) CHoCH on the 4HR — 1HR unclear, momentum closed through the 4HR structure the other way.
    if t1 == 0 and is_choch(h4, close, bullish):
        log.info(f"[vix1] {symbol} 4HR CHoCH: 1HR unclear, {'up' if bullish else 'down'} momentum closed "
                 f"through the opposite 4HR structure — bias {'BUY' if bullish else 'SELL'}")
        return (bullish, mc_idx, "choch4", run[1])

    # 5) momentum, but no confirmed trend on either TF and no structure break — a bare move; stand aside.
    log.info(f"[vix1] {symbol} bias=NONE: {'up' if bullish else 'down'} momentum but no confirmed trend "
             f"(1HR={t1}, 4HR={t4}) and no structure break — we trade trends & CHoCH only, standing aside")
    return None
