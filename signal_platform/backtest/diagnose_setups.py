"""
Diagnostic: prints full H1 context for every pullback setup found,
so we can see exactly what the algorithm is accepting vs what a manual
backtester would accept.

Run from signal_platform/:
    python backtest/diagnose_setups.py
"""
import sys, os, logging
from datetime import datetime, timezone

_DIR      = os.path.dirname(os.path.abspath(__file__))
_PLATFORM = os.path.dirname(_DIR)
for _p in (_PLATFORM, _DIR):
    if _p in sys.path: sys.path.remove(_p)
    sys.path.insert(0, _p)

logging.basicConfig(level=logging.WARNING)

from core.types import Candle, TF
from indicators.ema_200 import EMA200Indicator
from shared.session_phases import is_valid_phase
from shared.adx import calc_adx
from shared.candle_math import body_ratio, body_size, full_range
from shared.candle_math import is_bullish, is_bearish
from strategies.pullback_setup import find_volume_cluster, measure_pullback
from ctrader_fetch import fetch

_PIP        = 0.00010
_SL_BUFFER  = 2 * _PIP
_EMA_PERIOD = 200
_ADX_PERIOD = 14
_ADX_MIN    = 25
MIN_RISK    = 5  * _PIP
MAX_RISK    = 60 * _PIP


def fmt_c(c: Candle) -> str:
    dt  = datetime.fromtimestamp(c.time, tz=timezone.utc).strftime("%d/%m %H:%M")
    rng = (c.high - c.low) / _PIP
    br  = body_ratio(c)
    dir = "+" if is_bullish(c) else "-"
    return f"  {dt}  {dir}  range={rng:.1f}p  body%={br:.0%}  O={c.open:.5f} H={c.high:.5f} L={c.low:.5f} C={c.close:.5f}"


def diagnose(h1: list[Candle], h4: list[Candle], d1: list[Candle]) -> None:
    fired: set = set()
    n = 0

    for i in range(_EMA_PERIOD, len(h1)):
        cur     = h1[i]
        utc_now = datetime.fromtimestamp(cur.time, tz=timezone.utc)

        if not is_valid_phase(utc_now):
            continue

        h1_win = h1[max(0, i - 30): i + 1]

        bull_c = find_volume_cluster(h1_win, bullish=True)
        bear_c = find_volume_cluster(h1_win, bullish=False)
        if bull_c is None and bear_c is None:
            continue

        if bull_c is not None and bear_c is not None:
            bullish = bull_c[1] >= bear_c[1]
        elif bull_c is not None:
            bullish = True
        else:
            bullish = False
        vs, ve = bull_c if bullish else bear_c  # type: ignore[misc]

        abs_ve = max(0, i - 30) + ve
        if abs_ve in fired:
            continue

        pb = measure_pullback(h1_win, ve, bullish, cluster_start=vs)
        if pb is None:
            continue

        pb_high, pb_low, pb_count, _ = pb

        if bullish     and cur.close <= pb_high:
            continue
        if not bullish and cur.close >= pb_low:
            continue

        abs_start  = max(0, i - 30)
        pb_end_abs = abs_start + ve + pb_count
        invalidated = False
        for bar in h1[pb_end_abs + 1: i]:
            if bullish     and bar.low  < (pb_low  - _SL_BUFFER): invalidated = True; break
            if not bullish and bar.high > (pb_high + _SL_BUFFER): invalidated = True; break
        if invalidated:
            continue

        entry_price = pb_high if bullish else pb_low
        sl_price    = (pb_low  - _SL_BUFFER) if bullish else (pb_high + _SL_BUFFER)
        risk        = abs(entry_price - sl_price)
        if risk < MIN_RISK or risk > MAX_RISK:
            continue

        fired.add(abs_ve)

        # D1 EMA
        d1_past    = [c for c in d1 if c.time < cur.time]
        if len(d1_past) < _EMA_PERIOD:
            continue
        ema_d1     = EMA200Indicator._ema([c.close for c in d1_past[-_EMA_PERIOD:]], _EMA_PERIOD)
        d1_aligned = (d1_past[-1].close > ema_d1) == bullish
        ema_dist   = (d1_past[-1].close - ema_d1) / _PIP

        # ADX
        adx, pdi, mdi = calc_adx(h1[:i + 1], period=_ADX_PERIOD)

        # Bars from pullback end to trigger bar
        bars_gap = i - pb_end_abs

        # Cluster stats
        cluster_candles = h1_win[vs: ve + 1]
        cl_range  = (max(c.high for c in cluster_candles) - min(c.low for c in cluster_candles)) / _PIP
        cl_avgbr  = sum(body_ratio(c) for c in cluster_candles) / len(cluster_candles)

        # Pullback stats
        pb_candles = h1_win[ve + 1: ve + 1 + pb_count]
        pb_range   = (pb_high - pb_low) / _PIP
        pb_avgbr   = sum(body_ratio(c) for c in pb_candles) / len(pb_candles) if pb_candles else 0

        # Classification
        bucket = "CONFIRMED" if d1_aligned else ("WATCH" if adx >= _ADX_MIN and (pdi > mdi) == bullish else "SKIP")

        n += 1
        side = "BUY" if bullish else "SELL"
        print(f"\n{'='*70}")
        print(f"Setup #{n}  [{bucket}]  {utc_now.strftime('%Y-%m-%d %H:%M UTC')}  {side}")
        print(f"Entry={entry_price:.5f}  SL={sl_price:.5f}  Risk={risk/_PIP:.1f}p  TP={entry_price + 2*risk if bullish else entry_price - 2*risk:.5f}")
        print(f"D1 EMA {ema_d1:.5f}  |  D1 close {d1_past[-1].close:.5f}  |  dist={ema_dist:+.0f}p  |  aligned={d1_aligned}")
        print(f"ADX={adx:.1f}  +DI={pdi:.1f}  -DI={mdi:.1f}")
        print(f"Cluster: {ve-vs+1} candles, range={cl_range:.1f}p, avg body%={cl_avgbr:.0%}")
        print(f"Pullback: {pb_count} candles, range={pb_range:.1f}p, avg body%={pb_avgbr:.0%}, {pb_range/cl_range*100:.0f}% of cluster")
        print(f"Bars from pullback end to trigger: {bars_gap}")

        print(f"\n  --- 5 bars BEFORE cluster ---")
        for c in h1_win[max(0, vs-5): vs]:
            print(fmt_c(c))

        print(f"\n  --- CLUSTER ({ve-vs+1} candles) ---")
        for c in cluster_candles:
            print(fmt_c(c))

        print(f"\n  --- PULLBACK ({pb_count} candles) ---")
        for c in pb_candles:
            print(fmt_c(c))

        print(f"\n  --- TRIGGER BAR (entry bar, close confirms breakout) ---")
        print(fmt_c(cur))

    print(f"\n\nTotal setups printed: {n}")


if __name__ == "__main__":
    h1, h4, d1 = fetch()
    diagnose(h1, h4, d1)
