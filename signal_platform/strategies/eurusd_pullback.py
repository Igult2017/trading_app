"""
EURUSD Pullback Strategy — two-stage alert system.

Stage 1 (SETUP ALERT): Fires immediately when H1 cluster + valid pullback is
  detected. Tells the trader: setup forming, watch M1.

Stage 2 (ENTRY SIGNAL): Fires when M1 fractal is CONFIRMED and M1 is already
  heading toward the fractal level (HIGH touches for BUY, LOW touches for SELL).
  Tells the trader: place buy/sell stop at fractal level NOW — stop fills naturally.

State is in-memory. A platform restart resets stage tracking; Stage 2 may fire
without a preceding Stage 1 if the platform restarted mid-setup. This is correct
behaviour — Stage 2 is the actionable alert.
"""
import logging
import time

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, NewsStance, NewsImpact, StrategyResult, TF)
from core.strategy_context import StrategyContext
from indicators.ema_200 import EMA200Indicator
from shared.adx import calc_adx
from strategies.pullback_setup import find_volume_cluster, measure_pullback, recent_candles_summary
from strategies.pullback_fractal import fractal_identified
from strategies.pullback_obstruction import is_at_4h_key_level
from strategies.eurusd_pullback_signals import build_setup_signal, build_entry_signal

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
    news_stance         = NewsStance.AVOID_HIGH_ONLY
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        self._setup_alerted: dict[str, float] = {}   # cluster_sig → monotonic timestamp
        self._entry_alerted: set[str]          = set()

    def _cleanup(self) -> None:
        cutoff = time.monotonic() - _STATE_TTL
        stale  = [k for k, ts in self._setup_alerted.items() if ts < cutoff]
        for k in stale:
            self._setup_alerted.pop(k)
            self._entry_alerted.discard(k)

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        h1 = context.candles.get(TF.H1)
        h4 = context.candles.get(TF.H4)
        d1 = context.candles.get(TF.D1)

        if len(m1) < 10 or len(h1) < _EMA_PERIOD or len(h4) < 10 or len(d1) < _EMA_PERIOD:
            log.info(f"[eurusd_diag] insufficient candles: M1={len(m1)} H1={len(h1)}/{_EMA_PERIOD} H4={len(h4)} D1={len(d1)}/{_EMA_PERIOD}")
            return StrategyResult.empty()

        if context.news and context.news.has_high_impact(["USD", "EUR"]):
            log.info("[eurusd_diag] skipped: high-impact USD/EUR news in window")
            return StrategyResult.empty()
        # Phase/time-of-day filter removed — fire whenever trend + cluster + pullback present.

        bull_cluster = find_volume_cluster(h1, bullish=True)
        bear_cluster = find_volume_cluster(h1, bullish=False)
        if bull_cluster is None and bear_cluster is None:
            log.info(f"[eurusd_diag] no H1 volume cluster — last H1 {recent_candles_summary(h1)} (need >=2 same-dir, body_ratio>=0.55, growing body)")
            return StrategyResult.empty()

        if bull_cluster is not None and bear_cluster is not None:
            bullish = bull_cluster[1] >= bear_cluster[1]
        elif bull_cluster is not None:
            bullish = True
        else:
            bullish = False
        vol_start, vol_end = bull_cluster if bullish else bear_cluster  # type: ignore[misc]

        pb = measure_pullback(h1, vol_end, bullish, cluster_start=vol_start)
        if pb is None:
            log.info(f"[eurusd_diag] {'BULL' if bullish else 'BEAR'} H1 cluster ({vol_end - vol_start + 1}c) found but no valid pullback")
            return StrategyResult.empty()
        pb_high, pb_low, pb_count, pb_end_time = pb

        cluster_sig = f"{'B' if bullish else 'S'}_{h1[vol_end].time}"
        cluster_len = vol_end - vol_start + 1
        self._cleanup()

        zone_ref   = pb_low if bullish else pb_high
        at_4h_zone = is_at_4h_key_level(h4[-50:], zone_ref)

        # Stage 1 — fire once when valid pullback is first detected
        if cluster_sig not in self._setup_alerted:
            ema_d1     = EMA200Indicator._ema([c.close for c in d1[-_EMA_PERIOD:]], _EMA_PERIOD)
            d1_aligned = (d1[-1].close > ema_d1) == bullish
            if not d1_aligned:
                adx_s1, pdi_s1, mdi_s1 = calc_adx(h1, period=_ADX_PERIOD)
                if adx_s1 < _ADX_MIN or (pdi_s1 > mdi_s1) != bullish:
                    log.info(f"[eurusd_diag] {'BULL' if bullish else 'BEAR'} cluster+pullback FOUND but not trending — D1 EMA misaligned & ADX {adx_s1:.0f}<{_ADX_MIN}/DI mismatch")
                    return StrategyResult.empty()   # doesn't qualify even as watch
            log.info(f"[eurusd_diag] SETUP EMITTED — {'BULL' if bullish else 'BEAR'} cluster+pullback, trend OK (d1_aligned={d1_aligned})")
            self._setup_alerted[cluster_sig] = time.monotonic()
            sig = build_setup_signal(
                context.symbol, bullish, pb_high, pb_low,
                pb_count, cluster_len, self.id, self.name, d1_aligned,
            )
            return StrategyResult(signals=[sig])

        # Stage 2 — fire once when M1 fractal is approaching the breakout level
        if cluster_sig in self._entry_alerted:
            return StrategyResult.empty()

        entry = fractal_identified(m1, pb_high, pb_low, bullish, pb_end_time)
        if entry is None:
            return StrategyResult.empty()

        ema_d1     = EMA200Indicator._ema([c.close for c in d1[-_EMA_PERIOD:]], _EMA_PERIOD)
        d1_aligned = (d1[-1].close > ema_d1) == bullish
        adx        = 0.0
        if not d1_aligned:
            adx, pdi, mdi = calc_adx(h1, period=_ADX_PERIOD)
            if adx < _ADX_MIN or (pdi > mdi) != bullish:
                return StrategyResult.empty()

        sig = build_entry_signal(
            context.symbol, bullish, entry, pb_high, pb_low,
            pb_count, cluster_len, at_4h_zone, d1_aligned, adx, self.name,
        )
        if sig is None:
            return StrategyResult.empty()

        self._entry_alerted.add(cluster_sig)
        return StrategyResult(signals=[sig])
