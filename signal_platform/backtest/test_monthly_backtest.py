"""
Monthly signal-count backtest for EURUSD Pullback v2.

Uses 60 days of H1 + 400 days of D1 EURUSD data from Yahoo Finance.
The 1M fractal-break is approximated by H1 close past pb_high/pb_low.

Run from signal_platform/backtest/:
    python test_monthly_backtest.py

Or from signal_platform/:
    python backtest/test_monthly_backtest.py
"""
import sys, os, logging

_DIR      = os.path.dirname(os.path.abspath(__file__))   # signal_platform/backtest/
_PLATFORM = os.path.dirname(_DIR)                         # signal_platform/
for _p in (_PLATFORM, _DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

logging.basicConfig(level=logging.WARNING)

from datetime import datetime, timezone

from core.types import Candle
from shared.session_clock      import is_valid_session
from strategies.pullback_setup import find_volume_candle, measure_pullback
from strategies.pullback_obstruction import is_at_4h_key_level
from backtest_data   import fetch, near_news, ema_bias_at
from backtest_report import simulate_outcomes, report

_PIP = 0.00010


def run_backtest(h1: list[Candle], h4: list[Candle], d1: list[Candle]) -> dict:
    fired: set             = set()
    signals_by_month: dict = {}
    c_total = c_news = c_session = c_ema = c_vol = c_dedup = c_pb = c_frac = c_risk = c_4h = 0

    # Need 200 H1 bars for EMA 200; start from bar 200
    for i in range(200, len(h1)):
        cur     = h1[i]
        utc_now = datetime.fromtimestamp(cur.time, tz=timezone.utc)
        c_total += 1

        if near_news(utc_now):
            continue
        c_news += 1

        if not is_valid_session(utc_now):
            continue
        c_session += 1

        # EMA 200: H1 and D1 must agree
        h1_slice = h1[:i + 1]
        d1_past  = [c for c in d1 if c.time < cur.time]
        bullish, valid = ema_bias_at(h1_slice, d1_past)
        if not valid:
            continue
        c_ema += 1

        # Volume candle in last 15 H1 bars
        h1_window = h1[max(0, i - 14): i + 1]
        rel_idx   = find_volume_candle(h1_window, bullish=bullish)
        if rel_idx is None:
            continue
        c_vol += 1

        abs_idx = max(0, i - 14) + rel_idx
        if abs_idx in fired:
            continue
        c_dedup += 1

        # Pullback: 1-3 candles, depth 25-80%
        pb = measure_pullback(h1_window, rel_idx, bullish)
        if pb is None:
            continue
        c_pb += 1
        pb_high, pb_low, pb_count, _ = pb

        # H1 close proxy for fractal break (real M1 not available in 60d backtest)
        if bullish  and cur.close <= pb_high:
            continue
        if not bullish and cur.close >= pb_low:
            continue
        c_frac += 1

        # Risk levels
        pb_range = pb_high - pb_low
        buffer   = max(2 * _PIP, pb_range * 0.15)
        entry    = cur.close
        sl       = (pb_low - buffer) if bullish else (pb_high + buffer)
        risk     = abs(entry - sl)

        if risk < 5 * _PIP or risk > 60 * _PIP:
            continue
        c_risk += 1

        tp = entry + 2.0 * risk if bullish else entry - 2.0 * risk

        # 4H key zone check
        h4_window = [c for c in h4 if c.time <= cur.time][-50:]
        if is_at_4h_key_level(h4_window, entry):
            continue
        c_4h += 1

        fired.add(abs_idx)
        month = utc_now.strftime("%Y-%m")
        signals_by_month.setdefault(month, []).append({
            "date":     utc_now.strftime("%Y-%m-%d %H:%M"),
            "dir":      "BUY" if bullish else "SELL",
            "entry":    round(entry, 5),
            "sl":       round(sl, 5),
            "tp":       round(tp, 5),
            "rr":       2.0,
            "pb_count": pb_count,
            "bar_idx":  i,
        })

    print("\n=== Filter Funnel ===")
    print(f"  H1 bars scanned         : {c_total}")
    print(f"  After news filter       : {c_news}")
    print(f"  After session gate      : {c_session}")
    print(f"  After EMA 200 alignment : {c_ema}")
    print(f"  After volume candle     : {c_vol}")
    print(f"  After dedup             : {c_dedup}")
    print(f"  After pullback check    : {c_pb}")
    print(f"  After fractal proxy     : {c_frac}")
    print(f"  After risk bounds       : {c_risk}")
    print(f"  After 4H zone check     : {c_4h}  <- final signals")
    return signals_by_month


if __name__ == "__main__":
    h1, h4, d1 = fetch()
    if len(h1) < 200:
        print("Not enough H1 data (need 200+ bars).")
        sys.exit(1)
    results = run_backtest(h1, h4, d1)
    simulate_outcomes(results, h1)
    report(results)
