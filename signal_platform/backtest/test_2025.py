"""
2025 EURUSD Pullback backtest — cTrader H1/D1 data.
Shows monthly P&L, BUY vs SELL breakdown, and session breakdown.

Run from signal_platform/:
    python backtest/test_2025.py
"""
import sys, os, logging

_DIR      = os.path.dirname(os.path.abspath(__file__))
_PLATFORM = os.path.dirname(_DIR)
for _p in (_PLATFORM, _DIR):
    if _p in sys.path: sys.path.remove(_p)
    sys.path.insert(0, _p)

logging.basicConfig(level=logging.WARNING)

from ctrader_fetch import fetch, _H1_BACKTEST, _D1_DEFAULT
from test_ctrader_pullbacks import run_backtest
from backtest_report import simulate_outcomes, report, breakdown_direction, breakdown_session


def _flat(signals_by_month: dict) -> list:
    return [s for sigs in signals_by_month.values() for s in sigs]


def _filter_2025(signals_by_month: dict) -> dict:
    return {m: v for m, v in signals_by_month.items() if m.startswith("2025")}


if __name__ == "__main__":
    # 4900 H1 bars ≈ 1.5 years of history (cTrader's per-request cap is 5000)
    h1, h4, d1 = fetch(h1_count=_H1_BACKTEST, d1_count=_D1_DEFAULT)

    confirmed, watch = run_backtest(h1, h4, d1)

    conf_25  = _filter_2025(confirmed)
    watch_25 = _filter_2025(watch)

    simulate_outcomes(conf_25,  h1)
    simulate_outcomes(watch_25, h1)

    all_25 = _flat(conf_25) + _flat(watch_25)

    print("\n" + "=" * 60)
    print("CONFIRMED SIGNALS — 2025  (D1 EMA 200 aligned, conf=0.75)")
    print("=" * 60)
    report(conf_25)

    print("\n" + "=" * 60)
    print("WATCH SIGNALS — 2025  (EMA miss, ADX confirmed, conf=0.70)")
    print("=" * 60)
    report(watch_25)

    total = len(all_25)
    if total == 0:
        print("\nNo 2025 signals found — check data fetch or filter settings.")
        sys.exit(0)

    print(f"\n{'=' * 60}")
    print(f"BUY vs SELL  —  {total} total 2025 signals (confirmed + watch)")
    print("=" * 60)
    breakdown_direction(all_25)

    print(f"\n{'=' * 60}")
    print(f"SESSION BREAKDOWN  —  {total} total 2025 signals")
    print("=" * 60)
    breakdown_session(all_25)
