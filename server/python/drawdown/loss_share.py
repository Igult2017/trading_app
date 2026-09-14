"""
drawdown/loss_share.py
Where the losses came from — each pair's and each session's SHARE of the total loss, for the two pie
charts on the Drawdown page.

His request, 2026-09-14: "let the pie chart show loss percentage contributed by each pair ... the
second one can show percentage loss contributed by sessions".

WHAT A SLICE IS. The money lost on LOSING trades in that group, as a share of the money lost on losing
trades overall. It is the same "loss contribution" the strategy / instrument list on the page shows
(intelligence._group_metrics: losing trades only, break-evens excluded per his 2026-09-05 ruling, P&L
as % of the starting balance), grouped here by pair and by session.

WHY NOT DRAW THE PIES FROM THAT LIST AS IT STANDS. It stops at 8 rows, and a pie drawn from the top 8
of 11 pairs makes every slice too big while quietly dropping the rest. It also skips a trade with no
pair tag. A pie must add up to the whole, so here nothing is capped and untagged losses go into
"Unknown".
"""
from __future__ import annotations
from ._utils import get_instrument, get_session
from .intelligence import _group_drawdown, _group_metrics, _metrics_normalise

_EMPTY = {"byPair": [], "bySession": []}


def _shares(groups: list) -> list:
    """Keep the groups that lost money and give each its share of their total, largest first
    (name as the tie-break, so equal slices cannot swap places between two loads)."""
    losing = [g for g in groups if g["totalLossPct"] < 0]
    total = sum(g["totalLossPct"] for g in losing)
    rows = [{
        "name":    g["name"],
        "lossPct": g["totalLossPct"],      # % of the starting balance, negative
        "losses":  g["losses"],
        "share":   round(g["totalLossPct"] / total * 100, 1) if total else 0.0,
    } for g in losing]
    rows.sort(key=lambda r: (-r["share"], r["name"]))
    return rows


def compute_loss_share(trades: list, starting_balance: float) -> dict:
    """{byPair, bySession}: rows of {name, lossPct, losses, share}; each list's shares add to 100.

    Reads trades the way the page's strategy / instrument list does — the Metrics page's own parser
    when it imports, drawdown's matching extractors when it does not — so the pie's per-pair losses
    agree with that list."""
    if not trades:
        return dict(_EMPTY)
    sb = float(starting_balance) if starting_balance else 10_000.0
    if _metrics_normalise is not None:
        recs = [r for r in (_metrics_normalise(t) for t in trades) if r is not None]
        pairs    = _group_metrics(recs, "instrument", sb, limit=None, empty_label="Unknown")
        sessions = _group_metrics(recs, "session",    sb, limit=None, empty_label="Unknown")
    else:
        pairs    = _group_drawdown(trades, get_instrument, limit=None)
        sessions = _group_drawdown(trades, get_session,    limit=None)
    return {"byPair": _shares(pairs), "bySession": _shares(sessions)}
