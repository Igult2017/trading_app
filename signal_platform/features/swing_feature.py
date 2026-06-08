from core.types import MTFCandles, SwingPoint
from features.base_feature import BaseFeature
from shared.swing_points import find_swing_points


class SwingFeature(BaseFeature):
    """
    Returns: dict[str, list[SwingPoint]]  (keyed by timeframe)
    Access:  context.features["swing_points"]["H4"]
    """
    name = "Swing Points"
    id   = "swing_points"

    def compute(self, candles: MTFCandles) -> dict[str, list[SwingPoint]]:
        result: dict[str, list[SwingPoint]] = {}
        for tf in candles.timeframes():
            tf_candles = candles.get(tf)
            if tf_candles:
                result[tf] = find_swing_points(tf_candles)
        return result
