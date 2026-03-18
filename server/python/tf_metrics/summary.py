"""
tf_metrics/summary.py
Cross-timeframe summary stats for the TFMetricsPanel header section.
"""
from __future__ import annotations


def _f(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _get_outcome(t: dict) -> str:
    outcome = (t.get("outcome") or "").lower().strip()
    if outcome == "win":   return "win"
    if outcome == "loss":  return "loss"
    if outcome in ("breakeven", "be"): return "breakeven"
    pl = _f(t.get("profitLoss") or t.get("profit_loss"))
    if pl is not None:
        return "win" if pl > 0 else "loss" if pl < 0 else "breakeven"
    return "unknown"


def _get_confluence(t: dict) -> float | None:
    cs = _f(t.get("confluenceScore"))
    if cs is None:
        for blob_key in ("manualFields", "manual_fields", "aiExtracted", "ai_extracted"):
            blob = t.get(blob_key)
            if isinstance(blob, dict):
                cs = _f(blob.get("confluence_score") or blob.get("confluenceScore"))
                if cs is not None:
                    break
    return cs


# Values that indicate a trade was taken in HTF bias direction
_WITH_TREND = frozenset({
    "with_trend", "with trend", "aligned", "bullish", "bearish_short",
    "long", "buy", "bull", "yes", "true", "1",
})


def compute_summary(by_tf: dict, trades: list) -> dict:
    """
    Derive cross-TF headline stats.

    by_tf keys already have all per_tf_stats + breakdowns + equity merged.
    trades is the original raw list for htfBias / confluence scans.
    """
    MIN_TRADES = 5

    # ── Best / worst / most-traded TF ─────────────────────────────────────────
    eligible = {
        tf: d for tf, d in by_tf.items()
        if d.get("trades", 0) >= MIN_TRADES
    }

    if eligible:
        best_tf  = max(eligible, key=lambda tf: eligible[tf].get("winRate", 0.0))
        worst_tf = min(eligible, key=lambda tf: eligible[tf].get("winRate", 0.0))
    else:
        best_tf  = "N/A"
        worst_tf = "N/A"

    most_traded = (
        max(by_tf, key=lambda tf: by_tf[tf].get("trades", 0))
        if by_tf else "N/A"
    )

    # ── HTF bias alignment rate ───────────────────────────────────────────────
    # Count trades where htfBias / htf_bias (or manualFields equivalent) indicates
    # the trade was taken in the direction of the higher-timeframe trend.
    htf_total   = 0
    htf_aligned = 0

    for t in trades:
        htf_bias = (
            t.get("htfBias") or t.get("htf_bias")
        )
        if htf_bias is None:
            for blob_key in ("manualFields", "manual_fields", "aiExtracted", "ai_extracted"):
                blob = t.get(blob_key)
                if isinstance(blob, dict):
                    htf_bias = blob.get("htf_bias") or blob.get("htfBias")
                    if htf_bias is not None:
                        break

        if htf_bias is not None:
            htf_total += 1
            if str(htf_bias).lower().strip() in _WITH_TREND:
                htf_aligned += 1

    htf_rate = round(htf_aligned / htf_total * 100, 2) if htf_total > 0 else 0.0

    # ── MTF confluence win boost ──────────────────────────────────────────────
    # Overall win rate vs win rate of trades with confluenceScore >= 70.
    # Boost = high_confluence_wr - overall_wr
    # Requires >= 5 high-confluence trades to report; else 0.0.
    all_knowns = [t for t in trades if _get_outcome(t) in ("win", "loss", "breakeven")]
    all_wins   = sum(1 for t in all_knowns if _get_outcome(t) == "win")
    overall_wr = (all_wins / len(all_knowns) * 100) if all_knowns else 0.0

    hc_trades = [t for t in trades if (_get_confluence(t) or 0) >= 70]
    if len(hc_trades) >= 3:
        hc_knowns = [t for t in hc_trades if _get_outcome(t) in ("win", "loss", "breakeven")]
        hc_wins   = sum(1 for t in hc_knowns if _get_outcome(t) == "win")
        hc_wr     = (hc_wins / len(hc_knowns) * 100) if hc_knowns else 0.0
        mtf_boost = round(hc_wr - overall_wr, 2)
    else:
        mtf_boost = 0.0

    return {
        "bestTimeframe":         best_tf,
        "worstTimeframe":        worst_tf,
        "mostTradedTimeframe":   most_traded,
        "htfBiasAlignmentRate":  htf_rate,
        "mtfConfluenceWinBoost": mtf_boost,
    }
