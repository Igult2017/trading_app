"""
VOCANT.1 — "Volume Strategy".

Built ONLY from the Volume Strategy playbook — a self-contained strategy, unrelated to any other:
  1HR = bias: a CLEAR TREND (HH+HL up / LH+LL down) OR a range breaking into a trend, carried by
        VOLUME (a run of 1-3 volume candles). NO indicators. See vocant1_bias.
  1M  = entry: after that, a fractal is BROKEN then PULLED BACK; the entry is a stop just beyond the
        broken fractal (continuation). See vocant1_entry.
  SL  = just beyond the M1 pull-back extreme (tight);  TP = 2R.

Once a setup fires it is LOCKED and WATCHED on both timeframes (vocant1_watch) — if the 1HR bias
flips or the 1M reverses past the stop before entry, it is invalidated (alert) so we never keep
assuming a stale bias. Trades EUR/USD + GBP/USD, London/NY sessions, both directions. The only things
shared with other strategies are platform RESOURCES (candle feed, news feed, pip-size, dedup, signal
types) — never trading logic.

PHASE 1 = signal generation only (tagged `_watch` → private DM). Phase 2 (2% pending stop orders on
demo, with spread/slippage + position caps) + Phase 3 (BE / partial / trail) follow.
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
from strategies.vocant1_watch import check_invalidation, invalidation_signal
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
    news_stance         = NewsStance.NEWS_AGNOSTIC   # news candle + news-window guards applied in analyze()
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        self.fired = FiredRegistry(self.id)                  # M2: DB-persisted dedup, survives restarts
        self._recent: dict[str, tuple[bool, float]] = {}     # C4: symbol -> (bullish, ts) of last signal
        self._locked: dict[str, dict] = {}                   # WATCH: symbol -> pending locked setup

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        h1 = context.candles.get(TF.H1)
        if len(m1) < 12 or len(h1) < 20:
            return StrategyResult.empty()
        pip    = pip_size(context.symbol)
        digits = price_digits(context.symbol)
        now    = time.time()

        # WATCH — if a setup is LOCKED (pending) on this instrument, check BOTH 1HR + 1M for a reversal
        # FIRST, so we never keep assuming a stale bias holds. Invalidate + alert on a genuine flip.
        locked = self._locked.get(context.symbol)
        if locked is not None:
            reason = check_invalidation(locked, h1, m1, now)
            if reason is None:
                return StrategyResult.empty()             # still pending-valid — keep watching, no new setup
            del self._locked[context.symbol]
            if reason not in ("triggered", "expired"):
                log.info(f"[vocant1] {context.symbol} setup invalidated — {reason}")
                return StrategyResult(signals=[invalidation_signal(locked, reason, context.symbol, self.name)])
            # triggered / expired → lock cleared; fall through to look for a fresh setup

        # 1+2) 1HR BIAS — established HH+HL/LH+LL trend OR a range breaking into a trend (with origin).
        bias = detect_bias(h1)
        if bias is None:
            return StrategyResult.empty()
        bullish, vc_idx, origin, vol_count = bias
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
        corr = [inst for inst, (b, t) in self._recent.items()
                if inst != context.symbol and b == bullish and (now - t) < _CORR_WINDOW]

        vlabel  = f"{vol_count} volume candle{'s' if vol_count != 1 else ''}"
        reasons = [
            (f"1HR RANGE BREAKOUT ({side.lower()}) — {vlabel} broke the range, trend building"
             if origin == "range" else
             f"1HR clear {'up (HH+HL)' if bullish else 'down (LH+LL)'} trend + {vlabel} ({side.lower()})"),
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
            # Panel-labelled factors so the UI renders dynamically (CTX = per-TF context, PA = price
            # action). VOCANT.1 uses NO indicators, so it emits NO IND factors → Technical Confluence
            # stays empty (correct) rather than showing fabricated EMA/ADX rows.
            smc_factors       = ([f"CTX::1HR TREND::{'RANGE BREAKOUT' if origin == 'range' else ('UPTREND' if bullish else 'DOWNTREND')}",
                                  f"CTX::1HR VOLUME::{vol_count} CANDLE{'S' if vol_count != 1 else ''}",
                                  "CTX::1M ENTRY::FRACTAL BREAK + PULL-BACK",
                                  "PA::CONTINUATION STOP-ENTRY (2R)"]
                                 + (["PA::CORRELATED USD — SIZE DOWN"] if corr else [])),
            market_context    = (f"VOCANT.1 (validating) — {side} {context.symbol} "
                                 f"[{'range breakout' if origin == 'range' else 'trend'}]"
                                 f"{' correlated' if corr else ''} stop at {entry:.{digits}f}"),
            news_note         = news_msg,
        )
        self.fired.add(sig_key)
        self._recent[context.symbol] = (bullish, now)
        self._locked[context.symbol] = {"bullish": bullish, "entry": entry, "sl": sl, "locked_at": now}
        return StrategyResult(signals=[sig])
