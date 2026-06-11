"""
Backtest data helpers: fetch, convert, resample, EMA bias.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timezone
import yfinance as yf
import pandas as pd

from core.types import Candle, TF
from indicators.ema_200 import EMA200Indicator

SYMBOL      = "EURUSD=X"
_EMA_PERIOD = 200

# High-impact USD/EUR events (date + UTC hour) — ±30 min window
HIGH_IMPACT_EVENTS: list[datetime] = [
    # NFP
    datetime(2026, 4,  3, 12, 30, tzinfo=timezone.utc),
    datetime(2026, 5,  1, 12, 30, tzinfo=timezone.utc),
    datetime(2026, 6,  5, 12, 30, tzinfo=timezone.utc),
    # FOMC
    datetime(2026, 3, 19, 18,  0, tzinfo=timezone.utc),
    datetime(2026, 5,  7, 18,  0, tzinfo=timezone.utc),
    datetime(2026, 6, 18, 18,  0, tzinfo=timezone.utc),
    # US CPI
    datetime(2026, 4, 10, 12, 30, tzinfo=timezone.utc),
    datetime(2026, 5, 13, 12, 30, tzinfo=timezone.utc),
    datetime(2026, 6, 11, 12, 30, tzinfo=timezone.utc),
    # ECB
    datetime(2026, 3,  6, 13, 15, tzinfo=timezone.utc),
    datetime(2026, 4, 17, 13, 15, tzinfo=timezone.utc),
    datetime(2026, 6,  5, 13, 15, tzinfo=timezone.utc),
]
NEWS_WINDOW_SECS = 30 * 60


def near_news(dt: datetime) -> bool:
    ts = dt.timestamp()
    return any(abs(ts - ev.timestamp()) <= NEWS_WINDOW_SECS for ev in HIGH_IMPACT_EVENTS)


def _to_candles(df: pd.DataFrame, tf_name: str) -> list[Candle]:
    rows = []
    for ts, row in df.iterrows():
        try:
            def _f(col):
                v = row[col]
                return float(v.iloc[0]) if hasattr(v, "iloc") else float(v)
            o, h, l, c = _f("Open"), _f("High"), _f("Low"), _f("Close")
            v = _f("Volume") if "Volume" in row else 0.0
        except Exception:
            continue
        if pd.isna(c) or c <= 0:
            continue
        unix = int(ts.timestamp()) if hasattr(ts, "timestamp") else int(pd.Timestamp(ts).timestamp())
        rows.append(Candle(time=unix, open=o, high=h, low=l, close=c, volume=v, timeframe=tf_name))
    return rows


def _resample_h4(h1: list[Candle]) -> list[Candle]:
    grouped: dict = {}
    for c in h1:
        b = c.time - c.time % (4 * 3600)
        grouped.setdefault(b, []).append(c)
    return [
        Candle(time=b, open=bars[0].open,
               high=max(x.high for x in bars), low=min(x.low for x in bars),
               close=bars[-1].close, volume=sum(x.volume for x in bars),
               timeframe=TF.H4)
        for b, bars in sorted(grouped.items())
    ]


def fetch() -> tuple[list[Candle], list[Candle], list[Candle]]:
    print("Fetching EURUSD H1 + D1 from Yahoo Finance ...")
    df_h1 = yf.download(SYMBOL, interval="1h", period="60d",  progress=False, auto_adjust=True)
    df_d1 = yf.download(SYMBOL, interval="1d", period="400d", progress=False, auto_adjust=True)
    h1 = _to_candles(df_h1, TF.H1)
    d1 = _to_candles(df_d1, TF.D1)
    h4 = _resample_h4(h1)
    print(f"  H1: {len(h1)} bars   H4: {len(h4)} bars   D1: {len(d1)} bars")
    return h1, h4, d1


def ema_bias_at(h1_slice: list[Candle], d1_past: list[Candle]) -> tuple[bool, bool]:
    """
    Returns (bullish, valid).
    valid=False when not enough bars for EMA 200 on either timeframe.
    H1 and D1 must agree for valid=True.
    """
    if len(h1_slice) < _EMA_PERIOD or len(d1_past) < _EMA_PERIOD:
        return False, False
    ema_h1 = EMA200Indicator._ema([c.close for c in h1_slice[-_EMA_PERIOD:]], _EMA_PERIOD)
    ema_d1 = EMA200Indicator._ema([c.close for c in d1_past[-_EMA_PERIOD:]], _EMA_PERIOD)
    h1_bull = h1_slice[-1].close > ema_h1
    d1_bull = d1_past[-1].close > ema_d1
    if h1_bull != d1_bull:
        return False, False   # disagreement → no trade
    return h1_bull, True
