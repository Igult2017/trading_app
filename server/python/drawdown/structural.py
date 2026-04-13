"""
drawdown/structural.py
Trade structural diagnostics — two tabs: Context and Entry.
All groups are built exclusively from actual trade data.
Labels with zero matching trades are never shown.
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
    Build one diagnostic item.
    Returns None when the group is empty (no trades) so callers can filter.
    """
    total = len(group_trades)
    if total == 0:
        return None  # caller must filter

    losses = sum(1 for t in group_trades if get_outcome(t) == "loss")
    loss_pcts = [
        p for t in group_trades
        if get_outcome(t) == "loss"
        for p in [get_pnl_pct(t)]
        if p is not None
    ]
    avg_dd    = round(safe_mean(loss_pcts), 2) if loss_pcts else 0.0
    loss_rate = round(losses / total * 100, 1) if total > 0 else 0.0

    return {
        "label":       label,
        "avgDdPct":    avg_dd,
        "total":       total,
        "losses":      losses,
        "lossRate":    loss_rate,
        "barWidthPct": loss_rate,
    }


def _section(title: str, raw_items: list) -> dict | None:
    """
    Build a section dict, filtering out empty items.
    Returns None when no items have data (so the whole section is skipped).
    """
    items = [i for i in raw_items if i is not None]
    if not items:
        return None
    return {"title": title, "items": items}


def compute_structural(trades: list) -> dict:
    """
    Compute trade structural diagnostics.
    Only groups with at least one matching trade are included.
    Sections with no matching groups are omitted entirely.
    """
    empty = {"context": [], "entry": []}

    if not trades:
        return empty

    groups: dict[str, list] = defaultdict(list)

    for t in trades:
        outcome      = get_outcome(t)
        ob_valid     = _bool_field(t, "ob_valid")
        choch_valid  = _bool_field(t, "choch_valid")
        fvg_trap     = _bool_field(t, "fvg_trap")

        htf_bias = _s(
            t.get("htfBias") or t.get("htf_bias") or
            blob_field(t, "htf_bias") or blob_field(t, "htfBias") or ""
        )
        entry_type = _s(
            t.get("entryType") or t.get("entry_type") or
            blob_field(t, "entry_type") or blob_field(t, "entryType") or ""
        )
        sl_placement = _s(
            t.get("slPlacement") or t.get("sl_placement") or
            blob_field(t, "sl_placement") or blob_field(t, "slPlacement") or ""
        )

        # ── SMC / context groups ───────────────────────────────────────────
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

        # ── Entry execution groups ─────────────────────────────────────────
        if entry_type in ("premature", "early", "pre_confirm", "pre-confirm"):
            groups["premature_entry"].append(t)
        if entry_type in ("confirmed", "confirm", "valid"):
            groups["confirmed_entry"].append(t)
        if "inducement" in entry_type or "induced" in entry_type:
            groups["inducement"].append(t)

        # ── Entry reason (generic — any trading style) ─────────────────────
        reason = _s(
            t.get("entryReason") or t.get("entry_reason") or
            blob_field(t, "entryReason") or blob_field(t, "entry_reason") or ""
        )
        if reason:
            groups[f"reason_{reason[:40]}"].append(t)

        # ── SL placement ───────────────────────────────────────────────────
        if sl_placement:
            groups[f"sl_{sl_placement}"].append(t)
        elif outcome == "loss":
            sld = t.get("stopLossDistance") or t.get("stop_loss_distance")
            if sld is not None:
                groups["sl_above_below_wick"].append(t)
            else:
                groups["sl_inside_structure"].append(t)

        # ── Psychology / discipline ────────────────────────────────────────
        tags_raw = (
            t.get("tags") or blob_field(t, "tags") or
            blob_field(t, "psychology") or []
        )
        if isinstance(tags_raw, str):
            tags_raw = [tags_raw]
        combined = " ".join(str(x).lower() for x in (tags_raw or []))
        if "revenge" in combined:
            groups["psych_revenge"].append(t)
        if "fomo" in combined:
            groups["psych_fomo"].append(t)
        if "oversize" in combined:
            groups["psych_oversize"].append(t)
        if any(x in combined for x in ("calm", "disciplined", "patient")):
            groups["psych_disciplined"].append(t)

    def g(key: str) -> list:
        return groups.get(key, [])

    def bi(label: str, key: str) -> dict | None:
        return _build_item(label, g(key), trades)

    # ── Context tab ────────────────────────────────────────────────────────
    # Only build sections that contain at least one non-empty item.

    context_sections_raw = [
        _section("Orderblock / Structure", [
            bi("HTF Orderblock Failed",   "htf_ob_failed"),
            bi("HTF Swing Alignment",     "htf_swing_alignment"),
        ]),
        _section("Confirmation", [
            bi("Fake-out CHoCH",          "fake_choch"),
            bi("Unmitigated FVG Trap",    "fvg_trap"),
        ]),
        _section("Trend Bias", [
            bi("Counter-Trend Entry",     "counter_trend"),
            bi("With-Trend Entry",        "with_trend"),
        ]),
        _section("Psychology", [
            bi("Revenge Trade",           "psych_revenge"),
            bi("FOMO Trigger",            "psych_fomo"),
            bi("Oversized Position",      "psych_oversize"),
            bi("Disciplined Execution",   "psych_disciplined"),
        ]),
    ]
    context = [s for s in context_sections_raw if s is not None]

    # ── Entry tab ──────────────────────────────────────────────────────────
    # SL placement: prefer explicit sl_ groups, fall back to derived groups.
    sl_items_raw = [
        _build_item(k[3:].replace("_", " ").title(), v, trades)
        for k, v in groups.items()
        if k.startswith("sl_") and v
    ]
    if not sl_items_raw:
        sl_items_raw = [
            bi("SL Above/Below Wick",  "sl_above_below_wick"),
            bi("SL Inside Structure",  "sl_inside_structure"),
        ]
    sl_items_raw = [i for i in sl_items_raw if i is not None]

    # Entry reason: generic groups (any trading style)
    reason_items = [
        _build_item(k[7:].replace("_", " ").title(), v, trades)
        for k, v in sorted(groups.items())
        if k.startswith("reason_") and v
    ]
    reason_items = [i for i in reason_items if i is not None]

    entry_sections_raw = [
        _section("Execution Timing", [
            bi("Early / Pre-confirm Entry", "premature_entry"),
            bi("Confirmed Entry",           "confirmed_entry"),
            bi("Inducement Failure",        "inducement"),
        ]),
        _section("Entry Reason", reason_items) if reason_items else None,
        _section("Risk Placement", sl_items_raw) if sl_items_raw else None,
    ]
    entry = [s for s in entry_sections_raw if s is not None]

    return {"context": context, "entry": entry}
