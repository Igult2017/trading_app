"""
ai_engine/proof.py
Confidence and sample-size gating layer.
Nothing surfaces unless it passes the golden rule:
  every finding must be backed by real data, not inference.
"""
from __future__ import annotations
from ._models import ProofedFinding, Confidence, VariableCombo
from ._utils import confidence_level, is_sufficient, win_rate as global_win_rate


# ── Trade-level finding builder ───────────────────────────────────────────────

def build_finding(
    finding:     str,
    group:       list[dict],
    baseline_wr: float,
    context:     dict | None = None,
) -> ProofedFinding | None:
    """
    Return a ProofedFinding only when the group meets the minimum sample size.
    Returns None when data is insufficient — caller must handle the None case.
    """
    n = len(group)
    if not is_sufficient(n):
        return None

    wr  = global_win_rate(group)
    dev = wr - baseline_wr
    return ProofedFinding(
        finding=finding,
        sample_size=n,
        win_rate=round(wr, 4),
        baseline_wr=round(baseline_wr, 4),
        deviation=round(dev, 4),
        confidence=confidence_level(n),
        context=context or {},
    )


# ── Combo → ProofedFinding adapter ───────────────────────────────────────────

def combo_to_finding(combo: VariableCombo, positive: bool = True) -> ProofedFinding:
    """Convert a VariableCombo into a ProofedFinding for the verdict layer."""
    direction = "edge" if positive else "drain"
    label = ", ".join(f"{k}={v}" for k, v in combo.variables.items())
    return ProofedFinding(
        finding=f"{label} → {direction} ({combo.win_rate:.0%} WR)",
        sample_size=combo.sample_size,
        win_rate=combo.win_rate,
        baseline_wr=combo.baseline_wr,
        deviation=combo.deviation,
        confidence=combo.confidence,
        context={"variables": combo.variables},
    )


# ── Filter helpers ────────────────────────────────────────────────────────────

def filter_sufficient(findings: list[ProofedFinding | None]) -> list[ProofedFinding]:
    """Strip None and INSUFFICIENT results from a mixed list."""
    return [f for f in findings if f is not None and f.confidence != "INSUFFICIENT"]


def top_findings(
    findings: list[ProofedFinding],
    n: int = 5,
    positive: bool = True,
) -> list[ProofedFinding]:
    """
    Return the top-n most actionable findings.
    positive=True  → highest win_rate (edges)
    positive=False → lowest win_rate (drains / risk alerts)
    """
    return sorted(
        filter_sufficient(findings),  # type: ignore[arg-type]
        key=lambda f: f.win_rate,
        reverse=positive,
    )[:n]


# ── Data-warning generator ────────────────────────────────────────────────────

def data_warnings(findings: list[ProofedFinding]) -> list[str]:
    """Surface human-readable warnings for LOW-confidence findings."""
    warnings: list[str] = []
    for f in findings:
        if f.confidence == "LOW":
            warnings.append(
                f"⚠ '{f.finding}' is based on only {f.sample_size} trades — "
                "treat as preliminary, not proven."
            )
    return warnings
