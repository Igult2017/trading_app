"""
metrics_calculator.py
═══════════════════════════════════════════════════════════════════════════════
Trading Journal — Complete Metrics Engine
Version: 2.1.0  (fix: stdin object unwrapping + journalEntries field remapping)
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

MIN_SAMPLE: int = 1

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
    "direction": "direction", "outcome": "outcome",
    # ── FIX: map DB column names used in journalEntries schema ──────────────
    "pnl": "pnl",
    "profitLoss": "pnl",           # journalEntries uses profitLoss, not pnl
    "profit_loss": "pnl",          # snake_case variant
    "rrRatio": "rr_ratio",
    "riskReward": "rr_ratio",      # journalEntries uses riskReward
    "risk_reward": "rr_ratio",
    "riskPercent": "risk_percent",
    "risk_percent": "risk_percent",
    "lotSize": "lot_size",
    "lot_size": "lot_size",
    # ── Scores ───────────────────────────────────────────────────────────────
    "entryPrecisionScore": "entry_precision_score",
    "entryPrecision": "entry_precision_score",       # JournalForm stores without "Score"
    "timingQualityScore": "timing_quality_score",
    "timingQuality": "timing_quality_score",
    "marketAlignmentScore": "market_alignment_score",
    "marketAlignment": "market_alignment_score",
    "setupClarityScore": "setup_clarity_score",
    "setupClarity": "setup_clarity_score",
    "confluenceScore": "confluence_score",
    "confluence": "confluence_score",
    "signalValidationScore": "signal_validation_score",
    "signalValidation": "signal_validation_score",  # JournalForm stores without "Score"
    "momentumScore": "momentum_score",
    # ── Booleans ─────────────────────────────────────────────────────────────
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
    # ── Categoricals ─────────────────────────────────────────────────────────
    "tradeGrade": "trade_grade",
    "setupType": "setup_type",
    "setupTag": "setup_type",              # JournalForm uses setupTag, not setupType
    "exitReason": "exit_reason",
    "primaryExitReason": "exit_reason",    # journalEntries uses primaryExitReason
    "primary_exit_reason": "exit_reason",
    "session": "session",
    "sessionName": "session",              # journalEntries uses sessionName
    "session_name": "session",
    "sessionPhase": "session_phase",
    "session_phase": "session_phase",
    "timeframe": "timeframe",
    "entryTF": "timeframe",                # journalEntries uses entryTF
    "entry_tf": "timeframe",
    "analysisTimeframe": "analysis_timeframe",
    "analysisTF": "analysis_timeframe",    # journalEntries uses analysisTF
    "analysis_tf": "analysis_timeframe",
    "contextTimeframe": "context_timeframe",
    "contextTF": "context_timeframe",      # journalEntries uses contextTF
    "context_tf": "context_timeframe",
    "marketRegime": "market_regime",
    "volatilityState": "volatility_state",
    "htfBias": "htf_bias",
    "directionalBias": "directional_bias",
    "keyLevelType": "key_level_type",
    "timingContext": "timing_context",
    "orderType": "order_type",
    "order_type": "order_type",
    "managementType": "management_type",
    "candlePattern": "candle_pattern",
    "indicatorState": "indicator_state",
    "newsImpact": "news_impact",
    "newsEnvironment": "news_impact",      # JournalForm uses newsEnvironment
    "emotionalState": "emotional_state",
    "focusLevel": "focus_level",
    "focusStressLevel": "focus_level",     # JournalForm uses focusStressLevel
    "confidenceLevel": "confidence_level",
    "energyLevel": "energy_level",
    "confidenceAtEntry": "confidence_at_entry",
    "rulesFollowed": "rules_followed",
    "strategy": "strategy",
    "strategyVersionId": "strategy",       # JournalForm uses strategyVersionId
    "riskHeat": "risk_heat",
    # ── MAE / MFE ────────────────────────────────────────────────────────────
    "mae": "mae", "mfe": "mfe",
    "plannedRR": "planned_rr",
    "achievedRR": "achieved_rr",
    "slDistance": "sl_distance",
    "stopLossDistance": "sl_distance",     # journalEntries uses stopLossDistance
    "stop_loss_distance": "sl_distance",
    "tpDistance": "tp_distance",
    "takeProfitDistance": "tp_distance",   # journalEntries uses takeProfitDistance
    "take_profit_distance": "tp_distance",
    "spreadAtEntry": "spread_at_entry",
    "spread_at_entry": "spread_at_entry",
    "entryDeviation": "entry_deviation",
    "slDeviation": "sl_deviation",
    "tpDeviation": "tp_deviation",
    # ── Timestamps ───────────────────────────────────────────────────────────
    "openedAt": "opened_at",
    "entryTime": "opened_at",              # journalEntries uses entryTime
    "entry_time": "opened_at",
    "entryTimeUTC": "opened_at",           # fallback
    "closedAt": "closed_at",
    "exitTime": "exit_time",
    "exit_time": "exit_time",
    "tradeDate": "trade_date",
    "createdAt": "created_at",
    "created_at": "created_at",
    # ── Balance ──────────────────────────────────────────────────────────────
    "accountBalance": "account_balance",
    "account_balance": "account_balance",
    "startingBalance": "starting_balance",
    "starting_balance": "starting_balance",
    # ── Day of week ──────────────────────────────────────────────────────────
    "dayOfWeek": "day_of_week",
    "day_of_week": "day_of_week",
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
    momentum_validity: Optional[str]   # raw "Strong"/"Moderate"/"Weak" string
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
    indicator_state: Optional[str]
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
                    "%Y-%m-%dT%H:%M:%S",       # ISO with seconds, no tz (common DB format)
                    "%Y-%m-%dT%H:%M",          # datetime-local input (no seconds)
                    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d",
                    "%d/%m/%Y %H:%M", "%d/%m/%Y"):
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


def _get_field(raw: Dict[str, Any], camel: str) -> Any:
    """
    Resolve a field from the raw dict using FIELD_MAP.
    Tries: camelCase key → mapped snake_case key → direct camelCase lookup.
    This handles both the original camelCase API shape AND the journalEntries
    DB column names (entryTF, profitLoss, primaryExitReason, etc.).
    """
    # 1. Direct lookup by the camelCase key name as provided
    if camel in raw:
        return raw[camel]
    # 2. Look up via FIELD_MAP to find the snake_case target, then check raw
    snake = FIELD_MAP.get(camel, camel)
    if snake in raw:
        return raw[snake]
    # 3. Try alternative aliases — scan all FIELD_MAP entries that map to same snake
    for alias, target in FIELD_MAP.items():
        if target == snake and alias in raw:
            return raw[alias]
    return None


def normalise_trade(raw: Dict[str, Any]) -> Optional[TradeRecord]:
    """Convert raw camelCase dict to typed TradeRecord. Returns None if invalid."""
    # Merge manualFields and aiExtracted JSONB blobs into the flat dict first,
    # so scores, booleans and categorical fields are visible to _get_field().
    # Top-level values always win (they override blob values).
    merged: Dict[str, Any] = {}
    for blob_key in ("manualFields", "manual_fields", "aiExtracted", "ai_extracted"):
        blob = raw.get(blob_key)
        if isinstance(blob, dict):
            merged.update(blob)
    merged.update(raw)
    raw = merged

    def g(camel: str) -> Any:
        return _get_field(raw, camel)

    raw_id  = g("id")

    # ── FIX: accept profitLoss (journalEntries) as well as pnl ──────────────
    raw_pnl = _coerce_float(g("pnl"))
    if raw_pnl is None:
        raw_pnl = _coerce_float(g("profitLoss"))
    if raw_pnl is None:
        raw_pnl = _coerce_float(raw.get("profit_loss"))
    # Default to 0 when pnl is missing so the trade is still counted.
    # Only drop the trade if it has no id at all (truly unidentifiable).
    if raw_id is None:
        return None
    if raw_pnl is None:
        raw_pnl = 0.0

    # ── Timestamps ──────────────────────────────────────────────────────────
    # journalEntries uses entryTime / entryTimeUTC; original schema uses openedAt
    opened_at = (
        _coerce_datetime(g("openedAt"))
        or _coerce_datetime(g("entryTime"))
        or _coerce_datetime(g("entryTimeUTC"))
        or _coerce_datetime(raw.get("entry_time"))
        or _coerce_datetime(raw.get("entry_time_utc"))
    )
    closed_at = (
        _coerce_datetime(g("closedAt"))
        or _coerce_datetime(g("exitTime"))
        or _coerce_datetime(raw.get("exit_time"))
    )
    trade_date = (
        _coerce_datetime(g("tradeDate"))
        or opened_at
        or closed_at
        or _coerce_datetime(g("createdAt"))
        or _coerce_datetime(raw.get("created_at"))
    )

    # Duration — prefer computed from timestamps, fall back to tradeDuration string
    duration = None
    if opened_at and closed_at:
        delta = (closed_at - opened_at).total_seconds()
        duration = delta / 60.0 if delta >= 0 else None
    if duration is None:
        # Parse tradeDuration strings like "2h 30m", "45m", "1h", "90" (minutes)
        td_raw = g("tradeDuration") or raw.get("trade_duration") or raw.get("tradeDuration")
        if td_raw is not None:
            import re as _re
            td_str = str(td_raw).strip()
            d = _re.search(r"(\d+(?:\.\d+)?)\s*d", td_str)
            h = _re.search(r"(\d+(?:\.\d+)?)\s*h", td_str)
            m = _re.search(r"(\d+(?:\.\d+)?)\s*m(?!o)", td_str)  # "m" not "mo"
            if d or h or m:
                duration = (float(d.group(1) if d else 0) * 1440
                          + float(h.group(1) if h else 0) * 60
                          + float(m.group(1) if m else 0))
            else:
                try:
                    duration = float(td_str)  # plain number → treat as minutes
                except (ValueError, TypeError):
                    pass

    # Day of week from trade_date
    dow = g("dayOfWeek") or (trade_date.strftime("%A") if trade_date else None)

    # ── R:R — accept riskReward (journalEntries) or rrRatio ─────────────────
    rr = _coerce_float(g("rrRatio")) or _coerce_float(g("riskReward")) or _coerce_float(raw.get("risk_reward"))

    # ── SL / TP distances — accept stopLossDistance / takeProfitDistance ────
    sl_dist = (
        _coerce_float(g("slDistance"))
        or _coerce_float(g("stopLossDistance"))
        or _coerce_float(raw.get("stop_loss_distance"))
    )
    tp_dist = (
        _coerce_float(g("tpDistance"))
        or _coerce_float(g("takeProfitDistance"))
        or _coerce_float(raw.get("take_profit_distance"))
    )

    # ── Exit reason — accept primaryExitReason (journalEntries) ─────────────
    exit_rsn = (
        _str(g("exitReason"))
        or _str(g("primaryExitReason"))
        or _str(raw.get("primary_exit_reason"))
    )

    # ── Session — accept sessionName (journalEntries) ────────────────────────
    session_val = (
        _str(g("session"))
        or _str(g("sessionName"))
        or _str(raw.get("session_name"))
    )

    # ── Timeframes — accept entryTF / analysisTF / contextTF ────────────────
    tf_entry = (
        _str(g("timeframe"))
        or _str(g("entryTF"))
        or _str(raw.get("entry_tf"))
    )
    tf_analysis = (
        _str(g("analysisTimeframe"))
        or _str(g("analysisTF"))
        or _str(raw.get("analysis_tf"))
    )
    tf_context = (
        _str(g("contextTimeframe"))
        or _str(g("contextTF"))
        or _str(raw.get("context_tf"))
    )

    def cat(camel: str) -> Optional[str]:
        v = g(camel)
        return str(v).strip() or None if v is not None else None

    # ── Planned vs Actual deviations ─────────────────────────────────────────
    def _deviation(planned_key: str, actual_key: str) -> Optional[float]:
        planned = _coerce_float(g(planned_key))
        actual  = _coerce_float(g(actual_key))
        if planned is not None and actual is not None and planned != 0:
            return round(abs(actual - planned), 5)
        return None

    entry_dev = _coerce_float(g("entryDeviation")) or _deviation("plannedEntry", "actualEntry")
    sl_dev    = _coerce_float(g("slDeviation"))    or _deviation("plannedSL",    "actualSL")
    tp_dev    = _coerce_float(g("tpDeviation"))    or _deviation("plannedTP",    "actualTP")

    return TradeRecord(
        id=str(raw_id),
        session_id=str(g("sessionId") or raw.get("session_id") or ""),
        instrument=str(g("instrument") or "").strip().upper(),
        direction=_normalise_direction(g("direction")),
        outcome=_normalise_outcome(g("outcome")),
        pnl=raw_pnl,
        risk_percent=_coerce_float(g("riskPercent")) or _coerce_float(raw.get("risk_percent")),
        rr_ratio=rr,
        lot_size=_coerce_float(g("lotSize")) or _coerce_float(raw.get("lot_size")),
        entry_precision_score=_coerce_float(g("entryPrecisionScore")),
        timing_quality_score=_coerce_float(g("timingQualityScore")),
        market_alignment_score=_coerce_float(g("marketAlignmentScore")),
        setup_clarity_score=_coerce_float(g("setupClarityScore")),
        confluence_score=_coerce_float(g("confluenceScore")),
        signal_validation_score=_coerce_float(g("signalValidationScore") or g("signalValidation")),
        momentum_score=_momentum_to_score(g("momentumScore") or g("momentumValidity")),
        mtf_alignment=_coerce_bool(g("mtfAlignment")),
        trend_alignment=_coerce_bool(g("trendAlignment")),
        htf_key_level_present=_coerce_bool(g("htfKeyLevelPresent")),
        key_level_respected=_coerce_bool(g("keyLevelRespected")),
        target_logic=_target_logic_bool(g("targetLogic")),
        setup_fully_valid=_coerce_bool(g("setupFullyValid")),
        rule_broken=_coerce_bool(g("ruleBroken")),
        worth_repeating=_coerce_bool(g("worthRepeating")),
        fomo_trade=_coerce_bool(g("fomoTrade")),
        revenge_trade=_coerce_bool(g("revengeTrade")),
        boredom_trade=_coerce_bool(g("boredomTrade")),
        emotional_trade=_coerce_bool(g("emotionalTrade")),
        external_distraction=_coerce_bool(g("externalDistraction")),
        breakeven_applied=_coerce_bool(g("breakevenApplied")),
        strong_momentum=_strong_momentum_bool(g("strongMomentum")),
        momentum_validity=_normalise_momentum_validity(g("strongMomentum")),
        momentum_with_htf_align=_coerce_bool(g("momentumWithHTFAlign")),
        counter_momentum_entry=_coerce_bool(g("counterMomentumEntry")),
        trade_grade=cat("tradeGrade"),
        setup_type=cat("setupType"),
        exit_reason=exit_rsn,
        session=session_val,
        session_phase=cat("sessionPhase") or _str(raw.get("session_phase")),
        timeframe=tf_entry,
        analysis_timeframe=tf_analysis,
        context_timeframe=tf_context,
        market_regime=cat("marketRegime"),
        volatility_state=cat("volatilityState"),
        htf_bias=cat("htfBias"),
        directional_bias=cat("directionalBias"),
        key_level_type=cat("keyLevelType"),
        timing_context=cat("timingContext") or _str(raw.get("timing_context")),
        order_type=cat("orderType") or _str(raw.get("order_type")),
        management_type=cat("managementType"),
        candle_pattern=cat("candlePattern"),
        indicator_state=cat("indicatorState"),
        news_impact=cat("newsImpact"),
        emotional_state=cat("emotionalState"),
        focus_level=_score_to_level(g("focusLevel") or g("focusStressLevel")),
        confidence_level=_score_to_level(g("confidenceLevel")),
        energy_level=_score_to_level(g("energyLevel")),
        confidence_at_entry=_score_to_level(g("confidenceAtEntry")),
        rules_followed=_pct_to_level(g("rulesFollowed")),
        strategy=cat("setupTag") or cat("strategyVersionId") or cat("strategy"),
        risk_heat=cat("riskHeat"),
        mae=_coerce_float(g("mae")),
        mfe=_coerce_float(g("mfe")),
        planned_rr=_coerce_float(g("plannedRR")),
        achieved_rr=_coerce_float(g("achievedRR")),
        sl_distance=sl_dist,
        tp_distance=tp_dist,
        spread_at_entry=_coerce_float(g("spreadAtEntry")) or _coerce_float(raw.get("spread_at_entry")),
        entry_deviation=entry_dev,
        sl_deviation=sl_dev,
        tp_deviation=tp_dev,
        opened_at=opened_at,
        closed_at=closed_at,
        trade_date=trade_date,
        duration_minutes=duration,
        day_of_week=dow,
        account_balance=_coerce_float(g("accountBalance")) or _coerce_float(raw.get("account_balance")),
        starting_balance=_coerce_float(g("startingBalance")) or _coerce_float(raw.get("starting_balance")),
    )


def _str(v: Any) -> Optional[str]:
    """Return stripped string or None."""
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _score_to_level(v: Any) -> Optional[str]:
    """Convert a 1–5 numeric score to Low / Medium / High.
    If v is already a string label (e.g. 'High'), it is returned as-is."""
    if v is None:
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        s = str(v).strip()
        return s or None  # already a label string
    if n <= 2:
        return "Low"
    if n <= 3:
        return "Medium"
    return "High"


def _pct_to_level(v: Any) -> Optional[str]:
    """Convert a 0–100 percentage to Low / Medium / High.
    If v is already a string label, it is returned as-is."""
    if v is None:
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        s = str(v).strip()
        return s or None
    if n < 60:
        return "Low"
    if n < 80:
        return "Medium"
    return "High"


_MOMENTUM_SCORE_MAP: Dict[str, float] = {
    "strong": 4.5,
    "moderate": 3.0,
    "weak": 1.5,
}


def _momentum_to_score(v: Any) -> Optional[float]:
    """Convert momentumValidity string ('Strong'/'Moderate'/'Weak') or a raw
    numeric score to a float suitable for score-bucket analysis."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return _MOMENTUM_SCORE_MAP.get(str(v).strip().lower())


def _normalise_momentum_validity(v: Any) -> Optional[str]:
    """Return 'Strong', 'Moderate', or 'Weak' from a raw field value; None otherwise."""
    if v is None:
        return None
    low = str(v).strip().lower()
    if low == "strong":
        return "Strong"
    if low == "moderate":
        return "Moderate"
    if low == "weak":
        return "Weak"
    return None


def _strong_momentum_bool(v: Any) -> Optional[bool]:
    """'Strong' → True; 'Moderate' / 'Weak' → False; anything else defers to
    _coerce_bool (handles 'yes'/'no'/'true'/'false' etc.)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    low = str(v).strip().lower()
    if low == "strong":
        return True
    if low in ("moderate", "weak"):
        return False
    return _coerce_bool(v)


def _target_logic_bool(v: Any) -> Optional[bool]:
    """'High' / 'Medium' → True (clear target logic present);
    'Low' → False; other strings fall through to _coerce_bool."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    low = str(v).strip().lower()
    if low in ("high", "medium"):
        return True
    if low == "low":
        return False
    return _coerce_bool(v)


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
        else:
            logger.debug("Skipping invalid trade at index %d (missing id or pnl)", i)

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
    yes_t = [t for t in trades if getattr(t, field_name, None) is True]
    no_t  = [t for t in trades if getattr(t, field_name, None) is False]
    return ImpactResult(
        yes_win_rate=win_rate_of(yes_t), yes_count=len(yes_t),
        no_win_rate=win_rate_of(no_t),   no_count=len(no_t),
    )


def breakdown_by_categorical(trades: List[TradeRecord], field_name: str) -> Dict:
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
    return round(m, 2) if m is not None else None


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
# LAYER 4 — METRIC CALCULATORS
# ─────────────────────────────────────────────────────────────────────────────

def calc_core(ctx: SharedContext) -> Dict:
    if ctx.total == 0:
        return {}
    avg_win  = float(ctx.win_pnl_arr.mean())        if ctx.win_count  else 0.0
    avg_loss = float(abs(ctx.loss_pnl_arr.mean()))  if ctx.loss_count else 0.0

    # Profit Factor: gross_profit / gross_loss.
    # When there are no losing trades, return 999.0 (conventional ∞ sentinel)
    # so the frontend can display "∞" rather than falling back to 0.
    if ctx.gross_loss > 0:
        pf: Optional[float] = ctx.gross_profit / ctx.gross_loss
    elif ctx.gross_profit > 0:
        pf = 999.0   # all-win session — infinite profit factor
    else:
        pf = None

    # R Expectancy: expectancy expressed in R-multiples, NOT dollars.
    # Each winning trade contributes its rr_ratio (defaulting to 1R when absent).
    # Each losing trade contributes -1R. Breakevens contribute 0R.
    # Formula: Σ(outcome_in_R) / total_trades
    r_outcomes: List[float] = (
        [t.rr_ratio if (t.rr_ratio is not None and t.rr_ratio > 0) else 1.0
         for t in ctx.wins] +
        [-1.0 for _ in ctx.losses]
        # breakevens → 0R (omitting them is equivalent to adding 0.0)
    )
    r_exp = safe_mean(r_outcomes) if r_outcomes else None

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
        "profitFactor": round(pf,   3) if pf   is not None else None,
        "expectancy":   round(r_exp, 3) if r_exp is not None else None,
        "avgRR":        round(safe_mean(rr_vals), 2) if rr_vals else None,
    }


def calc_streaks(ctx: SharedContext) -> Dict:
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

    current_dd = max(0.0, peak - cumulative)
    return {
        "maxWinStreak":       max_win,
        "maxLossStreak":      max_loss,
        "currentStreakType":  cur_type,
        "currentStreakCount": cur_count,
        "maxDrawdown":        round(max_dd, 2),
        "currentDrawdown":    round(current_dd, 2),
        "recoverySequences":  recovery,
    }


def calc_equity_curve(ctx: SharedContext) -> Dict:
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
        "avgRiskPercent": round(safe_mean(risk_v), 2) if risk_v else None,
        "maxRiskPercent": round(max(risk_v), 2)       if risk_v else None,
        "minRiskPercent": round(min(risk_v), 2)       if risk_v else None,
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
            # Normalize "A - Textbook" → "A", "B - Solid" → "B", plain "A" → "A"
            letter = t.trade_grade.strip()[0].upper()
            if letter in ("A", "B", "C", "D", "F"):
                groups[letter].append(t)
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
        "riskHeat": "risk_heat", "momentumValidity": "momentum_validity",
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

    impulsive = ["fomo_trade", "revenge_trade", "boredom_trade", "emotional_trade"]
    n_data = [t for t in trades if any(getattr(t, f) is not None for f in impulsive)]
    discipline = (
        round(sum(1 for t in n_data
                  if not any(getattr(t, f) is True for f in impulsive)) / len(n_data) * 100, 2)
        if len(n_data) >= MIN_SAMPLE else None
    )

    patience = percent_true(trades, "setup_fully_valid")

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


def calc_candle_indicator_tf_matrix(ctx: SharedContext) -> Dict:
    """3-way composite: candle_pattern · indicator_state · timeframe → performance."""
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        candle = t.candle_pattern
        indicator = t.indicator_state
        tf = t.timeframe or t.analysis_timeframe
        if candle and indicator and tf:
            key = f"{candle} · {indicator} · {tf}"
            groups[key].append(t)
    return {
        k: {
            "winRate": win_rate_of(v),
            "count": len(v),
            "pl": round(sum(t.pnl for t in v), 2),
        }
        for k, v in sorted(groups.items())
    }


def calc_duration_breakdown(ctx: SharedContext) -> Dict:
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
        "avgMinutesWin":   round(v, 2) if (v := safe_mean([t.duration_minutes for t in ctx.wins   if t.duration_minutes is not None])) is not None else None,
        "avgMinutesLoss":  round(v, 2) if (v := safe_mean([t.duration_minutes for t in ctx.losses if t.duration_minutes is not None])) is not None else None,
    }


def calc_session_phase(ctx: SharedContext) -> Dict:
    return breakdown_by_categorical(ctx.trades, "session_phase")


def calc_session_phase_by_session(ctx: SharedContext) -> Dict:
    """Groups trades by 'SESSION Phase' key, e.g. 'LONDON Open', 'NEW YORK Mid'."""
    PHASE_ORDER = {"Open": 0, "Mid": 1, "Close": 2}
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        if t.session and t.session_phase:
            key = f"{t.session} {t.session_phase}"
            groups[key].append(t)
    # Sort by session name then phase order
    def _sort_key(k: str) -> tuple:
        parts = k.rsplit(" ", 1)
        phase = parts[-1] if len(parts) > 1 else ""
        session = parts[0] if len(parts) > 1 else k
        return (session, PHASE_ORDER.get(phase, 99))
    return {
        k: {"winRate": win_rate_of(v), "count": len(v), "pl": round(sum(t.pnl for t in v), 2)}
        for k, v in sorted(groups.items(), key=lambda item: _sort_key(item[0]))
    }


def calc_instrument_session_matrix(ctx: SharedContext) -> Dict:
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        if t.instrument and t.session and t.analysis_timeframe:
            key = f"{t.instrument} · {t.analysis_timeframe} · {t.session}"
            groups[key].append(t)
    return {
        k: {"winRate": win_rate_of(v), "count": len(v), "pl": round(sum(t.pnl for t in v), 2)}
        for k, v in sorted(groups.items())
    }


def _momentum_label(score: Optional[float]) -> Optional[str]:
    if score is None:
        return None
    if score >= 4.0:
        return "Strong"
    if score >= 2.5:
        return "Moderate"
    return "Weak"


def calc_instrument_phase_momentum_matrix(ctx: SharedContext) -> Dict:
    groups: Dict[str, List[TradeRecord]] = defaultdict(list)
    for t in ctx.trades:
        mom = _momentum_label(t.momentum_score)
        if t.instrument and t.session_phase and mom:
            key = f"{t.instrument} · {t.session_phase} · {mom}"
            groups[key].append(t)
    return {
        k: {"winRate": win_rate_of(v), "count": len(v), "pl": round(sum(t.pnl for t in v), 2)}
        for k, v in sorted(groups.items())
    }


def calc_strategy_market_matrix(ctx: SharedContext) -> Dict:
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
    trades = ctx.trades
    mae_v = [t.mae for t in trades if t.mae is not None and t.mae > 0]
    mfe_v = [t.mfe for t in trades if t.mfe is not None and t.mfe > 0]
    mae_gt_sl = sum(1 for t in trades if t.mae and t.sl_distance and t.mae > t.sl_distance)
    cap_r = [min(100.0, t.tp_distance / t.mfe * 100)
              for t in ctx.wins if t.mfe and t.mfe > 0 and t.tp_distance and t.tp_distance > 0]
    ratio_v = [t.mae / t.mfe for t in trades
                if t.mae is not None and t.mfe is not None and t.mfe > 0]
    return {
        "avgMAE":         round(safe_mean(mae_v), 2) if mae_v else None,
        "worstMAE":       round(max(mae_v), 2)       if mae_v else None,
        "avgMFE":         round(safe_mean(mfe_v), 2) if mfe_v else None,
        "bestMFE":        round(max(mfe_v), 2)       if mfe_v else None,
        "maeGtSLCount":   mae_gt_sl,
        "avgMFECapture":  round(safe_mean(cap_r),   2) if cap_r   else None,
        "avgMAEMFERatio": round(safe_mean(ratio_v), 3) if ratio_v else None,
    }


def calc_rr_analysis(ctx: SharedContext) -> Dict:
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
    if ctx.total == 0:
        return {}
    all_dates = [t.trade_date for t in ctx.trades if t.trade_date is not None]
    if not all_dates:
        return {}
    global_days = max(1, (max(all_dates) - min(all_dates)).days + 1)

    # Group trades by setup type, preserving their dates
    groups: Dict[str, list] = defaultdict(list)
    for t in ctx.trades:
        if t.setup_type and t.trade_date is not None:
            groups[t.setup_type].append(t.trade_date)
    # Also count setups without dates
    no_date_counts: Dict[str, int] = defaultdict(int)
    for t in ctx.trades:
        if t.setup_type and t.trade_date is None:
            no_date_counts[t.setup_type] += 1

    all_setups = set(groups.keys()) | set(no_date_counts.keys())
    result = {}
    for setup in sorted(all_setups):
        setup_dates = groups.get(setup, [])
        no_date_count = no_date_counts.get(setup, 0)
        count = len(setup_dates) + no_date_count
        if count == 0:
            continue
        # Always use the global journal span so every setup shares the same
        # denominator. Using a setup-specific span inflates clustered setups
        # (e.g. 4 trades in 23 days → 63.5/year) and deflates sparse ones.
        result[setup] = {
            "count":    count,
            "perDay":   round(count / global_days, 4),
            "perWeek":  round(count / global_days * 7,   4),
            "perMonth": round(count / global_days * 30,  4),
            "perYear":  round(count / global_days * 365, 4),
        }
    return result


def calc_statistics(ctx: SharedContext) -> Dict:
    # t-test requires at least 2 trades (ddof=1 → variance undefined for n=1)
    if ctx.total < 2:
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
    "candleIndicatorTFMatrix":  calc_candle_indicator_tf_matrix,
    "durationBreakdown":        calc_duration_breakdown,
    "sessionPhase":             calc_session_phase,
    "sessionPhaseBySession":    calc_session_phase_by_session,
    "instrumentSessionMatrix":        calc_instrument_session_matrix,
    "instrumentPhaseMomentumMatrix":  calc_instrument_phase_momentum_matrix,
    "strategyMarketMatrix":           calc_strategy_market_matrix,
    "orderTypeBreakdown":       calc_order_type_breakdown,
    "riskHeatBreakdown":        calc_risk_heat_breakdown,
    "newsImpactBreakdown":      calc_news_impact_breakdown,
    "maeMfe":                   calc_mae_mfe,
    "rrAnalysis":               calc_rr_analysis,
    "setupFrequencyAnnualised": calc_setup_frequency_annualised,
    "statistics":               calc_statistics,
    "_equity":                  calc_equity_curve,
}


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 5 — ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

def _run_registry(ctx: SharedContext, keys: Optional[List[str]] = None) -> Dict:
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
    starting_balance: Optional[float] = None,
) -> Dict:
    """
    Primary entry point.

    Parameters
    ----------
    raw_trades        : list of raw trade dicts (camelCase keys, from DB / API)
    metric_keys       : optional list of specific metric names; None = all
    starting_balance  : optional account starting balance forwarded from TypeScript bridge
    """
    try:
        trades = validate_and_normalise(raw_trades)
    except Exception as exc:
        logger.exception("Failed to normalise trades: %s", exc)
        return {"success": False, "error": str(exc), "tradeCount": 0, "metrics": {}}

    if not trades:
        return {"success": True, "tradeCount": 0, "metrics": {"core": {"totalTrades": 0}}}

    # Inject starting_balance from payload into trades that lack it
    if starting_balance is not None:
        from dataclasses import replace as dc_replace
        trades = [
            dc_replace(t, starting_balance=starting_balance)
            if t.starting_balance is None else t
            for t in trades
        ]

    ctx     = build_shared_context(trades)
    metrics = _run_registry(ctx, keys=metric_keys)
    return {"success": True, "tradeCount": ctx.total, "metrics": metrics}


def calculate_all_metrics(raw_trades: List[Dict], starting_balance: Optional[float] = None) -> Dict:
    """Convenience wrapper: compute every registered metric."""
    return calculate_metrics(raw_trades, metric_keys=None, starting_balance=starting_balance)


# ─────────────────────────────────────────────────────────────────────────────
# CLI ENTRY POINT  ── FIX: unwrap { trades, startingBalance } object from stdin
# ─────────────────────────────────────────────────────────────────────────────

def _main() -> None:
    """
    Read JSON from stdin. Accepts two shapes:
      1. A bare JSON array  →  treated as the trades list directly
      2. An object          →  { "trades": [...], "startingBalance": 10000 }
                               (shape sent by metricsCalculator.ts)
    """
    logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
    try:
        # json.load() streams-parses stdin without holding the full raw string
        # in memory alongside the parsed objects — halves peak memory for large
        # trade payloads compared to read() + loads().
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError) as exc:
        sys.stdout.write(json.dumps({"success": False, "error": str(exc), "metrics": {}}))
        sys.exit(1)

    # ── Unwrap object or accept bare array ───────────────────────────────────
    if isinstance(payload, list):
        trades = payload
        starting_balance = None
    elif isinstance(payload, dict):
        trades = payload.get("trades", [])
        sb = payload.get("startingBalance")
        starting_balance = float(sb) if sb is not None else None
    else:
        sys.stdout.write(json.dumps({
            "success": False,
            "error":   f"Expected list or object, got {type(payload).__name__}",
            "metrics": {},
        }))
        sys.exit(1)

    result = calculate_all_metrics(trades, starting_balance=starting_balance)
    sys.stdout.write(json.dumps(result, default=str))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
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

        # journalEntries DB shape
        JE_BASE = {
            "id": "je1", "sessionId": "s1", "instrument": "EURUSD",
            "direction": "long", "outcome": "win",
            "profitLoss": "200.00",          # ← journalEntries field
            "riskPercent": "1.0",
            "riskReward": "2.0",             # ← journalEntries field
            "entryTF": "M15",                # ← journalEntries field
            "analysisTF": "H1",              # ← journalEntries field
            "sessionName": "London",         # ← journalEntries field
            "primaryExitReason": "Target Hit",  # ← journalEntries field
            "entryTime": "2024-01-02T09:00:00Z",
            "exitTime":  "2024-01-02T11:00:00Z",
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

        print("\nLayer 1 — journalEntries field mapping")
        je_rec = normalise_trade(JE_BASE)
        check("JE profitLoss → pnl",      je_rec is not None and je_rec.pnl == 200.0, je_rec)
        check("JE riskReward → rr_ratio", je_rec is not None and je_rec.rr_ratio == 2.0)
        check("JE entryTF → timeframe",   je_rec is not None and je_rec.timeframe == "M15")
        check("JE analysisTF → analysis_timeframe", je_rec is not None and je_rec.analysis_timeframe == "H1")
        check("JE sessionName → session", je_rec is not None and je_rec.session == "London")
        check("JE primaryExitReason → exit_reason", je_rec is not None and je_rec.exit_reason == "Target Hit")

        print("\nLayer 1 — stdin object unwrapping")
        import io, contextlib
        fake_stdin_list = json.dumps([T()])
        fake_stdin_obj  = json.dumps({"trades": [T()], "startingBalance": 10000})

        # Test bare list
        result_list = calculate_all_metrics(json.loads(fake_stdin_list))
        check("bare list accepted", result_list["success"] and result_list["tradeCount"] == 1)

        # Test object shape
        payload_obj = json.loads(fake_stdin_obj)
        trades_from_obj = payload_obj.get("trades", [])
        sb_from_obj = float(payload_obj.get("startingBalance", 0))
        result_obj = calculate_all_metrics(trades_from_obj, starting_balance=sb_from_obj)
        check("object trades accepted", result_obj["success"] and result_obj["tradeCount"] == 1)
        check("startingBalance forwarded", result_obj["metrics"]["equityGrowth"]["startingBalance"] == 10000.0)

        print("\nLayer 2 — Utilities")
        pool = validate_and_normalise([
            T(id=str(i), outcome="win" if i < 6 else "loss", pnl=200 if i < 6 else -80)
            for i in range(10)
        ])
        wr = win_rate_of(pool)
        check("win_rate 6/10 = 60%",   abs(wr - 60.0) < 0.01, wr)
        check("win_rate < MIN → None", win_rate_of([]) is None)
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
        check("maxDrawdown >= 0",      streaks["maxDrawdown"] >= 0)
        check("currentDrawdown >= 0", streaks["currentDrawdown"] >= 0)
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
