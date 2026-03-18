"""
drawdown/frequency.py
Loss-frequency breakdown by attributes and by instrument.
"""
from __future__ import annotations
from collections import defaultdict
from ._utils import (
    get_instrument, get_strategy, get_session, get_outcome,
    blob_field, _s
)

_MIN_GROUP = 5   # minimum trades to include a group


def _rate(losses: int, total: int) -> float:
    return round(losses / total * 100, 1) if total > 0 else 0.0


def _psychology_tag(t: dict) -> str | None:
    """
    Extract psychology label from tags array or manualFields.
    Returns None when no psychology signal is found.
    """
    tags_raw = (
        t.get("tags") or
        blob_field(t, "tags") or
        blob_field(t, "psychology") or
        []
    )
    if isinstance(tags_raw, str):
        tags_raw = [tags_raw]
    tags = [str(x).lower() for x in (tags_raw or [])]
    combined = " ".join(tags)

    if "revenge" in combined:       return "Revenge Trade"
    if "fomo" in combined:          return "FOMO Trigger"
    if "oversize" in combined:      return "Oversized Position"
    if any(x in combined for x in ("calm", "disciplined", "patient")):
        return "Calm Execution"
    return None


def _structural_tag(t: dict) -> str | None:
    """Derive structural diagnosis label from boolean fields."""
    outcome = get_outcome(t)

    ob_valid = blob_field(t, "ob_valid")
    if ob_valid is not None:
        try:
            ob_valid = str(ob_valid).lower() not in ("false", "0", "no")
        except: pass
        if ob_valid is False and outcome == "loss":
            return "HTF OB Failed"

    choch_valid = blob_field(t, "choch_valid")
    if choch_valid is not None:
        try:
            choch_valid = str(choch_valid).lower() not in ("false", "0", "no")
        except: pass
        if choch_valid is False and outcome == "loss":
            return "CHOCH Failure"

    fvg_trap = blob_field(t, "fvg_trap")
    if fvg_trap is not None:
        try:
            fvg_trap = str(fvg_trap).lower() in ("true", "1", "yes")
        except: pass
        if fvg_trap:
            return "FVG Trap"

    htf_bias = (
        t.get("htfBias") or t.get("htf_bias") or
        blob_field(t, "htf_bias") or blob_field(t, "htfBias") or ""
    )
    if str(htf_bias).lower() in ("counter_trend", "counter trend", "against"):
        return "Counter-Trend Entry"

    return None


def compute_frequency(trades: list) -> dict:
    """
    Compute attribute-based and instrument-based loss frequency.
    """
    if not trades:
        return {"attr": [], "instr": []}

    # ── Attribute groups ──────────────────────────────────────────────────────
    # Each group: { cat, name } → { total, losses }
    attr_groups: dict[tuple, dict] = defaultdict(lambda: {"total": 0, "losses": 0})

    for t in trades:
        outcome = get_outcome(t)
        is_loss = outcome == "loss"

        # Strategy
        strat = get_strategy(t)
        if strat and strat != "Unknown":
            key = ("Strategy", strat)
            attr_groups[key]["total"]  += 1
            attr_groups[key]["losses"] += int(is_loss)

        # Session
        session = get_session(t)
        if session and session != "Off-Hours":
            key = ("Session", session)
            attr_groups[key]["total"]  += 1
            attr_groups[key]["losses"] += int(is_loss)

        # Psychology
        psych = _psychology_tag(t)
        if psych:
            key = ("Psychology", psych)
            attr_groups[key]["total"]  += 1
            attr_groups[key]["losses"] += int(is_loss)

        # Structure
        struct = _structural_tag(t)
        if struct:
            key = ("Structure", struct)
            attr_groups[key]["total"]  += 1
            attr_groups[key]["losses"] += int(is_loss)

    attr_list = []
    for (cat, name), d in attr_groups.items():
        if d["total"] < _MIN_GROUP:
            continue
        attr_list.append({
            "cat":      cat,
            "name":     name,
            "total":    d["total"],
            "losses":   d["losses"],
            "lossRate": _rate(d["losses"], d["total"]),
        })
    attr_list.sort(key=lambda x: x["lossRate"], reverse=True)

    # ── Instrument groups ─────────────────────────────────────────────────────
    instr_groups: dict[str, dict] = defaultdict(lambda: {"total": 0, "losses": 0})
    for t in trades:
        instr   = get_instrument(t)
        outcome = get_outcome(t)
        instr_groups[instr]["total"]  += 1
        instr_groups[instr]["losses"] += int(outcome == "loss")

    instr_list = []
    for instr, d in instr_groups.items():
        if d["total"] < _MIN_GROUP:
            continue
        instr_list.append({
            "cat":      "Instrument",
            "name":     instr,
            "total":    d["total"],
            "losses":   d["losses"],
            "lossRate": _rate(d["losses"], d["total"]),
        })
    instr_list.sort(key=lambda x: x["lossRate"], reverse=True)

    return {"attr": attr_list, "instr": instr_list}
