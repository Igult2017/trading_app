"""PIX OPTIONS LEVELS — the stored runs and the day's levels (23 Nov 2026, docs/options-levels.md). Tables
`options_snapshots` + `options_levels` (`docker-migrate.sql`, `shared/schema.ts`). Plain SQL through the engine's session."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import text

from storage.db import get_session


def unmapped_runs() -> list[dict]:
    """Runs whose snapshots are not mapped yet, oldest first: [{run_id, slot, taken_at, snaps: [row dicts]}]."""
    with get_session() as s:
        rows = s.execute(text(
            "SELECT run_id, slot, source, market, taken_at, expiry, spot, futures, rows, picks "
            "FROM options_snapshots ORDER BY taken_at")).mappings().all()     # a mapped run's rows are deleted
    runs: dict[str, dict] = {}
    for r in rows:
        run = runs.setdefault(r["run_id"], {"run_id": r["run_id"], "slot": r["slot"], "taken_at": r["taken_at"],
                                            "snaps": []})
        run["snaps"].append(dict(r))
    return list(runs.values())


def delete_run(run_id: str) -> None:
    """The run's raw tables are GONE once mapped (his rule, 23 Nov 2026: "the data scraped … is only for dealer mapping
    and calculations and after that they will be automatically be gotten rid of from the database")."""
    with get_session() as s:
        s.execute(text("DELETE FROM options_snapshots WHERE run_id = :r"), {"r": run_id})


def purge() -> None:
    """Housekeeping each minute: a run stuck unmapped for 24 h is deleted; finished levels (signalled, broken, replaced,
    not qualified) are deleted after 7 days — they matter for the day; a week is kept for checking."""
    with get_session() as s:
        s.execute(text("DELETE FROM options_snapshots WHERE taken_at < NOW() - INTERVAL '24 hours'"))
        s.execute(text("DELETE FROM options_levels WHERE status NOT IN ('watching', 'touched') "
                       "AND mapped_at < NOW() - INTERVAL '7 days'"))


def opposite(run_id: str, market: str, side: str) -> float | None:
    """The opposite ACTIVE dealer zone of the same map — the guide's take-profit (a sell aims at Active Dealer Support,
    a buy at Active Dealer Resistance)."""
    label = "Active Dealer Support" if side == "sell" else "Active Dealer Resistance"
    with get_session() as s:
        return s.execute(text("SELECT level FROM options_levels WHERE run_id = :r AND market = :m AND label = :l "
                              "LIMIT 1"), {"r": run_id, "m": market, "l": label}).scalar()


def save_levels(run_id: str, slot: str, market: str, mapped_at: datetime, levels: list[dict]) -> None:
    """The new map for `market` — the previous map's levels still being watched are marked `replaced` (the guide:
    levels are locked at the open and re-evaluated only at the next open)."""
    with get_session() as s:
        s.execute(text("UPDATE options_levels SET status = 'replaced', status_at = NOW() "
                       "WHERE market = :m AND status IN ('watching', 'touched', 'not qualified')"), {"m": market})
        for lv in levels:
            s.execute(text(
                "INSERT INTO options_levels (run_id, slot, market, mapped_at, label, side, level, grade, qualified, "
                "sweep, detail, status) VALUES (:run, :slot, :m, :at, :label, :side, :level, :grade, :q, :sweep, "
                "CAST(:detail AS JSONB), :status)"),
                {"run": run_id, "slot": slot, "m": market, "at": mapped_at, "label": lv["label"], "side": lv["side"],
                 "level": lv["strike"], "grade": lv.get("grade"), "q": lv["qualified"], "sweep": lv.get("sweep", False),
                 "detail": json.dumps({k: lv.get(k) for k in ("why", "why_not", "iv", "iv_class", "delta", "speed",
                                                               "barchart")}, default=str),
                 "status": "watching" if lv["qualified"] else "not qualified"})


def watching(market: str) -> list[dict]:
    """The levels of `market` still waiting for a reaction — untouched (`watching`) or reached (`touched`)."""
    with get_session() as s:
        rows = s.execute(text(
            "SELECT id, run_id, market, mapped_at, label, side, level, grade, sweep, detail, status FROM options_levels "
            "WHERE market = :m AND status IN ('watching', 'touched') ORDER BY level"), {"m": market}).mappings().all()
    return [dict(r) for r in rows]


def set_status(level_id: str, status: str, signal_id: str | None = None) -> None:
    with get_session() as s:
        s.execute(text("UPDATE options_levels SET status = :st, status_at = :at, signal_id = :sig WHERE id = :id"),
                  {"st": status, "at": datetime.now(timezone.utc), "sig": signal_id, "id": level_id})
