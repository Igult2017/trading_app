from core.types import MTFCandles, Trend
from features.base_feature import BaseFeature
from shared.trend_detector import detect
from shared.mtf_utils import to_minutes


class TrendFeature(BaseFeature):
    """
    Returns: Trend enum (UPTREND / DOWNTREND / RANGING)
    Access:  context.features["trend"]
    """
    name = "Trend Detection"
    id   = "trend"

    def compute(self, candles: MTFCandles) -> Trend:
        tfs = candles.timeframes()
        if not tfs:
            return Trend.RANGING
        htf = max(tfs, key=to_minutes)
        htf_candles = candles.get(htf)
        if not htf_candles:
            return Trend.RANGING
        return detect(htf_candles)
