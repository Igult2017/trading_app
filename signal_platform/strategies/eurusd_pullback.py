"""
EURUSD Pullback Strategy — H1 momentum run + controlled pullback + 1M fractal entry.

Full flow:
  1. News     — no trade within 30 min of high-impact USD/EUR event
  2. Session  — London and NY only (07:00–17:00 UTC)
  3. Condition— reject volatile or choppy H1 environment
  4. D1 trend — structural daily bias must be clear (not ranging)
  5. Volume   — 3+ candle H1 momentum run ending in a clean institutional candle
  6. Pullback — 1-2 H1 bars retracing 25–80% of the volume candle, fresh (<= 3 bars ago)
  7. Fractal  — first 1M fractal after the pullback extreme, broken within 5 bars
  8. Risk     — SL anchored to pullback zone; 5–60 pip risk band enforced
  9. Path     — 4H obstruction check (unmitigated S/R or FVG blocking 2R target)
"""
from datetime import datetime, timezone

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, Direction, NewsStance,
                         NewsImpact, Signal, StrategyResult, TF)
from core.strategy_context import StrategyContext
from shared.market_condition import is_tradeable
from shared.session_clock import is_valid_session
from shared.trend_detector import detect as detect_trend
from strategies.pullback_setup import find_volume_candle, measure_pullback, fractal_entry
from strategies.pullback_obstruction import has_4h_obstruction

_PIP     = 0.00010
MIN_RISK = 5  * _PIP   # 5 pips  — filters micro doji-pullback setups
MAX_RISK = 60 * _PIP   # 60 pips — filters news-spike overshoot setups


class EURUSDPullbackStrategy(BaseStrategy):
    name    = "EURUSD Pullback"
    id      = "eurusd_pullback_v1"
    enabled = True

    required_timeframes  = [TF.M1, TF.H1, TF.H4, TF.D1]
    required_indicators  = []
    required_patterns    = []
    required_features    = []
    requires_news        = True

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
        if len(m1) < 10 or len(h1) < 30 or len(h4) < 10 or len(d1) < 15:
            return StrategyResult.empty()

        utc_now = datetime.fromtimestamp(m1[-1].time, tz=timezone.utc)

        # 1 — News: skip 30 min before/after high-impact USD or EUR events
        if context.news and context.news.has_high_impact(["USD", "EUR"]):
            return StrategyResult.empty()

        # 2 — Session: London + NY only
        if not is_valid_session(utc_now):
            return StrategyResult.empty()

        # 3 — Environment: clean trending conditions on last 30 H1 bars
        if not is_tradeable(h1[-30:]):
            return StrategyResult.empty()

        # 4 — D1 structural trend (20-bar lookback — fast enough to catch reversals
        #     without being noisy; 50 bars lags by weeks at inflection points)
        d1_trend = detect_trend(d1, lookback=20)
        if d1_trend == Trend.RANGING:
            return StrategyResult.empty()
        bullish = (d1_trend == Trend.UPTREND)

        # 5 — Volume candle: 3+ bar momentum run, body >= 1.5× average, ratio >= 0.60
        vol_idx = find_volume_candle(h1, bullish=bullish)
        if vol_idx is None:
            return StrategyResult.empty()

        # 6 — Pullback: 1-2 bars, depth 25–80% of vol body, ended <= 3 bars ago
        pb = measure_pullback(h1, vol_idx, bullish)
        if pb is None:
            return StrategyResult.empty()
        pb_high, pb_low, pb_count, pb_end_time = pb

        # 7 — 1M fractal entry: returns the actual break price, or None
        entry = fractal_entry(m1, pb_high, pb_low, bullish, pb_end_time)
        if entry is None:
            return StrategyResult.empty()

        # 8 — Risk levels: SL anchored to pullback zone boundary + 15% buffer
        pb_range = pb_high - pb_low
        buffer   = max(2 * _PIP, pb_range * 0.15)
        sl       = (pb_low - buffer) if bullish else (pb_high + buffer)
        risk     = abs(entry - sl)

        if risk < MIN_RISK or risk > MAX_RISK:
            return StrategyResult.empty()

        tp = entry + 2.0 * risk if bullish else entry - 2.0 * risk

        # 9 — 4H path: no unmitigated S/R or FVG between entry and 2R target
        if has_4h_obstruction(h4[-50:], entry, bullish, risk):
            return StrategyResult.empty()

        direction = Direction.BUY if bullish else Direction.SELL
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
                f"D1 {d1_label} structural context (20-bar lookback)",
                f"1H {side} 3-candle run → volume candle",
                f"{pb_count}-candle pullback [{pb_low:.5f}–{pb_high:.5f}], depth {pb_range/0.0001:.1f} pips",
                f"1M fractal broken at {entry:.5f}, SL {sl:.5f}, risk {risk/0.0001:.1f} pips",
                f"TP {tp:.5f} (2R), 4H path clear",
            ],
            smc_factors    = ["d1_structural_trend", "h1_momentum_run", "pullback_continuation"],
            market_context = f"D1 {d1_label} | {side} run | {pb_count}c pb | fractal entry",
        )])
