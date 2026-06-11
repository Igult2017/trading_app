raise ImportError(
    "backtest_report.py has moved to signal_platform/backtest/backtest_report.py.\n"
    "This file is a deliberate guard — it must never be imported by production code.\n"
    "To run the backtest: python signal_platform/backtest/test_monthly_backtest.py"
)
