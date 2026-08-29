"""
drawdown/montecarlo.py
─────────────────────────────────────────────────────────────────────────────
Bootstrap Monte-Carlo of max-drawdown. Resamples YOUR OWN per-trade returns
(with replacement) over many simulated sequences to project:
  • expected max drawdown
  • worst-case max drawdown at the 95% / 99% confidence levels
  • risk-of-ruin (probability of breaching a -50% account drawdown)
  • where your ACTUAL max drawdown ranks among the simulations

Deterministic per dataset (seeded from the data) so it doesn't jitter between
refetches. Pure, never raises.
"""
from __future__ import annotations
import random
from ._utils import equity_curve, max_drawdown_pct, safe_mean, trade_deltas

_EMPTY = {
    "hasData": False, "runs": 0, "actualMaxDd": 0.0, "expectedMaxDd": 0.0,
    "worstCase95": 0.0, "worstCase99": 0.0, "actualPercentile": 0.0,
    "riskOfRuinPct": 0.0, "ruinThreshold": -50.0, "breach20Pct": 0.0,
}


def _walk(deltas: list, sb: float) -> float:
    """Deepest fall from a peak on one path of per-trade cash results."""
    bal = sb
    out = []
    for d in deltas:
        bal += d
        out.append(bal)
    return max_drawdown_pct(out, sb)


def compute_montecarlo(trades: list, starting_balance: float, runs: int = 1000) -> dict:
    """TWO DEFECTS FIXED HERE, 2026-08-29 — both made this card disagree with the rest of the page.

    1. IT READ THE TRADES BACKWARDS. It walked the list exactly as delivered, and the database hands
       entries over newest-first (`storage.getJournalEntries`, `orderBy(desc(createdAt))`). Every
       other order-sensitive module called `sort_by_date`; this one never did, so the "actual maximum
       drawdown" it reported was of a sequence that never happened. On test sets a true -31.43% read
       as -18.03%.

    2. IT COMPOUNDED PERCENTAGES THAT WERE DELIBERATELY MADE NON-COMPOUNDING. `core._annotate_pnl_pct`
       measures each trade against the STARTING balance on purpose — its own note records that the
       older running-balance version "diverged from Metrics, and skewed payoff/Kelly". This file then
       applied those figures multiplicatively to a running balance (`eq *= 1 + r/100`), mixing two
       models. The same maximum drawdown appeared twice on the page, up to 23 percentage points
       apart (-31.43% headline against -54.64% here), and risk-of-ruin was wrong in BOTH directions
       (41.8% where it should read 17.9%; 1.2% where it should read 2.9%).

    Both are gone because the equity curve is no longer rebuilt here: it comes from `_utils`, the one
    definition the whole page shares.

    THE SIMULATION RESAMPLES CASH RESULTS, NOT PERCENTAGES. A trade's cash result is a fact about
    that trade, so drawing them with replacement genuinely re-runs the same account through a
    different order — which is the question this card asks. Percentages are not: compounding a
    percentage that was measured against a fixed base is not a rerun of anything.
    """
    _, curve = equity_curve(trades, starting_balance)
    if len(curve) < 5:                        # too few trades to project meaningfully
        return _EMPTY

    sb = float(starting_balance) if starting_balance else 10_000.0
    deltas = trade_deltas(curve, sb)
    n = len(deltas)
    actual = max_drawdown_pct(curve, sb)

    # Deterministic seed from the data → stable results across refetches.
    random.seed(n * 1000 + int(abs(sum(deltas)) * 100) % 1000)

    ruin_t = -50.0
    sims, ruin, breach20 = [], 0, 0
    for _ in range(runs):
        sample = [random.choice(deltas) for _ in range(n)]
        m = _walk(sample, sb)
        sims.append(m)
        if m <= ruin_t:
            ruin += 1
        if m <= -20.0:
            breach20 += 1
    sims.sort()                               # ascending → sims[0] is the worst

    def at(p_worst: float) -> float:
        idx = min(runs - 1, max(0, int(p_worst / 100.0 * runs)))
        return round(sims[idx], 2)

    worse = sum(1 for s in sims if s <= actual)
    return {
        "hasData": True,
        "runs": runs,
        "actualMaxDd": round(actual, 2),
        "expectedMaxDd": round(safe_mean(sims), 2),
        "worstCase95": at(5),                 # 5% chance of being worse than this
        "worstCase99": at(1),
        "actualPercentile": round(worse / runs * 100, 1),
        "riskOfRuinPct": round(ruin / runs * 100, 1),
        "ruinThreshold": ruin_t,
        "breach20Pct": round(breach20 / runs * 100, 1),
    }
