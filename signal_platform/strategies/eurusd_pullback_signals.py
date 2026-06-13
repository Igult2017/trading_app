"""
Signal builders for EURUSDPullbackStrategy two-stage alert system.
build_setup_signal() — Stage 1: H1 pullback spotted (alert only, no trade yet)
build_entry_signal() — Stage 2: M1 fractal approaching, place stop order NOW
"""
from core.types import Signal, Direction, TF

_PIP       = 0.00010
_SL_BUFFER = 2 * _PIP
MIN_RISK   = 5  * _PIP
MAX_RISK   = 60 * _PIP


def build_setup_signal(
    symbol: str, bullish: bool, pb_high: float, pb_low: float,
    pb_count: int, cluster_len: int, strategy_id: str, strategy_name: str,
) -> Signal:
    """Stage 1 — H1 pullback detected. Telegram alert only; no trade entry yet."""
    side   = "BUY" if bullish else "SELL"
    entry  = pb_high if bullish else pb_low
    sl     = (pb_low  - _SL_BUFFER) if bullish else (pb_high + _SL_BUFFER)
    risk   = abs(entry - sl)
    tp     = entry + 2.0 * risk if bullish else entry - 2.0 * risk
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if bullish else Direction.SELL,
        strategy_id       = strategy_id + "_setup",
        strategy_name     = strategy_name,
        entry_price       = round(entry, 5),
        stop_loss         = round(sl, 5),
        take_profit       = round(tp, 5),
        risk_reward       = 2.0,
        confidence        = 0.60,
        primary_timeframe = TF.H1,
        technical_reasons = [
            f"H1 {'bullish' if bullish else 'bearish'} cluster: {cluster_len} candles, body_ratio >= 0.55",
            f"Pullback: {pb_count}c [{pb_low:.5f} – {pb_high:.5f}], {(pb_high-pb_low)/_PIP:.1f} pips",
            f"Approximate entry zone: {entry:.5f} | SL: {sl:.5f} | Risk: ~{risk/_PIP:.0f} pips",
            "DO NOT enter yet — waiting for M1 fractal entry signal.",
        ],
        market_context    = f"SETUP — {side} H1 pullback | {cluster_len}c cluster | Awaiting M1 fractal",
        alert_only        = True,
    )


def build_entry_signal(
    symbol: str, bullish: bool, entry: float, pb_high: float, pb_low: float,
    pb_count: int, cluster_len: int, at_4h_zone: bool,
    d1_aligned: bool, adx: float, strategy_name: str,
) -> Signal | None:
    """Stage 2 — M1 fractal approaching breakout. Place buy/sell stop NOW."""
    side = "BUY" if bullish else "SELL"
    sl   = (pb_low  - _SL_BUFFER) if bullish else (pb_high + _SL_BUFFER)
    risk = abs(entry - sl)
    if risk < MIN_RISK or risk > MAX_RISK:
        return None
    tp        = entry + 2.0 * risk if bullish else entry - 2.0 * risk
    zone_note = "WARNING key level nearby" if at_4h_zone else "clear"

    if d1_aligned:
        sig_id, confidence = "eurusd_pullback_v2", 0.75
        ctx     = f"ENTRY — Place {side} stop at {entry:.5f} NOW | D1 EMA aligned"
        reasons = [
            f"Place {side} stop at {entry:.5f} — M1 fractal approaching breakout",
            f"SL: {sl:.5f} | TP: {tp:.5f} | Risk: {risk/_PIP:.0f} pips | RR 2:1",
            f"D1 EMA 200 {'bullish' if bullish else 'bearish'} aligned ✓",
            f"H1 cluster ({cluster_len}c) + {pb_count}c pullback confirmed",
            f"4H zone: {zone_note}",
        ]
    else:
        sig_id, confidence = "eurusd_pullback_v2_watch", 0.70
        ctx     = f"ENTRY WATCH — Place {side} stop at {entry:.5f} | EMA miss, ADX={adx:.1f}"
        reasons = [
            f"Place {side} stop at {entry:.5f} — M1 fractal approaching breakout",
            f"SL: {sl:.5f} | TP: {tp:.5f} | Risk: {risk/_PIP:.0f} pips | RR 2:1",
            f"ADX {adx:.1f} confirms trend — D1 EMA not aligned (trade at own risk)",
            f"H1 cluster ({cluster_len}c) + {pb_count}c pullback confirmed",
            f"4H zone: {zone_note}",
        ]

    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if bullish else Direction.SELL,
        strategy_id       = sig_id,
        strategy_name     = strategy_name,
        entry_price       = round(entry, 5),
        stop_loss         = round(sl, 5),
        take_profit       = round(tp, 5),
        risk_reward       = 2.0,
        confidence        = confidence,
        primary_timeframe = TF.H1,
        technical_reasons = reasons,
        smc_factors       = ["h1_volume_cluster", "pullback_continuation", "m1_fractal_entry"],
        market_context    = ctx,
    )
