"""PIX OPTIONS — WATCHING THE DAY'S LEVELS from PIX's `analyze`, and the signal (23 Nov 2026, docs/options-levels.md).

For each level of this market still `watching` (`options_levels`): the CLOSED 1M candles since the map was made go to
`watch.judge`. RESPECTED → one PIX signal (saved, monitored, shown on the Assets page; PIX's cards go to his PIX DM —
his answer 7); BROKEN → the level is marked broken, nothing sent. Either way the level is done for this session (the guide's
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


MEASURES = ("IV skew", "IV", "Delta", "Gamma", "Theta", "Vega")      # "IV skew" first: it also starts with "IV"


def options_lines(lv: dict) -> list[str]:
    """THE OPTIONS METRICS ON THE CARD (his ask, 23 Nov 2026: "In the signal card, make sure you mention all the options
    metrics a signal has failed"). What Investing.com's map passed, what Barchart's strike passed, and EVERY metric it
    failed with its value and what it should be (a line starting with ❌ is shown without a tick)."""
    d = lv.get("detail") or {}
    out = [f"Investing.com: {w}" for w in (d.get("why") or []) if not w.startswith("Barchart:")]
    if d.get("speed"):
        out.append(f"Investing.com: {d['speed']}")
    p = d.get("barchart")
    if not p:
        out.append("❌ Barchart: no strike backs this level — no confluence (grade C)")
        return out
    fails = p.get("fails") or []
    failed = {next((m for m in MEASURES if f.startswith(m)), f) for f in fails}
    passed = [m for m in MEASURES if m not in failed]
    out.append(f"Barchart strike {p['strike']:g} (= {p['spot']:g} on your chart) passes: {', '.join(passed)}"
               if passed else f"Barchart strike {p['strike']:g} passes none of its measures")
    out += [f"❌ Barchart {f}" for f in fails]
    return out


def build(symbol: str, lv: dict, plan: dict, strategy_id: str, strategy_name: str) -> Signal:
    digits = price_digits(symbol)
    buy = lv["side"] == "buy"
    d = lv.get("detail") or {}
    reasons = [f"Options level {lv['level']:.{digits}f} — {lv['label']} (grade {lv.get('grade') or 'C'})",
               ("Swept below, then a 1M candle closed back above" if lv.get("sweep") else
                f"1M touched it, then a 1M candle closed back {'above' if buy else 'below'}"),
               plan["note"]] + list(d.get("why") or [])[:2]
    # THE TELEGRAM CARD SHOWS ONLY THE CHECKLIST (`notifications/telegram_cards.py`) — found 23 Nov 2026: without one
    # this card showed none of its reasons. So everything he needs is here.
    checklist = [f"{lv['label']} {lv['level']:.{digits}f} — grade {lv.get('grade') or 'C'}", reasons[1]] + \
        options_lines(lv) + [plan["note"], f"Target {plan['rr']:g}R"]
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
        checklist         = checklist,
        market_context    = f"PIX options — {'BUY' if buy else 'SELL'} {symbol} at the {lv['label']} "
                            f"{lv['level']:.{digits}f}, {plan['rr']:g}R",
    )


async def check(symbol: str, m1: list, spread: float, strategy_id: str, strategy_name: str) -> list[Signal]:
    """For each level of `symbol` still watched: RESPECTED → a signal. That is the ONLY message (his word, 23 Nov 2026:
    *"Only report the respected levels because if you report zones that have not been respected that is a lot of
    messages in DM"*) — the "📍 reached" and "❌ not respected" notices built earlier that day are gone. Reaching and
    breaking are still RECORDED on the level (touched / broken), silently: a broken level never signals later, and a
    restart repeats nothing."""
    from storage import options_repo as R
    loop = asyncio.get_running_loop()
    out = []
    for lv in await loop.run_in_executor(None, R.watching, symbol):
        since = lv["mapped_at"].timestamp()
        candles = [x for x in m1 if x.time >= since]
        level = {"side": lv["side"], "strike": lv["level"], "sweep": bool(lv["sweep"])}
        kind, got = W.judge(level, candles, spread)
        if kind == "broken":
            await loop.run_in_executor(None, R.set_status, lv["id"], "broken")
            log.info("[pix-options] %s %s %s NOT respected: %s", symbol, lv["label"], lv["level"], got)
        elif kind == "signal":
            sig = build(symbol, lv, got, strategy_id, strategy_name)
            opp = await loop.run_in_executor(None, R.opposite, lv["run_id"], symbol, lv["side"])
            if opp is not None:
                line = f"Opposite active dealer zone (the guide's target): {opp:.{price_digits(symbol)}f}"
                sig.technical_reasons.insert(2, line)
                sig.checklist.append(line)                    # on the Telegram card too (it shows the checklist only)
            sig.dedup_key = f"{symbol}_pix_options_{lv['id']}"
            await loop.run_in_executor(None, R.set_status, lv["id"], "signalled")
            log.info("[pix-options] %s %s %s respected — %s entry %s", symbol, lv["label"], lv["level"],
                     lv["side"], got["entry"])
            out.append(sig)
        elif lv.get("status") == "watching" and W.touched(level, candles) is not None:
            await loop.run_in_executor(None, R.set_status, lv["id"], "touched")
    return out
