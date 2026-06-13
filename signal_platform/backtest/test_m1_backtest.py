"""
EURUSD Pullback — M1-accurate backtest.

Uses real M1 data from cTrader and the live fractal_entry() function.
H1/D1 from yfinance. For 2025 data, M1 fetch takes ~15 minutes.

Run from signal_platform/:
    python backtest/test_m1_backtest.py
"""
import sys, os, logging, bisect
from datetime import datetime, timezone

_DIR      = os.path.dirname(os.path.abspath(__file__))
_PLATFORM = os.path.dirname(_DIR)
for _p in (_PLATFORM, _DIR):
    if _p in sys.path: sys.path.remove(_p)
    sys.path.insert(0, _p)

logging.basicConfig(level=logging.WARNING)

import calendar
from core.types import Candle, TF
from indicators.ema_200 import EMA200Indicator
from shared.session_phases import is_valid_phase
from shared.adx import calc_adx
from strategies.pullback_setup import find_volume_cluster, measure_pullback, fractal_entry
from backtest_report import simulate_outcomes, report, breakdown_direction, breakdown_session
from yf_fetch import fetch as fetch_ohlc
from ctrader_fetch import fetch_m1

_PIP        = 0.00010
_SL_BUFFER  = 2 * _PIP
_EMA_PERIOD = 200
_ADX_PERIOD = 14
_ADX_MIN    = 25
MIN_RISK    = 5  * _PIP
MAX_RISK    = 60 * _PIP
MIN_CLUSTER = 14 * _PIP

# 2025 window bounds (Unix seconds)
_2025_START = calendar.timegm((2025, 1, 1, 0, 0, 0))
_2025_END   = calendar.timegm((2026, 1, 1, 0, 0, 0))


def run(h1, d1, m1):
    m1_times = [c.time for c in m1]   # for fast bisect lookups
    confirmed: dict = {}
    watch:     dict = {}
    fired:     set  = set()

    c_total = c_sess = c_cl = c_pb = c_frac = c_risk = c_conf = c_watch = 0

    for i in range(_EMA_PERIOD, len(h1)):
        cur     = h1[i]
        if not (_2025_START <= cur.time < _2025_END):
            continue
        utc_now = datetime.fromtimestamp(cur.time, tz=timezone.utc)
        c_total += 1

        if not is_valid_phase(utc_now):
            continue
        c_sess += 1

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
        vs, ve = bull_c if bullish else bear_c

        abs_ve = max(0, i - 30) + ve
        if abs_ve in fired:
            continue

        cluster_c = h1_win[vs: ve + 1]
        cl_rng = max(c.high for c in cluster_c) - min(c.low for c in cluster_c)
        if cl_rng < MIN_CLUSTER:
            continue
        c_cl += 1

        pb = measure_pullback(h1_win, ve, bullish, cluster_start=vs)
        if pb is None:
            continue
        c_pb += 1
        pb_high, pb_low, pb_count, pb_end_time = pb

        # M1 window: pb_end_time to end of this H1 bar (no look-ahead)
        m1_s = bisect.bisect_left(m1_times, pb_end_time)
        m1_e = bisect.bisect_left(m1_times, cur.time + 3600)
        m1_win = m1[m1_s: m1_e]

        entry = fractal_entry(m1_win, pb_high, pb_low, bullish, pb_end_time)
        if entry is None:
            continue
        c_frac += 1
        fired.add(abs_ve)

        sl   = (pb_low  - _SL_BUFFER) if bullish else (pb_high + _SL_BUFFER)
        risk = abs(entry - sl)
        if risk < MIN_RISK or risk > MAX_RISK:
            continue
        c_risk += 1

        tp     = entry + 2.0 * risk if bullish else entry - 2.0 * risk
        d1_pre = [c for c in d1 if c.time < cur.time]
        if len(d1_pre) < _EMA_PERIOD:
            continue
        ema    = EMA200Indicator._ema([c.close for c in d1_pre[-_EMA_PERIOD:]], _EMA_PERIOD)
        d1_ok  = (d1_pre[-1].close > ema) == bullish

        rec = {
            "date":     utc_now.strftime("%Y-%m-%d %H:%M"),
            "dir":      "BUY" if bullish else "SELL",
            "entry":    round(entry, 5),
            "sl":       round(sl, 5),
            "tp":       round(tp, 5),
            "rr":       2.0,
            "bar_idx":  i,
        }
        month = utc_now.strftime("%Y-%m")
        if d1_ok:
            confirmed.setdefault(month, []).append(rec)
            c_conf += 1
        else:
            adx, pdi, mdi = calc_adx(h1[:i + 1], period=_ADX_PERIOD)
            if adx >= _ADX_MIN and (pdi > mdi) == bullish:
                watch.setdefault(month, []).append(rec)
                c_watch += 1

    print("=== M1 Backtest Funnel ===")
    print(f"  2025 H1 bars in session  : {c_sess} / {c_total}")
    print(f"  After cluster + 14pip    : {c_cl}")
    print(f"  After pullback (1-6c)    : {c_pb}")
    print(f"  After M1 fractal         : {c_frac}")
    print(f"  After risk (5-60 pip)    : {c_risk}")
    print(f"  >> Confirmed             : {c_conf}")
    print(f"  >> Watch                 : {c_watch}\n")
    return confirmed, watch


if __name__ == "__main__":
    # H1/D1 via yfinance (fast)
    h1, _, d1 = fetch_ohlc(h1_start="2024-07-01", h1_end="2026-06-01",
                            d1_start="2024-01-01")

    # M1 via cTrader — fetch from start of 2025 warmup
    m1 = fetch_m1(start_unix=_2025_START)

    confirmed, watch = run(h1, d1, m1)
    simulate_outcomes(confirmed, h1)
    simulate_outcomes(watch,     h1)

    all_sigs = [s for v in {**confirmed, **watch}.values() for s in v]

    print("\n" + "=" * 60)
    print("CONFIRMED SIGNALS — 2025  (D1 EMA 200 aligned)")
    print("=" * 60)
    report(confirmed)

    print("\n" + "=" * 60)
    print("WATCH SIGNALS — 2025  (EMA miss, ADX confirmed)")
    print("=" * 60)
    report(watch)

    if all_sigs:
        print(f"\n{'=' * 60}")
        print(f"BUY vs SELL  —  {len(all_sigs)} total 2025 signals")
        print("=" * 60)
        breakdown_direction(all_sigs)

        print(f"\n{'=' * 60}")
        print(f"SESSION BREAKDOWN  —  {len(all_sigs)} total 2025 signals")
        print("=" * 60)
        breakdown_session(all_sigs)
