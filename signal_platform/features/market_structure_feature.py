from typing import Any
from core.types import MTFCandles
from features.base_feature import BaseFeature
from shared.swing_points import find_swing_points, classify_structure
from shared.trend_detector import detect


class MarketStructureFeature(BaseFeature):
    """
    Full market structure per timeframe: trend + swing points + HH/HL/LH/LL labels.

    Returns: dict[str, dict]  (keyed by timeframe)
    Access:  ms = context.features["market_structure"]["H4"]
             ms["trend"]     → Trend enum
             ms["swings"]    → list[SwingPoint]
             ms["structure"] → list[tuple[str, SwingPoint]]  (label, point)
    """
    name = "Market Structure"
    id   = "market_structure"

    def compute(self, candles: MTFCandles) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for tf in candles.timeframes():
            tf_candles = candles.get(tf)
            if not tf_candles:
                continue
            swings   = find_swing_points(tf_candles)
            labelled = classify_structure(swings)
            result[tf] = {
                "trend":     detect(tf_candles),
                "swings":    swings,
                "structure": labelled,
            }
        return result
