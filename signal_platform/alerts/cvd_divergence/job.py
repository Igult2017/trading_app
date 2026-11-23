"""THE MINUTE JOB — reads the candles, runs the watch, sends the DMs, remembers (23 Nov 2026).

His ask: a notification to the PIX-bot DM (the copy bot, `notifications/copy_dm.send`, which falls back to his usual DM
so nothing is lost) when a 1H CVD divergence STARTS on EURUSD, GBPJPY, GBPUSD and XAUUSD, and when the 1M has started
to reverse. "It's not yet a strategy, it is just a notification that can be traded" — so it is NOT a strategy, places
nothing, and touches no strategy's code.

OFF UNTIL HE HAS MATCHED IT AGAINST HIS CHART: the admin switch `cvd_divergence_alerts` (default off). While off, the
job does nothing at all — not even remembering — so switching it on starts from the market as it is then.
Remembered across restarts in `strategy_state` (row `cvd_divergence`), so a deploy never re-sends.
"""
from __future__ import annotations

import asyncio
import logging

from alerts.cvd_divergence import messages, watch

log = logging.getLogger(__name__)

SYMBOLS = ("EUR/USD", "GBP/JPY", "GBP/USD", "XAU/USD")
STATE_ID = "cvd_divergence"
H1_COUNT = 500      # ~3 weeks of hours: room for 20-hour CVD, 5-each-side swings, and the last swing however far back
M1_COUNT = 600      # the hour in progress + the 1M turn since the diverging hour (10 hours)


async def _candles(symbol: str):
    """(closed 1H, the hour in progress or None, closed 1M) — or None when the broker has not yet published an hour
    that 1M candles show has closed (never calculate with an hour missing)."""
    from data.candle_fetcher import fetch_candles
    from data.candle_aggregator import forming_bar
    from shared.mtf_utils import closed_only
    h1 = closed_only(await fetch_candles(symbol, "H1", H1_COUNT))
    m1 = closed_only(await fetch_candles(symbol, "M1", M1_COUNT))
    if not h1:
        return None
    if any(h1[-1].time + 3600 <= m.time < (m1[-1].time // 3600) * 3600 for m in m1):
        log.info("[cvd-div] %s: the broker has not published the last closed hour yet — skipped this minute", symbol)
        return None
    return h1, forming_bar(m1, "H1", anchor=h1[-1].time), m1


async def run_once() -> None:
    from config import live_settings
    if not live_settings.get("cvd_divergence_alerts"):
        return
    from notifications import copy_dm
    from storage import strategy_state_repo as repo
    loop = asyncio.get_running_loop()
    state = await loop.run_in_executor(None, repo.load, STATE_ID) or {}
    sent = 0
    for symbol in SYMBOLS:
        try:
            got = await _candles(symbol)
            if got is None:
                continue
            h1, forming, m1 = got
            state, events = await loop.run_in_executor(None, watch.step, state, symbol, h1, forming, m1)
        except Exception:
            log.exception("[cvd-div] %s: this minute failed — the next minute tries again", symbol)
            continue
        for e in events:
            text = messages.render(e)
            ok = await copy_dm.send(text)
            sent += 1
            log.info("[cvd-div] %s %s %s — %s", symbol, e["side"], e["kind"], "sent" if ok else "NOT DELIVERED")
    await loop.run_in_executor(None, repo.save, STATE_ID, state)
    if sent:
        log.info("[cvd-div] %d message(s) this minute; open watches: %s", sent, sorted(state.get("watches", {})))
