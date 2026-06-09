"""
Builds a StrategyContext from resolved dependencies and fetched candle data.
Strategies never call this — the scanner calls it once per (strategy, instrument).
"""
import logging
from core.strategy_context import StrategyContext
from core.dependency_resolver import ResolvedDeps
from core.indicator_registry import compute as _compute_indicator
from core.pattern_registry import detect as _detect_patterns
from core.feature_registry import compute as _compute_feature
from core.indicator_types import IndicatorBundle
from core.pattern_types import PatternBundle
from core.types import MTFCandles, NewsContext, Session

log = logging.getLogger(__name__)

_MIN_CANDLES = 5   # minimum candles per TF — below this the context is unusable


def build(
    symbol:           str,
    deps:             ResolvedDeps,
    candle_view:      dict[str, list],
    news_context:     NewsContext | None,
    current_sessions: list[Session],
    spread:           float | None = None,
    volatility:       float | None = None,
) -> StrategyContext | None:
    """
    Returns None when any required TF has fewer than _MIN_CANDLES candles.
    Returning None signals the scanner to skip this strategy for this tick.
    """
    if not deps.timeframes:
        log.warning(f"[context_builder] {symbol}: strategy resolved zero timeframes — skip")
        return None

    for tf in deps.timeframes:
        count = len(candle_view.get(tf, []))
        if count < _MIN_CANDLES:
            log.debug(f"[context_builder] {symbol}/{tf}: {count} candles < {_MIN_CANDLES} — skip")
            return None

    mtf = MTFCandles.from_cache(candle_view, deps.timeframes)

    ind_cache: dict = {}
    for ind_id in deps.indicator_ids:
        result = _compute_indicator(ind_id, mtf)
        if result:
            ind_cache[ind_id] = result
    indicators = IndicatorBundle.from_cache(ind_cache, deps.indicator_ids)

    pat_tf_view = {tf: candle_view[tf] for tf in deps.timeframes if tf in candle_view}
    pat_cache: dict = {}
    for pat_id in deps.pattern_ids:
        pat_cache[pat_id] = _detect_patterns(pat_id, pat_tf_view)
    patterns = PatternBundle.from_cache(pat_cache, deps.pattern_ids)

    feature_results: dict = {}
    for feat_id in deps.feature_ids:
        feature_results[feat_id] = _compute_feature(feat_id, mtf)

    return StrategyContext(
        symbol     = symbol,
        candles    = mtf,
        indicators = indicators,
        patterns   = patterns,
        features   = feature_results,
        session    = current_sessions if deps.needs_session else [],
        news       = news_context     if deps.needs_news    else None,
        spread     = spread           if deps.needs_spread  else None,
        volatility = volatility       if deps.needs_volatility else None,
    )
