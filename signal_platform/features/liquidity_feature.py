from core.types import MTFCandles, LiquiditySweep
from features.base_feature import BaseFeature
from shared.liquidity_sweep import detect_sweeps


class LiquidityFeature(BaseFeature):
    """
    Returns: dict[str, list[LiquiditySweep]]  (keyed by timeframe)
    Access:  context.features["liquidity_sweep"]["M15"]
    """
    name = "Liquidity Sweep"
    id   = "liquidity_sweep"

    def compute(self, candles: MTFCandles) -> dict[str, list[LiquiditySweep]]:
        result: dict[str, list[LiquiditySweep]] = {}
        for tf in candles.timeframes():
            tf_candles = candles.get(tf)
            if tf_candles:
                result[tf] = detect_sweeps(tf_candles)
        return result
