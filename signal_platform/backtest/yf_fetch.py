"""
yfinance data fetcher for backtesting — EURUSD H1 + D1 by date range.
Same return signature as ctrader_fetch.fetch(): (h1, h4, d1) Candle lists.

Run from signal_platform/backtest/ or signal_platform/.
"""
import os, sys
import yfinance as yf

_PLATFORM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PLATFORM not in sys.path:
    sys.path.insert(0, _PLATFORM)

from core.types import Candle, TF

_SYM = "EURUSD=X"


def _download(start: str, end: str, interval: str):
    ticker = yf.Ticker(_SYM)
    df = ticker.history(start=start, end=end, interval=interval, auto_adjust=True)
    return df


def _df_to_candles(df, tf: str) -> list[Candle]:
    out = []
    for ts, row in df.iterrows():
        # Ensure UTC — yfinance usually returns tz-aware, but guard either way
        try:
            import pytz
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=pytz.utc)
        except ImportError:
            pass
        t = int(ts.timestamp())
        out.append(Candle(
            time=t,
            open=float(row["Open"]),
            high=float(row["High"]),
            low=float(row["Low"]),
            close=float(row["Close"]),
            volume=float(row.get("Volume", 0.0)),
            timeframe=tf,
        ))
    return sorted(out, key=lambda c: c.time)


def _resample_h4(h1: list[Candle]) -> list[Candle]:
    grouped: dict = {}
    for c in h1:
        bucket = c.time - c.time % (4 * 3600)
        grouped.setdefault(bucket, []).append(c)
    return [
        Candle(
            time=b,
            open=bars[0].open,
            high=max(c.high for c in bars),
            low=min(c.low  for c in bars),
            close=bars[-1].close,
            volume=sum(c.volume for c in bars),
            timeframe=TF.H4,
        )
        for b, bars in sorted(grouped.items())
    ]


def fetch(
    h1_start: str = "2024-07-01",
    h1_end:   str = "2026-06-01",
    d1_start: str = "2024-01-01",
) -> tuple[list[Candle], list[Candle], list[Candle]]:
    """
    Returns (h1, h4, d1) sorted ascending by time.

    h1_start / h1_end : H1 bar range (YYYY-MM-DD)
    d1_start          : D1 start — needs ~200 bars before h1_start for EMA warmup
    """
    print(f"[yfinance] {_SYM} H1  {h1_start} to {h1_end} ...")
    df_h1 = _download(h1_start, h1_end, "1h")
    print(f"[yfinance] {_SYM} D1  {d1_start} to {h1_end} ...")
    df_d1 = _download(d1_start, h1_end, "1d")

    h1 = _df_to_candles(df_h1, TF.H1)
    d1 = _df_to_candles(df_d1, TF.D1)
    h4 = _resample_h4(h1)

    print(f"  H1: {len(h1)} bars  H4: {len(h4)} bars  D1: {len(d1)} bars\n")
    return h1, h4, d1
