"""
tf_metrics/breakdowns.py
Instrument, direction, and session breakdowns for one TF group.
"""
from __future__ import annotations
from collections import defaultdict


def _f(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _wr(wins: int, total: int) -> float:
    return round(wins / total * 100, 2) if total > 0 else 0.0


def _mean(vals: list) -> float:
    clean = [v for v in vals if v is not None]
    return round(sum(clean) / len(clean), 2) if clean else 0.0


def _get_outcome(t: dict) -> str:
    outcome = (t.get("outcome") or "").lower().strip()
    if outcome == "win":   return "win"
    if outcome == "loss":  return "loss"
    if outcome in ("breakeven", "be"): return "breakeven"
    pl = _f(t.get("profitLoss") or t.get("profit_loss"))
    if pl is not None:
        return "win" if pl > 0 else "loss" if pl < 0 else "breakeven"
    return "unknown"


def _get_session(t: dict) -> str:
    """
    Derive canonical session from sessionName field (schema.ts: sessionName).
    Falls back to UTC hour from entryTimeUTC / entryTime.
    Returns one of: London | NewYork | Asia | Sydney | Unknown
    """
    sn = (
        t.get("sessionName") or
        t.get("session_name") or
        t.get("sessionLabel") or
        t.get("session_label") or ""
    ).lower()

    if any(x in sn for x in ("london", "lon", "eu", "europe")):
        return "London"
    if any(x in sn for x in ("new york", "newyork", "ny", "us", "america")):
        return "NewYork"
    if any(x in sn for x in ("tokyo", "asia", "asian")):
        return "Asia"
    if any(x in sn for x in ("sydney", "aest", "aus")):
        return "Sydney"
    if any(x in sn for x in ("overlap", "london/ny", "lon/ny")):
        # London/NY overlap — count under NewYork (peak liquidity)
        return "NewYork"

    # Fall back to UTC hour
    ts = (
        t.get("entryTimeUTC") or t.get("entry_time_utc") or
        t.get("entryTime")    or t.get("entry_time") or ""
    )
    try:
        s = str(ts)
        # Support both "2024-10-14T09:30:00Z" and "2024-10-14 09:30"
        time_part = s.split("T")[-1] if "T" in s else s.split(" ")[-1]
        hour = int(time_part[:2])
        # London: 07:00–16:00 UTC
        if 7 <= hour < 16:
            return "London"
        # New York: 12:00–21:00 UTC (overlaps London 12–16)
        if 12 <= hour < 21:
            return "NewYork"
        # Tokyo / Asia: 00:00–09:00 UTC
        if 0 <= hour < 9:
            return "Asia"
        # Sydney: 21:00–07:00 UTC
        return "Sydney"
    except (ValueError, IndexError):
        return "Unknown"


def compute_breakdowns(group: list) -> dict:
    """
    Compute instrument, direction, and session breakdowns for one TF group.
    """
    # ── By instrument ─────────────────────────────────────────────────────────
    # Uses: instrument field (schema.ts journalEntries)
    instr_buckets: dict[str, dict] = defaultdict(
        lambda: {"trades": 0, "wins": 0, "net_pnl": 0.0}
    )

    for t in group:
        instr = (t.get("instrument") or t.get("symbol") or "Unknown").strip() or "Unknown"
        outcome = _get_outcome(t)
        pl = _f(t.get("profitLoss") or t.get("profit_loss")) or 0.0

        instr_buckets[instr]["trades"] += 1
        instr_buckets[instr]["net_pnl"] = round(instr_buckets[instr]["net_pnl"] + pl, 2)
        if outcome == "win":
            instr_buckets[instr]["wins"] += 1

    by_instrument: dict[str, dict] = {}
    for instr, d in instr_buckets.items():
        by_instrument[instr] = {
            "trades":  d["trades"],
            "wins":    d["wins"],
            "winRate": _wr(d["wins"], d["trades"]),
            "netPnl":  d["net_pnl"],
        }

    # best/worst: min 3 trades threshold
    eligible = {k: v for k, v in by_instrument.items() if v["trades"] >= 3}
    best_instrument  = max(eligible, key=lambda k: eligible[k]["winRate"]) if eligible else "N/A"
    worst_instrument = min(eligible, key=lambda k: eligible[k]["winRate"]) if eligible else "N/A"

    # ── By direction ──────────────────────────────────────────────────────────
    # Uses: direction field (schema.ts journalEntries: "buy"/"sell" or "long"/"short")
    dir_buckets: dict[str, dict] = defaultdict(
        lambda: {"trades": 0, "wins": 0, "rr_vals": []}
    )

    for t in group:
        raw_dir = (
            t.get("direction") or
            t.get("orderType") or
            t.get("order_type") or
            t.get("type") or ""
        ).lower().strip()

        if raw_dir in ("buy", "long", "bull"):
            direction = "long"
        elif raw_dir in ("sell", "short", "bear"):
            direction = "short"
        else:
            direction = "long"  # default — don't discard the trade

        outcome = _get_outcome(t)
        rr = _f(t.get("riskReward") or t.get("risk_reward"))

        dir_buckets[direction]["trades"] += 1
        if outcome == "win":
            dir_buckets[direction]["wins"] += 1
            if rr is not None and rr > 0:
                dir_buckets[direction]["rr_vals"].append(rr)

    by_direction: dict[str, dict] = {}
    for direction in ("long", "short"):
        d = dir_buckets[direction]
        by_direction[direction] = {
            "trades":  d["trades"],
            "winRate": _wr(d["wins"], d["trades"]),
            "avgRR":   _mean(d["rr_vals"]),
        }

    # ── By session ────────────────────────────────────────────────────────────
    # Always return all 4 canonical sessions so the frontend never hits KeyError
    session_buckets: dict[str, dict] = defaultdict(
        lambda: {"trades": 0, "wins": 0}
    )

    for t in group:
        session = _get_session(t)
        outcome = _get_outcome(t)
        session_buckets[session]["trades"] += 1
        if outcome == "win":
            session_buckets[session]["wins"] += 1

    by_session: dict[str, dict] = {
        s: {"trades": 0, "winRate": 0.0}
        for s in ("London", "NewYork", "Asia", "Sydney")
    }
    for session, d in session_buckets.items():
        if session in by_session:
            by_session[session] = {
                "trades":  d["trades"],
                "winRate": _wr(d["wins"], d["trades"]),
            }
        # Unknown / non-canonical sessions are discarded (rare edge case)

    return {
        "bestInstrument":  best_instrument,
        "worstInstrument": worst_instrument,
        "byInstrument":    by_instrument,
        "byDirection":     by_direction,
        "bySession":       by_session,
    }
