"""
VIX.1 — "Volume Strategy".

Built ONLY from the Volume Strategy playbook — a self-contained strategy, unrelated to any other:
  1HR = bias: a CONFIRMED TREND, carried by MOMENTUM (a run of 1-3 momentum candles). TRENDS ONLY —
        a clear 1HR trend (HH+HL up / LH+LL down), or, when the 1HR is unclear, 1HR momentum backed by
        a clear 4HR trend. A range->trend transition is taken only once the trend is CONFIRMED, never
        on the bare breakout. OPERATE FROM THE 1ST momentum candle. NO indicators.
  1M  = entry, and the 1M alone decides WHEN — the 1HR never puts a clock on it. THE LINE says which
        side we are on: our side -> the PULLBACK is the entry; the wrong side -> the counter-move's
        last FRACTAL must break first. Entry = a stop just beyond the first pullback candle, so a
        reversal never fills. SL = the nearest 1M REGION OF INTEREST beyond it (vix1_roi) — never a
        pip count; TP = 2R, the two-1HR-candle move. See vix1_entry.

Once a setup fires it is LOCKED and WATCHED on both timeframes (vix1_watch) — if the 1HR bias
flips or the 1M reverses past the stop before entry, it is invalidated (alert) so we never keep
assuming a stale bias. EUR/USD + GBP/USD, all 3 sessions, both directions. The only things shared
with other strategies are platform RESOURCES (candles, news, pip-size, dedup) — never trading logic.

ENTRIES go to the public channel (the 1M pullback = place the stop now); the invalidation alert stays
a private DM. Phase 2 (2% pending stop orders) + Phase 3 (BE / partial / trail) follow.
"""
import logging
import time

from core.base_strategy import BaseStrategy
from core.types import (Session, Trend, NewsStance, NewsImpact,
                        StrategyResult, TF, Signal)
from core.strategy_context import StrategyContext
from core import delivery_ledger
from strategies.vix1_bias import detect_bias
from strategies.vix1_entry import m1_signals
from strategies.vix1_momentum import LOOKBACK, momentum_grade   # candle_counts[M1] derives from LOOKBACK
from strategies.vix1_signal import build_signal
from strategies import vix1_spacing
from strategies.vix1_watch import check_invalidation, invalidation_signal, WATCH_M1
from shared.pip import pip_size, price_digits
from shared.mtf_utils import closed_only
from news.news_candle import is_news_candle, in_news_window   # shared platform resources

log = logging.getLogger(__name__)

_STATE_TTL   = 48 * 3600   # forget a fired setup after 48h
_CORR_WINDOW = 4  * 3600   # a same-direction signal on the other USD pair within 4h = correlated


class Vix1Strategy(BaseStrategy):
    name    = "VIX.1"
    id      = "vix1"
    enabled = True

    required_timeframes = [TF.M1, TF.H1, TF.H4]   # H4 = the TREND timeframe; H1 = momentum; M1 = entry
    requires_news       = True
    # The 1M window MUST span the oldest momentum candle the bias can return, because the entry reads
    # everything "since the line was drawn": the line-1 gate (traded_past), the FIRST candle of the
    # retrace, the fractals, and the SL regions. A flat 250 bars covered only 4.2h against a 12h
    # lookback, so on 51% of bias hits the entry judged a setup on a window that began hours after
    # its own line — silently rejecting valid entries and mis-siting the ones it took. DERIVED, never
    # a literal, so the two cannot drift apart a third time (fix log ef6ff8b).
    # H4: 120 bars = 20 days — ample to print the HH+HL/LH+LL structure clear_trend reads.
    # M1 must span BOTH consumers: the entry window (LOOKBACK+2 hours) and the invalidation watch
    # (WATCH_M1 bars, sized to the 24h lock TTL) — derived, never a literal, same no-drift rule.
    candle_counts       = {TF.M1: max((LOOKBACK + 2) * 60, WATCH_M1 + 30), TF.H1: 120, TF.H4: 120}

    # All three sessions. The playbook has no session rule at all — the London/NY gate was an
    # addition, and the strategy already filters thin hours by itself: no momentum candle (a bigger body
    # than the previous one, wicks <= 33%) means no bias means no trade, and quiet Asian hours produce
    # few of them. GBP/USD in Tokyo will simply stay silent; USD/JPY finally gets its HOME session.
    allowed_sessions    = [Session.LONDON, Session.NEW_YORK, Session.ASIAN]
    allowed_trends      = [Trend.ANY]        # VIX.1 reads its own trend — 1HR primary, 4HR fallback (cascade)
    allowed_instruments = ["EUR/USD", "GBP/USD"]
    news_stance         = NewsStance.NEWS_AGNOSTIC   # news candle + news-window guards applied in analyze()
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        # dedup = the shared delivery_ledger, committed only once a signal is REAL (never at build
        # time) by signal_validator.register_confirmed — see that docstring for why.
        self._recent: dict[str, tuple[bool, float]] = {}     # C4: symbol -> (bullish, ts) last signal
        self._locked: dict[str, dict] = {}                   # WATCH: symbol -> pending locked setup

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        # The 1HR feed hands back the candle still FORMING as its newest bar. Its body, wicks and
        # close all keep changing, so it can be neither the momentum candle nor the line — a line that
        # moves every scan is not a line, and its "close" is simply the current price. The 1M's
        # forming bar is KEPT on purpose: there, live price is exactly what the entry reacts to.
        h1 = closed_only(context.candles.get(TF.H1))
        h4 = closed_only(context.candles.get(TF.H4))   # TREND timeframe (clear_trend runs on this)
        if len(m1) < 12 or len(h1) < 20 or len(h4) < 20:
            return StrategyResult.empty()
        pip    = pip_size(context.symbol)
        digits = price_digits(context.symbol)
        now    = time.time()
        sym    = context.symbol
        out: list[Signal] = []

        # WATCH — a LOCKED pending setup: alert on invalidation, but never block a fresh setup.
        locked = self._locked.get(sym)
        if locked is not None:
            reason = check_invalidation(locked, h1, h4, m1, now, sym)
            if reason in ("triggered", "expired"):
                del self._locked[sym]                       # cleared — look for a fresh setup
            elif reason is not None:
                del self._locked[sym]
                log.info(f"[vix1] {sym} setup invalidated — {reason}")
                # Only if the signal was actually DELIVERED: the lock is taken at BUILD time, but the
                # validator/save can still drop the signal downstream — an invalidation DM for a
                # setup nobody was ever told about is pure confusion. When it WAS delivered, also
                # RETRACT it: cancel the still-pending DB row (the public card must not stay live
                # after the strategy itself has called the setup dead) and free the dedup key so a
                # fresh setup can fire. cancel_active leaves a triggered row alone by design.
                if delivery_ledger.is_delivered(locked.get("key", "")):
                    side = "buy" if locked["bullish"] else "sell"
                    try:
                        from storage import signal_repo
                        from validation import signal_validator
                        signal_repo.cancel_active(self.id, sym, side)
                        signal_validator.release(sym, side, self.id)
                    except Exception as exc:
                        log.warning(f"[vix1] {sym} could not retract the cancelled signal: {exc}")
                    out.append(invalidation_signal(locked, reason, sym, self.name))
            # reason is None → still valid: keep the lock, fall through (the pull-back may have formed)

        # 1HR BIAS — from the FIRST momentum candle of the run.
        bias = detect_bias(h1, h4, sym)                     # trend on H4, momentum on H1; logs when None
        if bias is None:
            return StrategyResult(signals=out)
        bullish, vc_idx, origin, vol_count = bias
        vc = h1[vc_idx]
        if is_news_candle(vc, context.news, sym):           # NEVER trade the news candle itself
            log.info(f"[vix1] {sym} 1st momentum candle is a news candle — skip")
            return StrategyResult(signals=out)
        if in_news_window(context.news, sym):               # H2: skip entries in a high-impact window
            log.info(f"[vix1] {sym} inside a high-impact news window — skip entry")
            return StrategyResult(signals=out)

        # SPACING — is this instrument still busy with the last signal? Checked here, AFTER the bias
        # is known (so the log says which setup was refused) and BEFORE the 1M entry work, which is
        # the expensive part and pointless if the instrument is shut. See strategies/vix1_spacing.py
        # for the rule in the user's own words.
        ok, why = vix1_spacing.check(h1, sym, self.id, now)
        if not ok:
            log.info(f"[vix1] {sym} setup SKIPPED by spacing — {why}")
            return StrategyResult(signals=out)

        # 1M — align (structure, or a fractal break), then the pullback entry.
        delivery_ledger.cleanup(_STATE_TTL)
        log.info(f"[vix1] {sym} 1HR bias OK ({'BUY' if bullish else 'SELL'}, {origin}, "
                 f"{vol_count} vol candle{'s' if vol_count != 1 else ''}, from 1st) — checking 1M")
        raw = m1_signals(m1, bullish, vc, pip=pip, symbol=sym)
        if not raw:
            return StrategyResult(signals=out)

        # C4: correlation — another USD pair already the SAME direction within the window (warn, don't
        # block). Only signals that were actually DELIVERED count — _recent is stamped at build time,
        # and a signal the validator dropped must not put a phantom warning on a real one.
        corr = [inst for inst, (b, t, k) in self._recent.items()
                if inst != sym and b == bullish and (now - t) < _CORR_WINDOW
                and delivery_ledger.is_delivered(k)]

        # GRADE the momentum candle by SHAPE (user 2026-07-21): A (75% body / 15% wick) -> 0.85;
        # weaker-but-passing shapes slide 0.74 -> 0.60. The grade IS the signal's confidence.
        grade, conf = momentum_grade(vc, bullish)

        for s in raw:                                       # each = {"kind", "entry", "sl"}
            # ONE entry per momentum candle, NOT keyed by kind: the same setup can reach the entry via
            # either alignment path, and the second would be silently dropped as a duplicate.
            key = f"{self.id}_{sym}_{'B' if bullish else 'S'}_{vc.time}"
            if delivery_ledger.is_delivered(key):
                continue
            entry, sl = s["entry"], s["sl"]
            risk = abs(entry - sl)
            # TP is 2R from the entry — the two-1HR-candle move ("2 candles of 1HR gives me 2R").
            # There used to be a LATE branch here that retargeted to where the original move was
            # aiming. It is gone with the late path itself (vix1_entry, 2026-07-26): that path was
            # provably unreachable, because the stop sits behind the line and the entry past it, so
            # more than 1R to the original target is structurally guaranteed. `late` is now always
            # False and its keys are kept only so this card and the DB row need no schema change.
            late = False
            tp = entry + 2.0 * risk if bullish else entry - 2.0 * risk
            rr = 2.0
            # One entry per setup, so it is SAVED (AssetPage + DM + TP/SL monitoring) and holds the
            # single symbol:direction reservation the validator/monitor/DB invariant assumes.
            # `vix1`, NOT `vix1_watch`: the _watch suffix is what the dispatcher reads to mean
            # "unconfirmed — admin DM only". This IS the entry (the 1M pullback: place the stop now),
            # so it goes to the PUBLIC CHANNEL as a full signal card. It is a real saved signal too,
            # so the monitor closes it on TP/SL and the channel gets that as well. The invalidation
            # alert keeps `vix1_watch` and stays a DM — it is a correction, not a signal.
            sig = build_signal(s["kind"], sym, bullish, origin, vol_count, entry, sl, tp, risk, pip,
                               digits, corr, context.news, self.id, self.name,
                               grade, conf, sl_note=s.get("sl_note", ""),
                               late=late, late_note=s.get("late_note", ""), rr=rr)
            sig.dedup_key = key          # committed ONLY once the signal is real — never here
            out.append(sig)
            self._recent[sym] = (bullish, now, key)
            # Assign, don't setdefault: this is a new momentum candle, so it SUPERSEDES any older
            # pending setup. setdefault left the watch tracking the stale entry/sl and the live one
            # unwatched. "key" lets the invalidation path ask whether this setup was ever DELIVERED.
            self._locked[sym] = {"bullish": bullish, "entry": entry, "sl": sl,
                                 "locked_at": now, "key": key}
            log.info(f"[vix1] {sym} 1M {s['kind'].upper()} signal — {'BUY' if bullish else 'SELL'} "
                     f"stop {entry:.{digits}f} SL {sl:.{digits}f}")

        return StrategyResult(signals=out)
