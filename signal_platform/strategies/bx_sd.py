"""
BX-S/D — Smart-Money supply/demand strategy (EUR/USD only).

Built ONLY from the SMC (Dixit Vekariya) book — a self-contained strategy. Its cascade:
  4H   — the SETUP is confirmed here and ONLY here: a CONFIRMED, PRO-TREND trend with a fresh
         unmitigated zone that satisfies all 3 factors (IFC + broke structure + liquidity grabbed),
         freshly tapped, priced right, and defensive-liquidity clear ("don't be the liquidity").
  15M  — CONFIRM + REFINE: a CHoCH must print INSIDE the 4H zone (confirmed entries only — never a
         blind limit), the zone is refined onto a tight LTF POI, and the stack is graded.
  1M   — TRIGGER: a 1M CHoCH off the refined POI locks the entry (proximal/50%), SL beyond the
         refined distal (~2 pip), TP = next unmitigated opposite zone / fib extension, >= 2R.

Pro-trend + confirmed only. EUR/USD only. The only things shared with other strategies are platform
RESOURCES (candle feed, pip-size, dedup, signal types) — never another strategy's trading logic.

PHASE 1 = signal generation only (DM-only alert via `_watch`). Phase 2 (auto-execute) follows.
"""
import logging

from core.base_strategy import BaseStrategy
from core.types import Session, Trend, NewsStance, NewsImpact, StrategyResult, TF, Signal
from core.strategy_context import StrategyContext
from core.fired_registry import FiredRegistry
from shared.pip import pip_size, price_digits
from strategies.bx_sd_setup import detect_setup
from strategies.bx_sd_ltf import ltf_confluence
from strategies.bx_sd_entry import entry_trigger
from strategies.bx_sd_signal import build_signal

log = logging.getLogger(__name__)

_STATE_TTL = 14 * 24 * 3600   # forget a fired 4H setup after 2 weeks


class BXStrategy(BaseStrategy):
    name    = "BX-S/D"
    id      = "bx_sd"
    enabled = True

    required_timeframes = [TF.H4, TF.M15, TF.M1]   # 4H setup · 15M confluence · 1M entry
    candle_counts       = {TF.H4: 200, TF.M15: 200, TF.M1: 250}

    # EUR/USD only; London/NY only (thin Asian EUR/USD → fake 1M CHoCHs). BX reads its OWN 4H trend.
    allowed_sessions    = [Session.LONDON, Session.NEW_YORK]
    allowed_trends      = [Trend.ANY]
    allowed_instruments = ["EUR/USD"]
    news_stance         = NewsStance.NEWS_AGNOSTIC
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        self.fired = FiredRegistry(self.id)     # DB-persisted dedup, survives restarts
        self._stage: dict[str, str] = {}        # symbol -> last logged cascade stage (observability)

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        h4  = context.candles.get(TF.H4)
        m15 = context.candles.get(TF.M15)
        m1  = context.candles.get(TF.M1)
        if len(h4) < 40 or len(m15) < 30 or len(m1) < 30:
            return StrategyResult.empty()
        sym    = context.symbol
        pip    = pip_size(sym)
        digits = price_digits(sym)

        # STAGE 1 — 4H setup (confirmed, pro-trend, valid fresh zone, tapped, priced, liquidity-safe)
        setup = detect_setup(h4, pip)
        if not setup.active:
            self._log(sym, "SCANNING", f"4H: {setup.reason}")
            return StrategyResult.empty()

        # STAGE 2 — 15M confluence: CHoCH inside the zone (confirm) + refine + score
        conf = ltf_confluence(setup, m15, pip)
        if not conf.confirmed:
            self._log(sym, "4H_ZONE_TAPPED", f"await 15M CHoCH — {conf.reason}")
            return StrategyResult.empty()
        if not conf.passed:
            self._log(sym, "AWAIT_SCORE", f"15M confirmed but {conf.reason}")
            return StrategyResult.empty()

        # STAGE 3 — 1M trigger off the refined POI
        trig = entry_trigger(conf, setup, m1, h4, pip)
        if not trig.triggered:
            self._log(sym, "REFINED_SCORED", f"await 1M trigger — {trig.reason}")
            return StrategyResult.empty()

        # SIGNAL — one per 4H zone (anchored to the zone candle's time), DM-only alert (Phase 1)
        self.fired.cleanup(_STATE_TTL)
        zone_time = h4[setup.zone.origin_index].time
        key = f"{sym}_{trig.direction}_{zone_time}"
        if self.fired.has(key):
            return StrategyResult.empty()
        self.fired.add(key)
        self._log(sym, "SIGNAL", f"{trig.direction.upper()} entry {trig.entry:.{digits}f} "
                  f"SL {trig.sl:.{digits}f} TP {trig.tp:.{digits}f} RR {trig.rr} (grade {conf.grade})")
        sig = build_signal(sym, setup, conf, trig, pip, digits, self.id + "_watch", self.name)
        return StrategyResult(signals=[sig])

    def _log(self, sym: str, stage: str, detail: str) -> None:
        """Log only on stage change — a 'missed setup' is diagnosable without spamming every scan."""
        if self._stage.get(sym) != stage:
            self._stage[sym] = stage
            log.info(f"[bx_sd] {sym} -> {stage} | {detail}")
