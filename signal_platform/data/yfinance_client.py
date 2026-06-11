raise ImportError(
    "yfinance has been removed from the signal platform. "
    "The only data source is cTrader Open API (set CTRADER_* env vars). "
    "yfinance is still available inside signal_platform/backtest/ for historical backtests."
)
