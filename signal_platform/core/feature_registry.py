import logging
from typing import Any
from core.types import MTFCandles

log = logging.getLogger(__name__)
_features: dict = {}   # id → BaseFeature


def register(feature) -> None:
    for attr in ("name", "id"):
        if not hasattr(feature, attr):
            raise ValueError(f"Feature '{type(feature).__name__}' missing '{attr}'")
    _features[feature.id] = feature
    log.info(f"[feature_registry] registered '{feature.name}' (id={feature.id})")


def get(feature_id: str):
    return _features.get(feature_id)


def compute(feature_id: str, candles: MTFCandles) -> Any:
    feat = _features.get(feature_id)
    if not feat:
        log.warning(f"[feature_registry] unknown feature '{feature_id}'")
        return None
    try:
        return feat.compute(candles)
    except Exception as exc:
        log.error(f"[feature_registry] '{feature_id}' compute error: {exc}")
        return None


def registered_ids() -> list[str]:
    return list(_features.keys())
