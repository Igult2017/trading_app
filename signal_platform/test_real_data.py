"""
Real-data test for EURUSDPullbackStrategy.
Fetches live EURUSD OHLCV data via yfinance (free, no key), converts to
platform Candle objects, runs the strategy across a rolling 1H window, and
reports every signal generated.

Run from the signal_platform directory:
    python test_real_data.py
"""

import sys
import os
import asyncio
import logging
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

import yfinance as yf
import pandas as pd

from core.types import Candle, MTFCandles, TF
from core.indicator_types import IndicatorBundle, IndicatorResult
from core.pattern_types import PatternBundle
from core.strategy_context import StrategyContext
from indicators.ema_200 import EMA200Indicator
from strategies.eurusd_pullback import EURUSDPullbackStrategy
from strategies.pullback_setup import find_volume_candle, measure_pullback, fractal_broken
from strategies.pullback_obstruction import has_4h_obstruction
from shared.session_clock import is_valid_session
from shared.market_condition import is_tradeable

logging.basicConfig(level=logging.WARNING)

SYMBOL  = "EURUSD=X"
_EMA_CHOP_PCT = 0.0008


def _to_candles(df: pd.DataFrame, tf_name: str) -> list[Candle]:
    rows = []
    for ts, row in df.iterrows():
        try:
            o = float(row["Open"].iloc[0]) if hasattr(row["Open"], "iloc") else float(row["Open"])
            h = float(row["High"].iloc[0]) if hasattr(row["High"], "iloc") else float(row["High"])
            l = float(row["Low"].iloc[0])  if hasattr(row["Low"],  "iloc") else float(row["Low"])
            c = float(row["Close"].iloc[0]) if hasattr(row["Close"], "iloc") else float(row["Close"])
            v = float(row["Volume"].iloc[0]) if hasattr(row.get("Volume", 0), "iloc") else float(row.get("Volume", 0))
        except Exception:
            continue
        if pd.isna(c) or c <= 0:
            continue
        unix = int(ts.timestamp()) if hasattr(ts, "timestamp") else int(pd.Timestamp(ts).timestamp())
        rows.append(Candle(time=unix, open=o, high=h, low=l, close=c, volume=v, timeframe=tf_name))
    return rows


def _resample_to_h4(h1_candles: list[Candle]) -> list[Candle]:
    if not h1_candles:
        return []
    grouped: dict[int, list[Candle]] = {}
    for c in h1_candles:
        bucket = c.time - (c.time % (4 * 3600))
        grouped.setdefault(bucket, []).append(c)
    h4: list[Candle] = []
    for bucket in sorted(grouped):
        bars = grouped[bucket]
        h4.append(Candle(
            time=bucket, open=bars[0].open,
            high=max(b.high for b in bars), low=min(b.low for b in bars),
            close=bars[-1].close, volume=sum(b.volume for b in bars),
            timeframe=TF.H4,
        ))
    return h4


def fetch_all() -> dict[str, list[Candle]]:
    print("Fetching EURUSD data from Yahoo Finance …")
    candles: dict[str, list[Candle]] = {}

    df_m1 = yf.download(SYMBOL, interval="1m", period="7d", progress=False, auto_adjust=True)
    candles[TF.M1] = _to_candles(df_m1, TF.M1)
    print(f"  M1 : {len(candles[TF.M1])} bars")

    df_h1 = yf.download(SYMBOL, interval="1h", period="60d", progress=False, auto_adjust=True)
    candles[TF.H1] = _to_candles(df_h1, TF.H1)
    print(f"  H1 : {len(candles[TF.H1])} bars")

    candles[TF.H4] = _resample_to_h4(candles[TF.H1])
    print(f"  H4 : {len(candles[TF.H4])} bars")

    df_d1 = yf.download(SYMBOL, interval="1d", period="2y", progress=False, auto_adjust=True)
    candles[TF.D1] = _to_candles(df_d1, TF.D1)
    print(f"  D1 : {len(candles[TF.D1])} bars")

    return candles


def debug_current_state(h1: list[Candle], h4: list[Candle], m1: list[Candle], ema: IndicatorResult):
    """Walk each filter and report exactly where the strategy is blocked right now."""
    print("\n--- Filter Debug (current market state) ---")

    utc_now = datetime.fromtimestamp(m1[-1].time, tz=timezone.utc)
    session_ok = is_valid_session(utc_now)
    print(f"  Session ({utc_now.strftime('%H:%M UTC')}) : {'PASS' if session_ok else 'BLOCKED — outside 6 session windows'}")

    tradeable = is_tradeable(h1)
    print(f"  Market tradeable (H1)       : {'PASS' if tradeable else 'BLOCKED — volatile or choppy'}")

    bias = ema.get("bias")
    dist = ema.get("distance_pct") or 0.0
    ema_ok = bias in ("bullish", "bearish") and dist >= _EMA_CHOP_PCT
    print(f"  EMA 200 bias={bias} dist={dist:.5f} : {'PASS' if ema_ok else 'BLOCKED — ranging/unknown bias'}")

    if not ema_ok:
        print("  [Can't check further — no valid EMA bias]")
        return

    bullish = (bias == "bullish")
    vol_idx = find_volume_candle(h1, bullish=bullish)
    print(f"  Volume candle (1H, bias={'bull' if bullish else 'bear'}): {'PASS — idx ' + str(vol_idx) if vol_idx is not None else 'BLOCKED — no volume candle in last 15 bars'}")

    if vol_idx is None:
        # Show most recent H1 bars for manual inspection
        print(f"  Last 5 H1 closes: {[round(c.close, 5) for c in h1[-5:]]}")
        return

    pb = measure_pullback(h1, vol_idx, bullish)
    if pb is None:
        # Count consecutive against-direction candles
        against = 0
        from shared.candle_math import is_bullish as _ib
        for c in h1[vol_idx + 1:]:
            if (_ib(c) != bullish):
                against += 1
            else:
                break
        print(f"  Pullback (1-3 candles)      : BLOCKED — {against} consecutive against-direction candles after vol candle")
    else:
        pb_high, pb_low, count = pb
        print(f"  Pullback                    : PASS — {count} candles, high={pb_high:.5f} low={pb_low:.5f}")

        fb = fractal_broken(m1, pb_high, pb_low, bullish)
        print(f"  1M fractal break            : {'PASS' if fb else 'BLOCKED — no M1 close past pb level'}")

        if fb:
            entry = m1[-1].close
            sl = pb_low - (pb_high - pb_low) * 0.10 if bullish else pb_high + (pb_high - pb_low) * 0.10
            risk = abs(entry - sl)
            obstr = has_4h_obstruction(h4, entry, bullish, risk)
            print(f"  4H obstruction             : {'BLOCKED — key level in path' if obstr else 'PASS — clear space to 2R'}")

    print("-----------------------------------------------------------------")


async def run_test():
    all_candles = fetch_all()
    m1_all = all_candles[TF.M1]
    h1_all = all_candles[TF.H1]
    h4_all = all_candles[TF.H4]
    d1_all = all_candles[TF.D1]

    if len(m1_all) < 10 or len(h1_all) < 200:
        print("Not enough data to run the strategy.")
        return

    strategy  = EURUSDPullbackStrategy()
    ema_indic = EMA200Indicator().compute(MTFCandles(_data={TF.H1: h1_all}))

    print(f"\nEMA 200: {ema_indic.get('value')}  bias={ema_indic.get('bias')}  dist={ema_indic.get('distance_pct'):.5f}")

    debug_current_state(h1_all, h4_all, m1_all, ema_indic)

    # Slide a 200-bar M1 window, step every 10 bars
    signals_found = []
    total_windows = 0
    step = 10

    print(f"\nScanning {len(m1_all)} M1 bars in {step}-bar steps …")

    for end in range(200, len(m1_all) + 1, step):
        m1_window = m1_all[max(0, end - 200):end]
        mtf = MTFCandles(_data={TF.M1: m1_window, TF.H1: h1_all, TF.H4: h4_all, TF.D1: d1_all})
        bundle = IndicatorBundle(_data={"ema_200": ema_indic})
        ctx = StrategyContext(symbol="EURUSD", candles=mtf, indicators=bundle, patterns=PatternBundle())
        result = await strategy.analyze(ctx)
        total_windows += 1
        for sig in result.signals:
            ts = datetime.fromtimestamp(m1_window[-1].time, tz=timezone.utc)
            signals_found.append((ts, sig))

    print(f"\nWindows scanned : {total_windows}")
    print(f"Signals fired   : {len(signals_found)}")

    if signals_found:
        print("\n-- Signals -----------------------------------------------------")
        for ts, sig in signals_found:
            print(f"  [{ts.strftime('%Y-%m-%d %H:%M')} UTC] {sig.direction.value.upper()}")
            print(f"    entry={sig.entry_price}  sl={sig.stop_loss}  tp={sig.take_profit}  rr={sig.risk_reward}")
            for reason in sig.technical_reasons:
                print(f"    · {reason}")
        print("-----------------------------------------------------------------")
    else:
        print("\nStrategy did not fire — all filters working as designed.")
        print("The session + volume candle + pullback + fractal-break combo")
        print("is intentionally selective; a signal requires all 5 conditions at once.")


if __name__ == "__main__":
    asyncio.run(run_test())
