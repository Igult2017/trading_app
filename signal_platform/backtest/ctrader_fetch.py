"""
cTrader data fetch for backtesting — EURUSD H1 + D1, derives H4 from H1.
Run from signal_platform/backtest/ or signal_platform/.
"""
import asyncio, os, sys, time

_PLATFORM = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PLATFORM not in sys.path:
    sys.path.insert(0, _PLATFORM)

from core.types import Candle, TF
from config.settings import settings
import data.ctrader_session as _sess
from data.ctrader_client import fetch_bars

H1_COUNT = 1500   # ~62 days of H1
D1_COUNT = 400    # enough for EMA 200 warmup + scan window


async def _fetch() -> tuple[list[dict], list[dict]]:
    _sess.configure(
        client_id=settings.ctrader_client_id,
        client_secret=settings.ctrader_client_secret,
        account_id=settings.ctrader_account_id,
        env=settings.ctrader_env,
    )
    # Use stored access token directly — the live platform may have already
    # rotated the refresh token, making a refresh attempt fail with ACCESS_DENIED.
    if settings.ctrader_access_token:
        _sess._access_token = settings.ctrader_access_token
        _sess._token_expiry  = time.monotonic() + 3600

    print(f"[cTrader] fetching EURUSD H1 ({H1_COUNT} bars)...")
    h1_raw = await fetch_bars("EURUSD", "H1", count=H1_COUNT)
    print(f"[cTrader] fetching EURUSD D1 ({D1_COUNT} bars)...")
    d1_raw = await fetch_bars("EURUSD", "D1", count=D1_COUNT)
    return h1_raw, d1_raw


def _raw_to_candles(bars: list[dict], tf: str) -> list[Candle]:
    return [Candle(time=b["time"], open=b["open"], high=b["high"],
                   low=b["low"], close=b["close"], volume=b["volume"], timeframe=tf)
            for b in bars]


def _resample_h4(h1: list[Candle]) -> list[Candle]:
    grouped: dict = {}
    for c in h1:
        bucket = c.time - c.time % (4 * 3600)
        grouped.setdefault(bucket, []).append(c)
    return [
        Candle(time=b, open=bars[0].open, high=max(c.high for c in bars),
               low=min(c.low for c in bars), close=bars[-1].close,
               volume=sum(c.volume for c in bars), timeframe=TF.H4)
        for b, bars in sorted(grouped.items())
    ]


def fetch() -> tuple[list[Candle], list[Candle], list[Candle]]:
    """Returns (h1, h4, d1) as Candle lists, sorted ascending by time."""
    h1_raw, d1_raw = asyncio.run(_fetch())
    h1 = _raw_to_candles(h1_raw, TF.H1)
    d1 = _raw_to_candles(d1_raw, TF.D1)
    h4 = _resample_h4(h1)
    print(f"  H1: {len(h1)} bars  H4: {len(h4)} bars  D1: {len(d1)} bars\n")
    return h1, h4, d1
