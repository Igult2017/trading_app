"""
EURUSD Pullback — two-stage alerts.
Stage 1: reports EVERY H1 volume-cluster + pullback once, labelled QUALIFIED
  (entry will follow) or NOT QUALIFIED (review only, with the failing rules).
Stage 2: M1 fractal entry — fired only for QUALIFIED setups.
State is in-memory; the scanner's first-scan warm-up re-seeds it after a restart so prior setups are not re-fired.
"""
import logging
import time

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, NewsStance, NewsImpact, StrategyResult, TF)
from core.strategy_context import StrategyContext
from indicators.ema_200 import EMA200Indicator
from shared.adx import calc_adx
from strategies.pullback_setup import find_volume_cluster, measure_pullback, recent_candles_summary, cluster_strength
from strategies.pullback_fractal import fractal_identified
from strategies.pullback_obstruction import is_at_4h_key_level, nearby_zone_warnings
from strategies.eurusd_pullback_signals import build_setup_signal, build_entry_signal
from news.news_filter import news_note

log = logging.getLogger(__name__)

_EMA_PERIOD = 200
_ADX_PERIOD = 14
_ADX_MIN    = 25
_STATE_TTL  = 48 * 3600   # discard setup state after 48 h


class EURUSDPullbackStrategy(BaseStrategy):
    name    = "EURUSD Pullback"
    id      = "eurusd_pullback_v2"
    enabled = True

    required_timeframes  = [TF.M1, TF.H1, TF.H4, TF.D1]
    required_indicators  = []
    required_patterns    = []
    required_features    = []
    requires_news        = True

    candle_counts = {TF.M1: 250, TF.H1: 250, TF.H4: 100, TF.D1: 250}  # EMA 200 needs 200+

    allowed_sessions    = [Session.ALL]
    # Trend.ANY: strategy manages trend via D1 EMA 200; pre-filter would cache D1 with count=100
    allowed_trends      = [Trend.ANY]
    allowed_instruments = ["EUR/USD"]
    # News is REPORTED on the card (info only), never blocks — user's call to trade through it.
    news_stance         = NewsStance.NEWS_AGNOSTIC
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        self._setup_alerted: dict[str, float] = {}   # cluster_sig → monotonic timestamp
        self._entry_alerted: set[str]          = set()
        self._qualified:     dict[str, bool]   = {}   # cluster_sig → passed all rules

    def _cleanup(self) -> None:
        cutoff = time.monotonic() - _STATE_TTL
        stale  = [k for k, ts in self._setup_alerted.items() if ts < cutoff]
        for k in stale:
            self._setup_alerted.pop(k)
            self._entry_alerted.discard(k)
            self._qualified.pop(k, None)

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        h1 = context.candles.get(TF.H1)
        h4 = context.candles.get(TF.H4)
        d1 = context.candles.get(TF.D1)

        if len(m1) < 10 or len(h1) < _EMA_PERIOD or len(h4) < 10 or len(d1) < _EMA_PERIOD:
            log.info(f"[eurusd_diag] insufficient candles: M1={len(m1)} H1={len(h1)}/{_EMA_PERIOD} H4={len(h4)} D1={len(d1)}/{_EMA_PERIOD}")
            return StrategyResult.empty()

        bull_cluster = find_volume_cluster(h1, bullish=True)
        bear_cluster = find_volume_cluster(h1, bullish=False)
        if bull_cluster is None and bear_cluster is None:
            log.info(f"[eurusd_diag] no H1 volume cluster — last H1 {recent_candles_summary(h1)} (need >=2 same-dir, body_ratio>=0.55, growing body)")
            return StrategyResult.empty()

        if bull_cluster is not None and bear_cluster is not None:
            bullish = cluster_strength(h1, *bull_cluster) >= cluster_strength(h1, *bear_cluster)
        elif bull_cluster is not None:
            bullish = True
        else:
            bullish = False
        vol_start, vol_end = bull_cluster if bullish else bear_cluster  # type: ignore[misc]

        pb = measure_pullback(h1, vol_end, bullish, cluster_start=vol_start)
        if pb is None:
            log.info(f"[eurusd_diag] {'BULL' if bullish else 'BEAR'} H1 cluster ({vol_end - vol_start + 1}c) — no pullback yet")
            return StrategyResult.empty()
        pb_high, pb_low, pb_count = pb["pb_high"], pb["pb_low"], pb["count"]
        pb_end_time, pb_reasons   = pb["pb_end_time"], pb["reasons"]

        cluster_sig = f"{'B' if bullish else 'S'}_{h1[vol_end].time}"
        cluster_len = vol_end - vol_start + 1
        self._cleanup()
        at_4h_zone = is_at_4h_key_level(h4[-50:], pb_low if bullish else pb_high)
        zone_notes = nearby_zone_warnings(h4, d1, pb_high if bullish else pb_low)
        news_msg   = news_note(context.news, ["USD", "EUR"]) if context.news else ""

        # Trend gate — D1 EMA 200, with H1 ADX as a fallback confirmation.
        ema_d1     = EMA200Indicator._ema([c.close for c in d1[-_EMA_PERIOD:]], _EMA_PERIOD)
        d1_aligned = (d1[-1].close > ema_d1) == bullish
        adx        = 0.0
        trend_ok   = d1_aligned
        if not d1_aligned:
            adx, pdi, mdi = calc_adx(h1, period=_ADX_PERIOD)
            trend_ok = adx >= _ADX_MIN and (pdi > mdi) == bullish

        disqualifiers = list(pb_reasons)
        if not trend_ok:
            disqualifiers.append(f"not trending (D1 EMA misaligned, ADX {adx:.0f} < {_ADX_MIN})")
        qualified = not disqualifiers
        # at_4h_zone is a WARNING shown on the card (below), never a reject — user's call.

        # Stage 1 — alert once, and again on upgrade to qualified (re-evaluated each tick, never frozen).
        prev_q = self._qualified.get(cluster_sig)
        if prev_q is None or (prev_q is False and qualified and cluster_sig not in self._entry_alerted):
            self._setup_alerted[cluster_sig] = time.monotonic()
            self._qualified[cluster_sig]     = qualified
            log.info(f"[eurusd_diag] {'QUALIFIED' if qualified else 'UNQUALIFIED'} pullback — "
                     f"{'BULL' if bullish else 'BEAR'} {cluster_len}c cluster"
                     + ("" if qualified else f" | {'; '.join(disqualifiers)}"))
            sig = build_setup_signal(
                context.symbol, bullish, pb_high, pb_low, pb_count, cluster_len,
                self.id, self.name, d1_aligned=d1_aligned, qualified=qualified,
                disqualifiers=disqualifiers, at_4h_zone=at_4h_zone, zone_notes=zone_notes,
                news_msg=news_msg,
            )
            return StrategyResult(signals=[sig])
        self._qualified[cluster_sig] = qualified   # keep status fresh between alerts

        # Stage 2 — entry only while CURRENTLY qualified, fired once.
        if not qualified or cluster_sig in self._entry_alerted:
            return StrategyResult.empty()

        entry = fractal_identified(m1, pb_high, pb_low, bullish, pb_end_time)
        if entry is None:
            return StrategyResult.empty()

        sig = build_entry_signal(
            context.symbol, bullish, entry, pb_high, pb_low, pb_count, cluster_len,
            at_4h_zone, d1_aligned, adx, self.name, zone_notes, news_msg=news_msg,
        )
        if sig is None:
            return StrategyResult.empty()

        self._entry_alerted.add(cluster_sig)
        return StrategyResult(signals=[sig])
