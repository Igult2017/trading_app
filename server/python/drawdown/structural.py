"""
drawdown/structural.py
SMC context and execution entry structural diagnostics.
Two tabs: context (WHY context was wrong) and entry (WHY execution was poor).
"""
from __future__ import annotations
from collections import defaultdict
from ._utils import get_outcome, get_pnl_pct, blob_field, safe_mean, _s


def _bool_field(t: dict, key: str) -> bool | None:
    """Read a boolean field from trade or JSONB blobs. Returns None if absent."""
    val = t.get(key) or blob_field(t, key)
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    return str(val).lower().strip() in ("true", "1", "yes")


def _build_item(label: str, group_trades: list, all_trades: list) -> dict:
    """
    Build one diagnostic item dict matching frontend shape:
    { label, avgDdPct, total, losses, lossRate, barWidthPct }
    avgDdPct computed from losing trades' pnl_pct (negative).
    """
    total  = len(group_trades)
    losses = sum(1 for t in group_trades if get_outcome(t) == "loss")
    loss_pcts = [
        p for t in group_trades
        if get_outcome(t) == "loss"
        for p in [get_pnl_pct(t)]
        if p is not None
    ]
    avg_dd   = round(safe_mean(loss_pcts), 2) if loss_pcts else 0.0
    loss_rate = round(losses / total * 100, 1) if total > 0 else 0.0

    return {
        "label":       label,
        "avgDdPct":    avg_dd,
        "total":       total,
        "losses":      losses,
        "lossRate":    loss_rate,
        "barWidthPct": loss_rate,   # frontend uses this for progress bar width
    }


def compute_structural(trades: list) -> dict:
    """
    Compute SMC context and execution entry structural diagnostics.
    All groups always present — zeros when no matching trades.
    """
    if not trades:
        return {
            "context": _empty_context(),
            "entry":   _empty_entry(),
        }

    # ── Pre-classify trades into groups ──────────────────────────────────────
    groups: dict[str, list] = defaultdict(list)

    for t in trades:
        outcome    = get_outcome(t)
        ob_valid   = _bool_field(t, "ob_valid")
        choch_valid = _bool_field(t, "choch_valid")
        fvg_trap   = _bool_field(t, "fvg_trap")
        htf_bias   = str(
            t.get("htfBias") or t.get("htf_bias") or
            blob_field(t, "htf_bias") or blob_field(t, "htfBias") or ""
        ).lower().strip()
        entry_type = str(
            t.get("entryType") or t.get("entry_type") or
            blob_field(t, "entry_type") or blob_field(t, "entryType") or ""
        ).lower().strip()
        sl_placement = str(
            t.get("slPlacement") or t.get("sl_placement") or
            blob_field(t, "sl_placement") or blob_field(t, "slPlacement") or ""
        ).lower().strip()

        # Context groups
        if ob_valid is False:
            groups["htf_ob_failed"].append(t)
        if ob_valid is True or htf_bias in ("with_trend", "with trend", "aligned", "bullish", "long", "buy"):
            groups["htf_swing_alignment"].append(t)
        if choch_valid is False:
            groups["fake_choch"].append(t)
        if fvg_trap is True:
            groups["fvg_trap"].append(t)
        if htf_bias in ("counter_trend", "counter trend", "against"):
            groups["counter_trend"].append(t)
        if htf_bias in ("with_trend", "with trend", "aligned", "bullish", "long", "buy"):
            groups["with_trend"].append(t)

        # Entry groups
        if entry_type in ("premature", "early", "pre_confirm", "pre-confirm"):
            groups["premature_bos"].append(t)
        if entry_type in ("confirmed", "confirm", "valid"):
            groups["confirmed_entry"].append(t)
        if "inducement" in entry_type or "induced" in entry_type:
            groups["inducement"].append(t)

        # SL placement groups
        if sl_placement:
            groups[f"sl_{sl_placement}"].append(t)
        elif get_outcome(t) == "loss":
            # Derive from pips gained/lost relative to stop loss distance
            sld = t.get("stopLossDistance") or t.get("stop_loss_distance")
            if sld is not None:
                groups["sl_above_below_wick"].append(t)
            else:
                groups["sl_inside_structure"].append(t)

    def g(key: str) -> list:
        return groups.get(key, [])

    # ── Context tab ───────────────────────────────────────────────────────────
    context = [
        {
            "title": "CTF Validity",
            "items": [
                _build_item("HTF Orderblock Failed",  g("htf_ob_failed"),       trades),
                _build_item("HTF Swing Alignment",    g("htf_swing_alignment"), trades),
            ],
        },
        {
            "title": "ATF Validity",
            "items": [
                _build_item("Fake-out CHOCH ID",     g("fake_choch"), trades),
                _build_item("Unmitigated FVG Trap",  g("fvg_trap"),   trades),
            ],
        },
        {
            "title": "HTF Bias",
            "items": [
                _build_item("Counter-Trend Entry", g("counter_trend"), trades),
                _build_item("With-Trend Entry",    g("with_trend"),    trades),
            ],
        },
    ]

    # ── Entry tab ─────────────────────────────────────────────────────────────
    # SL placement — build dynamically from what's in the data
    sl_items_raw = [
        (k[3:].replace("_", " ").title(), v)    # strip "sl_" prefix
        for k, v in groups.items()
        if k.startswith("sl_") and v
    ]
    if not sl_items_raw:
        # Fallback: split losses by whether stop_loss_distance is present
        sl_items_raw = [
            ("SL Above/Below Wick",  g("sl_above_below_wick")),
            ("SL Inside Structure",  g("sl_inside_structure")),
        ]

    entry = [
        {
            "title": "ETF Execution",
            "items": [
                _build_item("Premature BOS Execution", g("premature_bos"), trades),
                _build_item("Inducement Failure",      g("inducement"),    trades),
            ],
        },
        {
            "title": "Entry Timing",
            "items": [
                _build_item("Early Entry (Pre-confirm)", g("premature_bos"),    trades),
                _build_item("Confirmed Entry",           g("confirmed_entry"), trades),
            ],
        },
        {
            "title": "Risk Placement",
            "items": [_build_item(label, grp, trades) for label, grp in sl_items_raw[:2]],
        },
    ]

    return {"context": context, "entry": entry}


def _empty_context() -> list:
    def _z(label): return {"label": label, "avgDdPct": 0.0, "total": 0, "losses": 0, "lossRate": 0.0, "barWidthPct": 0.0}
    return [
        {"title": "CTF Validity", "items": [_z("HTF Orderblock Failed"), _z("HTF Swing Alignment")]},
        {"title": "ATF Validity", "items": [_z("Fake-out CHOCH ID"), _z("Unmitigated FVG Trap")]},
        {"title": "HTF Bias",     "items": [_z("Counter-Trend Entry"), _z("With-Trend Entry")]},
    ]


def _empty_entry() -> list:
    def _z(label): return {"label": label, "avgDdPct": 0.0, "total": 0, "losses": 0, "lossRate": 0.0, "barWidthPct": 0.0}
    return [
        {"title": "ETF Execution", "items": [_z("Premature BOS Execution"), _z("Inducement Failure")]},
        {"title": "Entry Timing",  "items": [_z("Early Entry (Pre-confirm)"), _z("Confirmed Entry")]},
        {"title": "Risk Placement","items": [_z("SL Above/Below Wick"), _z("SL Inside Structure")]},
    ]
