"""
Aggregates fine-grained candles into coarser timeframes.
Used for non-native cTrader periods: H2, H3, H6, H8, M6, etc.
Strategy authors never call this — candle_fetcher uses it transparently.
"""

from core.types import Candle
from shared.mtf_utils import to_minutes


def aggregate(base_candles: list[Candle], target_tf: str) -> list[Candle]:
    """
    Group base_candles into target_tf bars using timestamp-floor bucketing.

    Correct for any (base, target) pair where target_mins % base_mins == 0.
    Output timestamps align to the target bar's open-time boundary —
    matching how TradingView and most brokers stamp their bars.

    Args:
        base_candles: Validated candles at the finer (base) timeframe.
        target_tf:    Target timeframe string, e.g. "H2", "H6", "M10".
    """
    if not base_candles:
        return []

    target_secs = to_minutes(target_tf) * 60
    groups: dict[int, list[Candle]] = {}

    for c in base_candles:
        bucket = (c.time // target_secs) * target_secs
        groups.setdefault(bucket, []).append(c)

    result: list[Candle] = []
    for bucket_ts in sorted(groups):
        bars = groups[bucket_ts]
        result.append(Candle(
            time=bucket_ts,
            open=bars[0].open,
            high=max(b.high for b in bars),
            low=min(b.low for b in bars),
            close=bars[-1].close,
            volume=sum(b.volume for b in bars),
            timeframe=target_tf,
        ))

    return result
