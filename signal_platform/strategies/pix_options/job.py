"""PIX OPTIONS — THE MAP JOB, once a minute (23 Nov 2026, docs/options-levels.md).

The scraper container stores each open's tables in `options_snapshots` (route `/api/internal/options/snapshot`):
Investing.com's overnight table per market (source "investing", with OUR live price at that moment) and Barchart's judged
picks per market, already converted to the level on his chart (source "barchart"). This job maps each stored run by his
guide (`mapping`), grades it with Barchart (`grade`), stores the levels (`options_levels` — the previous map's are marked
replaced: the guide locks levels until the next open), posts the map to the CHANNEL (his answer 7), one message per
market, and then DELETES the run's raw tables (his rule, 23 Nov 2026: scraped data is only for mapping and
calculations, then gone). The levels are watched by PIX (`signals`, from `strategies/pix.py`).

NEVER A CRASH, NEVER A LOOP: the whole minute is guarded (a database that cannot be reached = one log line, try again
next minute); a run that fails to map MAX_TRIES times is deleted and his DM is told, instead of retried for ever.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from strategies.pix_options import grade as G, mapping as MP, message as MSG

log = logging.getLogger(__name__)
MARKETS = ("XAU/USD", "EUR/USD", "GBP/USD")
MAX_TRIES = 3
_tries: dict[str, int] = {}


def _j(v):
    return json.loads(v) if isinstance(v, str) else v


def build(run: dict) -> tuple[list[tuple[str, dict, dict]], list[list[str]]]:
    """[(market, map, investing snapshot)], [message block per market] for one stored run. Pure apart from the input."""
    by = {(s["source"], s["market"]): s for s in run["snaps"]}
    maps, blocks = [], []
    for market in MARKETS:
        inv, bc = by.get(("investing", market)), by.get(("barchart", market))
        if inv is None:
            if bc is None:
                blocks.append([f"<b>{market}</b>", "<i>Neither Investing.com nor Barchart could be read this open "
                                                   "(3 tries each) — not mapped</i>"])
                continue
            # Investing.com failed its 3 tries → Barchart's FULL qualifiers only (his order, 23 Nov 2026).
            m = G.barchart_only(_j(bc.get("picks")), bc.get("spot"))
            maps.append((market, m, bc))
            blocks.append(MSG.market_block(market, m, bc.get("spot") or 0.0, bc.get("expiry") or ""))
            continue
        rows, spot = _j(inv["rows"]) or [], inv["spot"]
        m = MP.map_market(rows, spot)
        if m["status"] == "mapped":
            G.grade(m, sorted(r["strike"] for r in rows), _j(bc["picks"]) if bc and bc.get("picks") is not None
                    else None, spot)
        maps.append((market, m, inv))
        blocks.append(MSG.market_block(market, m, spot or 0.0, inv.get("expiry") or ""))
    return maps, blocks


async def _map_one(run: dict, loop) -> list[str]:
    from storage import options_repo as R
    maps, blocks = build(run)
    when = run["taken_at"] or datetime.now(timezone.utc)
    for market, m, _ in maps:
        if m["status"] == "mapped":
            await loop.run_in_executor(None, R.save_levels, run["run_id"], run["slot"], market, when, m["levels"])
    await loop.run_in_executor(None, R.delete_run, run["run_id"])            # mapped → the raw tables are gone
    return MSG.render(run["slot"], when, blocks)


async def run_once() -> None:
    from storage import options_repo as R
    from notifications import dispatcher as D, copy_dm
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, R.purge)
        runs = await loop.run_in_executor(None, R.unmapped_runs)
    except Exception as e:                                                    # noqa: BLE001
        log.warning("[pix-options] database not reachable this minute (%s) — trying again next minute",
                    type(e).__name__)
        return
    for run in runs:
        rid = run["run_id"]
        try:
            texts = await _map_one(run, loop)
            _tries.pop(rid, None)
        except Exception:
            _tries[rid] = _tries.get(rid, 0) + 1
            log.exception("[pix-options] run %s could not be mapped (try %d of %d)", rid, _tries[rid], MAX_TRIES)
            if _tries[rid] >= MAX_TRIES:
                try:
                    await loop.run_in_executor(None, R.delete_run, rid)
                    await copy_dm.send(f"⚠️ PIX options map NOT made for the {run.get('slot')} open — the stored "
                                       f"tables could not be mapped {MAX_TRIES} times and were dropped. The previous "
                                       f"levels stay watched.")
                except Exception:                                             # noqa: BLE001
                    log.exception("[pix-options] could not drop run %s", rid)
                _tries.pop(rid, None)
            continue
        for text in texts:
            ok = await D._send_text(text)
            log.info("[pix-options] map %s (%s) %s", rid, run["slot"], "posted" if ok else "NOT POSTED")
