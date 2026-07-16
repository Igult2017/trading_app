"""
BX-S/D — Smart-Money supply/demand strategy (EUR/USD, GBP/USD, USD/JPY), from the SMC (Vekariya) book.

Cascade — 4H: the SETUP is confirmed there and ONLY there (confirmed pro-trend + a fresh 3-factor
zone: IFC + broke structure + liquidity grabbed, tapped, priced right, defensive-liquidity clear).
15M: a CHoCH INSIDE the zone confirms (never a blind limit), refines it to a tight POI, and grades it.
1M/5M: the trigger locks entry (proximal/50%), SL ~2 pip beyond the distal, TP = next opposite zone /
fib, >= 2R. Pro-trend + confirmed only. Shares platform RESOURCES only, never another strategy's logic.
PHASE 1 = signal generation only (DM-only alert via `_watch`). Phase 2 (auto-execute) follows.
"""
import logging
import time

from core.base_strategy import BaseStrategy
from core.types import Session, Trend, NewsStance, NewsImpact, StrategyResult, TF, Signal
from core.strategy_context import StrategyContext
from core import delivery_ledger
from shared.pip import pip_size, price_digits
from strategies.bx_sd_setup import detect_setup
from strategies.bx_sd_ltf import ltf_confluence
from strategies.bx_sd_entry import entry_trigger
from strategies.bx_sd_signal import build_signal
from strategies.bx_sd_watch import check_invalidation, invalidation_signal
from strategies.bx_sd_reports import scan_reports

log = logging.getLogger(__name__)

_STATE_TTL = 14 * 24 * 3600   # forget a fired 4H setup after 2 weeks


class BXStrategy(BaseStrategy):
    name    = "BX-S/D"
    id      = "bx_sd"
    enabled = True

    # H4 is the ONLY hard requirement (setup + mitigation heads-up need nothing else). The rest are
    # paths/enrichment — 15M confluence, 5M/1M entry, 1H/30M bonus, D1/W1/MN tagging. OPTIONAL means
    # one flaky/lagging feed degrades a path instead of silently killing the whole strategy.
    required_timeframes = [TF.H4]
    optional_timeframes = [TF.H1, TF.M30, TF.M15, TF.M5, TF.M1, TF.D1, TF.W1, TF.MN]
    candle_counts       = {TF.H4: 200, TF.H1: 200, TF.M30: 200, TF.M15: 200, TF.M5: 250,
                           TF.M1: 250, TF.D1: 200, TF.W1: 120, TF.MN: 60}

    # London/NY only (thin Asian liquidity → fake 1M CHoCHs). BX reads its OWN 4H trend. Pip math
    # all flows from pip_size(symbol), so USD/JPY's 0.01 pip / 3 digits needs no special case.
    allowed_sessions    = [Session.LONDON, Session.NEW_YORK]
    allowed_trends      = [Trend.ANY]
    allowed_instruments = ["EUR/USD", "GBP/USD", "USD/JPY"]
    news_stance         = NewsStance.NEWS_AGNOSTIC
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        # dedup is the shared delivery_ledger (committed only on a confirmed DM — at-least-once)
        self._stage:  dict[str, str]  = {}       # symbol -> last logged cascade stage (observability)
        self._locked: dict[str, dict] = {}       # symbol -> tapped setup being watched to invalidation

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        h4  = context.candles.get(TF.H4)
        m15 = context.candles.get(TF.M15)
        m5  = context.candles.get(TF.M5)
        m1  = context.candles.get(TF.M1)
        sym = context.symbol
        if len(h4) < 40:
            self._log(sym, "NO_H4", f"only {len(h4)} H4 bars (need 40+) — nothing can run")
            return StrategyResult.empty()
        # Entry TF: prefer 1M, fall back to 5M. The book uses whichever is clearer, and this also
        # keeps BX alive when the 1M feed lags (stale bars get dropped upstream by the fail-safe).
        entry_tf = m1 if len(m1) >= 30 else (m5 if len(m5) >= 30 else [])
        higher = [c for c in (context.candles.get(TF.H1), context.candles.get(TF.M30)) if len(c) >= 20]
        htf    = {"Daily":   context.candles.get(TF.D1),
                  "Weekly":  context.candles.get(TF.W1),
                  "Monthly": context.candles.get(TF.MN)}
        pip    = pip_size(sym)
        digits = price_digits(sym)
        out: list[Signal] = []

        # REPORTS — 4H zone mitigation heads-ups + respected-retest confirmed entries.
        # Independent of the fresh-zone cascade below; deduped once per zone ON CONFIRMED DELIVERY
        # (at-least-once — a failed DM re-fires next scan instead of being lost).
        out += scan_reports(sym, h4, m5, m1, htf, pip, digits, self.name, self.id + "_watch")

        # WATCH — a tapped setup broke before it triggered: alert (at-least-once), then stop watching.
        locked = self._locked.get(sym)
        if locked is not None:
            ikey = f"{sym}_{locked['direction']}_{locked['zone_time']}"
            if delivery_ledger.is_delivered(ikey):
                self._locked.pop(sym, None)     # entry fired OR invalidation delivered — stop watching
            else:
                inval = check_invalidation(locked, h4, m15)
                if inval == "broken":
                    self._log(sym, "INVALIDATED", "4H zone broken before the entry triggered")
                    sig = invalidation_signal(locked, sym, self.name, self.id + "_watch")
                    sig.dedup_key = ikey        # committed on delivery; the lock is popped next scan
                    out.append(sig)
                elif inval == "expired":
                    self._locked.pop(sym, None)

        # The fresh-zone cascade needs the 15M confluence AND an entry TF. If either feed is missing
        # we still return the reports above — and SAY SO, rather than dying silently.
        if len(m15) < 30 or len(entry_tf) < 30:
            self._log(sym, "AWAIT_DATA", f"cascade needs 15M + an entry TF "
                      f"(M15={len(m15)} M1={len(m1)} M5={len(m5)}) — reports still ran")
            return StrategyResult(signals=out)

        # STAGE 1 — 4H setup (confirmed, pro-trend, valid fresh zone, tapped, priced, liquidity-safe)
        setup = detect_setup(h4, pip)
        if not setup.active:
            self._log(sym, "SCANNING", f"4H: {setup.reason}")
            return StrategyResult(signals=out)
        zone_time = h4[setup.zone.origin_index].time
        key = f"{sym}_{setup.direction}_{zone_time}"     # one fire + one watch per 4H zone
        # lock the tapped setup so a break before the trigger is reported — but never re-watch a
        # zone that already fired (else we'd 'invalidate' a trade we already signalled).
        if not delivery_ledger.is_delivered(key):
            self._locked.setdefault(sym, {"direction": setup.direction, "distal": setup.zone.distal,
                                          "zone_time": zone_time, "locked_at": time.time()})

        # STAGE 2 — LTF confluence: 15M CHoCH inside the zone (confirm) + refine + score;
        #           1H/30M CHoCH inside the zone add strength (bonus, never required — they lag).
        conf = ltf_confluence(setup, m15, pip, higher=higher)
        if not conf.confirmed:
            self._log(sym, "4H_ZONE_TAPPED", f"await 15M CHoCH — {conf.reason}")
            return StrategyResult(signals=out)
        if not conf.passed:
            self._log(sym, "AWAIT_SCORE", f"15M confirmed but {conf.reason}")
            return StrategyResult(signals=out)

        # STAGE 3 — entry trigger off the refined POI (1M, or 5M when the 1M feed is lagging)
        trig = entry_trigger(conf, setup, entry_tf, h4, pip)
        if not trig.triggered:
            self._log(sym, "REFINED_SCORED", f"await 1M trigger — {trig.reason}")
            return StrategyResult(signals=out)

        # SIGNAL — one per 4H zone, DM-only alert (Phase 1). Dedup committed ON CONFIRMED DELIVERY.
        delivery_ledger.cleanup(_STATE_TTL)
        if delivery_ledger.is_delivered(key):
            return StrategyResult(signals=out)
        self._locked.pop(sym, None)             # setup resolved into a signal — stop watching
        self._log(sym, "SIGNAL", f"{trig.direction.upper()} entry {trig.entry:.{digits}f} "
                  f"SL {trig.sl:.{digits}f} TP {trig.tp:.{digits}f} RR {trig.rr} (grade {conf.grade})")
        sig = build_signal(sym, setup, conf, trig, pip, digits, self.id + "_watch", self.name)
        sig.dedup_key = key
        out.append(sig)
        return StrategyResult(signals=out)

    def _log(self, sym: str, stage: str, detail: str) -> None:
        """Log only on stage change — a 'missed setup' is diagnosable without spamming every scan."""
        if self._stage.get(sym) != stage:
            self._stage[sym] = stage
            log.info(f"[bx_sd] {sym} -> {stage} | {detail}")
