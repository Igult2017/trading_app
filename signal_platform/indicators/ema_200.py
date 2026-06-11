"""EMA 200 indicator — computed on H1. Primary trend filter for the strategy."""
from core.base_indicator import BaseIndicator
from core.types import MTFCandles, TF
from core.indicator_types import IndicatorResult


class EMA200Indicator(BaseIndicator):
    name                = "EMA 200"
    id                  = "ema_200"
    required_timeframes = [TF.H1]

    def compute(self, candles: MTFCandles) -> IndicatorResult:
        h1 = candles.get(TF.H1)
        if len(h1) < 200:
            return IndicatorResult(id=self.id, values={
                "value":        None,
                "bias":         "unknown",
                "distance_pct": 0.0,
            })

        ema_val  = self._ema([c.close for c in h1], 200)
        price    = h1[-1].close
        bias     = "bullish" if price > ema_val else "bearish"
        dist_pct = abs(price - ema_val) / ema_val

        return IndicatorResult(id=self.id, values={
            "value":        round(ema_val, 5),
            "bias":         bias,
            "distance_pct": round(dist_pct, 6),
        })

    @staticmethod
    def _ema(closes: list[float], period: int) -> float:
        k   = 2.0 / (period + 1)
        ema = closes[0]
        for price in closes[1:]:
            ema = price * k + ema * (1 - k)
        return ema
