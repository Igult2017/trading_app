"""
EURUSD Pullback Strategy v3 — intent-faithful implementation.

Flow:
  1. News     — skip 30 min around high-impact USD/EUR events
  2. Session  — 6 institutional UTC phase windows
  3. Volume   — most recent H1 cluster: 2-4 consecutive directional candles,
                body_ratio >= 0.55, avg body > preceding candle
  4. D1 trend — D1 close vs EMA 200 must agree with cluster direction
  5. Pullback — 1-3 H1 candles retracing 25-80% of the cluster range
  6. 4H zone  — reject if pullback extreme is at or inside a 4H key level
  7. Fractal  — first 1M fractal break after pullback extreme; entry = fractal level
  8. H1 align — last closed H1 candle must confirm trade direction
  9. Risk     — SL at pullback extreme + 2 pip buffer; 5-60 pip band
"""
from datetime import datetime, timezone

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, Direction, NewsStance,
                         NewsImpact, Signal, StrategyResult, TF)
from core.strategy_context import StrategyContext
from indicators.ema_200 import EMA200Indicator
from shared.session_phases import is_valid_phase
from shared.candle_math import is_bullish
from strategies.pullback_setup import find_volume_cluster, measure_pullback, fractal_entry
from strategies.pullback_obstruction import is_at_4h_key_level

_PIP        = 0.00010
_SL_BUFFER  = 2 * _PIP
MIN_RISK    = 5  * _PIP
MAX_RISK    = 60 * _PIP
_EMA_PERIOD = 200


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

        # 2 — Session: must be in one of the 6 institutional phase windows
        if not is_valid_phase(utc_now):
            return StrategyResult.empty()

        # 3 — Volume cluster: find most recent cluster in either direction
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

        # 4 — D1 trend: EMA 200 must agree with cluster direction
        ema_d1 = EMA200Indicator._ema([c.close for c in d1[-_EMA_PERIOD:]], _EMA_PERIOD)
        if (d1[-1].close > ema_d1) != bullish:
            return StrategyResult.empty()

        # 5 — Pullback immediately after cluster end
        pb = measure_pullback(h1, vol_end, bullish, cluster_start=vol_start)
        if pb is None:
            return StrategyResult.empty()
        pb_high, pb_low, pb_count, pb_end_time = pb

        # 6 — 4H roadblock: reject if pullback extreme sits at a key 4H level
        zone_ref = pb_low if bullish else pb_high
        if is_at_4h_key_level(h4[-50:], zone_ref):
            return StrategyResult.empty()

        # 7 — 1M fractal entry
        entry = fractal_entry(m1, pb_high, pb_low, bullish, pb_end_time)
        if entry is None:
            return StrategyResult.empty()

        # 8 — H1 alignment: last closed H1 candle must confirm trade direction
        if is_bullish(h1[-1]) != bullish:
            return StrategyResult.empty()

        # 9 — Risk: SL at pullback extreme with 2 pip buffer only
        sl   = (pb_low  - _SL_BUFFER) if bullish else (pb_high + _SL_BUFFER)
        risk = abs(entry - sl)
        if risk < MIN_RISK or risk > MAX_RISK:
            return StrategyResult.empty()

        tp       = entry + 2.0 * risk if bullish else entry - 2.0 * risk
        side     = "bullish" if bullish else "bearish"
        pb_range = pb_high - pb_low
        cluster_len = vol_end - vol_start + 1

        return StrategyResult(signals=[Signal(
            symbol            = context.symbol,
            direction         = Direction.BUY if bullish else Direction.SELL,
            strategy_id       = self.id,
            strategy_name     = self.name,
            entry_price       = round(entry, 5),
            stop_loss         = round(sl, 5),
            take_profit       = round(tp, 5),
            risk_reward       = 2.0,
            confidence        = 0.75,
            primary_timeframe = TF.H1,
            technical_reasons = [
                f"D1 EMA 200 {side}: close={d1[-1].close:.5f} vs EMA={ema_d1:.5f}",
                f"H1 volume cluster ({cluster_len}c, body_ratio≥0.55, expanding bodies)",
                f"{pb_count}c pullback [{pb_low:.5f}–{pb_high:.5f}], {pb_range/0.0001:.1f} pips",
                f"1M fractal entry {entry:.5f}, SL {sl:.5f} (2 pip buffer), risk {risk/0.0001:.1f} pips",
                f"H1 last candle aligned {side}, 4H zone clear at pullback extreme",
            ],
            smc_factors    = ["d1_ema_trend", "h1_volume_cluster", "pullback_continuation"],
            market_context = f"D1 {side} | {cluster_len}c H1 cluster | {pb_count}c pullback | fractal",
        )])
