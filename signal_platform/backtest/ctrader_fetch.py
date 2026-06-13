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

H1_COUNT    = 1500   # ~62 days of H1
D1_COUNT    = 400    # enough for EMA 200 warmup + scan window
_M1_PER_REQ = 4900   # safe under cTrader's 5000-bar-per-request cap


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


async def _fetch_m1_paginated(start_unix: int) -> list[dict]:
    """Paginate M1 bars backwards from now to start_unix."""
    _sess.configure(
        client_id=settings.ctrader_client_id,
        client_secret=settings.ctrader_client_secret,
        account_id=settings.ctrader_account_id,
        env=settings.ctrader_env,
    )
    if settings.ctrader_access_token:
        _sess._access_token = settings.ctrader_access_token
        _sess._token_expiry  = time.monotonic() + 3600

    start_ms = start_unix * 1000
    to_ms    = int(time.time() * 1000)
    seen: set[int]  = set()
    acc:  list[dict] = []
    n_req = 0

    while True:
        chunk = await fetch_bars("EURUSD", "M1", count=_M1_PER_REQ, to_ms=to_ms)
        if not chunk:
            break
        n_req += 1
        fresh = [b for b in chunk if b["time"] not in seen]
        acc.extend(fresh)
        seen.update(b["time"] for b in fresh)
        oldest_ms = chunk[0]["time"] * 1000
        pct = 100 * max(0, oldest_ms - start_ms) / max(1, int(time.time() * 1000) - start_ms)
        print(f"  [M1] req {n_req:3d}  oldest={chunk[0]['time']}  {len(acc):>8} bars  {100-pct:.0f}% done")
        if oldest_ms <= start_ms:
            break
        to_ms = oldest_ms - 1

    return sorted((b for b in acc if b["time"] >= start_unix), key=lambda b: b["time"])


def fetch_m1(start_unix: int) -> list[Candle]:
    """
    Fetch EURUSD M1 bars from start_unix (Unix seconds) to now via cTrader.
    Paginates backwards in chunks of 4900 bars. May take several minutes.
    Returns Candle list sorted ascending by time.
    """
    print(f"[cTrader] fetching EURUSD M1 from {start_unix} (paginated)...")
    raw = asyncio.run(_fetch_m1_paginated(start_unix))
    candles = _raw_to_candles(raw, TF.M1)
    print(f"  M1: {len(candles)} bars\n")
    return candles
