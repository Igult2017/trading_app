from core.types import MTFCandles
from features.base_feature import BaseFeature
from shared.pullback_detector import Pullback, latest_pullback


class PullbackFeature(BaseFeature):
    """
    Returns: dict[str, Pullback | None]  (keyed by timeframe)
    Access:  context.features["pullback"]["H4"]
    Use latest_pullback or detect_pullbacks from shared.pullback_detector
    for full list access within a strategy.
    """
    name = "Pullback Detector"
    id   = "pullback"

    def compute(self, candles: MTFCandles) -> dict[str, Pullback | None]:
        result: dict[str, Pullback | None] = {}
        for tf in candles.timeframes():
            tf_candles = candles.get(tf)
            if tf_candles:
                result[tf] = latest_pullback(tf_candles)
        return result
