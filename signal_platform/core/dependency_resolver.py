"""
Reads a strategy's declarations and returns every TF and component
the platform must compute. No strategy code executes here.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from core.indicator_registry import get_timeframes as _ind_tfs
from core.pattern_registry import get_timeframes as _pat_tfs


@dataclass
class ResolvedDeps:
    timeframes:       list[str]
    indicator_ids:    list[str]
    pattern_ids:      list[str]
    feature_ids:      list[str]
    needs_news:       bool
    needs_session:    bool
    needs_volatility: bool
    needs_spread:     bool
    # Subset of `timeframes` that is enrichment-only: fetched and passed through, but an empty
    # series must NOT null the context (see strategy_context_builder). Default empty = old behaviour.
    optional_timeframes: list[str] = field(default_factory=list)
    # Timeframes for which the runner appends the bar CURRENTLY FORMING, built from a finer series
    # already fetched (`candle_aggregator.forming_bar`). OPT-IN, because the feed serves closed bars
    # only and every strategy but the one asking has been written against that. A strategy that does
    # not list a TF here sees exactly what it saw before. Default empty = old behaviour.
    wants_forming: list[str] = field(default_factory=list)


def resolve(strategy) -> ResolvedDeps:
    """
    Return a ResolvedDeps from the strategy's class-level declarations.

    TF list is the union of:
      - strategy.required_timeframes
      - each indicator's declared required_timeframes
      - each pattern's declared required_timeframes
    This ensures every component receives the candle data it needs.
    """
    tfs: set[str] = set(strategy.required_timeframes)

    for ind_id in strategy.required_indicators:
        tfs.update(_ind_tfs(ind_id))

    for pat_id in strategy.required_patterns:
        tfs.update(_pat_tfs(pat_id))

    # Optional (enrichment) TFs are fetched too, but never gate the context. A TF that is also
    # required/needed by a component stays REQUIRED — required always wins.
    optional = set(getattr(strategy, "optional_timeframes", None) or []) - tfs
    tfs |= optional

    return ResolvedDeps(
        timeframes       = list(tfs),
        optional_timeframes = list(optional),
        indicator_ids    = list(strategy.required_indicators),
        pattern_ids      = list(strategy.required_patterns),
        feature_ids      = list(strategy.required_features),
        needs_news       = bool(strategy.requires_news),
        needs_session    = bool(strategy.requires_session),
        needs_volatility = bool(strategy.requires_volatility),
        needs_spread     = bool(strategy.requires_spread),
        wants_forming    = [tf for tf in (getattr(strategy, "wants_forming", None) or []) if tf in tfs],
    )
