"""
EURUSD Pullback Strategy v3.

Flow:
  1. News     — skip around high-impact USD/EUR events
  2. Session  — 6 institutional UTC phase windows
  3. Volume   — H1 cluster: 2+ consecutive directional candles, body_ratio >= 0.55
  4. Pullback — 1-3 H1 candles retracing 25-80% of cluster range
  5. 4H zone  — reject if pullback extreme sits at a 4H key level
  6. Fractal  — 1M fractal break; entry = fractal level
  7. Risk     — SL at pullback extreme + 2 pip buffer; 5-60 pip band
  8. Signal   — D1 EMA 200 aligned → confirmed (0.75); EMA miss + ADX > 25 → watch (0.70)
"""
from datetime import datetime, timezone

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, Direction, NewsStance,
                         NewsImpact, Signal, StrategyResult, TF)
from core.strategy_context import StrategyContext
from indicators.ema_200 import EMA200Indicator
from shared.session_phases import is_valid_phase
from shared.adx import calc_adx
from strategies.pullback_setup import find_volume_cluster, measure_pullback, fractal_entry
from strategies.pullback_obstruction import is_at_4h_key_level

_PIP        = 0.00010
_SL_BUFFER  = 2 * _PIP
MIN_RISK    = 5  * _PIP
MAX_RISK    = 60 * _PIP
_EMA_PERIOD = 200
_ADX_PERIOD = 14
_ADX_MIN    = 25


class EURUSDPullbackStrategy(BaseStrategy):
    name    = "EURUSD Pullback"
    id      = "eurusd_pullback_v2"
    enabled = True

    required_timeframes  = [TF.M1, TF.H1, TF.H4, TF.D1]
    required_indicators  = []
    required_patterns    = []
    required_features    = []
    requires_news        = True

    allowed_sessions    = [Session.ALL]
    allowed_trends      = [Trend.UPTREND, Trend.DOWNTREND]
    allowed_instruments = ["EUR/USD"]
    news_stance         = NewsStance.AVOID_HIGH_ONLY
    news_impact_filter  = [NewsImpact.HIGH]

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        h1 = context.candles.get(TF.H1)
        h4 = context.candles.get(TF.H4)
        d1 = context.candles.get(TF.D1)

        if len(m1) < 10 or len(h1) < _EMA_PERIOD or len(h4) < 10 or len(d1) < _EMA_PERIOD:
            return StrategyResult.empty()

        utc_now = datetime.fromtimestamp(m1[-1].time, tz=timezone.utc)

        # 1 — News
        if context.news and context.news.has_high_impact(["USD", "EUR"]):
            return StrategyResult.empty()

        # 2 — Session
        if not is_valid_phase(utc_now):
            return StrategyResult.empty()

        # 3 — Volume cluster: find most recent in either direction
        bull_cluster = find_volume_cluster(h1, bullish=True)
        bear_cluster = find_volume_cluster(h1, bullish=False)
        if bull_cluster is None and bear_cluster is None:
            return StrategyResult.empty()

        if bull_cluster is not None and bear_cluster is not None:
            bullish = bull_cluster[1] >= bear_cluster[1]
        elif bull_cluster is not None:
            bullish = True
        else:
            bullish = False
        vol_start, vol_end = bull_cluster if bullish else bear_cluster  # type: ignore[misc]

        # 4 — Pullback immediately after cluster
        pb = measure_pullback(h1, vol_end, bullish, cluster_start=vol_start)
        if pb is None:
            return StrategyResult.empty()
        pb_high, pb_low, pb_count, pb_end_time = pb

        # 5 — 4H zone check (informational only — does not reject)
        zone_ref   = pb_low if bullish else pb_high
        at_4h_zone = is_at_4h_key_level(h4[-50:], zone_ref)

        # 6 — 1M fractal entry
        entry = fractal_entry(m1, pb_high, pb_low, bullish, pb_end_time)
        if entry is None:
            return StrategyResult.empty()

        # 7 — Risk
        sl   = (pb_low  - _SL_BUFFER) if bullish else (pb_high + _SL_BUFFER)
        risk = abs(entry - sl)
        if risk < MIN_RISK or risk > MAX_RISK:
            return StrategyResult.empty()

        tp          = entry + 2.0 * risk if bullish else entry - 2.0 * risk
        side        = "bullish" if bullish else "bearish"
        pb_range    = pb_high - pb_low
        cluster_len = vol_end - vol_start + 1

        # 8 — EMA 200: confirmed vs watch
        ema_d1     = EMA200Indicator._ema([c.close for c in d1[-_EMA_PERIOD:]], _EMA_PERIOD)
        d1_aligned = (d1[-1].close > ema_d1) == bullish

        if d1_aligned:
            sig_id     = self.id
            confidence = 0.75
            ctx        = f"D1 {side} ✓ | {cluster_len}c cluster | {pb_count}c pullback | fractal"
            reasons    = [
                f"D1 EMA 200 {side}: close={d1[-1].close:.5f} vs EMA={ema_d1:.5f}",
                f"H1 cluster ({cluster_len}c, body_ratio≥0.55, expanding)",
                f"{pb_count}c pullback [{pb_low:.5f}–{pb_high:.5f}], {pb_range/0.0001:.1f} pips",
                f"Entry {entry:.5f} | SL {sl:.5f} (2 pip buffer) | risk {risk/0.0001:.1f} pips",
                f"4H zone: {'WARNING key level nearby' if at_4h_zone else 'clear'}",
            ]
        else:
            adx, pdi, mdi = calc_adx(h1, period=_ADX_PERIOD)
            if adx < _ADX_MIN or (pdi > mdi) != bullish:
                return StrategyResult.empty()
            sig_id     = f"{self.id}_watch"
            confidence = 0.70
            ctx        = f"⚠️ EMA watch | ADX={adx:.1f} | {cluster_len}c cluster | fractal"
            reasons    = [
                f"⚠️ Not aligning with D1 EMA 200 (close={d1[-1].close:.5f} / EMA={ema_d1:.5f})",
                f"ADX {adx:.1f} > {_ADX_MIN} — {'↑' if bullish else '↓'}DI dominant — trend confirmed",
                f"H1 cluster ({cluster_len}c, body_ratio≥0.55, expanding)",
                f"{pb_count}c pullback [{pb_low:.5f}–{pb_high:.5f}], {pb_range/0.0001:.1f} pips",
                f"Entry {entry:.5f} | SL {sl:.5f} (2 pip buffer) | risk {risk/0.0001:.1f} pips",
                f"4H zone: {'WARNING key level nearby' if at_4h_zone else 'clear'}",
            ]

        return StrategyResult(signals=[Signal(
            symbol            = context.symbol,
            direction         = Direction.BUY if bullish else Direction.SELL,
            strategy_id       = sig_id,
            strategy_name     = self.name,
            entry_price       = round(entry, 5),
            stop_loss         = round(sl, 5),
            take_profit       = round(tp, 5),
            risk_reward       = 2.0,
            confidence        = confidence,
            primary_timeframe = TF.H1,
            technical_reasons = reasons,
            smc_factors       = ["h1_volume_cluster", "pullback_continuation", "momentum_trend"],
            market_context    = ctx,
        )])
