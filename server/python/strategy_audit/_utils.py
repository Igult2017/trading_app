"""
strategy_audit/_utils.py
Shared helpers: safe_mean, safe_std, check_minimum_sample, win_rate,
profit_factor, expectancy. Imported by level1/2/3/4.
No imports from within this package — zero circular risk.
"""
from __future__ import annotations
from datetime import datetime, timezone
import re
from typing import Any


_DATE_FORMATS = [
    "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%d/%m/%Y %H:%M", "%d/%m/%Y", "%m/%d/%Y %H:%M", "%m/%d/%Y", "%H:%M",
]


def _to_float(v: Any) -> float | None:
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
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v
    s = str(v).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _extract_jsonb(trade: dict, blob_key: str, field: str) -> Any:
    blob = trade.get(blob_key)
    if not isinstance(blob, dict):
        return None
    return blob.get(field)


def safe_mean(values: list) -> float:
    clean = [v for v in values if v is not None]
    return sum(clean) / len(clean) if clean else 0.0


def safe_std(values: list) -> float:
    clean = [v for v in values if v is not None]
    if len(clean) < 2:
        return 0.0
    m = safe_mean(clean)
    return (sum((x - m) ** 2 for x in clean) / (len(clean) - 1)) ** 0.5


def check_minimum_sample(trades: list, min_trades: int = 5) -> tuple:
    n = len(trades)
    if n < min_trades:
        return False, f"Insufficient trades ({n} < {min_trades} minimum)"
    return True, ""


def win_rate(trades: list) -> float:
    if not trades:
        return 0.0
    wins   = sum(1 for t in trades if t.get("win") is True)
    knowns = sum(1 for t in trades if t.get("win") is not None)
    return (wins / knowns * 100) if knowns else 0.0


def profit_factor(trades: list) -> float:
    gross_win  = sum(t["pnl"] for t in trades if t.get("pnl") and t["pnl"] > 0)
    gross_loss = sum(abs(t["pnl"]) for t in trades if t.get("pnl") and t["pnl"] < 0)
    return (gross_win / gross_loss) if gross_loss > 0 else (999.0 if gross_win > 0 else 0.0)


def expectancy(trades: list) -> float:
    pnls = [t["pnl"] for t in trades if t.get("pnl") is not None]
    return safe_mean(pnls)


_ALIAS: dict[str, str] = {
    "id": "id", "userId": "user_id", "sessionId": "session_id",
    "instrument": "instrument", "pairCategory": "pair_category",
    "direction": "direction", "orderType": "order_type",
    "entryPrice": "entry_price", "stopLoss": "stop_loss", "takeProfit": "take_profit",
    "stopLossDistance": "stop_loss_distance", "takeProfitDistance": "take_profit_distance",
    "lotSize": "lot_size", "riskReward": "risk_reward", "riskPercent": "risk_percent",
    "spreadAtEntry": "spread_at_entry", "monetaryRisk": "monetary_risk",
    "potentialReward": "potential_reward",
    "entryTime": "entry_time", "exitTime": "exit_time", "dayOfWeek": "day_of_week",
    "tradeDuration": "trade_duration", "entryTF": "entry_tf",
    "analysisTF": "analysis_tf", "contextTF": "context_tf",
    "entryTimeUTC": "entry_time_utc", "timingContext": "timing_context",
    "outcome": "outcome", "profitLoss": "profit_loss",
    "pipsGainedLost": "pips_gained_lost", "accountBalance": "account_balance",
    "commission": "commission", "mae": "mae", "mfe": "mfe",
    "plannedRR": "planned_rr", "achievedRR": "achieved_rr",
    "primaryExitReason": "primary_exit_reason",
    "sessionName": "session_name", "sessionPhase": "session_phase",
    "aiExtracted": "ai_extracted", "manualFields": "manual_fields",
    "createdAt": "created_at",
}

_REQUIRED_KEYS: list[str] = list(_ALIAS.values())


def normalise_trades(raw_trades: list) -> list:
    result = []
    for raw in raw_trades:
        if not isinstance(raw, dict):
            continue
        t: dict = {k: None for k in _REQUIRED_KEYS}
        for src, dst in _ALIAS.items():
            if src in raw:
                t[dst] = raw[src]
            if dst in raw and t[dst] is None:
                t[dst] = raw[dst]
        for f in ["entry_price","stop_loss","take_profit","stop_loss_distance",
                  "take_profit_distance","lot_size","risk_reward","risk_percent",
                  "spread_at_entry","profit_loss","pips_gained_lost","account_balance",
                  "commission","mae","mfe","monetary_risk","potential_reward"]:
            t[f] = _to_float(t[f])
        for f in ["id","user_id","session_id","instrument","pair_category",
                  "direction","order_type","day_of_week","trade_duration",
                  "entry_tf","analysis_tf","context_tf","outcome","planned_rr",
                  "achieved_rr","primary_exit_reason","session_name","session_phase",
                  "entry_time_utc","timing_context"]:
            t[f] = _to_str(t[f])
        t["entry_dt"]   = _parse_date(t.get("entry_time"))
        t["exit_dt"]    = _parse_date(t.get("exit_time"))
        t["created_dt"] = _parse_date(t.get("created_at"))
        if not t["outcome"] or t["outcome"].lower() not in ("win","loss","breakeven","be"):
            pl = t.get("profit_loss")
            if pl is not None:
                t["outcome"] = "win" if pl > 0 else "loss" if pl < 0 else "breakeven"
        if t["outcome"] in ("be","breakeven","break_even"):
            t["outcome"] = "breakeven"
        if t["outcome"]:
            t["outcome"] = t["outcome"].lower()
        t["pnl"] = t["profit_loss"]
        t["win"] = (True if t["outcome"] == "win"
                    else False if t["outcome"] == "loss"
                    else None)
        t["rr_float"] = _to_float(t.get("risk_reward"))
        if t["rr_float"] is None:
            prr = _to_str(t.get("planned_rr")) or ""
            m = re.search(r"[\d.]+\s*:\s*([\d.]+)", prr)
            t["rr_float"] = _to_float(m.group(1)) if m else _to_float(prr)
        if t["risk_percent"] is None and t["monetary_risk"] and t["account_balance"]:
            try:
                t["risk_percent"] = (t["monetary_risk"] / t["account_balance"]) * 100
            except ZeroDivisionError:
                pass
        sn = (t["session_name"] or "").lower()
        if any(x in sn for x in ("london","lon","eu","europe")):
            t["session_label"] = "London"
        elif any(x in sn for x in ("new york","ny","us","america")):
            t["session_label"] = "New York"
        elif any(x in sn for x in ("tokyo","asia","asian")):
            t["session_label"] = "Tokyo"
        elif any(x in sn for x in ("sydney","aest","aus")):
            t["session_label"] = "Sydney"
        elif any(x in sn for x in ("overlap","london/ny","lon/ny")):
            t["session_label"] = "London/NY Overlap"
        else:
            t["session_label"] = t["session_name"] or "Unknown"
        for extra_key in ["htf_bias","confluence_score","entry_type","ob_valid",
                           "choch_valid","psychology_score","rules_adherence",
                           "setup_tags","regime","entry_deviation","tp_hit"]:
            if extra_key not in t or t.get(extra_key) is None:
                val = _extract_jsonb(t, "manual_fields", extra_key)
                if val is None:
                    val = _extract_jsonb(t, "ai_extracted", extra_key)
                t[extra_key] = val
        result.append(t)
    return result
