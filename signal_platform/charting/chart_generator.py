"""
Generates a candlestick chart PNG for a signal.
Used by the AI validator and optionally attached to Telegram notifications.
"""

import logging
import tempfile
from pathlib import Path

from core.types import Candle, Signal

log = logging.getLogger(__name__)


def generate_chart(candles: list[Candle], signal: Signal) -> str | None:
    """
    Render a candlestick chart with entry/SL/TP levels marked.
    Returns filesystem path to the saved PNG, or None on failure.
    """
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
        log.info(f"[chart_generator] saved → {path}")
        return str(path)

    except Exception as exc:
        log.warning(f"[chart_generator] failed: {exc}")
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
        } for c in candles[-100:]]   # last 100 candles max
        df = pd.DataFrame(data).set_index("Date")
        return df
    except Exception:
        import pandas as pd
        return pd.DataFrame()
