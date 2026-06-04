from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class IndicatorResult:
    """Output from a single indicator computation."""
    id:     str
    values: dict[str, Any] = field(default_factory=dict)  # key → computed value

    def get(self, key: str, default: Any = None) -> Any:
        return self.values.get(key, default)


@dataclass
class IndicatorBundle:
    """All indicator results for a single strategy run."""
    _data: dict[str, IndicatorResult] = field(default_factory=dict)

    def get(self, indicator_id: str) -> IndicatorResult | None:
        return self._data.get(indicator_id)

    @classmethod
    def from_cache(cls, cache: dict[str, IndicatorResult],
                   ids: list[str]) -> "IndicatorBundle":
        return cls(_data={k: cache[k] for k in ids if k in cache})
