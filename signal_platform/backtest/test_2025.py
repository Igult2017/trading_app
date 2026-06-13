"""
2025 EURUSD Pullback backtest — full year via yfinance.
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

from yf_fetch import fetch
from test_ctrader_pullbacks import run_backtest
from backtest_report import simulate_outcomes, report, breakdown_direction, breakdown_session


def _flat(signals_by_month: dict) -> list:
    return [s for sigs in signals_by_month.values() for s in sigs]


def _filter_2025(signals_by_month: dict) -> dict:
    return {m: v for m, v in signals_by_month.items() if m.startswith("2025")}


if __name__ == "__main__":
    # H1 from Jul 2024 for warmup — D1 from Jan 2024 for EMA 200 warmup
    # H1 extends to Jun 2026 so late-2025 signals get outcome bars
    h1, h4, d1 = fetch(
        h1_start="2024-07-01",
        h1_end  ="2026-06-01",
        d1_start="2024-01-01",
    )

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
