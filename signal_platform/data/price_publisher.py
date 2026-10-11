"""
Push the live FIX quotes to the Node API, so the journal ticker can show real broker prices.

HIS ASK, 2026-10-11: real prices in the ticker, *"in the journal only not landing page"*.

WHAT THIS IS. One loop, reading quotes that are ALREADY in memory, POSTing them to Node every two
seconds. Node keeps the newest one per symbol and fans it out to every signed-in journal user, so a
hundred open browsers cost this platform exactly one FIX subscription — the thing
`docs/ctrader-scaling.md` exists to protect.

WHY ITS OWN TASK AND NOT A TICK INSIDE THE ENTRY WATCHER. The entry watcher's whole purpose is to
scan the INSTANT a 1-minute bar closes, because signals were measured arriving at or past their own
entry. An HTTP POST awaited inside that 0.25s loop would add network latency to the one path where
latency is the defect being fixed. This reads the same shared quote registry (`fix_quotes._STREAMS`,
which exists precisely so code outside a watcher can read prices) and never touches that loop.

IT IS COSMETIC, AND IT MUST STAY COSMETIC. Nothing here decides, places, amends or stores anything.
Every failure is swallowed and logged at debug. If this loop dies the ticker goes stale and the
platform is otherwise exactly as it was — that is the only acceptable blast radius for a decoration.
"""
import asyncio
import logging

import httpx

log = logging.getLogger(__name__)

# Every two seconds. Fast enough that the ticker reads as live, slow enough to be invisible: 30
# requests a minute to our own Node process, carrying five numbers. It spends NO broker budget at
# all — the quotes are already in memory, pushed to us over FIX.
_PERIOD_S = 2.0
# After a failure, back off rather than hammer a Node that is restarting or deploying.
_BACKOFF_S = 15.0


def _symbols() -> list[str]:
    """The symbols the FIX session actually subscribes to.

    READ FROM `fix_wire.SYMBOL_IDS`, NEVER LISTED AGAIN HERE. A second hardcoded list is how a
    symbol gets added to the feed and silently never reaches the ticker — or worse, is asked for
    here under a name the book does not use and quietly returns nothing for ever.
    """
    from data.fix_wire import SYMBOL_IDS
    return list(SYMBOL_IDS.keys())


def _collect() -> list[dict]:
    """The quotes available right now. A symbol with no healthy quote is OMITTED, not zeroed.

    OMITTED IS THE POINT. `live_quote` refuses anything older than 15s, so a shut market or a dead
    session means a symbol simply stops appearing — and the age Node reports for it climbs, which is
    how the ticker knows to mark the market closed. Sending a zero, or the last price we happened to
    remember, would show a dead number as a live one.
    """
    from data.fix_quotes import live_quote
    out: list[dict] = []
    for sym in _symbols():
        q = live_quote(sym)
        if q is None:
            continue
        out.append({"symbol": sym, "bid": q[0], "ask": q[1]})
    return out


async def _push(rows: list[dict]) -> bool:
    """POST one batch. Returns False on any failure, and never raises."""
    from data.node_bridge import _node_bridge
    url = _node_bridge.get("node_api_url")
    secret = _node_bridge.get("admin_secret")
    if not url or not secret:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as http:
            r = await http.post(
                f"{url}/api/internal/prices",
                headers={"x-admin-secret": secret},
                json={"prices": rows},
            )
        return r.status_code == 200
    except Exception as exc:
        log.debug(f"[prices] push failed: {type(exc).__name__}: {exc}")
        return False


async def run_forever() -> None:
    """Never raises. A ticker feed that can take the platform down is not a feature."""
    log.info("[prices] publisher started — pushing live quotes to the journal ticker every %ss",
             _PERIOD_S)
    said_quiet = False
    while True:
        try:
            rows = _collect()
            if rows:
                said_quiet = False
                if not await _push(rows):
                    await asyncio.sleep(_BACKOFF_S)
                    continue
            elif not said_quiet:
                # Said ONCE per outage, not every two seconds. Usually the market is simply shut.
                said_quiet = True
                log.debug("[prices] no live quotes to publish (market shut, or no FIX session)")
            await asyncio.sleep(_PERIOD_S)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.debug(f"[prices] publisher cycle failed: {type(exc).__name__}: {exc}")
            await asyncio.sleep(_BACKOFF_S)
