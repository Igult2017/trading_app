"""
Pattern registry — singleton.

Detection TF resolution:
  - If a pattern declares required_timeframes = ['H4', 'D1']:
    only those TFs are scanned (the pattern is TF-specific)
  - If required_timeframes = []:
    detect on every TF that appears in candles_by_tf
    (the pattern is TF-agnostic — strategy controls which TFs are passed)
"""

import logging
from core.base_pattern import BasePattern
from core.types import Candle
from core.pattern_types import PatternMatch

log = logging.getLogger(__name__)
_patterns: dict[str, BasePattern] = {}


def register(pattern: BasePattern) -> None:
    for attr in ("name", "id", "required_timeframes", "lookback"):
        if not hasattr(pattern, attr):
            raise ValueError(f"Pattern '{type(pattern).__name__}' missing '{attr}'")
    _patterns[pattern.id] = pattern
    log.info(f"[pattern_registry] registered '{pattern.name}' (id={pattern.id})")


def detect(pattern_id: str,
           candles_by_tf: dict[str, list[Candle]]) -> list[PatternMatch]:
    pat = _patterns.get(pattern_id)
    if not pat:
        log.warning(f"[pattern_registry] unknown pattern '{pattern_id}'")
        return []

    # TF-agnostic pattern: scan every TF provided by the strategy
    tfs = pat.required_timeframes if pat.required_timeframes else list(candles_by_tf.keys())

    results: list[PatternMatch] = []
    for tf in tfs:
        candles = candles_by_tf.get(tf, [])
        if len(candles) < pat.lookback:
            continue
        try:
            results.extend(pat.detect(candles, tf))
        except Exception as exc:
            log.error(f"[pattern_registry] '{pattern_id}' on {tf}: {exc}")
    return results
