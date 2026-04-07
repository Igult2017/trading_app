"""
ai_engine/_utils.py
Shared pure functions used across all pipelines.
No side effects, no imports from other ai_engine modules.
"""
from __future__ import annotations
import json
from ._models import Confidence, MIN_TRADES_HIGH, MIN_TRADES_MEDIUM, MIN_TRADES_LOW

# ── Outcome helpers ───────────────────────────────────────────────────────────

_WIN_OUTCOMES  = {"win", "w", "profit"}
_LOSS_OUTCOMES = {"loss", "l", "lose", "loser"}

def is_win(trade: dict) -> bool:
    return str(trade.get("outcome", "")).strip().lower() in _WIN_OUTCOMES

def is_loss(trade: dict) -> bool:
    return str(trade.get("outcome", "")).strip().lower() in _LOSS_OUTCOMES

def win_rate(trades: list[dict]) -> float:
    if not trades:
        return 0.0
    return sum(1 for t in trades if is_win(t)) / len(trades)


# ── manualFields extraction ───────────────────────────────────────────────────

def extract_manual(trade: dict) -> dict:
    """
    Pull the manualFields JSONB blob from a trade row.
    Handles string-encoded JSON (some drivers return JSONB as a string).
    """
    raw = trade.get("manualFields") or trade.get("manual_fields") or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return {}
    return raw if isinstance(raw, dict) else {}


# ── Math helpers ──────────────────────────────────────────────────────────────

def safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    return numerator / denominator if denominator else default

def safe_mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


# ── Confidence gating ─────────────────────────────────────────────────────────

def confidence_level(n: int) -> Confidence:
    if n >= MIN_TRADES_HIGH:
        return "HIGH"
    if n >= MIN_TRADES_MEDIUM:
        return "MEDIUM"
    if n >= MIN_TRADES_LOW:
        return "LOW"
    return "INSUFFICIENT"

def is_sufficient(n: int) -> bool:
    """Minimum bar to surface any finding at all."""
    return n >= MIN_TRADES_LOW


# ── Field coercion ────────────────────────────────────────────────────────────

def coerce_bool(value) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1"}
    return None

def coerce_str(value, fallback: str = "") -> str:
    return str(value).strip() if value is not None else fallback


# ── Duration bucketing ────────────────────────────────────────────────────────

def bucket_duration(minutes_str: str) -> str | None:
    """
    Convert trade duration stored as minutes (string) into a descriptive bucket.
    Returns None if value is missing or unparseable.
    """
    try:
        m = float(str(minutes_str).strip())
    except (ValueError, TypeError):
        return None
    if m <= 0:
        return None
    if m < 5:
        return "scalp (<5m)"
    if m < 30:
        return "short (5-30m)"
    if m < 120:
        return "medium (30-120m)"
    if m < 480:
        return "swing (2-8h)"
    return "position (>8h)"


# ── Python-side trade field remapper ─────────────────────────────────────────

def remap_trade(trade: dict) -> dict:
    """
    Apply the same field aliases as remapJournalEntry.ts so Python can resolve
    session, entryTF, primaryExitReason etc. regardless of which column name
    the DB row uses.
    """
    out = dict(trade)

    # P&L
    if out.get("pnl") is None and out.get("profitLoss") is not None:
        out["pnl"] = out["profitLoss"]

    # R:R
    if out.get("rrRatio") is None and out.get("riskReward") is not None:
        out["rrRatio"] = out["riskReward"]
    if out.get("riskRewardRatio") is None and out.get("rrRatio") is not None:
        out["riskRewardRatio"] = out["rrRatio"]

    # Session
    if not out.get("session") and out.get("sessionName"):
        out["session"] = out["sessionName"]

    # Timeframes
    if not out.get("entryTF") and out.get("timeframe"):
        out["entryTF"] = out["timeframe"]
    if not out.get("analysisTF") and out.get("analysisTimeframe"):
        out["analysisTF"] = out["analysisTimeframe"]

    # Exit reason
    if not out.get("primaryExitReason") and out.get("exitReason"):
        out["primaryExitReason"] = out["exitReason"]

    # SL / TP
    if out.get("slDistance") is None and out.get("stopLossDistance") is not None:
        out["slDistance"] = out["stopLossDistance"]
    if out.get("tpDistance") is None and out.get("takeProfitDistance") is not None:
        out["tpDistance"] = out["takeProfitDistance"]

    # Timestamps
    if not out.get("openedAt"):
        out["openedAt"] = (
            out.get("entryTime") or out.get("entryTimeUTC") or
            out.get("entry_time") or None
        )
    if not out.get("closedAt"):
        out["closedAt"] = out.get("exitTime") or out.get("exit_time") or None

    return out
