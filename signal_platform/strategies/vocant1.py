"""
VOCANT.1 — "Volume Strategy".

Built ONLY from the Volume Strategy playbook — a self-contained strategy, unrelated to any other:
  1HR = bias: a CLEAR TREND (HH+HL up / LH+LL down) OR a range breaking into a trend, carried by
        VOLUME (a run of 1-3 volume candles). OPERATE FROM THE 1ST volume candle. NO indicators.
  1M  = entry, and the 1M alone decides WHEN — the 1HR never puts a clock on it. THE LINE says which
        side we are on: our side -> the PULLBACK is the entry; the wrong side -> the counter-move's
        last FRACTAL must break first. Entry = a stop just beyond the first pullback candle, so a
        reversal never fills. SL = the nearest 1M REGION OF INTEREST beyond it (vocant1_roi) — never a
        pip count; TP = 2R, the two-1HR-candle move. See vocant1_entry.

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
                        StrategyResult, TF, Signal)
from core.strategy_context import StrategyContext
from core.fired_registry import FiredRegistry
from strategies.vocant1_bias import detect_bias
from strategies.vocant1_entry import m1_signals
from strategies.vocant1_signal import build_signal
from strategies.vocant1_watch import check_invalidation, invalidation_signal
from shared.pip import pip_size, price_digits
from shared.mtf_utils import closed_only
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

    # All three sessions. The playbook has no session rule at all — the London/NY gate was an
    # addition, and the strategy already filters thin hours by itself: no volume candle (a bigger body
    # than the previous one, wicks <= 33%) means no bias means no trade, and quiet Asian hours produce
    # few of them. GBP/USD in Tokyo will simply stay silent; USD/JPY finally gets its HOME session.
    allowed_sessions    = [Session.LONDON, Session.NEW_YORK, Session.ASIAN]
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
        # The 1HR feed hands back the candle still FORMING as its newest bar. Its body, wicks and
        # close all keep changing, so it can be neither the volume candle nor the line — a line that
        # moves every scan is not a line, and its "close" is simply the current price. The 1M's
        # forming bar is KEPT on purpose: there, live price is exactly what the entry reacts to.
        h1 = closed_only(context.candles.get(TF.H1))
        if len(m1) < 12 or len(h1) < 20:
            return StrategyResult.empty()
        pip    = pip_size(context.symbol)
        digits = price_digits(context.symbol)
        now    = time.time()
        sym    = context.symbol
        out: list[Signal] = []

        # WATCH — a LOCKED pending setup: alert on invalidation, but never block a fresh setup.
        locked = self._locked.get(sym)
        if locked is not None:
            reason = check_invalidation(locked, h1, m1, now, sym)
            if reason in ("triggered", "expired"):
                del self._locked[sym]                       # cleared — look for a fresh setup
            elif reason is not None:
                del self._locked[sym]
                log.info(f"[vocant1] {sym} setup invalidated — {reason}")
                out.append(invalidation_signal(locked, reason, sym, self.name))
            # reason is None → still valid: keep the lock, fall through (the pull-back may have formed)

        # 1HR BIAS — from the FIRST volume candle of the run.
        bias = detect_bias(h1, sym)                         # logs its own reason at INFO when None
        if bias is None:
            return StrategyResult(signals=out)
        bullish, vc_idx, origin, vol_count = bias
        vc = h1[vc_idx]
        if is_news_candle(vc, context.news, sym):           # NEVER trade the news candle itself
            log.info(f"[vocant1] {sym} 1st volume candle is a news candle — skip")
            return StrategyResult(signals=out)
        if in_news_window(context.news, sym):               # H2: skip entries in a high-impact window
            log.info(f"[vocant1] {sym} inside a high-impact news window — skip entry")
            return StrategyResult(signals=out)

        # 1M — align (structure, or a fractal break), then the pullback entry.
        self.fired.cleanup(_STATE_TTL)
        log.info(f"[vocant1] {sym} 1HR bias OK ({'BUY' if bullish else 'SELL'}, {origin}, "
                 f"{vol_count} vol candle{'s' if vol_count != 1 else ''}, from 1st) — checking 1M")
        raw = m1_signals(m1, bullish, vc, pip=pip, symbol=sym)
        if not raw:
            return StrategyResult(signals=out)

        # C4: correlation — another USD pair already the SAME direction within the window (warn, don't block).
        corr = [inst for inst, (b, t) in self._recent.items()
                if inst != sym and b == bullish and (now - t) < _CORR_WINDOW]

        for s in raw:                                       # each = {"kind", "entry", "sl"}
            # ONE entry per volume candle. The key must NOT include the kind: the same setup can
            # reach the entry via either alignment path as the 1M develops, and a second
            # same-direction signal would be dropped by the validator as a duplicate — silently.
            key = f"{sym}_{'B' if bullish else 'S'}_{vc.time}"
            if self.fired.has(key):
                continue
            entry, sl = s["entry"], s["sl"]
            risk = abs(entry - sl)
            tp   = entry + 2.0 * risk if bullish else entry - 2.0 * risk
            # One entry per setup, so it is SAVED (AssetPage + DM + TP/SL monitoring) and holds the
            # single symbol:direction reservation the validator/monitor/DB invariant assumes.
            out.append(build_signal(s["kind"], sym, bullish, origin, vol_count, entry, sl, tp,
                                    risk, pip, digits, corr, context.news, self.id + "_watch",
                                    self.name, sl_note=s.get("sl_note", "")))
            self.fired.add(key)
            self._recent[sym] = (bullish, now)
            # Assign, don't setdefault: this is a new volume candle, so it SUPERSEDES any older
            # pending setup. setdefault left the watch tracking the stale entry/sl and the live one
            # unwatched.
            self._locked[sym] = {"bullish": bullish, "entry": entry, "sl": sl, "locked_at": now}
            log.info(f"[vocant1] {sym} 1M {s['kind'].upper()} signal — {'BUY' if bullish else 'SELL'} "
                     f"stop {entry:.{digits}f} SL {sl:.{digits}f}")

        return StrategyResult(signals=out)
