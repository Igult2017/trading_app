"""
VOCANT.1 — "Volume Strategy".

1HR = bias: a CLEAR TREND carried by VOLUME (a volume cluster in the trend direction).
      No 1HR pullback — just volume + a clear trend (per the playbook).
1M  = entry: after the volume cluster, an aligned M1 pullback forms a fractal; the entry is
      a STOP order at that fractal (buy stop above the fractal high / sell stop below the low).

Trades EUR/USD + GBP/USD, both directions. Reuses the EURUSD strategy's volume-cluster
(`find_volume_cluster`); the 1M entry is M1-native (`vocant1_entry.m1_entry` — aligned push →
pullback → fractal, with a TIGHT stop from the M1 pullback extreme). DROPS the 1HR pullback.

PHASE 1 = signal generation only. Signals are tagged `_watch` so they route to the private DM
for validation before the channel. Phase 2 (2% pending stop orders on demo) + Phase 3 (full
break-even / partial / trail management) follow once these setups are confirmed correct.
"""
import logging

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, NewsStance, NewsImpact,
                        StrategyResult, TF, Signal, Direction)
from core.strategy_context import StrategyContext
from indicators.ema_200 import EMA200Indicator
from shared.adx import calc_adx
from strategies.pullback_setup import find_volume_cluster, cluster_strength
from strategies.vocant1_entry import m1_entry
from strategies.pullback_state import PullbackState
from news.news_filter import news_note

log = logging.getLogger(__name__)

_EMA_PERIOD = 200
_ADX_PERIOD = 14
_ADX_MIN    = 25
_PIP        = 0.00010
_SL_BUFFER  = 2 * _PIP
_MIN_RISK   = 5  * _PIP
_MAX_RISK   = 60 * _PIP
_STATE_TTL  = 48 * 3600


class Vocant1Strategy(BaseStrategy):
    name    = "VOCANT.1"
    id      = "vocant1"
    enabled = True

    required_timeframes = [TF.M1, TF.H1, TF.D1]
    requires_news       = True
    candle_counts       = {TF.M1: 250, TF.H1: 250, TF.D1: 250}   # EMA 200 needs 200+

    allowed_sessions    = [Session.ALL]
    allowed_trends      = [Trend.ANY]                # trend managed internally (D1 EMA / ADX)
    allowed_instruments = ["EUR/USD", "GBP/USD"]
    news_stance         = NewsStance.NEWS_AGNOSTIC   # news reported on the card (never trade the news candle: handled in Phase 2 refine)
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        self.state = PullbackState(self.id)   # own dedup memory, persisted to DB

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        h1 = context.candles.get(TF.H1)
        d1 = context.candles.get(TF.D1)
        if len(m1) < 10 or len(h1) < _EMA_PERIOD or len(d1) < _EMA_PERIOD:
            return StrategyResult.empty()

        # 1) 1HR VOLUME — a volume cluster in one direction. No pullback required.
        bull = find_volume_cluster(h1, bullish=True)
        bear = find_volume_cluster(h1, bullish=False)
        if bull is None and bear is None:
            return StrategyResult.empty()
        if bull is not None and bear is not None:
            bullish = cluster_strength(h1, *bull) >= cluster_strength(h1, *bear)
        else:
            bullish = bull is not None
        vol_start, vol_end = bull if bullish else bear   # type: ignore[misc]

        # 2) 1HR CLEAR TREND in the volume direction (D1 EMA 200, H1 ADX fallback). No trend → no trade.
        ema_d1     = EMA200Indicator._ema([c.close for c in d1[-_EMA_PERIOD:]], _EMA_PERIOD)
        d1_aligned = (d1[-1].close > ema_d1) == bullish
        adx        = 0.0
        trend_ok   = d1_aligned
        if not d1_aligned:
            adx, pdi, mdi = calc_adx(h1, period=_ADX_PERIOD)
            trend_ok = adx >= _ADX_MIN and (pdi > mdi) == bullish
        if not trend_ok:
            log.info(f"[vocant1] {context.symbol} volume ({'BULL' if bullish else 'BEAR'}) but no clear trend — skip")
            return StrategyResult.empty()

        # 3) 1M ENTRY — after the volume cluster, an ALIGNED M1 pullback forms a fractal.
        #    entry = the fractal (stop-order level); SL = just beyond the M1 pullback extreme
        #    (a TIGHT M1 stop — NOT the wide 1HR cluster range). See vocant1_entry.m1_entry.
        end_time = h1[vol_end].time + 3600         # the cluster candle's close → look at M1 after it
        sig_key  = f"{'B' if bullish else 'S'}_{h1[vol_end].time}"
        self.state.cleanup(_STATE_TTL)
        if sig_key in self.state.entry_alerted:
            return StrategyResult.empty()

        res = m1_entry(m1, bullish, end_time)
        if res is None:
            return StrategyResult.empty()
        entry, sl = res
        risk = abs(entry - sl)
        if risk < _MIN_RISK or risk > _MAX_RISK:
            return StrategyResult.empty()
        tp = entry + 2.0 * risk if bullish else entry - 2.0 * risk

        side     = "BUY" if bullish else "SELL"
        news_msg = news_note(context.news, ["USD", "EUR", "GBP"]) if context.news else ""
        sig = Signal(
            symbol            = context.symbol,
            direction         = Direction.BUY if bullish else Direction.SELL,
            strategy_id       = self.id + "_watch",   # PHASE 1: route to private DM for validation
            strategy_name     = self.name,
            entry_price       = round(entry, 5),
            stop_loss         = round(sl, 5),
            take_profit       = round(tp, 5),
            risk_reward       = 2.0,
            confidence        = 0.75 if d1_aligned else 0.70,
            primary_timeframe = TF.H1,
            technical_reasons = [
                f"1HR clear {'up' if bullish else 'down'}trend + volume ({vol_end - vol_start + 1}c cluster)",
                f"Place {side} STOP at {entry:.5f} — M1 fractal (stop-order entry)",
                f"SL {sl:.5f} | TP {tp:.5f} | Risk {risk/_PIP:.0f} pips | RR 2:1",
                ("D1 EMA 200 aligned ✓" if d1_aligned else f"ADX {adx:.0f} confirms trend"),
            ],
            smc_factors    = ["h1_volume", "h1_clear_trend", "m1_fractal_stop_entry"],
            market_context = f"VOCANT.1 (validating) — {side} {context.symbol} stop at {entry:.5f}",
            news_note      = news_msg,
        )
        self.state.mark_entry(sig_key)
        return StrategyResult(signals=[sig])
