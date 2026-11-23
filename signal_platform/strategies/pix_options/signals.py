"""PIX OPTIONS — WATCHING THE DAY'S LEVELS from PIX's `analyze`, and the signal (23 Nov 2026, docs/options-levels.md).

For each level of this market still `watching` (`options_levels`): the CLOSED 1M candles since the map was made go to
`watch.judge`. RESPECTED → one PIX signal (saved, monitored, shown on the Assets page; PIX's cards go to his PIX DM —
his answer 7); BROKEN → the level is marked broken. Either way the level is done for this session (the guide's
single-touch rule) — the database row says so, so a restart cannot send it twice.
"""
from __future__ import annotations

import asyncio
import logging

from core.types import Direction, Signal, TF
from charting import theme
from notifications import titles
from shared.pip import price_digits
from strategies.pix_options import watch as W

log = logging.getLogger(__name__)
MARKETS = ("XAU/USD", "EUR/USD", "GBP/USD")


def build(symbol: str, lv: dict, plan: dict, strategy_id: str, strategy_name: str) -> Signal:
    digits = price_digits(symbol)
    buy = lv["side"] == "buy"
    d = lv.get("detail") or {}
    reasons = [f"Options level {lv['level']:.{digits}f} — {lv['label']} (grade {lv.get('grade') or 'C'})",
               ("Swept below, then a 1M candle closed back above" if lv.get("sweep") else
                f"1M touched it, then a 1M candle closed back {'above' if buy else 'below'}"),
               plan["note"]] + list(d.get("why") or [])[:2]
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,
        strategy_name     = strategy_name,
        label             = "PIX-OPTIONS",
        entry_price       = round(plan["entry"], digits),
        stop_loss         = round(plan["sl"], digits),
        take_profit       = round(plan["tp"], digits),
        risk_reward       = plan["rr"],
        confidence        = 0.75,
        primary_timeframe = TF.M1,
        chart_bands       = [(lv["level"], lv["level"], theme.ZONE_DEMAND if buy else theme.ZONE_SUPPLY,
                              lv["label"].upper())],
        alert_only        = False,
        stage             = "ready",
        headline          = titles.CONFIRMED_ENTRY,
        technical_reasons = reasons,
        market_context    = f"PIX options — {'BUY' if buy else 'SELL'} {symbol} at the {lv['label']} "
                            f"{lv['level']:.{digits}f}, {plan['rr']:g}R",
    )


async def check(symbol: str, m1: list, spread: float, strategy_id: str, strategy_name: str) -> list[Signal]:
    """Signals for the levels of `symbol` respected now; marks respected and broken levels in the database."""
    from storage import options_repo as R
    loop = asyncio.get_running_loop()
    out = []
    for lv in await loop.run_in_executor(None, R.watching, symbol):
        since = lv["mapped_at"].timestamp()
        candles = [x for x in m1 if x.time >= since]
        kind, got = W.judge({"side": lv["side"], "strike": lv["level"], "sweep": bool(lv["sweep"])}, candles, spread)
        if kind == "broken":
            await loop.run_in_executor(None, R.set_status, lv["id"], "broken")
            log.info("[pix-options] %s %s %s broken: %s", symbol, lv["label"], lv["level"], got)
        elif kind == "signal":
            sig = build(symbol, lv, got, strategy_id, strategy_name)
            sig.dedup_key = f"{symbol}_pix_options_{lv['id']}"
            await loop.run_in_executor(None, R.set_status, lv["id"], "signalled")
            log.info("[pix-options] %s %s %s respected — %s entry %s", symbol, lv["label"], lv["level"],
                     lv["side"], got["entry"])
            out.append(sig)
    return out
