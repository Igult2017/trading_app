"""
EURUSD Pullback — cTrader backtest (pattern identification only).

Detects pullback setups in real cTrader H1 data using the live strategy
logic: volume cluster, session phases, ADX, EMA 200 classification.

Fractal entry is proxied by H1 close past the pullback boundary
(real M1 data is too large for historical backtesting).

Run from signal_platform/:
    python backtest/test_ctrader_pullbacks.py
"""
import sys, os, logging
from datetime import datetime, timezone

_DIR      = os.path.dirname(os.path.abspath(__file__))
_PLATFORM = os.path.dirname(_DIR)
# Insert in reverse order so _DIR (backtest/) ends up at [0]:
# root has guard shim files that would shadow the real backtest modules otherwise.
for _p in (_PLATFORM, _DIR):
    if _p in sys.path:
        sys.path.remove(_p)
    sys.path.insert(0, _p)

logging.basicConfig(level=logging.WARNING)

from core.types import Candle, TF
from indicators.ema_200 import EMA200Indicator
from shared.session_phases import is_valid_phase
from shared.adx import calc_adx
from strategies.pullback_setup import find_volume_cluster, measure_pullback
from strategies.pullback_obstruction import is_at_4h_key_level
from backtest_report import simulate_outcomes, report
from ctrader_fetch import fetch

_PIP        = 0.00010
_SL_BUFFER  = 2 * _PIP
_EMA_PERIOD = 200
_ADX_PERIOD = 14
_ADX_MIN    = 25
MIN_RISK    = 5  * _PIP
MAX_RISK    = 60 * _PIP


def run_backtest(h1: list[Candle], h4: list[Candle], d1: list[Candle]) -> tuple[dict, dict]:
    confirmed: dict = {}
    watch:     dict = {}
    fired:     set  = set()

    c_total = c_sess = c_vol = c_dedup = c_pb = c_frac = c_risk = c_conf = c_watch = 0

    for i in range(_EMA_PERIOD, len(h1)):
        cur     = h1[i]
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
        c_vol += 1

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
        c_dedup += 1

        pb = measure_pullback(h1_win, ve, bullish, cluster_start=vs)
        if pb is None:
            continue
        c_pb += 1
        pb_high, pb_low, pb_count, _ = pb

        # H1 close must confirm breakout (close > pb_high for BUY, < pb_low for SELL).
        # This filters out spike bars where high briefly tagged pb_high then reversed —
        # a real M1 fractal would never form/hold in that case.
        # Entry is at the stop level (pb_high / pb_low), not the H1 close.
        if bullish     and cur.close <= pb_high:
            continue
        if not bullish and cur.close >= pb_low:
            continue

        # Invalidation: if any bar between pullback end and now closed through the
        # wrong boundary (stop-loss zone), the setup is dead — cancel the stop order.
        abs_start   = max(0, i - 30)
        pb_end_abs  = abs_start + ve + pb_count
        invalidated = False
        for bar in h1[pb_end_abs + 1: i]:
            if bullish     and bar.low  < (pb_low  - _SL_BUFFER):
                invalidated = True; break
            if not bullish and bar.high > (pb_high + _SL_BUFFER):
                invalidated = True; break
        if invalidated:
            continue
        c_frac += 1

        # Entry at stop level; risk spans full pullback range + buffer
        entry_price = pb_high if bullish else pb_low
        sl_price    = (pb_low  - _SL_BUFFER) if bullish else (pb_high + _SL_BUFFER)
        risk        = abs(entry_price - sl_price)
        if risk < MIN_RISK or risk > MAX_RISK:
            continue
        c_risk += 1

        h4_win   = [c for c in h4 if c.time <= cur.time][-50:]
        at_4h    = is_at_4h_key_level(h4_win, entry_price)

        # EMA 200 on D1
        d1_past = [c for c in d1 if c.time < cur.time]
        if len(d1_past) < _EMA_PERIOD:
            continue
        ema_d1     = EMA200Indicator._ema([c.close for c in d1_past[-_EMA_PERIOD:]], _EMA_PERIOD)
        d1_aligned = (d1_past[-1].close > ema_d1) == bullish

        entry  = round(entry_price, 5)
        sl_r   = round(sl_price, 5)
        tp_r   = round(entry + 2.0 * risk if bullish else entry - 2.0 * risk, 5)
        rec    = {
            "date":     utc_now.strftime("%Y-%m-%d %H:%M"),
            "dir":      "BUY" if bullish else "SELL",
            "entry":    entry,
            "sl":       sl_r,
            "tp":       tp_r,
            "rr":       2.0,
            "pb_count": pb_count,
            "cluster":  ve - vs + 1,
            "bar_idx":  i,
            "at_4h":    at_4h,
        }
        month = utc_now.strftime("%Y-%m")
        fired.add(abs_ve)

        if d1_aligned:
            confirmed.setdefault(month, []).append(rec)
            c_conf += 1
        else:
            adx, pdi, mdi = calc_adx(h1[:i + 1], period=_ADX_PERIOD)
            if adx >= _ADX_MIN and (pdi > mdi) == bullish:
                watch.setdefault(month, []).append(rec)
                c_watch += 1

    print("=== Filter Funnel ===")
    print(f"  H1 bars scanned          : {c_total}")
    print(f"  After session phases     : {c_sess}")
    print(f"  After volume cluster     : {c_vol}")
    print(f"  After dedup              : {c_dedup}")
    print(f"  After pullback (1-6c)    : {c_pb}")
    print(f"  After fractal proxy      : {c_frac}")
    print(f"  After risk (5-60 pips)   : {c_risk}")
    print(f"  >> Confirmed (EMA OK)    : {c_conf}")
    print(f"  >> Watch (ADX OK,EMA no) : {c_watch}\n")
    return confirmed, watch


if __name__ == "__main__":
    h1, h4, d1 = fetch()
    if len(h1) < _EMA_PERIOD + 10:
        print("Not enough H1 data.")
        sys.exit(1)

    confirmed, watch = run_backtest(h1, h4, d1)

    print("\n" + "=" * 55)
    print("CONFIRMED SIGNALS (D1 EMA 200 aligned)")
    print("=" * 55)
    simulate_outcomes(confirmed, h1)
    report(confirmed)

    print("\n" + "=" * 55)
    print("WATCH SIGNALS (EMA miss, ADX confirmed)")
    print("=" * 55)
    simulate_outcomes(watch, h1)
    report(watch)
