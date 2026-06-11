"""
EURUSD Pullback Strategy
Instrument: EURUSD only.

Flow:
  Block 1  — High-impact news: no trade within 2H before/after USD or EUR event
  Block 2  — Session filter: 6 institutional liquidity windows only
  Block 3  — Environment: reject volatile or choppy market conditions
  Block 4  — D1 (Institutional Day) context: trade direction must align with Daily trend
  Step 1   — 1H volume candle concluding a 3-candle momentum run + 1-2 candle pullback
  Step 2   — 4H structure: clear space to 2R target, no unmitigated S/R or FVG blocking
  Step 3   — 1M fractal break of pullback high/low = entry confirmation
"""
from datetime import datetime, timezone

from core.base_strategy import BaseStrategy
from core.types import Session, Trend, Direction, NewsStance, NewsImpact, Signal, StrategyResult, TF
from core.strategy_context import StrategyContext
from shared.market_condition import is_tradeable
from shared.session_clock import is_valid_session
from shared.trend_detector import detect as detect_trend
from strategies.pullback_setup import find_volume_candle, measure_pullback, fractal_broken
from strategies.pullback_obstruction import has_4h_obstruction


class EURUSDPullbackStrategy(BaseStrategy):
    """
    3-candle momentum run on 1H → 1-2 candle pullback → 1M fractal entry.
    Direction bias from D1 institutional context (structural trend).
    """

    name    = "EURUSD Pullback"
    id      = "eurusd_pullback_v1"
    enabled = True

    required_timeframes  = [TF.M1, TF.H1, TF.H4, TF.D1]
    required_indicators  = []          # EMA removed — D1 structural trend used instead
    required_patterns    = []
    required_features    = []
    requires_news        = True        # news context needed for high-impact avoidance
    requires_session     = False
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
        if len(m1) < 10 or len(h1) < 30 or len(h4) < 10 or len(d1) < 10:
            return StrategyResult.empty()

        utc_now = datetime.fromtimestamp(m1[-1].time, tz=timezone.utc)

        # Block 1 — High-impact news: skip 2H before and after any USD/EUR event
        if context.news and context.news.has_high_impact(["USD", "EUR"]):
            return StrategyResult.empty()

        # Block 2 — Session: only trade during the 6 institutional windows
        if not is_valid_session(utc_now):
            return StrategyResult.empty()

        # Block 3 — Environment: reject volatile and choppy 1H conditions
        if not is_tradeable(h1):
            return StrategyResult.empty()

        # Block 4 — D1 institutional context: only trade with the Daily trend
        d1_trend = detect_trend(d1)
        if d1_trend == Trend.RANGING:
            return StrategyResult.empty()
        bullish = (d1_trend == Trend.UPTREND)

        # Step 1 — 3-candle momentum run ending in a volume candle
        vol_idx = find_volume_candle(h1, bullish=bullish)
        if vol_idx is None:
            return StrategyResult.empty()

        # Step 1 — 1-2 candle controlled pullback after the volume candle
        pb = measure_pullback(h1, vol_idx, bullish)
        if pb is None:
            return StrategyResult.empty()
        pb_high, pb_low, pb_count = pb

        # Step 3 — 1M fractal break: pullback structure must be broken before entry
        if not fractal_broken(m1, pb_high, pb_low, bullish):
            return StrategyResult.empty()

        # Build levels
        entry = m1[-1].close
        sl    = pb_low  - (pb_high - pb_low) * 0.10 if bullish else pb_high + (pb_high - pb_low) * 0.10
        risk  = abs(entry - sl)
        if risk <= 0:
            return StrategyResult.empty()

        # Step 2 — 4H structure: no unmitigated S/R or FVG blocking path to 2R
        if has_4h_obstruction(h4[-50:], entry, bullish, risk):
            return StrategyResult.empty()

        direction = Direction.BUY if bullish else Direction.SELL
        tp        = entry + 2.0 * risk if bullish else entry - 2.0 * risk
        side      = "bullish" if bullish else "bearish"
        d1_label  = "uptrend" if bullish else "downtrend"

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
                f"D1 {d1_label} context (institutional direction)",
                f"1H {side} 3-candle momentum run + volume candle",
                f"{pb_count}-candle pullback — high {pb_high:.5f} / low {pb_low:.5f}",
                f"1M fractal break {'above pb_high' if bullish else 'below pb_low'}",
                f"4H clear space to 2R target {tp:.5f}",
            ],
            smc_factors    = ["d1_trend", "volume_candle", "pullback_continuation"],
            market_context = f"D1 {d1_label} — {side} 3-candle run, {pb_count}c pullback, 1M fractal entry",
        )])
