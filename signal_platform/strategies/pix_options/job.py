"""PIX OPTIONS — THE MAP JOB, once a minute (23 Nov 2026, docs/options-levels.md).

The scraper container stores each open's tables in `options_snapshots` (route `/api/internal/options/snapshot`):
Investing.com's overnight table per market (source "investing", with OUR live price at that moment) and Barchart's judged
picks per market, already converted to the level on his chart (source "barchart"). This job maps each stored run by his
guide (`mapping`), grades it with Barchart (`grade`), stores the levels (`options_levels` — the previous map's are marked
replaced: the guide locks levels until the next open), posts the map to the CHANNEL (his answer 7), one message per
market (a chart with the levels drawn, the text under it — 23 Nov 2026), and then DELETES the run's raw tables (his rule, 23 Nov 2026: scraped data is only for mapping and
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


def build(run: dict) -> list[dict]:
    """One post per market with at least one QUALIFIED level: {market, map (qualified levels only), spot, expiry, block}.
    A market whose data failed, or where nothing qualified, gets no post (his word 23 Nov 2026: "only map what qualifies
    and if nothing does dont"). Pure apart from the input."""
    by = {(s["source"], s["market"]): s for s in run["snaps"]}
    posts = []
    for market in MARKETS:
        inv, bc = by.get(("investing", market)), by.get(("barchart", market))
        if inv is None:
            if bc is None:
                log.info("[pix-options] %s: neither source read this open — not mapped", market)
                continue
            # Investing.com failed its 3 tries → Barchart's FULL qualifiers only (his order, 23 Nov 2026).
            m, spot, expiry = G.barchart_only(_j(bc.get("picks")), bc.get("spot")), bc.get("spot") or 0.0, bc.get("expiry")
        else:
            rows, spot, expiry = _j(inv["rows"]) or [], inv["spot"] or 0.0, inv.get("expiry")
            m = MP.map_market(rows, spot)
            if m["status"] == "mapped":
                G.grade(m, sorted(r["strike"] for r in rows), _j(bc["picks"]) if bc and bc.get("picks") is not None
                        else None, spot)
        m["levels"] = MSG.qualified(m)
        if not m["levels"]:
            log.info("[pix-options] %s: nothing qualified (%s) — not mapped, not posted", market,
                     m.get("note") or m["status"])
            continue
        posts.append({"market": market, "map": m, "spot": spot, "expiry": expiry or "",
                      "block": MSG.market_block(market, m, spot, expiry or "")})
    return posts


async def _map_one(run: dict, loop) -> list[dict]:
    from storage import options_repo as R
    posts = build(run)
    when = run["taken_at"] or datetime.now(timezone.utc)
    for p in posts:
        await loop.run_in_executor(None, R.save_levels, run["run_id"], run["slot"], p["market"], when, p["map"]["levels"])
    await loop.run_in_executor(None, R.delete_run, run["run_id"])            # mapped → the raw tables are gone
    for p in posts:
        p["when"], p["slot"] = when, run["slot"]
    return posts


async def post(p: dict, send_text=None, send_photo=None, candles_for=None) -> bool:
    """ONE MARKET'S MAP: the chart with its qualified levels drawn (his sample, `Desktop/Option 2 .png`) and the text
    UNDER it (the caption; what does not fit follows as a message). No chart (no candles, a drawing failure) → the text
    alone — the map is never lost."""
    import os
    from charting import levels_map
    from notifications import dispatcher as D
    send_text, send_photo = send_text or D._send_text, send_photo or D._send_photo
    full = MSG.text(p["slot"], p["when"], p["block"])
    path = None
    try:
        candles = await (candles_for or _candles)(p["market"])
        lines = [{"price": lv["strike"], "name": lv["label"], "side": lv["side"], "dashed": bool(lv.get("sweep"))}
                 for lv in p["map"]["levels"]]
        path = await asyncio.get_running_loop().run_in_executor(
            None, levels_map.render, MSG.title(p["market"], p["slot"], p["when"]), candles, lines, p["spot"],
            MSG.DIGITS.get(p["market"], 5))
    except Exception:                                                         # noqa: BLE001
        log.exception("[pix-options] %s: the map chart could not be drawn — text only", p["market"])
    if not path:
        return await send_text(full)
    cap, rest = MSG.split(full)
    try:
        ok = await send_photo(path, cap)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    if ok and rest:
        await send_text(rest)
    return ok


async def _candles(market: str) -> list:
    """The last ~2 days of CLOSED 30-minute candles — the picture shows what price did, never a half-formed bar."""
    from data.candle_fetcher import fetch_candles
    from strategies.pix_candles import closed_only          # PIX's own copy — strategies share no logic
    return closed_only(await fetch_candles(market, "M30", 100))


async def run_once() -> None:
    from storage import options_repo as R
    from notifications import copy_dm
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
            posts = await _map_one(run, loop)
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
        if not posts:
            log.info("[pix-options] map %s (%s): nothing qualified in any market — nothing posted", rid, run["slot"])
        for p in posts:
            ok = await post(p)
            log.info("[pix-options] map %s (%s) %s %s", rid, run["slot"], p["market"], "posted" if ok else "NOT POSTED")
