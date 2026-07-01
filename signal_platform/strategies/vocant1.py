"""
VOCANT.1 — "Volume Strategy".

Built ONLY from the Volume Strategy playbook — a self-contained strategy, unrelated to any other:
  1HR = bias: a CLEAR TREND (HH+HL up / LH+LL down) carried by VOLUME (a volume candle in the trend
        direction). NO indicators. See vocant1_bias.
  1M  = entry: after that, an ALIGNED M1 pullback forms a fractal; the entry is a STOP order at the
        fractal (buy stop above a fractal high / sell stop below a fractal low). See vocant1_entry.
  SL  = just beyond the M1 pullback extreme (tight);  TP = 2R.

Trades EUR/USD + GBP/USD, both directions. The ONLY things shared with other strategies are platform
RESOURCES — the candle feed, the news feed, and the signal/contract types — never trading logic.

PHASE 1 = signal generation only. Signals are tagged `_watch` so they route to the private DM for
validation before the channel. Phase 2 (2% pending stop orders on demo) + Phase 3 (BE / partial /
trail management) follow once these setups are confirmed correct.
"""
import logging

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, NewsStance, NewsImpact,
                        StrategyResult, TF, Signal, Direction)
from core.strategy_context import StrategyContext
from strategies.vocant1_bias import detect_bias
from strategies.vocant1_entry import m1_entry
from news.news_filter import news_note
from news.news_candle import is_news_candle   # shared platform resource

log = logging.getLogger(__name__)

_PIP      = 0.00010
_MIN_RISK = 5  * _PIP
_MAX_RISK = 60 * _PIP


class Vocant1Strategy(BaseStrategy):
    name    = "VOCANT.1"
    id      = "vocant1"
    enabled = True

    required_timeframes = [TF.M1, TF.H1]     # no D1 — VOCANT.1 uses no higher-TF indicator
    requires_news       = True
    candle_counts       = {TF.M1: 250, TF.H1: 120}

    allowed_sessions    = [Session.ALL]
    allowed_trends      = [Trend.ANY]        # VOCANT.1 reads its own 1HR trend (HH-HL / LH-LL)
    allowed_instruments = ["EUR/USD", "GBP/USD"]
    news_stance         = NewsStance.NEWS_AGNOSTIC   # trades post-news continuations too; the "never trade the news candle" rule is enforced below via the shared news_candle resource
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        self._fired: dict[str, int] = {}     # VOCANT.1's own dedup (in-memory): sig_key -> h1 time

    def _remember(self, sig_key: str, t: int) -> None:
        self._fired[sig_key] = t
        if len(self._fired) > 300:            # cap: keep the most recent ~150 setups
            cutoff = sorted(self._fired.values())[-150]
            self._fired = {k: v for k, v in self._fired.items() if v >= cutoff}

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        h1 = context.candles.get(TF.H1)
        if len(m1) < 12 or len(h1) < 20:
            return StrategyResult.empty()

        # 1+2) 1HR BIAS — an established HH+HL/LH+LL trend OR a range breaking into a trend, each
        #      confirmed by TWO volume candles. detect_bias returns which (origin) so we report it.
        bias = detect_bias(h1)
        if bias is None:
            return StrategyResult.empty()
        bullish, vc_idx, origin = bias
        vc = h1[vc_idx]
        # Playbook: NEVER trade the news candle. If the confirming volume candle is news-driven, drop
        # it — post-news continuations / range breakouts still qualify; this only removes the spike.
        if is_news_candle(vc, context.news, context.symbol):
            log.info(f"[vocant1] {context.symbol} volume candle is a news candle — never trade it, skip")
            return StrategyResult.empty()

        sig_key = f"{'B' if bullish else 'S'}_{vc.time}"
        if sig_key in self._fired:
            return StrategyResult.empty()

        # 3) 1M ENTRY — aligned M1 pullback -> fractal (stop-order level) + a TIGHT M1 stop.
        res = m1_entry(m1, bullish, vc.time + 3600)   # look at M1 after the volume candle closes
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
            confidence        = 0.72,
            primary_timeframe = TF.H1,
            technical_reasons = [
                (f"1HR RANGE BREAKOUT ({side.lower()}) — two volume candles broke the range, trend building"
                 if origin == "range" else
                 f"1HR clear {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend + two confirming {side.lower()} volume candles"),
                f"Place {side} STOP at {entry:.5f} — M1 fractal break + pull-back (continuation)",
                f"SL {sl:.5f} | TP {tp:.5f} | Risk {risk/_PIP:.0f} pips | RR 2:1",
            ],
            smc_factors    = [("h1_range_breakout" if origin == "range" else "h1_structure_trend"),
                              "h1_volume_candle", "m1_fractal_break_pullback"],
            market_context = f"VOCANT.1 (validating) — {side} {context.symbol} [{'range breakout' if origin == 'range' else 'trend'}] stop at {entry:.5f}",
            news_note      = news_msg,
        )
        self._remember(sig_key, vc.time)
        return StrategyResult(signals=[sig])
