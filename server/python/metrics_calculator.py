"""
metrics_calculator.py
═══════════════════════════════════════════════════════════════════════════════
Trading Journal — Complete Metrics Engine
Version: 2.0.0

Architecture
────────────
  Layer 0  │  Constants & Type Definitions
  Layer 1  │  Input Validation & Data Normalisation
  Layer 2  │  Shared Utility Functions (pure, stateless)
  Layer 3  │  Metric Registry  (METRIC_REGISTRY maps key → compute fn)
  Layer 4  │  Individual Metric Calculators  (single-responsibility)
  Layer 5  │  Orchestrator  (calls registry, assembles output)
  Layer 6  │  Public API   (calculate_metrics / calculate_all_metrics)

Design Principles
────────────────
  ✓ Single-responsibility functions
  ✓ Pure functional design  (no side-effects, all state passed in)
  ✓ Defensive programming  (every accessor guarded)
  ✓ Data normalisation layer  (raw dict → TradeRecord dataclass)
  ✓ Layered architecture
  ✓ Avoid repeated computation  (SharedContext pre-computes shared vals)
  ✓ Structured data models  (frozen dataclasses, ImpactResult etc.)
  ✓ Unit-testable functions
  ✓ Replace magic numbers with constants
  ✓ Optimised for large datasets  (numpy arrays, single-pass loops)
  ✓ Metric registry system
  ✓ Consistent metric schema
  ✓ Proper time handling  (timezone-aware, ISO-8601)
  ✓ Scientific libraries  (numpy, scipy)
  ✓ Clear documentation
  ✓ Input validation
  ✓ Independent metric logic
  ✓ Shared utility functions
  ✓ Deterministic calculations  (sorted inputs)
  ✓ Extensible architecture
═══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import sys
import json
import math
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
from scipy import stats as scipy_stats

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 0 — CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

MIN_SAMPLE: int = 3

SCORE_BUCKETS: List[Tuple[float, float, str]] = [
    (4.25, 5.01, "4.5"),
    (3.75, 4.25, "4.0"),
    (3.25, 3.75, "3.5"),
    (0.00, 3.25, "3.0"),
]

DURATION_BUCKETS: List[Tuple[Optional[float], Optional[float], str]] = [
    (None,  30,   "0-30 min"),
    (30,    120,  "30-120 min"),
    (120,   480,  "2-8 hrs"),
    (480,   None, "8+ hrs"),
]

WIN_OUTCOMES:  frozenset = frozenset({"win", "Win", "WIN", "w", "profit"})
LOSS_OUTCOMES: frozenset = frozenset({"loss", "Loss", "LOSS", "l", "lose", "loser"})
BE_OUTCOMES:   frozenset = frozenset({"breakeven", "be", "BE", "scratch"})

RISK_LOW_MAX:  float = 1.0
RISK_MED_MAX:  float = 2.0

# camelCase → snake_case field map (from schema / JournalForm)
FIELD_MAP: Dict[str, str] = {
    "id": "id", "sessionId": "session_id", "instrument": "instrument",
    "direction": "direction", "outcome": "outcome", "pnl": "pnl",
    "riskPercent": "risk_percent", "rrRatio": "rr_ratio", "lotSize": "lot_size",
    "entryPrecisionScore": "entry_precision_score",
    "timingQualityScore": "timing_quality_score",
    "marketAlignmentScore": "market_alignment_score",
    "setupClarityScore": "setup_clarity_score",
    "confluenceScore": "confluence_score",
    "signalValidationScore": "signal_validation_score",
    "momentumScore": "momentum_score",
    "mtfAlignment": "mtf_alignment",
    "trendAlignment": "trend_alignment",
    "htfKeyLevelPresent": "htf_key_level_present",
    "keyLevelRespected": "key_level_respected",
    "targetLogic": "target_logic",
    "setupFullyValid": "setup_fully_valid",
    "ruleBroken": "rule_broken",
    "worthRepeating": "worth_repeating",
    "fomoTrade": "fomo_trade",
    "revengeTrade": "revenge_trade",
    "boredomTrade": "boredom_trade",
    "emotionalTrade": "emotional_trade",
    "externalDistraction": "external_distraction",
    "breakevenApplied": "breakeven_applied",
    "strongMomentum": "strong_momentum",
    "momentumWithHTFAlign": "momentum_with_htf_align",
    "counterMomentumEntry": "counter_momentum_entry",
    "tradeGrade": "trade_grade",
    "setupType": "setup_type",
    "exitReason": "exit_reason",
    "session": "session",
    "sessionPhase": "session_phase",
    "timeframe": "timeframe",
    "analysisTimeframe": "analysis_timeframe",
    "contextTimeframe": "context_timeframe",
    "marketRegime": "market_regime",
    "volatilityState": "volatility_state",
    "htfBias": "htf_bias",
    "directionalBias": "directional_bias",
    "keyLevelType": "key_level_type",
    "timingContext": "timing_context",
    "orderType": "order_type",
    "managementType": "management_type",
    "candlePattern": "candle_pattern",
    "newsImpact": "news_impact",
    "emotionalState": "emotional_state",
    "focusLevel": "focus_level",
    "confidenceLevel": "confidence_level",
    "energyLevel": "energy_level",
    "confidenceAtEntry": "confidence_at_entry",
    "rulesFollowed": "rules_followed",
    "strategy": "strategy",
    "riskHeat": "risk_heat",
    "mae": "mae", "mfe": "mfe",
    "plannedRR": "planned_rr", "achievedRR": "achieved_rr",
    "slDistance": "sl_distance", "tpDistance": "tp_distance",
    "spreadAtEntry": "spread_at_entry",
    "entryDeviation": "entry_deviation",
    "slDeviation": "sl_deviation",
    "tpDeviation": "tp_deviation",
    "openedAt": "opened_at", "closedAt": "closed_at", "tradeDate": "trade_date",
    "accountBalance": "account_balance", "startingBalance": "starting_balance",
    "dayOfWeek": "day_of_week",
}

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 0 — DATA MODELS
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TradeRecord:
    """Normalised, typed trade record. All fields are safely typed."""
    id: str
    session_id: str
    instrument: str
    direction: str
    outcome: str
    pnl: float
    risk_percent: Optional[float]
    rr_ratio: Optional[float]
    lot_size: Optional[float]
    entry_precision_score: Optional[float]
    timing_quality_score: Optional[float]
    market_alignment_score: Optional[float]
    setup_clarity_score: Optional[float]
    confluence_score: Optional[float]
    signal_validation_score: Optional[float]
    momentum_score: Optional[float]
    mtf_alignment: Optional[bool]
    trend_alignment: Optional[bool]
    htf_key_level_present: Optional[bool]
    key_level_respected: Optional[bool]
    target_logic: Optional[bool]
    setup_fully_valid: Optional[bool]
    rule_broken: Optional[bool]
    worth_repeating: Optional[bool]
    fomo_trade: Optional[bool]
    revenge_trade: Optional[bool]
    boredom_trade: Optional[bool]
    emotional_trade: Optional[bool]
    external_distraction: Optional[bool]
    breakeven_applied: Optional[bool]
    strong_momentum: Optional[bool]
    momentum_with_htf_align: Optional[bool]
    counter_momentum_entry: Optional[bool]
    trade_grade: Optional[str]
    setup_type: Optional[str]
    exit_reason: Optional[str]
    session: Optional[str]
    session_phase: Optional[str]
    timeframe: Optional[str]
    analysis_timeframe: Optional[str]
    context_timeframe: Optional[str]
    market_regime: Optional[str]
    volatility_state: Optional[str]
    htf_bias: Optional[str]
    directional_bias: Optional[str]
    key_level_type: Optional[str]
    timing_context: Optional[str]
    order_type: Optional[str]
    management_type: Optional[str]
    candle_pattern: Optional[str]
    news_impact: Optional[str]
    emotional_state: Optional[str]
    focus_level: Optional[str]
    confidence_level: Optional[str]
    energy_level: Optional[str]
    confidence_at_entry: Optional[str]
    rules_followed: Optional[str]
    strategy: Optional[str]
    risk_heat: Optional[str]
    mae: Optional[float]
    mfe: Optional[float]
    planned_rr: Optional[float]
    achieved_rr: Optional[float]
    sl_distance: Optional[float]
    tp_distance: Optional[float]
    spread_at_entry: Optional[float]
    entry_deviation: Optional[float]
    sl_deviation: Optional[float]
    tp_deviation: Optional[float]
    opened_at: Optional[datetime]
    closed_at: Optional[datetime]
    trade_date: Optional[datetime]
    duration_minutes: Optional[float]
    day_of_week: Optional[str]
    account_balance: Optional[float]
    starting_balance: Optional[float]


@dataclass
class ImpactResult:
    yes_win_rate: Optional[float]
    yes_count: int
    no_win_rate: Optional[float]
    no_count: int

    def to_dict(self) -> Dict:
        return {
            "yes": {"winRate": self.yes_win_rate, "count": self.yes_count},
            "no":  {"winRate": self.no_win_rate,  "count": self.no_count},
        }


@dataclass
class SharedContext:
    """Pre-computed values shared across all metric calculators (single pass)."""
    trades: List[TradeRecord]
    total: int
    wins: List[TradeRecord]
    losses: List[TradeRecord]
    breakevens: List[TradeRecord]
    win_count: int
    loss_count: int
    be_count: int
    win_rate: Optional[float]
    pnl_arr: np.ndarray
    win_pnl_arr: np.ndarray
    loss_pnl_arr: np.ndarray
    gross_profit: float
    gross_loss: float
    total_pnl: float


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 1 — NORMALISATION
# ─────────────────────────────────────────────────────────────────────────────

def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        v = float(value)
        return None if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return None


def _coerce_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("true", "yes", "1", "t"):
            return True
        if low in ("false", "no", "0", "f"):
            return False
    return None


def _coerce_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (OSError, OverflowError, ValueError):
            return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z",
                    "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
                    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(value, fmt)
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return None


def _normalise_outcome(raw: Any) -> str:
    if raw is None:
        return "unknown"
    s = str(raw).strip()
    if s in WIN_OUTCOMES:
        return "win"
    if s in LOSS_OUTCOMES:
        return "loss"
    if s in BE_OUTCOMES:
        return "breakeven"
    return "unknown"


def _normalise_direction(raw: Any) -> str:
    if raw is None:
        return "unknown"
    s = str(raw).strip().lower()
    if s in ("long", "buy", "l"):
        return "long"
    if s in ("short", "sell", "s"):
        return "short"
    return "unknown"


def normalise_trade(raw: Dict[str, Any]) -> Optional[TradeRecord]:
    """Convert raw camelCase dict to typed TradeRecord. Returns None if invalid."""
    def g(camel: str) -> Any:
        snake = FIELD_MAP.get(camel, camel)
        return raw.get(camel, raw.get(snake))

    raw_id  = g("id")
    raw_pnl = _coerce_float(g("pnl"))

    if raw_id is None or raw_pnl is None:
        return None

    opened_at  = _coerce_datetime(g("openedAt"))
    closed_at  = _coerce_datetime(g("closedAt"))
    trade_date = _coerce_datetime(g("tradeDate")) or opened_at or closed_at

    # Duration
    duration = None
    if opened_at and closed_at:
        delta = (closed_at - opened_at).total_seconds()
        duration = delta / 60.0 if delta >= 0 else None

    # Day of week from trade_date
    dow = trade_date.strftime("%A") if trade_date else None

    def cat(camel: str) -> Optional[str]:
        v = g(camel)
        return str(v).strip() or None if v is not None else None

    return TradeRecord(
        id=str(raw_id),
        session_id=str(g("sessionId") or ""),
        instrument=str(g("instrument") or "").strip().upper(),
        direction=_normalise_direction(g("direction")),
        outcome=_normalise_outcome(g("outcome")),
        pnl=raw_pnl,
        risk_percent=_coerce_float(g("riskPercent")),
        rr_ratio=_coerce_float(g("rrRatio")),
        lot_size=_coerce_float(g("lotSize")),
        entry_precision_score=_coerce_float(g("entryPrecisionScore")),
        timing_quality_score=_coerce_float(g("timingQualityScore")),
        market_alignment_score=_coerce_float(g("marketAlignmentScore")),
        setup_clarity_score=_coerce_float(g("setupClarityScore")),
        confluence_score=_coerce_float(g("confluenceScore")),
        signal_validation_score=_coerce_float(g("signalValidationScore")),
        momentum_score=_coerce_float(g("momentumScore")),
        mtf_alignment=_coerce_bool(g("mtfAlignment")),
        trend_alignment=_coerce_bool(g("trendAlignment")),
        htf_key_level_present=_coerce_bool(g("htfKeyLevelPresent")),
        key_level_respected=_coerce_bool(g("keyLevelRespected")),
        target_logic=_coerce_bool(g("targetLogic")),
        setup_fully_valid=_coerce_bool(g("setupFullyValid")),
        rule_broken=_coerce_bool(g("ruleBroken")),
        worth_repeating=_coerce_bool(g("worthRepeating")),
        fomo_trade=_coerce_bool(g("fomoTrade")),
        revenge_trade=_coerce_bool(g("revengeTrade")),
        boredom_trade=_coerce_bool(g("boredomTrade")),
        emotional_trade=_coerce_bool(g("emotionalTrade")),
        external_distraction=_coerce_bool(g("externalDistraction")),
        breakeven_applied=_coerce_bool(g("breakevenApplied")),
        strong_momentum=_coerce_bool(g("strongMomentum")),
        momentum_with_htf_align=_coerce_bool(g("momentumWithHTFAlign")),
        counter_momentum_entry=_coerce_bool(g("counterMomentumEntry")),
        trade_grade=cat("tradeGrade"),
        setup_type=cat("setupType"),
        exit_reason=cat("exitReason"),
        session=cat("session"),
        session_phase=cat("sessionPhase"),
        timeframe=cat("timeframe"),
        analysis_timeframe=cat("analysisTimeframe"),
        context_timeframe=cat("contextTimeframe"),
        market_regime=cat("marketRegime"),
        volatility_state=cat("volatilityState"),
        htf_bias=cat("htfBias"),
        directional_bias=cat("directionalBias"),
        key_level_type=cat("keyLevelType"),
        timing_context=cat("timingContext"),
        order_type=cat("orderType"),
        management_type=cat("managementType"),
        candle_pattern=cat("candlePattern"),
        news_impact=cat("newsImpact"),
        emotional_state=cat("emotionalState"),
        focus_level=cat("focusLevel"),
        confidence_level=cat("confidenceLevel"),
        energy_level=cat("energyLevel"),
        confidence_at_entry=cat("confidenceAtEntry"),
        rules_followed=cat("rulesFollowed"),
        strategy=cat("strategy"),
        risk_heat=cat("riskHeat"),
        mae=_coerce_float(g("mae")),
        mfe=_coerce_float(g("mfe")),
        planned_rr=_coerce_float(g("plannedRR")),
        achieved_rr=_coerce_float(g("achievedRR")),
        sl_distance=_coerce_float(g("slDistance")),
        tp_distance=_coerce_float(g("tpDistance")),
        spread_at_entry=_coerce_float(g("spreadAtEntry")),
        entry_deviation=_coerce_float(g("entryDeviation")),
        sl_deviation=_coerce_float(g("slDeviation")),
        tp_deviation=_coerce_float(g("tpDeviation")),
        opened_at=opened_at,
        closed_at=closed_at,
        trade_date=trade_date,
        duration_minutes=duration,
        day_of_week=dow,
        account_balance=_coerce_float(g("accountBalance")),
        starting_balance=_coerce_float(g("startingBalance")),
    )


def validate_and_normalise(raw_trades: Any) -> List[TradeRecord]:
    """Validate list input, normalise each trade, return deterministically sorted list."""
    if not isinstance(raw_trades, list):
        logger.warning("validate_and_normalise: expected list, got %s", type(raw_trades))
        return []

    records: List[TradeRecord] = []
    for i, raw in enumerate(raw_trades):
        if not isinstance(raw, dict):
            logger.warning("Skipping non-dict at index %d", i)
            continue
        rec = normalise_trade(raw)
        if rec is not None:
            records.append(rec)

    def sort_key(r: TradeRecord):
        epoch = datetime.min.replace(tzinfo=timezone.utc)
        return (r.closed_at or epoch, r.opened_at or epoch, r.id)

    return sorted(records, key=sort_key)


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 2 — PURE UTILITY FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def is_win(t: TradeRecord) -> bool:
    return t.outcome == "win"

def is_loss(t: TradeRecord) -> bool:
    return t.outcome == "loss"


def win_rate_of(trades: List[TradeRecord]) -> Optional[float]:
    """Return win rate [0-100] or None if fewer than MIN_SAMPLE trades."""
    n = len(trades)
    if n < MIN_SAMPLE:
        return None
    return round(sum(1 for t in trades if is_win(t)) / n * 100, 2)


def safe_mean(values: List[Optional[float]]) -> Optional[float]:
    cleaned = [v for v in values if v is not None and not math.isnan(v)]
    return float(np.mean(cleaned)) if cleaned else None


def safe_std(values: List[Optional[float]]) -> Optional[float]:
    cleaned = [v for v in values if v is not None and not math.isnan(v)]
    return float(np.std(cleaned, ddof=1)) if len(cleaned) >= 2 else None


def impact_of_boolean(trades: List[TradeRecord], field_name: str) -> ImpactResult:
    """Win-rate impact of a boolean field."""
    yes_t = [t for t in trades if getattr(t, field_name, None) is True]
    no_t  = [t for t in trades if getattr(t, field_name, None) is False]
    return ImpactResult(
        yes_win_rate=win_rate_of(yes_t), yes_count=len(yes_t),
        no_win_rate=win_rate_of(no_t),   no_count=len(no_t),
    )


def breakdown_by_categorical(trades: List[TradeRecord], field_name: str) -> Dict:
    """Group by categorical field and compute win rate per group."""
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in trades:
        val = getattr(t, field_name, None)
        if val:
            groups[str(val)].append(t)
    return {
        label: {
            "winRate": win_rate_of(grp),
            "count":   len(grp),
            "pl":      round(sum(t.pnl for t in grp), 2),
        }
        for label, grp in sorted(groups.items())
    }


def breakdown_by_score_bucket(trades: List[TradeRecord], field_name: str) -> List[Dict]:
    """Bucket trades by 0-5 numeric score into SCORE_BUCKETS."""
    buckets: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in trades:
        val = getattr(t, field_name, None)
        if val is None:
            continue
        for lo, hi, label in SCORE_BUCKETS:
            if lo <= val < hi:
                buckets[label].append(t)
                break
    return [
        {"score": label, "winRate": win_rate_of(buckets.get(label, [])), "count": len(buckets.get(label, []))}
        for _, _, label in SCORE_BUCKETS
    ]


def avg_field(trades: List[TradeRecord], field_name: str) -> Optional[float]:
    vals = [getattr(t, field_name) for t in trades if getattr(t, field_name) is not None]
    m = safe_mean(vals)
    return round(m, 4) if m is not None else None


def percent_true(trades: List[TradeRecord], field_name: str) -> Optional[float]:
    relevant = [t for t in trades if getattr(t, field_name, None) is not None]
    if len(relevant) < MIN_SAMPLE:
        return None
    trues = sum(1 for t in relevant if getattr(t, field_name) is True)
    return round(trues / len(relevant) * 100, 2)


# ─────────────────────────────────────────────────────────────────────────────
# SHARED CONTEXT
# ─────────────────────────────────────────────────────────────────────────────

def build_shared_context(trades: List[TradeRecord]) -> SharedContext:
    wins   = [t for t in trades if is_win(t)]
    losses = [t for t in trades if is_loss(t)]
    bes    = [t for t in trades if t.outcome == "breakeven"]

    pnl_arr      = np.array([t.pnl for t in trades], dtype=float)
    win_pnl_arr  = np.array([t.pnl for t in wins],   dtype=float)
    loss_pnl_arr = np.array([t.pnl for t in losses],  dtype=float)

    return SharedContext(
        trades=trades, total=len(trades),
        wins=wins, losses=losses, breakevens=bes,
        win_count=len(wins), loss_count=len(losses), be_count=len(bes),
        win_rate=win_rate_of(trades),
        pnl_arr=pnl_arr, win_pnl_arr=win_pnl_arr, loss_pnl_arr=loss_pnl_arr,
        gross_profit=float(win_pnl_arr.sum()) if len(win_pnl_arr) else 0.0,
        gross_loss=abs(float(loss_pnl_arr.sum())) if len(loss_pnl_arr) else 0.0,
        total_pnl=float(pnl_arr.sum()),
    )


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4 — METRIC CALCULATORS (one responsibility each)
# ─────────────────────────────────────────────────────────────────────────────

def calc_core(ctx: SharedContext) -> Dict:
    """Core KPIs: P&L, win rate, profit factor, expectancy, avg R:R."""
    if ctx.total == 0:
        return {}
    avg_win  = float(ctx.win_pnl_arr.mean())        if ctx.win_count  else 0.0
    avg_loss = float(abs(ctx.loss_pnl_arr.mean()))  if ctx.loss_count else 0.0
    pf       = (ctx.gross_profit / ctx.gross_loss)  if ctx.gross_loss else None
    exp      = (avg_win * (ctx.win_rate / 100) - avg_loss * (1 - ctx.win_rate / 100)
                if ctx.win_rate is not None else None)
    rr_vals  = [t.rr_ratio for t in ctx.trades if t.rr_ratio is not None and t.rr_ratio > 0]
    return {
        "totalPL":      round(ctx.total_pnl,   2),
        "grossProfit":  round(ctx.gross_profit, 2),
        "grossLoss":    round(ctx.gross_loss,   2),
        "winRate":      ctx.win_rate,
        "wins":         ctx.win_count,
        "losses":       ctx.loss_count,
        "breakevens":   ctx.be_count,
        "totalTrades":  ctx.total,
        "avgWin":       round(avg_win,  2),
        "avgLoss":      round(avg_loss, 2),
        "profitFactor": round(pf,  3)  if pf  is not None else None,
        "expectancy":   round(exp, 3)  if exp is not None else None,
        "avgRR":        round(safe_mean(rr_vals), 2) if rr_vals else None,
    }


def calc_streaks(ctx: SharedContext) -> Dict:
    """Win/loss streaks, peak-to-trough drawdown, recovery sequences (single pass)."""
    if ctx.total == 0:
        return {}
    max_win = max_loss = cur_count = 0
    cur_type = None
    peak = cumulative = max_dd = 0.0
    in_dd = False
    recovery = 0

    for t in ctx.trades:
        cumulative += t.pnl
        if cumulative > peak:
            peak = cumulative
            if in_dd:
                recovery += 1
            in_dd = False
        dd = peak - cumulative
        if dd > max_dd:
            max_dd = dd
            in_dd = True

        oc = "win" if is_win(t) else "loss" if is_loss(t) else None
        if oc:
            if oc == cur_type:
                cur_count += 1
            else:
                cur_type = oc
                cur_count = 1
            if oc == "win":
                max_win  = max(max_win,  cur_count)
            else:
                max_loss = max(max_loss, cur_count)

    return {
        "maxWinStreak":       max_win,
        "maxLossStreak":      max_loss,
        "currentStreakType":  cur_type,
        "currentStreakCount": cur_count,
        "maxDrawdown":        round(-max_dd, 2),
        "recoverySequences":  recovery,
    }


def calc_equity_curve(ctx: SharedContext) -> Dict:
    """Build equity curve array and growth summary."""
    if ctx.total == 0:
        return {"equityCurve": [], "equityGrowth": None}
    start_bal = next((t.starting_balance for t in ctx.trades if t.starting_balance), 0.0) or 0.0
    cumulative = 0.0
    curve = []
    for i, t in enumerate(ctx.trades, 1):
        cumulative += t.pnl
        curve.append({
            "tradeNumber":  i,
            "cumulativePL": round(cumulative, 2),
            "pnl":          round(t.pnl, 2),
            "date":         t.trade_date.isoformat() if t.trade_date else None,
        })
    ret_pct = (cumulative / start_bal * 100) if start_bal else None
    return {
        "equityCurve": curve,
        "equityGrowth": {
            "startingBalance": start_bal,
            "currentBalance":  round(start_bal + cumulative, 2),
            "totalPL":         round(cumulative, 2),
            "totalReturnPct":  round(ret_pct, 2) if ret_pct is not None else None,
        },
    }


def calc_risk_metrics(ctx: SharedContext) -> Dict:
    """Avg/max risk %, MAE, MFE, MFE capture, rules adherence, deviations."""
    trades = ctx.trades
    risk_v = [t.risk_percent for t in trades if t.risk_percent is not None]
    mae_v  = [t.mae for t in trades if t.mae is not None]
    mfe_v  = [t.mfe for t in trades if t.mfe is not None]
    cap_r  = [min(100.0, t.tp_distance / t.mfe * 100)
               for t in ctx.wins
               if t.mfe and t.mfe > 0 and t.tp_distance and t.tp_distance > 0]
    rule_rel = [t for t in trades if t.rule_broken is not None]
    rules_adh = (
        round(sum(1 for t in rule_rel if not t.rule_broken) / len(rule_rel) * 100, 2)
        if len(rule_rel) >= MIN_SAMPLE else None
    )
    return {
        "avgRiskPercent": round(safe_mean(risk_v), 3) if risk_v else None,
        "maxRiskPercent": round(max(risk_v), 3)       if risk_v else None,
        "minRiskPercent": round(min(risk_v), 3)       if risk_v else None,
        "avgMAE":         round(safe_mean(mae_v), 2)  if mae_v  else None,
        "worstMAE":       round(max(mae_v), 2)        if mae_v  else None,
        "avgMFE":         round(safe_mean(mfe_v), 2)  if mfe_v  else None,
        "bestMFE":        round(max(mfe_v), 2)        if mfe_v  else None,
        "avgMFECapture":  round(safe_mean(cap_r), 2)  if cap_r  else None,
        "rulesAdherence": rules_adh,
        "avgEntryDeviation": avg_field(trades, "entry_deviation"),
        "avgSLDeviation":    avg_field(trades, "sl_deviation"),
        "avgTPDeviation":    avg_field(trades, "tp_deviation"),
        "avgSpreadAtEntry":  avg_field(trades, "spread_at_entry"),
    }


def calc_direction_bias(ctx: SharedContext) -> Dict:
    """Win rate and P&L split by long vs short."""
    def _dir(grp):
        return {
            "trades":  len(grp),
            "winRate": win_rate_of(grp),
            "pl":      round(sum(t.pnl for t in grp), 2),
        }
    return {
        "long":  _dir([t for t in ctx.trades if t.direction == "long"]),
        "short": _dir([t for t in ctx.trades if t.direction == "short"]),
    }


def calc_session_breakdown(ctx: SharedContext) -> Dict:
    return breakdown_by_categorical(ctx.trades, "session")


def calc_instrument_breakdown(ctx: SharedContext) -> Dict:
    return breakdown_by_categorical(ctx.trades, "instrument")


def calc_strategy_performance(ctx: SharedContext) -> Dict:
    """Win rate, P&L, trade count per strategy."""
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        groups[t.strategy or "Unclassified"].append(t)
    out = {}
    for name, grp in sorted(groups.items()):
        wg = [t for t in grp if is_win(t)]
        lg = [t for t in grp if is_loss(t)]
        out[name] = {
            "trades":  len(grp),
            "winRate": win_rate_of(grp),
            "pl":      round(sum(t.pnl for t in grp), 2),
            "avgWin":  round(safe_mean([t.pnl for t in wg]),       2) if wg else None,
            "avgLoss": round(safe_mean([abs(t.pnl) for t in lg]),   2) if lg else None,
        }
    return out


def calc_setup_frequency(ctx: SharedContext) -> Dict:
    counts: Dict[str, int] = defaultdict(int)
    for t in ctx.trades:
        if t.setup_type:
            counts[t.setup_type] += 1
    return dict(sorted(counts.items()))


def calc_trade_grades(ctx: SharedContext) -> Dict:
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        if t.trade_grade:
            groups[t.trade_grade].append(t)
    return {
        grade: {
            "count":   len(groups.get(grade, [])),
            "winRate": win_rate_of(groups.get(grade, [])),
            "pl":      round(sum(t.pnl for t in groups.get(grade, [])), 2),
        }
        for grade in ("A", "B", "C", "D", "F")
    }


def calc_day_of_week_breakdown(ctx: SharedContext) -> Dict:
    ORDER = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        if t.day_of_week:
            groups[t.day_of_week].append(t)
    return {
        day: {"winRate": win_rate_of(groups[day]), "count": len(groups[day]),
              "pl": round(sum(t.pnl for t in groups[day]), 2)}
        for day in ORDER if day in groups
    }


def calc_timeframe_breakdown(ctx: SharedContext) -> Dict:
    def _tf(field: str) -> Dict:
        return breakdown_by_categorical(ctx.trades, field)
    return {
        "entry":    _tf("timeframe"),
        "analysis": _tf("analysis_timeframe"),
        "context":  _tf("context_timeframe"),
    }


def calc_exit_analysis(ctx: SharedContext) -> Dict:
    return breakdown_by_categorical(ctx.trades, "exit_reason")


def calc_psychology(ctx: SharedContext) -> Dict:
    """
    Full psychology panel:
    - Win-rate impact of every boolean flag (fomoTrade, revenge, etc.)
    - Win-rate impact of every categorical psych field
    - Score bucket breakdowns for all scored fields
    - Discipline / patience / consistency aggregate indices
    """
    trades = ctx.trades

    bool_fields = {
        "fomoTrade": "fomo_trade", "revengeTrade": "revenge_trade",
        "boredomTrade": "boredom_trade", "emotionalTrade": "emotional_trade",
        "externalDistraction": "external_distraction",
        "setupFullyValid": "setup_fully_valid", "ruleBroken": "rule_broken",
        "worthRepeating": "worth_repeating", "mtfAlignment": "mtf_alignment",
        "trendAlignment": "trend_alignment", "htfKeyLevelPresent": "htf_key_level_present",
        "keyLevelRespected": "key_level_respected", "targetLogic": "target_logic",
        "breakevenApplied": "breakeven_applied", "strongMomentum": "strong_momentum",
        "momentumWithHTFAlign": "momentum_with_htf_align",
        "counterMomentumEntry": "counter_momentum_entry",
    }
    impacts = {camel: impact_of_boolean(trades, snake).to_dict()
               for camel, snake in bool_fields.items()}

    cat_fields = {
        "emotionalState": "emotional_state", "focusLevel": "focus_level",
        "confidenceLevel": "confidence_level", "energyLevel": "energy_level",
        "confidenceAtEntry": "confidence_at_entry", "rulesFollowed": "rules_followed",
        "managementType": "management_type", "timingContext": "timing_context",
        "orderType": "order_type", "marketRegime": "market_regime",
        "volatilityState": "volatility_state", "htfBias": "htf_bias",
        "directionalBias": "directional_bias", "keyLevelType": "key_level_type",
        "sessionPhase": "session_phase", "newsImpact": "news_impact",
        "riskHeat": "risk_heat",
    }
    breakdowns = {camel: breakdown_by_categorical(trades, snake)
                  for camel, snake in cat_fields.items()}

    score_fields = {
        "entryPrecisionScore": "entry_precision_score",
        "timingQualityScore": "timing_quality_score",
        "marketAlignmentScore": "market_alignment_score",
        "setupClarityScore": "setup_clarity_score",
        "confluenceScore": "confluence_score",
        "signalValidationScore": "signal_validation_score",
        "momentumScore": "momentum_score",
    }
    score_impacts = {camel: breakdown_by_score_bucket(trades, snake)
                     for camel, snake in score_fields.items()}

    # Discipline index: % of trades with NO impulsive flags
    impulsive = ["fomo_trade", "revenge_trade", "boredom_trade", "emotional_trade"]
    n_data = [t for t in trades if any(getattr(t, f) is not None for f in impulsive)]
    discipline = (
        round(sum(1 for t in n_data
                  if not any(getattr(t, f) is True for f in impulsive)) / len(n_data) * 100, 2)
        if len(n_data) >= MIN_SAMPLE else None
    )

    # Patience index: % trades where setup was fully valid
    patience = percent_true(trades, "setup_fully_valid")

    # Consistency index: inverse of coefficient of variation (capped 0-100)
    consistency = None
    if ctx.total >= MIN_SAMPLE:
        mean_p = float(ctx.pnl_arr.mean())
        std_p  = float(ctx.pnl_arr.std(ddof=1)) if ctx.total > 1 else 0.0
        if abs(mean_p) > 0:
            cv = std_p / abs(mean_p)
            consistency = round(max(0.0, min(100.0, 100.0 - cv * 50)), 2)

    return {
        "booleanImpacts": impacts,
        "categoricals":   breakdowns,
        "scoreImpacts":   score_impacts,
        "discipline":     discipline,
        "patience":       patience,
        "consistency":    consistency,
    }


def calc_market_regime(ctx: SharedContext) -> Dict:
    return {
        "regime":     breakdown_by_categorical(ctx.trades, "market_regime"),
        "volatility": breakdown_by_categorical(ctx.trades, "volatility_state"),
    }


def calc_setup_tags(ctx: SharedContext) -> Dict:
    return breakdown_by_categorical(ctx.trades, "setup_type")


def calc_candle_patterns(ctx: SharedContext) -> Dict:
    return breakdown_by_categorical(ctx.trades, "candle_pattern")


def calc_duration_breakdown(ctx: SharedContext) -> Dict:
    """Win rate per duration bucket and per timing context category."""
    bucket_groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        if t.duration_minutes is None:
            continue
        dur = t.duration_minutes
        for lo, hi, label in DURATION_BUCKETS:
            if (lo is None or dur >= lo) and (hi is None or dur < hi):
                bucket_groups[label].append(t)
                break

    dur_v = [t.duration_minutes for t in ctx.trades if t.duration_minutes is not None]
    return {
        "buckets": {
            label: {"count": len(bucket_groups.get(label, [])),
                    "winRate": win_rate_of(bucket_groups.get(label, []))}
            for _, _, label in DURATION_BUCKETS
        },
        "timingContext": breakdown_by_categorical(ctx.trades, "timing_context"),
        "avgMinutes":      round(safe_mean(dur_v), 2) if dur_v else None,
        "avgMinutesWin":   round(safe_mean([t.duration_minutes for t in ctx.wins   if t.duration_minutes is not None]), 2) if ctx.wins   else None,
        "avgMinutesLoss":  round(safe_mean([t.duration_minutes for t in ctx.losses if t.duration_minutes is not None]), 2) if ctx.losses else None,
    }


def calc_session_phase(ctx: SharedContext) -> Dict:
    return breakdown_by_categorical(ctx.trades, "session_phase")


def calc_instrument_session_matrix(ctx: SharedContext) -> Dict:
    """Win rate for every (instrument, session) pair."""
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        if t.instrument and t.session:
            groups[f"{t.instrument} / {t.session}"].append(t)
    return {
        k: {"winRate": win_rate_of(v), "count": len(v), "pl": round(sum(t.pnl for t in v), 2)}
        for k, v in sorted(groups.items())
    }


def calc_strategy_market_matrix(ctx: SharedContext) -> Dict:
    """Win rate per strategy × market_regime combination."""
    outer: Dict[str, Dict[str, List[TradeRecord]]] = defaultdict(lambda: defaultdict(list))
    for t in ctx.trades:
        outer[t.strategy or "Unclassified"][t.market_regime or "Unknown"].append(t)
    return {
        strat: {
            regime: {"winRate": win_rate_of(grp), "count": len(grp)}
            for regime, grp in sorted(regimes.items())
        }
        for strat, regimes in sorted(outer.items())
    }


def calc_order_type_breakdown(ctx: SharedContext) -> Dict:
    return breakdown_by_categorical(ctx.trades, "order_type")


def calc_risk_heat_breakdown(ctx: SharedContext) -> Dict:
    """Win rate by risk heat — uses field if set, derives from risk_percent otherwise."""
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        if t.risk_heat:
            groups[t.risk_heat].append(t)
        elif t.risk_percent is not None:
            label = ("Low" if t.risk_percent <= RISK_LOW_MAX
                     else "Medium" if t.risk_percent <= RISK_MED_MAX else "High")
            groups[label].append(t)
    return {
        label: {"winRate": win_rate_of(grp), "count": len(grp)}
        for label, grp in sorted(groups.items())
    }


def calc_news_impact_breakdown(ctx: SharedContext) -> Dict:
    """Win rate by news impact level + avg R per level."""
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        if t.news_impact:
            groups[t.news_impact].append(t)
    out: Dict[str, Dict] = {}
    for k, grp in sorted(groups.items()):
        rr_v = [t.rr_ratio for t in grp if t.rr_ratio is not None]
        out[k] = {
            "winRate": win_rate_of(grp),
            "count":   len(grp),
            "pl":      round(sum(t.pnl for t in grp), 2),
            "avgRR":   round(safe_mean(rr_v), 2) if rr_v else None,
        }
    return out


def calc_mae_mfe(ctx: SharedContext) -> Dict:
    """Extended MAE/MFE: averages, MAE > SL count, MFE capture, MAE/MFE ratio."""
    trades = ctx.trades
    mae_v = [t.mae for t in trades if t.mae is not None and t.mae > 0]
    mfe_v = [t.mfe for t in trades if t.mfe is not None and t.mfe > 0]
    mae_gt_sl = sum(1 for t in trades if t.mae and t.sl_distance and t.mae > t.sl_distance)
    cap_r = [min(100.0, t.tp_distance / t.mfe * 100)
              for t in ctx.wins if t.mfe and t.mfe > 0 and t.tp_distance and t.tp_distance > 0]
    ratio_v = [t.mae / t.mfe for t in trades
                if t.mae is not None and t.mfe is not None and t.mfe > 0]
    return {
        "avgMAE":         round(safe_mean(mae_v), 4) if mae_v else None,
        "worstMAE":       round(max(mae_v), 4)       if mae_v else None,
        "avgMFE":         round(safe_mean(mfe_v), 4) if mfe_v else None,
        "bestMFE":        round(max(mfe_v), 4)       if mfe_v else None,
        "maeGtSLCount":   mae_gt_sl,
        "avgMFECapture":  round(safe_mean(cap_r),   2) if cap_r   else None,
        "avgMAEMFERatio": round(safe_mean(ratio_v), 3) if ratio_v else None,
    }


def calc_rr_analysis(ctx: SharedContext) -> Dict:
    """Planned vs achieved R:R comparison."""
    planned  = [t.planned_rr  for t in ctx.trades if t.planned_rr  is not None]
    achieved = [t.achieved_rr for t in ctx.trades if t.achieved_rr is not None]
    avg_p = safe_mean(planned)
    avg_a = safe_mean(achieved)
    slip  = (avg_a - avg_p) if (avg_p is not None and avg_a is not None) else None
    return {
        "avgPlannedRR":  round(avg_p, 3) if avg_p is not None else None,
        "avgAchievedRR": round(avg_a, 3) if avg_a is not None else None,
        "avgRRSlippage": round(slip,  3) if slip  is not None else None,
    }


def calc_setup_frequency_annualised(ctx: SharedContext) -> Dict:
    """Per-setup frequency: per day / week / month / year based on actual date range."""
    if ctx.total == 0:
        return {}
    dates = [t.trade_date for t in ctx.trades if t.trade_date is not None]
    if not dates:
        return {}
    days = max(1, (max(dates) - min(dates)).days + 1)
    groups: Dict[str, int] = defaultdict(int)
    for t in ctx.trades:
        if t.setup_type:
            groups[t.setup_type] += 1
    return {
        setup: {
            "count":    count,
            "perDay":   round(count / days, 3),
            "perWeek":  round(count / days * 7,   3),
            "perMonth": round(count / days * 30,  3),
            "perYear":  round(count / days * 365, 3),
        }
        for setup, count in sorted(groups.items())
    }


def calc_statistics(ctx: SharedContext) -> Dict:
    """t-test, Sharpe, Sortino, skewness, kurtosis."""
    if ctx.total < MIN_SAMPLE:
        return {}
    pnl = ctx.pnl_arr
    t_stat, p_val = scipy_stats.ttest_1samp(pnl, 0)
    mean_p = float(pnl.mean())
    std_p  = float(pnl.std(ddof=1)) if ctx.total > 1 else 0.0
    sharpe = (mean_p / std_p * math.sqrt(ctx.total)) if std_p > 0 else None
    down   = pnl[pnl < 0]
    sortino = None
    if len(down) >= 1:
        ds = float(np.std(down, ddof=1)) if len(down) > 1 else abs(float(down[0]))
        sortino = (mean_p / ds * math.sqrt(ctx.total)) if ds > 0 else None
    return {
        "tStat":       round(float(t_stat), 4),
        "pValue":      round(float(p_val),  4),
        "significant": bool(p_val < 0.05),
        "sharpe":      round(sharpe,  3) if sharpe  is not None else None,
        "sortino":     round(sortino, 3) if sortino is not None else None,
        "skewness":    round(float(scipy_stats.skew(pnl)),     4) if ctx.total >= 3 else None,
        "kurtosis":    round(float(scipy_stats.kurtosis(pnl)), 4) if ctx.total >= 4 else None,
        "meanPnL":     round(mean_p, 4),
        "stdPnL":      round(std_p,  4),
    }


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3 — METRIC REGISTRY
# ─────────────────────────────────────────────────────────────────────────────
# To add a new metric: write a calc_* function above, register it here.

METRIC_REGISTRY: Dict[str, Callable[[SharedContext], Any]] = {
    "core":                     calc_core,
    "streaks":                  calc_streaks,
    "riskMetrics":              calc_risk_metrics,
    "directionBias":            calc_direction_bias,
    "sessionBreakdown":         calc_session_breakdown,
    "instrumentBreakdown":      calc_instrument_breakdown,
    "strategyPerformance":      calc_strategy_performance,
    "setupFrequency":           calc_setup_frequency,
    "tradeGrades":              calc_trade_grades,
    "dayOfWeekBreakdown":       calc_day_of_week_breakdown,
    "timeframeBreakdown":       calc_timeframe_breakdown,
    "exitAnalysis":             calc_exit_analysis,
    "psychology":               calc_psychology,
    "marketRegime":             calc_market_regime,
    "setupTags":                calc_setup_tags,
    "candlePatterns":           calc_candle_patterns,
    "durationBreakdown":        calc_duration_breakdown,
    "sessionPhase":             calc_session_phase,
    "instrumentSessionMatrix":  calc_instrument_session_matrix,
    "strategyMarketMatrix":     calc_strategy_market_matrix,
    "orderTypeBreakdown":       calc_order_type_breakdown,
    "riskHeatBreakdown":        calc_risk_heat_breakdown,
    "newsImpactBreakdown":      calc_news_impact_breakdown,
    "maeMfe":                   calc_mae_mfe,
    "rrAnalysis":               calc_rr_analysis,
    "setupFrequencyAnnualised": calc_setup_frequency_annualised,
    "statistics":               calc_statistics,
    # equity is special — computed once, split into two keys
    "_equity":                  calc_equity_curve,
}


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 5 — ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

def _run_registry(ctx: SharedContext, keys: Optional[List[str]] = None) -> Dict:
    """
    Execute all registered calculators.
    Equity is computed once and stored under two keys to avoid duplication.
    """
    equity_cache: Optional[Dict] = None

    def _get_equity() -> Dict:
        nonlocal equity_cache
        if equity_cache is None:
            equity_cache = calc_equity_curve(ctx)
        return equity_cache

    target_keys = keys or [k for k in METRIC_REGISTRY if not k.startswith("_")]

    output: Dict[str, Any] = {}
    for key in target_keys:
        if key in ("equityCurve", "equityGrowth"):
            eq = _get_equity()
            output["equityCurve"]  = eq.get("equityCurve")
            output["equityGrowth"] = eq.get("equityGrowth")
            continue
        fn = METRIC_REGISTRY.get(key)
        if fn is None:
            logger.warning("Unknown metric key: %s", key)
            continue
        try:
            output[key] = fn(ctx)
        except Exception as exc:
            logger.exception("Error in metric '%s': %s", key, exc)
            output[key] = None

    # Always include equity if not already added
    if "equityCurve" not in output:
        eq = _get_equity()
        output["equityCurve"]  = eq.get("equityCurve")
        output["equityGrowth"] = eq.get("equityGrowth")

    return output


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 6 — PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def calculate_metrics(
    raw_trades: List[Dict],
    metric_keys: Optional[List[str]] = None,
) -> Dict:
    """
    Primary entry point.

    Parameters
    ----------
    raw_trades   : list of raw trade dicts (camelCase keys, from DB / API)
    metric_keys  : optional list of specific metric names; None = all

    Returns
    -------
    { "success": bool, "tradeCount": int, "metrics": { ... } }
    """
    try:
        trades = validate_and_normalise(raw_trades)
    except Exception as exc:
        logger.exception("Failed to normalise trades: %s", exc)
        return {"success": False, "error": str(exc), "tradeCount": 0, "metrics": {}}

    if not trades:
        return {"success": True, "tradeCount": 0, "metrics": {"core": {"totalTrades": 0}}}

    ctx     = build_shared_context(trades)
    metrics = _run_registry(ctx, keys=metric_keys)
    return {"success": True, "tradeCount": ctx.total, "metrics": metrics}


def calculate_all_metrics(raw_trades: List[Dict]) -> Dict:
    """Convenience wrapper: compute every registered metric."""
    return calculate_metrics(raw_trades, metric_keys=None)


# ─────────────────────────────────────────────────────────────────────────────
# CLI ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def _main() -> None:
    """Read JSON array from stdin, write metrics JSON to stdout."""
    logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
    try:
        raw = sys.stdin.read()
        trades = json.loads(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        sys.stdout.write(json.dumps({"success": False, "error": str(exc), "metrics": {}}))
        sys.exit(1)
    sys.stdout.write(json.dumps(calculate_all_metrics(trades), default=str))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        # ──────────────────────────────────────────────────────────
        # INLINE UNIT TESTS  (no external framework required)
        # Run:  python metrics_calculator.py --test
        # ──────────────────────────────────────────────────────────
        PASS = "\033[92m✓\033[0m"
        FAIL = "\033[91m✗\033[0m"
        failures = 0

        def check(name, cond, detail=""):
            global failures
            if cond:
                print(f"  {PASS}  {name}")
            else:
                failures += 1
                print(f"  {FAIL}  {name}  {detail}")

        BASE = {
            "id": "1", "sessionId": "s1", "instrument": "EURUSD",
            "direction": "long", "outcome": "win", "pnl": 200,
            "riskPercent": 1.0, "rrRatio": 2.0, "strategy": "SB",
            "tradeGrade": "A", "setupType": "Breakout", "session": "London",
            "timeframe": "M15", "fomoTrade": False, "ruleBroken": False,
            "setupFullyValid": True, "emotionalState": "calm",
            "marketRegime": "Trending", "mae": 5.0, "mfe": 25.0,
            "openedAt": "2024-01-02T09:00:00Z", "closedAt": "2024-01-02T11:00:00Z",
            "tradeDate": "2024-01-02T09:00:00Z",
        }

        def T(**kw):
            t = dict(BASE)
            t.update(kw)
            return t

        print("\n═══════════════════════════════")
        print("  Trading Journal — Unit Tests")
        print("═══════════════════════════════\n")

        print("Layer 1 — Normalisation")
        rec = normalise_trade(T())
        check("outcome normalised",    rec.outcome == "win")
        check("direction normalised",  rec.direction == "long")
        check("pnl as float",          rec.pnl == 200.0)
        check("duration = 120 min",    rec.duration_minutes == 120.0)
        check("day_of_week derived",   rec.day_of_week == "Tuesday")
        check("missing pnl → None",    normalise_trade({"id": "x"}) is None)
        check("bool coercion True",    _coerce_bool("yes") is True)
        check("bool coercion False",   _coerce_bool("0") is False)
        check("float NaN → None",      _coerce_float(float("nan")) is None)
        check("non-list input",        validate_and_normalise("bad") == [])

        print("\nLayer 2 — Utilities")
        pool = validate_and_normalise([
            T(id=str(i), outcome="win" if i < 6 else "loss", pnl=200 if i < 6 else -80)
            for i in range(10)
        ])
        wr = win_rate_of(pool)
        check("win_rate 6/10 = 60%",   abs(wr - 60.0) < 0.01, wr)
        check("win_rate < MIN → None", win_rate_of(pool[:2]) is None)
        check("safe_mean empty → None", safe_mean([]) is None)
        check("safe_mean [1,2,3] = 2",  abs(safe_mean([1.0, 2.0, 3.0]) - 2.0) < 1e-9)

        print("\nLayer 4 — Calculators")
        result = calculate_all_metrics([
            T(id=str(i), outcome="win" if i < 6 else "loss",
              pnl=200.0 if i < 6 else -80.0,
              tradeGrade="A" if i < 3 else "B")
            for i in range(10)
        ])
        check("success = True",        result["success"])
        check("tradeCount = 10",       result["tradeCount"] == 10)
        core = result["metrics"]["core"]
        check("core totalTrades",      core["totalTrades"] == 10)
        check("core winRate = 60",     abs(core["winRate"] - 60.0) < 0.01, core["winRate"])
        check("core profitFactor > 1", core["profitFactor"] > 1.0)
        check("core expectancy > 0",   core["expectancy"] > 0)
        streaks = result["metrics"]["streaks"]
        check("maxWinStreak >= 1",     streaks["maxWinStreak"] >= 1)
        check("maxDrawdown <= 0",      streaks["maxDrawdown"] <= 0)
        curve = result["metrics"]["equityCurve"]
        check("equityCurve len = 10",  len(curve) == 10)
        check("last tradeNumber = 10", curve[-1]["tradeNumber"] == 10)
        grades = result["metrics"]["tradeGrades"]
        check("grade A count = 3",     grades["A"]["count"] == 3)
        check("grade B count = 7",     grades["B"]["count"] == 7)
        psych = result["metrics"]["psychology"]
        check("psychology booleanImpacts present", "booleanImpacts" in psych)
        check("psychology scoreImpacts present",   "scoreImpacts"   in psych)
        strats = result["metrics"]["strategyPerformance"]
        check("strategy SB present",   "SB" in strats)
        check("strategy trades = 10",  strats["SB"]["trades"] == 10)
        mae_mfe = result["metrics"]["maeMfe"]
        check("avgMAE populated",      mae_mfe["avgMAE"] is not None)
        check("avgMFE populated",      mae_mfe["avgMFE"] is not None)

        print("\nEdge Cases")
        empty = calculate_all_metrics([])
        check("empty list success",    empty["success"])
        check("empty tradeCount = 0",  empty["tradeCount"] == 0)
        check("non-list success",      calculate_all_metrics("x")["success"])  # type: ignore

        print(f"\n{'All tests passed! ✓' if failures == 0 else str(failures) + ' test(s) FAILED'}\n")
        sys.exit(0 if failures == 0 else 1)
    else:
        _main()
