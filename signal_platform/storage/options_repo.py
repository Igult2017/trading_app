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
            "FROM options_snapshots WHERE mapped_at IS NULL ORDER BY taken_at")).mappings().all()
    runs: dict[str, dict] = {}
    for r in rows:
        run = runs.setdefault(r["run_id"], {"run_id": r["run_id"], "slot": r["slot"], "taken_at": r["taken_at"],
                                            "snaps": []})
        run["snaps"].append(dict(r))
    return list(runs.values())


def mark_mapped(run_id: str) -> None:
    with get_session() as s:
        s.execute(text("UPDATE options_snapshots SET mapped_at = NOW() WHERE run_id = :r"), {"r": run_id})


def save_levels(run_id: str, slot: str, market: str, mapped_at: datetime, levels: list[dict]) -> None:
    """The new map for `market` — the previous map's levels still being watched are marked `replaced` (the guide:
    levels are locked at the open and re-evaluated only at the next open)."""
    with get_session() as s:
        s.execute(text("UPDATE options_levels SET status = 'replaced', status_at = NOW() "
                       "WHERE market = :m AND status IN ('watching', 'not qualified')"), {"m": market})
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
    """The levels of `market` still waiting for a reaction."""
    with get_session() as s:
        rows = s.execute(text(
            "SELECT id, run_id, market, mapped_at, label, side, level, grade, sweep, detail FROM options_levels "
            "WHERE market = :m AND status = 'watching' ORDER BY level"), {"m": market}).mappings().all()
    return [dict(r) for r in rows]


def set_status(level_id: str, status: str, signal_id: str | None = None) -> None:
    with get_session() as s:
        s.execute(text("UPDATE options_levels SET status = :st, status_at = :at, signal_id = :sig WHERE id = :id"),
                  {"st": status, "at": datetime.now(timezone.utc), "sig": signal_id, "id": level_id})
