"""
VOCANT.1 — "Volume Strategy".

Built ONLY from the Volume Strategy playbook — a self-contained strategy, unrelated to any other:
  1HR = bias: a CLEAR TREND (HH+HL up / LH+LL down) OR a range breaking into a trend, carried by
        VOLUME (two volume candles). NO indicators. See vocant1_bias.
  1M  = entry: after that, a fractal is BROKEN then PULLED BACK; the entry is a stop just beyond the
        broken fractal (continuation). See vocant1_entry.
  SL  = just beyond the M1 pull-back extreme (tight);  TP = 2R.

Trades EUR/USD + GBP/USD, London/NY sessions, both directions. The only things shared with other
strategies are platform RESOURCES — the candle feed, the news feed (news candle + news window), the
pip-size + dedup resources, and the signal/contract types — never trading logic.

PHASE 1 = signal generation only (tagged `_watch` → private DM for validation). Phase 2 (2% pending
stop orders on demo, with spread/slippage + position caps) + Phase 3 (BE / partial / trail) follow.
"""
import logging
import time

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, NewsStance, NewsImpact,
                        StrategyResult, TF, Signal, Direction)
from core.strategy_context import StrategyContext
from core.fired_registry import FiredRegistry
from strategies.vocant1_bias import detect_bias
from strategies.vocant1_entry import m1_entry
from shared.pip import pip_size, price_digits
from news.news_filter import news_note
from news.news_candle import is_news_candle, in_news_window   # shared platform resources

log = logging.getLogger(__name__)

_STATE_TTL   = 48 * 3600   # forget a fired setup after 48h
_CORR_WINDOW = 4  * 3600   # a same-direction signal on the other USD pair within 4h = correlated


class Vocant1Strategy(BaseStrategy):
    name    = "VOCANT.1"
    id      = "vocant1"
    enabled = True

    required_timeframes = [TF.M1, TF.H1]     # no D1 — VOCANT.1 uses no higher-TF indicator
    requires_news       = True
    candle_counts       = {TF.M1: 250, TF.H1: 120}

    # H1: London/NY only — skip thin Asian hours (wide spreads, low participation, fake breakouts).
    allowed_sessions    = [Session.LONDON, Session.NEW_YORK]
    allowed_trends      = [Trend.ANY]        # VOCANT.1 reads its own 1HR trend
    allowed_instruments = ["EUR/USD", "GBP/USD"]
    news_stance         = NewsStance.NEWS_AGNOSTIC   # news candle + news-window guards are applied in analyze()
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        self.fired = FiredRegistry(self.id)                  # M2: DB-persisted dedup, survives restarts
        self._recent: dict[str, tuple[bool, float]] = {}     # C4: symbol -> (bullish, wall-clock ts) of last signal

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        h1 = context.candles.get(TF.H1)
        if len(m1) < 12 or len(h1) < 20:
            return StrategyResult.empty()
        pip    = pip_size(context.symbol)
        digits = price_digits(context.symbol)

        # 1+2) 1HR BIAS — established HH+HL/LH+LL trend OR a range breaking into a trend (with origin).
        bias = detect_bias(h1)
        if bias is None:
            return StrategyResult.empty()
        bullish, vc_idx, origin = bias
        vc = h1[vc_idx]
        # NEVER trade the news candle itself.
        if is_news_candle(vc, context.news, context.symbol):
            log.info(f"[vocant1] {context.symbol} volume candle is a news candle — skip")
            return StrategyResult.empty()
        # H2: don't ENTER inside a high-impact news window (spreads blow out, stops get slipped).
        if in_news_window(context.news, context.symbol):
            log.info(f"[vocant1] {context.symbol} inside a high-impact news window — skip entry")
            return StrategyResult.empty()

        # M2: dedup keyed by SYMBOL + direction + volume-candle time (persisted; survives restarts).
        self.fired.cleanup(_STATE_TTL)
        sig_key = f"{context.symbol}_{'B' if bullish else 'S'}_{vc.time}"
        if self.fired.has(sig_key):
            return StrategyResult.empty()

        # 3) 1M ENTRY — fractal break + pull-back; entry stop beyond the fractal, tight SL (pip-scaled).
        res = m1_entry(m1, bullish, vc.time + 3600, pip=pip)   # M1 after the volume candle closes
        if res is None:
            return StrategyResult.empty()
        entry, sl = res
        risk = abs(entry - sl)
        tp   = entry + 2.0 * risk if bullish else entry - 2.0 * risk
        side = "BUY" if bullish else "SELL"

        # C4: correlation — another USD pair already signalled the SAME direction within the window =
        #     stacked USD exposure. Per user: SEND the signal, but flag it (warn, don't block).
        now  = time.time()
        corr = [inst for inst, (b, t) in self._recent.items()
                if inst != context.symbol and b == bullish and (now - t) < _CORR_WINDOW]

        reasons = [
            (f"1HR RANGE BREAKOUT ({side.lower()}) — two volume candles broke the range, trend building"
             if origin == "range" else
             f"1HR clear {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend + two confirming {side.lower()} volume candles"),
            f"Place {side} STOP at {entry:.{digits}f} — M1 fractal break + pull-back (continuation)",
            f"SL {sl:.{digits}f} | TP {tp:.{digits}f} | Risk {risk/pip:.0f} pips | RR 2:1",
        ]
        if corr:
            reasons.insert(0, f"⚠️ CORRELATED: {', '.join(corr)} already {side.lower()} (same USD direction) — stacked USD exposure, size down or skip")

        news_msg = news_note(context.news, ["USD", "EUR", "GBP"]) if context.news else ""
        sig = Signal(
            symbol            = context.symbol,
            direction         = Direction.BUY if bullish else Direction.SELL,
            strategy_id       = self.id + "_watch",   # PHASE 1: route to private DM for validation
            strategy_name     = self.name,
            entry_price       = round(entry, digits),
            stop_loss         = round(sl, digits),
            take_profit       = round(tp, digits),
            risk_reward       = 2.0,
            confidence        = 0.72,
            primary_timeframe = TF.H1,
            technical_reasons = reasons,
            smc_factors       = [("h1_range_breakout" if origin == "range" else "h1_structure_trend"),
                                 "h1_volume_candle", "m1_fractal_break_pullback"] + (["correlated_usd"] if corr else []),
            market_context    = (f"VOCANT.1 (validating) — {side} {context.symbol} "
                                 f"[{'range breakout' if origin == 'range' else 'trend'}]"
                                 f"{' correlated' if corr else ''} stop at {entry:.{digits}f}"),
            news_note         = news_msg,
        )
        self.fired.add(sig_key)
        self._recent[context.symbol] = (bullish, now)
        return StrategyResult(signals=[sig])
