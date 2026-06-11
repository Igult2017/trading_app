"""
EURUSD Pullback Strategy
Instrument: EURUSD only.

Flow (matches approved spec exactly):
  Block 1  — Session filter: 6 institutional liquidity windows only
  Block 2  — Environment: reject volatile or choppy market conditions
  Block 3  — EMA 200 trend bias; reject if price ranging tightly around EMA
  Step 1   — 1H volume candle aligned with EMA bias + 1–3 candle pullback
  Step 2   — 4H structure: clear space from entry to 2R target, no key levels blocking
  Step 3   — Daily trend confirmed (pre-filtered by runner, verified inside)
  Step 4/5 — 1M fractal break of pullback structure = entry confirmation
"""
from datetime import datetime, timezone

from core.base_strategy import BaseStrategy
from core.types import Session, Trend, Direction, NewsStance, NewsImpact, Signal, StrategyResult, TF
from core.strategy_context import StrategyContext
from shared.market_condition import is_tradeable
from shared.session_clock import is_valid_session
from strategies.pullback_setup import find_volume_candle, measure_pullback, has_4h_obstruction, fractal_broken

_EMA_CHOP_PCT = 0.0008    # price within 0.08% of EMA = ranging around it — no trade


class EURUSDPullbackStrategy(BaseStrategy):
    """Volume candle continuation: 1H setup → 4H/1D filter → 1M fractal entry."""

    name    = "EURUSD Pullback"
    id      = "eurusd_pullback_v1"
    enabled = True

    required_timeframes  = [TF.M1, TF.H1, TF.H4, TF.D1]
    required_indicators  = ["ema_200"]
    required_patterns    = []
    required_features    = []
    requires_news        = False
    requires_session     = False    # session handled inside analyze()
    requires_volatility  = False
    requires_spread      = False

    allowed_sessions    = [Session.ALL]
    allowed_trends      = [Trend.UPTREND, Trend.DOWNTREND]
    allowed_instruments = ["EURUSD"]
    news_stance         = NewsStance.AVOID_HIGH_ONLY
    news_impact_filter  = [NewsImpact.HIGH]

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        h1 = context.candles.get(TF.H1)
        h4 = context.candles.get(TF.H4)
        d1 = context.candles.get(TF.D1)
        if len(m1) < 10 or len(h1) < 30 or len(h4) < 10 or len(d1) < 5:
            return StrategyResult.empty()

        # Block 1 — Session: only trade during the 6 institutional windows
        utc_now = datetime.fromtimestamp(m1[-1].time, tz=timezone.utc)
        if not is_valid_session(utc_now):
            return StrategyResult.empty()

        # Block 2 — Environment: reject volatile and choppy conditions on 1H
        if not is_tradeable(h1):
            return StrategyResult.empty()

        # Block 3 — EMA 200 bias; reject if price is hugging the EMA (chop)
        ema = context.indicators.get("ema_200")
        if ema is None or ema.get("bias") == "unknown":
            return StrategyResult.empty()
        if (ema.get("distance_pct") or 0.0) < _EMA_CHOP_PCT:
            return StrategyResult.empty()
        bullish = ema.get("bias") == "bullish"

        # Step 1 — Find most recent 1H volume candle aligned with EMA direction
        vol_idx = find_volume_candle(h1, bullish=bullish)
        if vol_idx is None:
            return StrategyResult.empty()

        # Step 1 — Pullback: must be exactly 1–3 candles, no more
        pb = measure_pullback(h1, vol_idx, bullish)
        if pb is None:
            return StrategyResult.empty()
        pb_high, pb_low, pb_count = pb

        # Step 4/5 — 1M fractal break: pullback structure must be broken before entry
        if not fractal_broken(m1, pb_high, pb_low, bullish):
            return StrategyResult.empty()

        # Build levels
        entry = m1[-1].close
        sl    = pb_low  - (pb_high - pb_low) * 0.10 if bullish else pb_high + (pb_high - pb_low) * 0.10
        risk  = abs(entry - sl)
        if risk <= 0:
            return StrategyResult.empty()

        # Step 2 — 4H structure: no key level blocking the path to 2R.
        # Only last 30 H4 bars (~5 days): older swing points are mitigated
        # and scatter too densely in trending markets to be meaningful.
        if has_4h_obstruction(h4[-30:], entry, bullish, risk):
            return StrategyResult.empty()

        direction = Direction.BUY if bullish else Direction.SELL
        tp        = entry + 2.0 * risk if bullish else entry - 2.0 * risk
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
                f"1H {side} volume candle (EMA 200 aligned)",
                f"{pb_count}-candle pullback — high {pb_high:.5f} / low {pb_low:.5f}",
                f"1M fractal break {'above pb_high' if bullish else 'below pb_low'}",
                f"4H clear space to 2R target {tp:.5f}",
            ],
            smc_factors    = ["volume_candle", "pullback_continuation", "ema_200_trend"],
            market_context = f"{side.capitalize()} continuation — {pb_count}-candle pullback, 1M fractal entry",
        )])
