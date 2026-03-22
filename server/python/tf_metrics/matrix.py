"""
tf_metrics/matrix.py
Groups trades by (contextTF, analysisTF, entryTF) combo and computes
per-combo performance stats plus aggregated contextual/text fields.
The output list maps directly to the TFSMatrix component Row shape.
"""
from __future__ import annotations

from collections import defaultdict, Counter

from .grouping import _normalise_tf
from .per_tf_stats import compute_per_tf_stats


# ── Helpers ───────────────────────────────────────────────────────────────────

def _most_common(items: list, default: str = "—") -> str:
    filtered = [str(i).strip() for i in items if i and str(i).strip()]
    if not filtered:
        return default
    return Counter(filtered).most_common(1)[0][0]


def _get(trade: dict, *keys) -> str | None:
    """
    Try each key at top level, then inside manualFields / manual_fields JSONB blob.
    Returns the first non-empty string found, or None.
    """
    for key in keys:
        v = trade.get(key)
        if v and str(v).strip():
            return str(v).strip()
    for blob_key in ("manualFields", "manual_fields"):
        blob = trade.get(blob_key)
        if isinstance(blob, dict):
            for key in keys:
                v = blob.get(key)
                if v and str(v).strip():
                    return str(v).strip()
    return None


def _build_bias(val: str | None) -> str:
    m = {
        "Bull": "🟢 Bullish", "Bullish": "🟢 Bullish",
        "Bear": "🔴 Bearish", "Bearish": "🔴 Bearish",
        "Range": "🟡 Neutral", "Neutral": "🟡 Neutral",
    }
    return m.get(val or "", f"🟡 {val}") if val else "🟡 Neutral"


def _build_news(val: str | None) -> str:
    if not val or val == "Clear":
        return "✅ News-Free"
    if val == "Major":
        return "🚫 ACTIVE NEWS — DO NOT TRADE"
    return f"📰 {val} News"


def _build_condition(regime: str | None, direction: str | None) -> str:
    if not regime:
        return "Unknown"
    if direction and direction not in ("Sideways", ""):
        trend = "Uptrend" if direction in ("Bullish", "Bull") else "Downtrend"
        if "Trend" in regime or "trend" in regime:
            return f"Strong {trend}"
        return f"{regime} → {trend}"
    return regime


def _build_session(session: str | None, phase: str | None) -> str:
    times = {
        "London":   "London Open · 08:00–10:00 GMT",
        "New York": "NY Open · 13:00–15:00 GMT",
        "Tokyo":    "Asian Session · 00:00–07:00 GMT",
        "Sydney":   "Asian Session · 00:00–07:00 GMT",
        "Overlap":  "London/NY Overlap · 15:00–17:00 GMT",
    }
    base = times.get(session or "", session or "Unknown Session")
    if phase and phase not in ("Open",):
        return f"{base} · {phase}"
    return base


def _build_momentum(volatility: str | None, timing: str | None) -> str:
    parts = []
    if volatility:
        parts.append(
            {"Low": "Low ATR", "Normal": "ATR Stable", "High": "ATR Expanding"}.get(
                volatility, volatility
            )
        )
    if timing:
        parts.append(timing)
    return " · ".join(parts) if parts else "ATR Stable"


# ── Main export ───────────────────────────────────────────────────────────────

def compute_tf_combo_matrix(trades: list) -> list:
    """
    Groups trades by (contextTF, analysisTF, entryTF) triplet and returns a
    list of row dicts shaped to match the TFSMatrix component Row interface.

    Trade fields read (top-level or inside manualFields JSONB):
      entryTF / analysisTF / contextTF  — timeframe combo
      candlePattern                      — ETF entry pattern
      sessionName / sessionPhase         — session window
      marketRegime / trendDirection      — condition & direction
      htfBias                            — macro bias
      newsEnvironment                    — news context
      timingContext                      — entry timing
      volatilityState                    — ATR state
      indicatorState                     — indicator reading at entry
    """
    groups: dict[tuple, list] = defaultdict(list)

    for t in trades:
        if not isinstance(t, dict):
            continue
        etf_raw = _get(t, "entryTF", "entry_tf")
        atf_raw = _get(t, "analysisTF", "analysis_tf")
        htf_raw = _get(t, "contextTF", "context_tf")

        etf = _normalise_tf(etf_raw) if etf_raw else "M5"
        atf = _normalise_tf(atf_raw) if atf_raw else "H4"
        htf = _normalise_tf(htf_raw) if htf_raw else "D1"

        groups[(htf, atf, etf)].append(t)

    rows = []
    # Sort combos by trade count descending (most-traded first)
    for idx, ((htf, atf, etf), group) in enumerate(
        sorted(groups.items(), key=lambda x: -len(x[1]))
    ):
        stats = compute_per_tf_stats(group)

        top_candle  = _most_common([_get(t, "candlePattern")    for t in group])
        top_session = _most_common([_get(t, "sessionName")      for t in group])
        top_phase   = _most_common([_get(t, "sessionPhase")     for t in group])
        top_regime  = _most_common([_get(t, "marketRegime")     for t in group])
        top_dir     = _most_common([_get(t, "trendDirection")   for t in group])
        top_htf_b   = _most_common([_get(t, "htfBias")          for t in group])
        top_news    = _most_common([_get(t, "newsEnvironment")  for t in group])
        top_timing  = _most_common([_get(t, "timingContext")    for t in group])
        top_vol     = _most_common([_get(t, "volatilityState")  for t in group])
        top_ind     = _most_common([_get(t, "indicatorState")   for t in group])

        bias_str      = _build_bias(top_htf_b)
        condition_str = _build_condition(top_regime, top_dir)
        session_str   = _build_session(top_session, top_phase)
        news_str      = _build_news(top_news)
        momentum_str  = _build_momentum(top_vol, top_timing)

        rows.append({
            "id":  idx + 1,
            "htf": htf,
            "atf": atf,
            "etf": etf,
            "tf1": {
                "candle": f"{htf} · Macro Context",
                "pa": (
                    f"HTF {htf} bias: {bias_str}. "
                    f"Direction: {top_dir or 'N/A'}. "
                    f"Regime: {top_regime or 'N/A'}. "
                    f"Based on {len(group)} trade(s) in this combo."
                ),
            },
            "tf2": {
                "candle": f"{atf} · Setup Timeframe",
                "pa": (
                    f"ATF {atf} setup confirmed. "
                    f"Condition: {condition_str}. "
                    f"Aligns with {htf} macro context."
                ),
            },
            "tf3": {
                "candle": top_candle if top_candle != "—" else f"{etf} · Entry Signal",
                "pa": (
                    f"ETF {etf} entry. "
                    f"Most common pattern: {top_candle}. "
                    f"Timing: {top_timing or 'N/A'}."
                ),
            },
            "indicators": top_ind if top_ind != "—" else f"{etf} indicators at entry",
            "session":    session_str,
            "condition":  condition_str,
            "bias":       bias_str,
            "news":       news_str,
            "momentum":   momentum_str,
            "wr":         round(stats["winRate"]),
            "avgR":       round(stats["avgRR"], 1),
            "trades":     stats["trades"],
            "netPL":      round(stats["netPnl"]),
        })

    return rows
