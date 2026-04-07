"""
ai_engine/proof.py
Confidence and sample-size gating layer.
Nothing surfaces unless it passes the golden rule:
  every finding must be backed by real data, not inference.

Also provides a z-test gate for proportion significance (MEDIUM+ only).
"""
from __future__ import annotations
import math
from ._models import ProofedFinding, Confidence, VariableCombo
from ._utils import confidence_level, is_sufficient, win_rate as global_win_rate


# ── Z-test for proportions ────────────────────────────────────────────────────

def _z_score(p_hat: float, p0: float, n: int) -> float:
    """One-sample proportion z-score (p_hat vs null hypothesis p0)."""
    if n == 0 or p0 <= 0 or p0 >= 1:
        return 0.0
    se = math.sqrt(p0 * (1.0 - p0) / n)
    return (p_hat - p0) / se if se > 0 else 0.0


def is_statistically_significant(
    win_rate: float,
    baseline_wr: float,
    n: int,
    z_threshold: float = 1.645,   # p < 0.05 one-tailed
) -> bool:
    """
    Return True if the deviation from baseline is statistically significant.
    Applied as an additional gate for MEDIUM+ confidence findings before
    they are sent to the LLM for narration.
    LOW confidence findings bypass this (already labelled "preliminary").
    """
    z = abs(_z_score(win_rate, baseline_wr, n))
    return z >= z_threshold


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


def filter_for_llm(findings: list[ProofedFinding]) -> list[ProofedFinding]:
    """
    Return only findings suitable for LLM narration:
      - Confidence MEDIUM or HIGH
      - Passes the z-test for statistical significance
    LOW findings are returned separately (shown in UI only, not narrated).
    """
    result = []
    for f in findings:
        if f.confidence == "LOW":
            continue
        if not is_statistically_significant(f.win_rate, f.baseline_wr, f.sample_size):
            continue
        result.append(f)
    return result


def split_by_confidence(
    findings: list[ProofedFinding],
) -> tuple[list[ProofedFinding], list[ProofedFinding]]:
    """
    Returns (llm_findings, ui_only_findings).
    llm_findings: MEDIUM+ and statistically significant — sent to Gemini.
    ui_only_findings: LOW confidence or not significant — shown in UI but not narrated.
    """
    llm, ui_only = [], []
    for f in findings:
        if f.confidence == "LOW" or not is_statistically_significant(
            f.win_rate, f.baseline_wr, f.sample_size
        ):
            ui_only.append(f)
        else:
            llm.append(f)
    return llm, ui_only


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
                f"'{f.finding}' is based on only {f.sample_size} trades — "
                "treat as preliminary, not proven."
            )
    return warnings
