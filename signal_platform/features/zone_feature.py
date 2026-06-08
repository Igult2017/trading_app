from core.types import MTFCandles, Zone
from features.base_feature import BaseFeature
from shared.zone_detection import find_zones


class ZoneFeature(BaseFeature):
    """
    Returns: dict[str, list[Zone]]  (keyed by timeframe)
    Access:  context.features["zones"]["H4"]
    Use shared.zone_detection.unmitigated() to filter to active zones.
    """
    name = "Supply & Demand Zones"
    id   = "zones"

    def compute(self, candles: MTFCandles) -> dict[str, list[Zone]]:
        result: dict[str, list[Zone]] = {}
        for tf in candles.timeframes():
            tf_candles = candles.get(tf)
            if tf_candles:
                result[tf] = find_zones(tf_candles, tf)
        return result
