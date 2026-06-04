"""
Generates a candlestick chart PNG for a signal.

matplotlib/mplfinance is synchronous and CPU-bound.
generate_chart() is async and offloads to a thread pool executor
so it never blocks the asyncio event loop.
"""

import asyncio
import logging
import tempfile
from pathlib import Path

from core.types import Candle, Signal

log = logging.getLogger(__name__)


async def generate_chart(candles: list[Candle], signal: Signal) -> str | None:
    """
    Async wrapper — renders chart in a thread pool so the event loop stays free.
    Returns the filesystem path to the PNG, or None on failure.
    """
    if not candles:
        return None
    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _render_sync, candles, signal),
            timeout=30,   # chart gen should never take more than 30s
        )
    except asyncio.TimeoutError:
        log.warning("[chart_generator] timed out after 30s")
        return None
    except Exception as exc:
        log.warning(f"[chart_generator] error: {exc}")
        return None


def _render_sync(candles: list[Candle], signal: Signal) -> str | None:
    """Blocking chart render — runs inside the thread pool executor."""
    try:
        import pandas as pd
        import mplfinance as mpf
        import matplotlib.pyplot as plt

        df = _candles_to_df(candles)
        if df.empty:
            return None

        path = Path(tempfile.mktemp(suffix=".png"))

        add_lines = []
        if signal.entry_price:
            add_lines.append(mpf.make_addplot(
                [signal.entry_price] * len(df), color="blue", linestyle="--", width=0.8
            ))
        if signal.stop_loss:
            add_lines.append(mpf.make_addplot(
                [signal.stop_loss] * len(df), color="red", linestyle="--", width=0.8
            ))
        if signal.take_profit:
            add_lines.append(mpf.make_addplot(
                [signal.take_profit] * len(df), color="green", linestyle="--", width=0.8
            ))

        mpf.plot(
            df,
            type="candle",
            style="nightclouds",
            title=f"{signal.symbol} — {signal.direction.value.upper()} Signal",
            addplot=add_lines if add_lines else None,
            savefig=str(path),
            figsize=(12, 6),
        )
        plt.close("all")
        log.info(f"[chart_generator] saved {path}")
        return str(path)

    except Exception as exc:
        log.warning(f"[chart_generator] render failed: {exc}")
        return None


def _candles_to_df(candles: list[Candle]):
    try:
        import pandas as pd
        data = [{
            "Date":   pd.Timestamp(c.time, unit="s", tz="UTC"),
            "Open":   c.open,
            "High":   c.high,
            "Low":    c.low,
            "Close":  c.close,
            "Volume": c.volume,
        } for c in candles[-100:]]
        return pd.DataFrame(data).set_index("Date")
    except Exception:
        import pandas as pd
        return pd.DataFrame()
