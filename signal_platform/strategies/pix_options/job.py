"""PIX OPTIONS — THE MAP JOB, once a minute (23 Nov 2026, docs/options-levels.md).

The scraper container stores each open's tables in `options_snapshots` (route `/api/internal/options/snapshot`):
Investing.com's overnight table per market (source "investing", with OUR live price at that moment) and Barchart's judged
picks per market, already converted to the level on his chart (source "barchart"). This job finds a run not mapped yet,
maps every market by his guide (`mapping`), grades it with Barchart (`grade`), stores the levels (`options_levels` —
the previous map's are marked replaced: the guide locks levels until the next open), and posts the map to the CHANNEL
(his answer 7), one message per market. The levels are then watched by PIX (`watch`, from `strategies/pix.py`).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from strategies.pix_options import grade as G, mapping as MP, message as MSG

log = logging.getLogger(__name__)
MARKETS = ("XAU/USD", "EUR/USD", "GBP/USD")


def _j(v):
    return json.loads(v) if isinstance(v, str) else v


def build(run: dict) -> tuple[list[tuple[str, dict, dict]], list[list[str]]]:
    """[(market, map, investing snapshot)], [message block per market] for one stored run. Pure apart from the input."""
    by = {(s["source"], s["market"]): s for s in run["snaps"]}
    maps, blocks = [], []
    for market in MARKETS:
        inv = by.get(("investing", market))
        if inv is None:
            blocks.append([f"<b>{market}</b>", "<i>Investing.com's table could not be read this open — not mapped</i>"])
            continue
        rows, spot = _j(inv["rows"]) or [], inv["spot"]
        m = MP.map_market(rows, spot)
        bc = by.get(("barchart", market))
        if m["status"] == "mapped":
            G.grade(m, sorted(r["strike"] for r in rows), _j(bc["picks"]) if bc and bc.get("picks") is not None
                    else None, spot)
        maps.append((market, m, inv))
        blocks.append(MSG.market_block(market, m, spot or 0.0, inv.get("expiry") or ""))
    return maps, blocks


async def run_once() -> None:
    from storage import options_repo as R
    from notifications import dispatcher as D
    loop = asyncio.get_running_loop()
    for run in await loop.run_in_executor(None, R.unmapped_runs):
        try:
            maps, blocks = build(run)
            when = run["taken_at"] or datetime.now(timezone.utc)
            for market, m, _ in maps:
                if m["status"] == "mapped":
                    await loop.run_in_executor(None, R.save_levels, run["run_id"], run["slot"], market, when,
                                               m["levels"])
            await loop.run_in_executor(None, R.mark_mapped, run["run_id"])
        except Exception:
            log.exception("[pix-options] run %s could not be mapped — left for the next minute", run["run_id"])
            continue
        for text in MSG.render(run["slot"], when, blocks):
            ok = await D._send_text(text)
            log.info("[pix-options] map %s (%s) %s", run["run_id"], run["slot"], "posted" if ok else "NOT POSTED")
