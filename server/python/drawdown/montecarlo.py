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
from ._utils import get_pnl_pct, safe_mean

_EMPTY = {
    "hasData": False, "runs": 0, "actualMaxDd": 0.0, "expectedMaxDd": 0.0,
    "worstCase95": 0.0, "worstCase99": 0.0, "actualPercentile": 0.0,
    "riskOfRuinPct": 0.0, "ruinThreshold": -50.0, "breach20Pct": 0.0,
}


def _max_dd(returns: list, sb: float) -> float:
    """Max peak-to-trough % on a compounded path of per-trade % returns."""
    eq = sb
    peak = sb
    mdd = 0.0
    for r in returns:
        eq *= (1 + r / 100.0)
        if eq > peak:
            peak = eq
        if peak > 0:
            dd = (eq - peak) / peak * 100.0
            if dd < mdd:
                mdd = dd
    return mdd


def compute_montecarlo(trades: list, starting_balance: float, runs: int = 1000) -> dict:
    series = [p for p in (get_pnl_pct(t) for t in trades) if p is not None]
    if len(series) < 5:                       # too few trades to project meaningfully
        return _EMPTY

    sb = float(starting_balance) if starting_balance else 10_000.0
    n = len(series)
    actual = _max_dd(series, sb)

    # Deterministic seed from the data → stable results across refetches.
    random.seed(n * 1000 + int(abs(sum(series)) * 100) % 1000)

    ruin_t = -50.0
    sims, ruin, breach20 = [], 0, 0
    for _ in range(runs):
        sample = [random.choice(series) for _ in range(n)]
        m = _max_dd(sample, sb)
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
