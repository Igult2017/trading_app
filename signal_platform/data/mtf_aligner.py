"""
Builds an MTFCandles object from a candle cache.
The scanner manages the cache; this module only assembles the view
that gets passed to strategy.analyze().
"""

from core.types import Candle, MTFCandles, TimeFrame


def build(cache: dict[TimeFrame, list[Candle]],
          timeframes: list[TimeFrame]) -> MTFCandles:
    """
    Assemble MTFCandles from the per-timeframe candle cache.
    Only timeframes declared by the strategy are included.
    """
    return MTFCandles.from_cache(cache, timeframes)
