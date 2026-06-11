"""
EURUSD Pullback Strategy v2 — faithful implementation of the spec.

Flow (matches document order):
  1. News     — skip 30 min around high-impact USD/EUR events
  2. Session  — all 6 institutional windows (07:00-20:00 + 22:00-03:00 UTC)
  3. EMA 200  — H1 and D1 must agree (both above = BUY, both below = SELL)
  4. Volume   — most recent H1 candle: body > previous, body_ratio >= 0.60
  5. Pullback — 1-3 H1 candles retracing 25-80% of the volume candle range
  6. Fractal  — first 1M fractal break after pullback extreme; entry = fractal level
  7. Risk     — SL at pullback zone boundary + 15% buffer; 5-60 pip band
  8. 4H zone  — reject if entry price is at or inside any unmitigated 4H level
"""
from datetime import datetime, timezone

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, Direction, NewsStance,
                         NewsImpact, Signal, StrategyResult, TF)
from core.strategy_context import StrategyContext
from indicators.ema_200 import EMA200Indicator
from shared.session_clock import is_valid_session
from strategies.pullback_setup import find_volume_candle, measure_pullback, fractal_entry
from strategies.pullback_obstruction import is_at_4h_key_level

_PIP        = 0.00010
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

        # 2 — Session
        if not is_valid_session(utc_now):
            return StrategyResult.empty()

        # 3 — EMA 200: H1 and D1 must agree
        ema_h1     = EMA200Indicator._ema([c.close for c in h1[-_EMA_PERIOD:]], _EMA_PERIOD)
        ema_d1     = EMA200Indicator._ema([c.close for c in d1[-_EMA_PERIOD:]], _EMA_PERIOD)
        h1_bull    = h1[-1].close > ema_h1
        d1_bull    = d1[-1].close > ema_d1
        if h1_bull != d1_bull:
            return StrategyResult.empty()
        bullish = h1_bull

        # 4 — Volume candle
        vol_idx = find_volume_candle(h1, bullish=bullish)
        if vol_idx is None:
            return StrategyResult.empty()

        # 5 — Pullback
        pb = measure_pullback(h1, vol_idx, bullish)
        if pb is None:
            return StrategyResult.empty()
        pb_high, pb_low, pb_count, pb_end_time = pb

        # 6 — 1M fractal entry
        entry = fractal_entry(m1, pb_high, pb_low, bullish, pb_end_time)
        if entry is None:
            return StrategyResult.empty()

        # 7 — Risk levels
        pb_range = pb_high - pb_low
        buffer   = max(2 * _PIP, pb_range * 0.15)
        sl       = (pb_low - buffer) if bullish else (pb_high + buffer)
        risk     = abs(entry - sl)

        if risk < MIN_RISK or risk > MAX_RISK:
            return StrategyResult.empty()

        tp = entry + 2.0 * risk if bullish else entry - 2.0 * risk

        # 8 — 4H key zone check
        if is_at_4h_key_level(h4[-50:], entry):
            return StrategyResult.empty()

        direction = Direction.BUY if bullish else Direction.SELL
        side      = "bullish" if bullish else "bearish"

        return StrategyResult(signals=[Signal(
            symbol            = context.symbol,
            direction         = direction,
            strategy_id       = self.id,
            strategy_name     = self.name,
            entry_price       = round(entry, 5),
            stop_loss         = round(sl, 5),
            take_profit       = round(tp, 5),
            risk_reward       = 2.0,
            confidence        = 0.75,
            primary_timeframe = TF.H1,
            technical_reasons = [
                f"EMA 200 aligned {side}: H1={ema_h1:.5f}, D1={ema_d1:.5f}",
                f"1H volume candle (body > prev, BR >= 0.60)",
                f"{pb_count}-candle pullback [{pb_low:.5f}–{pb_high:.5f}], {pb_range/0.0001:.1f} pips",
                f"1M fractal entry {entry:.5f}, SL {sl:.5f}, risk {risk/0.0001:.1f} pips",
                f"TP {tp:.5f} (2R), 4H zone clear",
            ],
            smc_factors    = ["ema_200_alignment", "h1_volume_candle", "pullback_continuation"],
            market_context = f"EMA aligned {side} | {pb_count}c pullback | fractal entry",
        )])
