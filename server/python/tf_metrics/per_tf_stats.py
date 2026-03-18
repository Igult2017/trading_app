"""
tf_metrics/per_tf_stats.py
Base performance KPIs for a single timeframe group.
"""
from __future__ import annotations


def _f(v) -> float | None:
    """Safe float coercion from DB decimal strings."""
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _mean(vals: list) -> float:
    clean = [v for v in vals if v is not None]
    return round(sum(clean) / len(clean), 2) if clean else 0.0


def _get_outcome(t: dict) -> str:
    """
    Return 'win', 'loss', or 'breakeven'.
    Reads outcome field first; infers from profitLoss if absent.
    Handles both camelCase (DB raw) and snake_case fields.
    """
    outcome = (t.get("outcome") or "").lower().strip()
    if outcome in ("win", "loss", "breakeven", "be"):
        return "win" if outcome == "win" else "breakeven" if outcome in ("breakeven", "be") else "loss"

    pl = _f(t.get("profitLoss") or t.get("profit_loss"))
    if pl is not None:
        return "win" if pl > 0 else "loss" if pl < 0 else "breakeven"
    return "unknown"


def compute_per_tf_stats(group: list) -> dict:
    """
    Compute base KPIs for a single timeframe group.

    Reads from journalEntries schema fields (camelCase from DB):
      outcome, profitLoss, riskReward, manualFields.confluence_score
    """
    if not group:
        return {
            "trades": 0, "wins": 0, "losses": 0,
            "winRate": 0.0, "avgRR": 0.0, "profitFactor": 0.0,
            "netPnl": 0.0, "avgWin": 0.0, "avgLoss": 0.0,
            "expectancy": 0.0, "avgEntryQuality": 0.0,
        }

    wins = 0
    losses = 0
    breakevens = 0
    win_pnls: list[float] = []
    loss_pnls: list[float] = []
    win_rrs: list[float] = []
    confluence_scores: list[float] = []

    for t in group:
        outcome = _get_outcome(t)
        pl = _f(t.get("profitLoss") or t.get("profit_loss"))

        if outcome == "win":
            wins += 1
            if pl is not None:
                win_pnls.append(pl)
            # riskReward is a decimal column — stored as string in DB
            rr = _f(t.get("riskReward") or t.get("risk_reward"))
            if rr is not None and rr > 0:
                win_rrs.append(rr)
        elif outcome == "loss":
            losses += 1
            if pl is not None:
                loss_pnls.append(pl)
        else:
            breakevens += 1

        # confluenceScore: check direct field, then manualFields JSONB, then aiExtracted
        cs = _f(t.get("confluenceScore"))
        if cs is None:
            for blob_key in ("manualFields", "manual_fields", "aiExtracted", "ai_extracted"):
                blob = t.get(blob_key)
                if isinstance(blob, dict):
                    cs = _f(blob.get("confluence_score") or blob.get("confluenceScore"))
                    if cs is not None:
                        break
        if cs is not None:
            confluence_scores.append(cs)

    total  = len(group)
    knowns = wins + losses + breakevens
    win_rate = round(wins / knowns * 100, 2) if knowns > 0 else 0.0

    gross_wins  = sum(p for p in win_pnls  if p > 0)
    gross_losses = sum(abs(p) for p in loss_pnls if p < 0)
    profit_factor = round(gross_wins / gross_losses, 3) if gross_losses > 0 \
                    else (999.0 if gross_wins > 0 else 0.0)

    avg_win  = _mean(win_pnls)
    avg_loss = _mean(loss_pnls)   # negative value

    # Expectancy = (winRate * avgWin) + (lossRate * avgLoss)
    wr_dec   = wins   / knowns if knowns > 0 else 0.0
    lr_dec   = losses / knowns if knowns > 0 else 0.0
    expectancy = round((wr_dec * avg_win) + (lr_dec * avg_loss), 2)

    net_pnl = round(sum(win_pnls) + sum(loss_pnls), 2)

    return {
        "trades":          total,
        "wins":            wins,
        "losses":          losses,
        "winRate":         win_rate,
        "avgRR":           _mean(win_rrs),
        "profitFactor":    profit_factor,
        "netPnl":          net_pnl,
        "avgWin":          avg_win,
        "avgLoss":         avg_loss,
        "expectancy":      expectancy,
        "avgEntryQuality": _mean(confluence_scores),
    }
