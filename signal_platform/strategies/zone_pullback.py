"""
Zone Pullback — enter when price retraces into an unmitigated H4 S/D zone
with a M15 reversal candle, aligned with the HTF trend.

Logic:
  1. Runner pre-filter guarantees trend is UPTREND or DOWNTREND.
  2. Find all unmitigated H4 supply (downtrend) or demand (uptrend) zones.
  3. If current M15 price is inside a matched zone, look for reversal candle.
  4. Reversal = pin bar (wick >= 2× body) or momentum body (BR >= 0.60).
  5. SL below/above zone; TP = nearest H4 swing target; require RR >= 2.0.
  6. Fibonacci confluence (0.38–0.65 retracement) adds 5% confidence bonus.
"""
from core.base_strategy import BaseStrategy
from core.types import (
    Session, Trend, Direction, NewsStance, NewsImpact,
    Signal, StrategyResult, ZoneType, TF,
)
from core.strategy_context import StrategyContext
from shared.swing_points import find_swing_points
from shared.zone_detection import find_zones, unmitigated
from shared.candle_math import body_size, lower_wick, upper_wick, avg_body, is_bullish, body_ratio
from shared.pullback_detector import latest_pullback
from shared.trend_detector import detect as detect_trend

_ZONE_BUFFER = 0.001   # 0.1% allowance for price sitting just outside zone edge


class ZonePullbackStrategy(BaseStrategy):
    """H4 trend + unmitigated S/D zone + M15 reversal candle = entry signal."""

    name    = "Zone Pullback"
    id      = "zone_pullback_v1"
    enabled = True

    required_timeframes  = [TF.M15, TF.H4]
    required_indicators  = []
    required_patterns    = []
    required_features    = []
    requires_news        = False
    requires_session     = False
    requires_volatility  = False
    requires_spread      = False

    allowed_sessions    = [Session.ALL]
    allowed_trends      = [Trend.UPTREND, Trend.DOWNTREND]
    allowed_instruments = None    # all instruments
    news_stance         = NewsStance.AVOID_HIGH_ONLY
    news_impact_filter  = [NewsImpact.HIGH]

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        h4  = context.candles.get(TF.H4)
        m15 = context.candles.get(TF.M15)
        if len(h4) < 30 or len(m15) < 10:
            return StrategyResult.empty()

        # Re-detect trend to get direction (runner already verified it's not RANGING)
        trend = detect_trend(h4)
        if trend not in (Trend.UPTREND, Trend.DOWNTREND):
            return StrategyResult.empty()

        active_zones = unmitigated(find_zones(h4, TF.H4))
        if not active_zones:
            return StrategyResult.empty()

        price     = m15[-1].close
        bullish   = trend == Trend.UPTREND
        zone_type = ZoneType.DEMAND if bullish else ZoneType.SUPPLY
        direction = Direction.BUY   if bullish else Direction.SELL

        matched = [
            z for z in active_zones
            if z.type == zone_type
            and z.bottom * (1 - _ZONE_BUFFER) <= price <= z.top * (1 + _ZONE_BUFFER)
        ]

        signals = [
            s for z in matched
            for s in [self._build_signal(context.symbol, m15, h4, z, price, direction)]
            if s is not None
        ]
        return StrategyResult(signals=signals)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _reversal_strength(self, candle, recent: list, bullish: bool) -> float:
        """Return 0.0 if no reversal, 0.5–1.0 based on reversal candle quality."""
        avg  = avg_body(recent[-10:]) or 1e-8
        bs   = body_size(candle)
        br   = body_ratio(candle)
        wick = lower_wick(candle) if bullish else upper_wick(candle)

        if is_bullish(candle) != bullish:
            return 0.0

        # Pin bar / hammer: wick >= 2× body AND wick is meaningful vs recent candles
        if wick >= 2 * max(bs, 1e-8) and wick >= avg * 0.30:
            return min(1.0, 0.60 + (wick / (avg * 2)) * 0.20)

        # Momentum candle: large body, minimal opposing wick
        if br >= 0.60 and bs >= avg * 1.1:
            return 0.70

        return 0.0

    def _build_signal(
        self, symbol: str, m15: list, h4: list, zone, price: float, direction: Direction,
    ) -> Signal | None:
        bullish  = direction == Direction.BUY
        strength = self._reversal_strength(m15[-1], m15, bullish)
        if strength < 0.50:
            return None

        zone_h = (zone.top - zone.bottom) or 1e-8
        sl     = zone.bottom - zone_h * 0.30 if bullish else zone.top + zone_h * 0.30
        risk   = abs(price - sl)
        if risk <= 0:
            return None

        swings  = find_swing_points(h4)
        targets = [
            s.price for s in swings
            if (bullish     and s.is_high       and s.price > price)
            or (not bullish and not s.is_high   and s.price < price)
        ]
        if not targets:
            return None
        tp = min(targets) if bullish else max(targets)

        rr = abs(tp - price) / risk
        if rr < 2.0:
            return None

        pb         = latest_pullback(h4)
        fib_bonus  = 0.05 if pb and 0.36 <= pb.retracement <= 0.65 else 0.0
        confidence = round(min(0.90, 0.70 + (strength - 0.50) * 0.20 + fib_bonus), 2)

        side = "demand" if bullish else "supply"
        return Signal(
            symbol            = symbol,
            direction         = direction,
            strategy_id       = self.id,
            strategy_name     = self.name,
            entry_price       = round(price, 5),
            stop_loss         = round(sl, 5),
            take_profit       = round(tp, 5),
            risk_reward       = round(rr, 2),
            confidence        = confidence,
            primary_timeframe = TF.M15,
            technical_reasons = [
                f"H4 {'up' if bullish else 'down'}trend confirmed",
                f"Unmitigated H4 {side} zone {zone.bottom:.5f}–{zone.top:.5f}",
                f"M15 reversal candle strength {strength:.2f}",
            ],
            smc_factors    = [f"{side}_zone", "trend_alignment"]
                             + (["fib_confluence"] if fib_bonus else []),
            market_context = f"H4 {side} zone pullback, M15 entry",
        )
