"""
strategy_audit/normalise.py
────────────────────────────────────────────────────────────────────────────
Phase 0 — Data normalisation layer.

ALL computation levels call normalise_trades() first.
Responsibilities:
  - Coerce all DB string / decimal fields to Python native types
  - Map camelCase field names → snake_case
  - Parse date/time strings → datetime objects (multiple format attempts)
  - Infer missing outcome from profitLoss sign
  - Infer missing risk_percent from monetary_risk / account_balance
  - Return a clean list[TradeRecord] ready for math

TradeRecord is a plain dict with guaranteed key presence (missing → None).
No KeyError should ever occur in level1–4 when accessing TradeRecord fields.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any


# ── Field alias map (DB camelCase → snake_case) ───────────────────────────────

_ALIAS: dict[str, str] = {
    # Identity
    "id":                    "id",
    "userId":                "user_id",
    "sessionId":             "session_id",
    # Instrument
    "instrument":            "instrument",
    "pairCategory":          "pair_category",
    "direction":             "direction",
    "orderType":             "order_type",
    # Prices
    "entryPrice":            "entry_price",
    "stopLoss":              "stop_loss",
    "takeProfit":            "take_profit",
    "stopLossDistance":      "stop_loss_distance",
    "takeProfitDistance":    "take_profit_distance",
    # Sizing / risk
    "lotSize":               "lot_size",
    "riskReward":            "risk_reward",
    "riskPercent":           "risk_percent",
    "spreadAtEntry":         "spread_at_entry",
    "monetaryRisk":          "monetary_risk",
    "potentialReward":       "potential_reward",
    # Timing
    "entryTime":             "entry_time",
    "exitTime":              "exit_time",
    "dayOfWeek":             "day_of_week",
    "tradeDuration":         "trade_duration",
    "entryTF":               "entry_tf",
    "analysisTF":            "analysis_tf",
    "contextTF":             "context_tf",
    "entryTimeUTC":          "entry_time_utc",
    "timingContext":         "timing_context",
    # Outcome
    "outcome":               "outcome",
    "profitLoss":            "profit_loss",
    "pipsGainedLost":        "pips_gained_lost",
    "accountBalance":        "account_balance",
    "commission":            "commission",
    "mae":                   "mae",
    "mfe":                   "mfe",
    "plannedRR":             "planned_rr",
    "achievedRR":            "achieved_rr",
    "primaryExitReason":     "primary_exit_reason",
    # Session context
    "sessionName":           "session_name",
    "sessionPhase":          "session_phase",
    # JSON blobs
    "aiExtracted":           "ai_extracted",
    "manualFields":          "manual_fields",
    # Timestamps
    "createdAt":             "created_at",
}

# All keys that must exist in every TradeRecord (None if absent)
_REQUIRED_KEYS: list[str] = list(_ALIAS.values())

# ── Date format list (try in order) ──────────────────────────────────────────

_DATE_FORMATS = [
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%m/%d/%Y %H:%M",
    "%m/%d/%Y",
    "%H:%M",          # time-only strings — will get today's date
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_float(v: Any) -> float | None:
    """Safely cast anything to float; return None on failure."""
    if v is None or v == "" or v == "N/A" or v == "null":
        return None
    try:
        return float(str(v).strip().replace(",", ""))
    except (ValueError, TypeError):
        return None


def _to_str(v: Any) -> str | None:
    if v is None or v == "":
        return None
    return str(v).strip()


def _parse_date(v: Any) -> datetime | None:
    """Try multiple date formats; return timezone-aware UTC datetime or None."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v
    s = str(v).strip()
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _infer_outcome(trade: dict) -> str | None:
    """Infer win/loss/breakeven from profit_loss when outcome field is missing."""
    pl = trade.get("profit_loss")
    if pl is None:
        return None
    if pl > 0:
        return "win"
    if pl < 0:
        return "loss"
    return "breakeven"


def _extract_manual_field(trade: dict, key: str) -> Any:
    """Safely pull a key from the manualFields JSON blob."""
    mf = trade.get("manual_fields")
    if not isinstance(mf, dict):
        return None
    return mf.get(key)


def _extract_ai_field(trade: dict, key: str) -> Any:
    """Safely pull a key from the aiExtracted JSON blob."""
    af = trade.get("ai_extracted")
    if not isinstance(af, dict):
        return None
    return af.get(key)


# ── Main normaliser ───────────────────────────────────────────────────────────

def normalise_trades(raw_trades: list[dict]) -> list[dict]:
    """
    Convert raw DB rows into clean TradeRecord dicts.

    Every key in _REQUIRED_KEYS is guaranteed to be present (value may be None).
    Additional synthesised keys added:
      - entry_dt      : datetime | None  (parsed entry_time)
      - exit_dt       : datetime | None  (parsed exit_time)
      - created_dt    : datetime | None  (parsed created_at)
      - pnl           : float | None     (alias for profit_loss; both set)
      - win           : bool | None      (True = win, False = loss/be, None = unknown)
      - rr_float      : float | None     (risk_reward as float)
      - session_label : str              (normalised trading session name)
    """
    result: list[dict] = []

    for raw in raw_trades:
        if not isinstance(raw, dict):
            continue

        t: dict = {k: None for k in _REQUIRED_KEYS}

        # ── 1. Alias mapping ─────────────────────────────────────────────────
        for src, dst in _ALIAS.items():
            if src in raw:
                t[dst] = raw[src]
            # also accept already-snake_cased keys
            if dst in raw and t[dst] is None:
                t[dst] = raw[dst]

        # ── 2. Float coercions ───────────────────────────────────────────────
        float_fields = [
            "entry_price", "stop_loss", "take_profit",
            "stop_loss_distance", "take_profit_distance",
            "lot_size", "risk_reward", "risk_percent", "spread_at_entry",
            "profit_loss", "pips_gained_lost", "account_balance",
            "commission", "mae", "mfe", "monetary_risk", "potential_reward",
        ]
        for f in float_fields:
            t[f] = _to_float(t[f])

        # ── 3. String fields ─────────────────────────────────────────────────
        str_fields = [
            "id", "user_id", "session_id", "instrument", "pair_category",
            "direction", "order_type", "day_of_week", "trade_duration",
            "entry_tf", "analysis_tf", "context_tf",
            "outcome", "planned_rr", "achieved_rr", "primary_exit_reason",
            "session_name", "session_phase", "entry_time_utc", "timing_context",
        ]
        for f in str_fields:
            t[f] = _to_str(t[f])

        # ── 4. Date parsing ──────────────────────────────────────────────────
        t["entry_dt"]   = _parse_date(t.get("entry_time"))
        t["exit_dt"]    = _parse_date(t.get("exit_time"))
        t["created_dt"] = _parse_date(t.get("created_at"))

        # ── 5. Infer outcome ─────────────────────────────────────────────────
        if not t["outcome"] or t["outcome"].lower() not in ("win", "loss", "breakeven", "be"):
            t["outcome"] = _infer_outcome(t)

        # Normalise variants
        if t["outcome"] in ("be", "breakeven", "break_even"):
            t["outcome"] = "breakeven"
        if t["outcome"]:
            t["outcome"] = t["outcome"].lower()

        # ── 6. Synthesised helpers ───────────────────────────────────────────
        t["pnl"] = t["profit_loss"]   # convenient alias

        t["win"] = (
            True  if t["outcome"] == "win"
            else False if t["outcome"] in ("loss", "breakeven")
            else None
        )

        # risk_reward as float
        t["rr_float"] = _to_float(t.get("risk_reward"))
        if t["rr_float"] is None:
            # try planned_rr  e.g. "1:2.5" or "2.5"
            prr = _to_str(t.get("planned_rr")) or ""
            m = re.search(r"[\d.]+\s*:\s*([\d.]+)", prr)
            if m:
                t["rr_float"] = _to_float(m.group(1))
            else:
                t["rr_float"] = _to_float(prr)

        # ── 7. Infer risk_percent from monetary_risk / account_balance ───────
        if t["risk_percent"] is None and t["monetary_risk"] and t["account_balance"]:
            try:
                t["risk_percent"] = (t["monetary_risk"] / t["account_balance"]) * 100
            except ZeroDivisionError:
                pass

        # ── 8. Normalise session label ────────────────────────────────────────
        sn = (t["session_name"] or "").lower()
        if any(x in sn for x in ("london", "lon", "eu", "europe")):
            t["session_label"] = "London"
        elif any(x in sn for x in ("new york", "ny", "us", "america")):
            t["session_label"] = "New York"
        elif any(x in sn for x in ("tokyo", "asia", "asian", "tokyo")):
            t["session_label"] = "Tokyo"
        elif any(x in sn for x in ("sydney", "aest", "aus")):
            t["session_label"] = "Sydney"
        elif any(x in sn for x in ("overlap", "london/ny", "lon/ny")):
            t["session_label"] = "London/NY Overlap"
        else:
            t["session_label"] = t["session_name"] or "Unknown"

        # ── 9. Pull extra fields from JSONB blobs ────────────────────────────
        # These are optional analytical fields that may be stored in manual_fields
        for extra_key in [
            "htf_bias", "confluence_score", "entry_type", "ob_valid",
            "choch_valid", "psychology_score", "rules_adherence",
            "setup_tags", "regime", "entry_deviation", "tp_hit",
        ]:
            if extra_key not in t:
                val = _extract_manual_field(t, extra_key)
                if val is None:
                    val = _extract_ai_field(t, extra_key)
                t[extra_key] = val

        result.append(t)

    return result


# ── Minimum sample gate ───────────────────────────────────────────────────────

def check_minimum_sample(trades: list[dict], min_trades: int = 5) -> tuple[bool, str]:
    """
    Returns (ok, message).
    Callers should return empty-level dicts when ok is False.
    """
    n = len(trades)
    if n < min_trades:
        return False, f"Insufficient trades ({n} < {min_trades} minimum)"
    return True, ""


# ── Stats helpers shared across levels ───────────────────────────────────────

def safe_mean(values: list[float]) -> float:
    clean = [v for v in values if v is not None]
    return sum(clean) / len(clean) if clean else 0.0


def safe_std(values: list[float]) -> float:
    clean = [v for v in values if v is not None]
    if len(clean) < 2:
        return 0.0
    m = safe_mean(clean)
    variance = sum((x - m) ** 2 for x in clean) / (len(clean) - 1)
    return variance ** 0.5


def win_rate(trades: list[dict]) -> float:
    """Returns 0–100."""
    if not trades:
        return 0.0
    wins = sum(1 for t in trades if t.get("win") is True)
    knowns = sum(1 for t in trades if t.get("win") is not None)
    return (wins / knowns * 100) if knowns else 0.0


def profit_factor(trades: list[dict]) -> float:
    gross_win  = sum(t["pnl"] for t in trades if t.get("pnl") and t["pnl"] > 0)
    gross_loss = sum(abs(t["pnl"]) for t in trades if t.get("pnl") and t["pnl"] < 0)
    return (gross_win / gross_loss) if gross_loss > 0 else float("inf") if gross_win > 0 else 0.0


def expectancy(trades: list[dict]) -> float:
    """Expected value per trade in account currency."""
    pnls = [t["pnl"] for t in trades if t.get("pnl") is not None]
    return safe_mean(pnls)
