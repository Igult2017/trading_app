import logging
from core.base_indicator import BaseIndicator
from core.types import MTFCandles
from core.indicator_types import IndicatorResult

log = logging.getLogger(__name__)
_indicators: dict[str, BaseIndicator] = {}


def register(indicator: BaseIndicator) -> None:
    for attr in ("name", "id", "required_timeframes"):
        if not hasattr(indicator, attr):
            raise ValueError(f"Indicator '{type(indicator).__name__}' missing '{attr}'")
    _indicators[indicator.id] = indicator
    log.info(f"[indicator_registry] registered '{indicator.name}' (id={indicator.id})")


def compute(indicator_id: str, candles: MTFCandles) -> IndicatorResult | None:
    ind = _indicators.get(indicator_id)
    if not ind:
        log.warning(f"[indicator_registry] unknown indicator '{indicator_id}'")
        return None
    try:
        return ind.compute(candles)
    except Exception as exc:
        log.error(f"[indicator_registry] '{indicator_id}' compute error: {exc}")
        return None
