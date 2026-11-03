"""Ask the broker only for the bars that are NEW — not for the whole window again.

HIS QUESTION, 2026-11-03: *"Why don't we request data once and use everywhere where it is needed?
Why unnecessary requests?"* — asked while production was logging
`BLOCKED_PAYLOAD_TYPE — "You are being rate limited"` on the candle fetch.

THE WASTE HE SPOTTED. `candle_fetcher.fetch_candles(symbol, tf, count)` asks for `count` bars every
time, and the cache deliberately expires at every bar close (`candle_cache._ttl_for`, rule 1). So at
each M5 close the platform re-downloaded about 250 M5 bars **to learn one new one** — 249 of them
already held, and closed bars never change. Multiply by every timeframe and every instrument and
that is the request budget, spent on data we already had.

WHY PACING COULD NOT FIX IT. `ctrader_client._MIN_REQ_GAP` already spaces requests 0.30s apart
(~3.3/s, under the documented ~5/s historical cap) and we were refused anyway. The cap is not this
process's alone: the scanner, Node's trade sync and the copy engine all share ONE approved cTrader
application. Pacing one process cannot fix a budget shared across three. Making fewer requests can.

WHAT THIS IS NOT. It is not a replacement for the first load: FIX carries no history, and VIX.1 wants
3,000 H1 bars while BX-S/D wants 1,000 H4 — those come from the broker and always will. This only
removes the RE-reading of bars we already hold.

⚠ THE SAFETY PROPERTY, and every decision below follows from it: **anything less than a clean join
returns None and the caller does exactly what it does today.** A hole, an empty reply, a window as
wide as the full request, no held series at all — all fall back. The worst case of this being wrong
is the behaviour we already have.

⚠ CONTINUITY IS PROVED BY OVERLAP, NOT BY ARITHMETIC. The obvious check — "the new window starts one
bar after the old one ends" — is wrong here, because the bar grid has real holes in it: weekends,
holidays, and any session the broker did not publish. That check would refuse every Monday and,
worse, could be fooled into accepting a join across a hole on a timeframe whose spacing happens to
match. So a few bars of DELIBERATE OVERLAP are requested and the two series must genuinely meet. If
they do not touch, there is a hole, and we refuse.

WHY A HOLE MATTERS SO MUCH. A gap in a candle series is invisible downstream — indicators, swing
detection and the momentum test all treat the list as consecutive bars and will compute confidently
on a shape that never existed. `tick_serving` refuses for the same reason and its reasoning is the
model for this one.
"""
from __future__ import annotations

import logging
import time

from core.types import Candle
from data.data_source import fetch_raw
from shared.mtf_utils import to_minutes

log = logging.getLogger(__name__)

# How many bars of deliberate overlap to request, so the two series can be proved to meet rather
# than assumed to. Three is enough to survive one missing bar at the join without being a cost.
OVERLAP_BARS = 3


def _rows_to_candles(raw: list[dict], tf: str) -> list[Candle]:
    return [
        Candle(time=int(b["time"]), open=b["open"], high=b["high"],
               low=b["low"], close=b["close"], volume=b["volume"], timeframe=tf)
        for b in raw
    ]


def bars_needed(tf: str, newest_held: int, now: float | None = None) -> int:
    """How many bars to ask for to cover everything since `newest_held`, plus the overlap.

    Pure, so the arithmetic can be checked without a broker. `+1` covers the bar currently forming:
    it is re-read every time precisely because it is the one bar that still changes.
    """
    bar_s = to_minutes(tf) * 60
    if bar_s <= 0:
        return 0
    now = time.time() if now is None else now
    elapsed = now - newest_held
    if elapsed < 0:
        return 0                       # held series is from the future — nonsense, refuse
    return int(elapsed // bar_s) + 1 + OVERLAP_BARS


def merge(held: list[Candle], fresh: list[Candle]) -> list[Candle] | None:
    """Join a held series to a newer window, or None when they do not demonstrably meet.

    ⚠ EVERY HELD BAR AT OR AFTER THE FRESH WINDOW'S FIRST BAR IS DROPPED, not kept. The newest held
    bar was very likely still forming when it was stored, so its high, low and close are a snapshot
    of a half-built bar. The broker's copy is the answer sheet and replaces it.
    """
    if not fresh or not held:
        return None
    first_fresh = fresh[0].time
    # THE OVERLAP TEST. The fresh window must reach back to at least the newest bar we hold; if it
    # starts after it, something happened in between that neither series contains.
    if first_fresh > held[-1].time:
        return None
    kept = [c for c in held if c.time < first_fresh]
    if not kept:
        return None                    # the window covers everything — no saving, let the caller refetch
    return kept + fresh


async def top_up(symbol: str, tf: str, count: int, held: list[Candle],
                 validate) -> tuple[list[Candle], list[Candle]] | None:
    """Fetch only what is new and splice it onto `held`.

    Returns `(merged, fresh)` — the caller needs `fresh` because the M1 tick audit must score only
    the bars that actually just arrived. Returns None whenever the full fetch should be used instead,
    which is every case this cannot prove clean.

    `validate` is passed in rather than imported so this module never has to import
    `candle_fetcher`, which imports it — and so the merge can be checked with no broker at all.
    """
    if not held:
        return None
    want = bars_needed(tf, int(held[-1].time))
    if want <= 0:
        return None
    # NO SAVING, SO NO RISK WORTH TAKING. If the gap is as wide as the request itself, the top-up
    # would cost what the full fetch costs while adding a join that could go wrong.
    if want >= count:
        return None

    raw = await fetch_raw(symbol, tf, want)
    if not raw:
        return None
    fresh = validate(_rows_to_candles(raw, tf), symbol, tf)
    if not fresh:
        return None

    merged = merge(held, fresh)
    if merged is None:
        log.info(f"[candle_topup] {symbol} {tf}: held and fresh series do not meet — full fetch")
        return None
    if len(merged) < count:
        return None                    # short of what was asked for; the full fetch is the answer

    log.debug(f"[candle_topup] {symbol} {tf}: asked for {want} bars instead of {count}")
    return merged[-count:], fresh
