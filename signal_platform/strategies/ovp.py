"""
OVP — BTC/USD and XAU/USD. HIS SKELETON (18 Nov 2026). READ docs/strategies/ovp.md FIRST — his rules in his words.

  4H trending? → BIG zones (4H + 1H) in its direction, near the money → 5M tap + respect → 1M stop order, 3R.
  4H ranging   → 5M support / resistance on its 2nd respect → 1M stop order, only with ≥2R of room.

The rules live in `ovp_bigzones` and `ovp_skeleton`; this file only feeds them candles and turns a plan into a signal.
SIGNALS ONLY — to the public channel (`dm_only_exempt`). OVP is NOT in `autotrade_strategies`, so it places nothing:
his order, *"test before you link to autotrade. We start by sending them to the channel."*
Independent: OVP's own modules plus shared platform resources, never another strategy's logic.
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
from strategies.ovp_skeleton import Plan, range_plan, zone_plan

log = logging.getLogger(__name__)

_STATE_TTL = 14 * 24 * 3600   # forget a delivered setup after 2 weeks


class OVPStrategy(BaseStrategy):
    name    = "OVP"
    id      = "ovp"
    enabled = True             # his order, 18 Nov 2026: "I want it to start working immediately"

    required_timeframes = [TF.H4]
    optional_timeframes = [TF.H1, TF.M5, TF.M1, TF.D1]
    # 500 4H / 1H bars give the "big gap" test its 100 earlier gaps with room to spare; 300 5M bars cover the
    # support/resistance search (200) plus its pivots; 30 days for the daily range.
    candle_counts       = {TF.H4: 500, TF.H1: 500, TF.M5: 300, TF.M1: 30, TF.D1: 30}
    # THE LIVE BID/ASK. The platform fills `context.quote` / `context.spread` ONLY for a strategy that asks
    # (`strategy_runner`: `quote_for(...) if deps.needs_spread`). Without it OVP judged "would this stop order fill
    # at once?" on a closed 1M close up to ~2 minutes old and put no spread on a sell's stop — found live, 18 Nov.
    requires_spread     = True
    # ...but NOT the platform's 0.05%-of-price spread cap (`risk/spread_filter`) — not his rule, and Bitcoin's normal
    # spread ($33.82 = 0.054% on 18 Nov) would refuse every BTC signal. The spread is already in a sell's stop.
    spread_cap          = False

    allowed_sessions    = [Session.LONDON, Session.NEW_YORK, Session.ASIAN]
    allowed_trends      = [Trend.ANY]
    allowed_instruments = ["BTC/USD", "XAU/USD"]          # his instruction: "It will trade BTCUSD and XAUUSD"
    news_stance         = NewsStance.NEWS_AGNOSTIC
    news_impact_filter  = [NewsImpact.HIGH]

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        c = context.candles
        h4, h1, m5, m1, d1 = c.get(TF.H4), c.get(TF.H1), c.get(TF.M5), c.get(TF.M1), c.get(TF.D1)
        sym = context.symbol
        if len(h4) < 100 or len(m5) < 30 or not m1:
            self._log(sym, "AWAIT_DATA", f"H4={len(h4)} M5={len(m5)} M1={len(m1)} — need 100 / 30 / 1+")
            return StrategyResult.empty()
        # CURRENT price only — never a level. The live quote when there is one: the feed serves CLOSED bars, so the
        # last 1M close can be ~2 minutes old, and "would this stop order fill at once?" needs price NOW.
        if context.quote:
            bid, ask = context.quote
            price, spread = (bid + ask) / 2, max(0.0, ask - bid)
        else:
            price, spread = m1[-1].close, context.spread or 0.0
        plan, why_zone = zone_plan(h4, h1, m5, m1, price, spread, d1)
        why_range = ""
        if plan is None:
            plan, why_range = range_plan(h4, m5, m1, price, spread)
        if plan is None:
            self._log(sym, "SCANNING", f"{why_zone}; {why_range}")
            return StrategyResult.empty()
        key = f"{sym}_ovp_{plan.path}_{plan.tf}_{plan.level_at}_{plan.tap_at}"
        delivery_ledger.cleanup(_STATE_TTL)
        if delivery_ledger.is_delivered(key):
            return StrategyResult.empty()
        digits = price_digits(sym)
        self._log(sym, "SIGNAL", f"{plan.direction.upper()} {plan.path} {plan.tf} entry {plan.entry:.{digits}f} "
                  f"SL {plan.sl:.{digits}f} TP {plan.tp:.{digits}f} RR {plan.rr}")
        sig = build_signal(sym, plan, digits, self.id, self.name)
        sig.dedup_key = key
        return StrategyResult(signals=[sig])

    def _log(self, sym: str, stage: str, detail: str) -> None:
        """Print on a change AND restate an unchanged stage every heartbeat (`core.stage_tracker`), recorded durably."""
        line = f"[ovp] {sym} -> {stage} | {detail}"
        if stage_tracker.emit("ovp", sym, f"{stage}|{detail}", line, logger=log):
            obs.record(obs.STAGE_EVALUATED, self.id, sym, detail=f"{stage} | {detail}")


def build_signal(symbol: str, plan: Plan, digits: int, strategy_id: str, strategy_name: str) -> Signal:
    """A real, monitored signal: saved, shown on AssetPage, closed on TP/SL by the monitor."""
    buy = plan.direction == "buy"
    side = "BUY" if buy else "SELL"
    what = f"{plan.tf} {'demand' if buy else 'supply'} zone" if plan.path == "zone" else \
        f"5M {'support' if buy else 'resistance'}"
    reasons = plan.why + [
        f"STOP ORDER {side} {plan.entry:.{digits}f} — fills only if price carries on",
        f"SL {plan.sl:.{digits}f} | TP {plan.tp:.{digits}f} | RR {plan.rr}:1",
    ]
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if buy else Direction.SELL,
        strategy_id       = strategy_id,
        strategy_name     = strategy_name,
        label             = "OVP-" + ("ZONE" if plan.path == "zone" else "SR"),
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
        market_context    = f"OVP — {side} {symbol} off a {what}, {plan.rr}R stop-order entry {plan.entry:.{digits}f}",
    )
