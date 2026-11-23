"""
PIX — BTC/USD and XAU/USD. HIS SKELETON (18 Nov 2026). READ docs/strategies/pix.md FIRST — his rules in his words.

  4H (else 1H) trending? → REAL zones (5M first, then 1H / 4H) in its direction, near the money → on 1M the zone
                PROVES itself: touch, 2+ candles our way, one opposite candle → stop order off that pullback, 3R.
                Order flow: absorption refuses; divergence + delta are shown on the card as agreeing or not.
  both ranging → 5M support / resistance on its 2nd respect (the same 1M proof) → stop order, only with ≥2R of room.

The rules live in `pix_bigzones` and `pix_skeleton`; this file only feeds them candles and turns a plan into a signal.
SIGNALS ONLY — to the public channel (`dm_only_exempt`). PIX is NOT in `autotrade_strategies`, so it places nothing:
his order, *"test before you link to autotrade. We start by sending them to the channel."*
Independent: PIX's own modules plus shared platform resources, never another strategy's logic.
"""
import logging

from core.base_strategy import BaseStrategy
from core.types import Session, Trend, NewsStance, NewsImpact, StrategyResult, TF, Signal, Direction
from core.strategy_context import StrategyContext
from core import delivery_ledger, stage_tracker
from storage import observability_repo as obs
from shared.pip import price_digits
from notifications import titles
from charting import theme
from data import tick_listeners
from strategies import pix_btcflow, pix_tickflow
from strategies.pix_flow import absorbed, confirm
from strategies.pix_skeleton import Plan, range_plan, zone_plan
from strategies.pix_candles import closed_only
from strategies.pix_options import signals as pix_options_signals

log = logging.getLogger(__name__)

_STATE_TTL = 14 * 24 * 3600   # forget a delivered setup after 2 weeks

# BROKER-STREAMED MARKETS' ORDER FLOW (gold, any forex pair) is counted per symbol from the live price stream as it
# arrives (`pix_tickflow`); the stream's watcher hands every tick to the registered listeners, each inside its own try,
# so this can never disturb the stream.
tick_listeners.register(pix_tickflow.on_tick)


async def flow_data(symbol: str):
    """{"M5": (source, candle flows, footprints), "M1": (...)} — the adapter per market; the tools never see a symbol.
    Crypto: Binance (real candle buy/sell + per-price trades). Every broker-streamed market (gold, forex): our live tick
    count, an ESTIMATE (*"forex has no centralized data"*). No figures → the card says "not available"."""
    if symbol.startswith("BTC"):
        await pix_btcflow.refresh_prints()
        m5, m1 = await pix_btcflow.flows("M5", 60), await pix_btcflow.flows("M1", 90)
        return {"M5": (*m5, pix_btcflow.prints("M5")), "M1": (*m1, pix_btcflow.prints("M1"))}
    return {tf: (*pix_tickflow.flows(symbol, tf), pix_tickflow.prints(symbol, tf)) for tf in ("M5", "M1")}


def make_check(data):
    """The order-flow check the skeleton calls once the zone has proved itself on 1M (`pix_entry.Entry`).
    Returns (absorption reason or None, the card's agree / disagree line, extra details).
    ABSORPTION on any 5M or 1M candle of the visit refuses (his 18 Nov rule). DIVERGENCE + DELTA (1M) only confirm."""
    def check(m5, m1, bull, e):
        for tf, candles, since in (("M5", m5, e.first_touch_at // 300 * 300), ("M1", m1, e.first_touch_at)):
            source, fl, fp = data[tf]
            why = absorbed(candles, fl, bull, since, tf.replace("M", "") + "M", prints=fp)
            if why:
                return why + (f" ({source})" if source else ""), "", []
        source, fl, _ = data["M1"]
        c = confirm(m1, fl, bull, e.touch_at, [x.time for x in e.reaction], source=source)
        more = [f"1M reaction volume {c.volume_x:.1f}× the average before the touch"] if c.volume_x else []
        return None, c.line(bull), more
    return check


class PIXStrategy(BaseStrategy):
    name    = "PIX"
    id      = "pix"
    enabled = True             # his order, 18 Nov 2026: "I want it to start working immediately"

    required_timeframes = [TF.H4]
    optional_timeframes = [TF.H1, TF.M5, TF.M1, TF.D1]
    # 500 4H / 1H bars give the "big gap" test its 100 earlier gaps with room to spare; 300 5M bars cover the
    # support/resistance search (200) plus its pivots; 30 days for the daily range.
    # 90 1M bars = the 1M order-flow approach (12) + a visit of up to an hour (the 5M tap window).
    # 600 1M bars (23 Nov 2026): the OPTIONS levels are watched from the morning map onward (up to ~10 hours); the zone
    # logic below is still handed exactly its 90 (`m1[-90:]`), so nothing it decides changes.
    candle_counts       = {TF.H4: 500, TF.H1: 500, TF.M5: 300, TF.M1: 600, TF.D1: 30}
    # THE LIVE BID/ASK. The platform fills `context.quote` / `context.spread` ONLY for a strategy that asks
    # (`strategy_runner`: `quote_for(...) if deps.needs_spread`). Without it PIX judged "would this stop order fill
    # at once?" on a closed 1M close up to ~2 minutes old and put no spread on a sell's stop — found live, 18 Nov.
    requires_spread     = True
    # ...but NOT the platform's 0.05%-of-price spread cap (`risk/spread_filter`) — not his rule, and Bitcoin's normal
    # spread ($33.82 = 0.054% on 18 Nov) would refuse every BTC signal. The spread is already in a sell's stop.
    spread_cap          = False

    allowed_sessions    = [Session.LONDON, Session.NEW_YORK, Session.ASIAN]
    allowed_trends      = [Trend.ANY]
    allowed_instruments = ["BTC/USD", "XAU/USD", "EUR/USD", "GBP/USD"]
    # The ZONE logic trades only his two (18 Nov: "It will trade BTCUSD and XAUUSD"); EUR/USD and GBP/USD are here ONLY
    # for the options levels (his answer 1B, 23 Nov 2026 — `strategies/pix_options/`).
    zone_instruments    = ("BTC/USD", "XAU/USD")
    news_stance         = NewsStance.NEWS_AGNOSTIC
    news_impact_filter  = [NewsImpact.HIGH]

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        c = context.candles
        h4, h1, m5, m1_all, d1 = c.get(TF.H4), c.get(TF.H1), c.get(TF.M5), c.get(TF.M1), c.get(TF.D1)
        m1 = m1_all[-90:]                                   # the zone logic's window, unchanged (see candle_counts)
        sym = context.symbol
        options = await self._options(context, m1_all)
        if sym not in self.zone_instruments:
            return StrategyResult(signals=options) if options else StrategyResult.empty()
        if len(h4) < 100 or len(m5) < 30 or not m1:
            self._log(sym, "AWAIT_DATA", f"H4={len(h4)} M5={len(m5)} M1={len(m1)} — need 100 / 30 / 1+")
            return StrategyResult(signals=options) if options else StrategyResult.empty()
        # CURRENT price only — never a level. The live quote when there is one: the feed serves CLOSED bars, so the
        # last 1M close can be ~2 minutes old, and "would this stop order fill at once?" needs price NOW.
        if context.quote:
            bid, ask = context.quote
            price, spread = (bid + ask) / 2, max(0.0, ask - bid)
        else:
            price, spread = m1[-1].close, context.spread or 0.0
        check = make_check(await flow_data(sym))
        plan, why_zone = zone_plan(h4, h1, m5, m1, price, spread, d1, flow=check)
        why_range = ""
        if plan is None:
            plan, why_range = range_plan(h4, m5, m1, price, spread, flow=check, h1=h1)
        if plan is None:
            self._log(sym, "SCANNING", f"{why_zone}; {why_range}")
            return StrategyResult(signals=options) if options else StrategyResult.empty()
        key = f"{sym}_pix_{plan.path}_{plan.tf}_{plan.level_at}_{plan.pullback_at}"   # one signal per proven pullback
        delivery_ledger.cleanup(_STATE_TTL)
        if delivery_ledger.is_delivered(key):
            return StrategyResult(signals=options) if options else StrategyResult.empty()
        digits = price_digits(sym)
        self._log(sym, "SIGNAL", f"{plan.direction.upper()} {plan.path} {plan.tf} entry {plan.entry:.{digits}f} "
                  f"SL {plan.sl:.{digits}f} TP {plan.tp:.{digits}f} RR {plan.rr}")
        sig = build_signal(sym, plan, digits, self.id, self.name)
        sig.dedup_key = key
        return StrategyResult(signals=options + [sig])

    async def _options(self, context: StrategyContext, m1_all: list) -> list:
        """The day's OPTIONS levels for this market (`strategies/pix_options`), on CLOSED 1M candles. Never raises: a
        failure here must not stop the zone logic."""
        if context.symbol not in pix_options_signals.MARKETS:
            return []
        if context.quote:
            spread = max(0.0, context.quote[1] - context.quote[0])
        else:
            spread = context.spread or 0.0
        try:
            return await pix_options_signals.check(context.symbol, closed_only(m1_all), spread, self.id, self.name)
        except Exception:
            log.exception("[pix-options] %s: the options check failed this minute", context.symbol)
            return []

    def _log(self, sym: str, stage: str, detail: str) -> None:
        """Print on a change AND restate an unchanged stage every heartbeat (`core.stage_tracker`), recorded durably."""
        line = f"[pix] {sym} -> {stage} | {detail}"
        if stage_tracker.emit("pix", sym, f"{stage}|{detail}", line, logger=log):
            obs.record(obs.STAGE_EVALUATED, self.id, sym, detail=f"{stage} | {detail}")


def build_signal(symbol: str, plan: Plan, digits: int, strategy_id: str, strategy_name: str) -> Signal:
    """A real, monitored signal: saved, shown on AssetPage, closed on TP/SL by the monitor."""
    buy = plan.direction == "buy"
    side = "BUY" if buy else "SELL"
    what = f"{plan.tf} {'demand' if buy else 'supply'} zone" if plan.path == "zone" else \
        f"5M {'support' if buy else 'resistance'}"
    # The two lines that repeated the entry, stop, target and R:R are GONE (his ask, 20 Nov 2026: the PIX card is
    # wordy) — the card already prints all four, on one line.
    reasons = list(plan.why)
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,
        strategy_name     = strategy_name,
        label             = "PIX-" + ("ZONE" if plan.path == "zone" else "SR"),
        entry_price       = round(plan.entry, digits),
        stop_loss         = round(plan.sl, digits),
        take_profit       = round(plan.tp, digits),
        risk_reward       = plan.rr,
        confidence        = 0.75,
        primary_timeframe = TF.H4,
        chart_bands       = [(plan.bottom, plan.top, theme.ZONE_DEMAND if buy else theme.ZONE_SUPPLY, what.upper())],
        alert_only        = False,
        stage             = "ready",
        headline          = titles.CONFIRMED_ENTRY,
        technical_reasons = reasons,
        checklist         = list(plan.ticks),      # the card's ticks (`pix_skeleton`, his ask 20 Nov 2026)
        smc_factors       = list(plan.factors),     # the Assets page's three panels (pix_factors)
        market_context    = f"PIX — {side} {symbol} off a {what}, {plan.rr}R stop-order entry {plan.entry:.{digits}f}",
    )
