"""
ai_engine/_models.py
Shared dataclasses used across all pipelines.
No logic lives here — only data shapes.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal, Optional

# ── Confidence levels ─────────────────────────────────────────────────────────

Confidence = Literal["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]

MIN_TRADES_HIGH       = 30   # statistically reliable
MIN_TRADES_MEDIUM     = 15   # indicative, use with caution
MIN_TRADES_LOW        = 5    # surfaced but flagged
# below LOW → suppressed entirely


# ── Proof layer ───────────────────────────────────────────────────────────────

@dataclass
class ProofedFinding:
    """Any insight the AI surfaces must be backed by this."""
    finding:     str
    sample_size: int
    win_rate:    float
    baseline_wr: float          # overall win rate — deviation is relative to this
    deviation:   float          # win_rate - baseline_wr  (positive = edge, negative = drain)
    confidence:  Confidence
    context:     dict = field(default_factory=dict)


# ── Notes pipeline output ─────────────────────────────────────────────────────

@dataclass
class KeywordStat:
    keyword:     str
    occurrences: int
    count_win:   int
    count_loss:  int
    win_rate:    float


@dataclass
class EmotionStat:
    emotion:      str
    count:        int
    win_rate:     float
    pct_of_total: float


@dataclass
class SessionEmotionFinding:
    """Win-rate outcome for a specific (session_phase, emotion) combination."""
    session_phase:  str
    emotion:        str
    win_rate:       float
    baseline_wr:    float
    deviation:      float   # win_rate - baseline_wr
    sample_size:    int
    confidence:     Confidence
    label:          str     # human-readable e.g. "London Open + Calm: 74% WR (18 trades)"


@dataclass
class NotesSummary:
    coverage_pct:           float                        # % of trades with any written notes
    blind_spot_loss_pct:    float                        # % of no-note trades that were losses
    win_keywords:           list[KeywordStat]            # words that appear more in winning trades
    loss_keywords:          list[KeywordStat]            # words that appear more in losing trades
    red_flags:              list[KeywordStat]            # phrases that correlate strongly with losses
    emotion_correlation:    list[EmotionStat]
    behavioral_flags:       dict[str, ProofedFinding]    # fomo, revenge, rule_broken, etc.
    session_emotion_matrix: list[SessionEmotionFinding]  # dedicated sessionPhase × emotion analysis


# ── Pattern pipeline output ───────────────────────────────────────────────────

@dataclass
class VariableCombo:
    """A combination of 2–3 conditions and its measured edge."""
    variables:   dict[str, str]   # e.g. {"session": "Asian", "setup": "Reversal"}
    sample_size: int
    win_rate:    float
    baseline_wr: float
    deviation:   float
    confidence:  Confidence


@dataclass
class PatternSummary:
    baseline_win_rate: float
    top_edges:         list[VariableCombo]   # combos with highest win rate
    top_drains:        list[VariableCombo]   # combos with lowest win rate
    hidden_drivers:    list[VariableCombo]   # largest deviation from baseline


# ── Strategy builder output ───────────────────────────────────────────────────

@dataclass
class StrategyCondition:
    label:       str
    win_rate:    float
    sample_size: int
    confidence:  Confidence


@dataclass
class StrategyOutput:
    name:               str
    entry_conditions:   list[StrategyCondition]
    avoid_conditions:   list[StrategyCondition]
    risk_rules:         dict[str, str]
    projected_edge:     Optional[ProofedFinding]
    data_warnings:      list[str]              # surfaces LOW confidence conditions


# ── AI verdict output ─────────────────────────────────────────────────────────

@dataclass
class TradeProfile:
    label:       str                  # "Winning Trade" or "Losing Trade"
    conditions:  list[str]
    probability: str                  # e.g. "81% win rate across 42 trades"


@dataclass
class AIVerdict:
    mode:                  str        # "analysis" | "qa" | "strategy"
    trader_archetype:      str
    health_score:          str        # "Developing" | "Consistent" | "Advanced"
    headline:              str
    win_profile:           Optional[TradeProfile]
    loss_profile:          Optional[TradeProfile]
    findings:              list[ProofedFinding]
    strategy:              Optional[StrategyOutput]
    pre_trade_checklist:   list[str]
    risk_alert:            Optional[str]
    answer:                Optional[str]   # populated in qa mode only


# ── Tilt detection output ─────────────────────────────────────────────────────

@dataclass
class TiltResult:
    detected:            bool
    post_loss_win_rate:  Optional[float]   # WR in trades following N consecutive losses
    baseline_win_rate:   float
    deviation:           Optional[float]   # post_loss_wr - baseline_wr
    sample_size:         int               # number of post-tilt trades measured
    consecutive_losses:  int               # N used for detection
