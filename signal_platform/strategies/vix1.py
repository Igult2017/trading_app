"""
VIX.1 — "Volume Strategy".

Built ONLY from the Volume Strategy playbook — a self-contained strategy, unrelated to any other:
  1HR = bias: a CONFIRMED TREND, carried by MOMENTUM (a run of 1-3 momentum candles). TRENDS ONLY —
        a clear 1HR trend (HH+HL up / LH+LL down), or, when the 1HR is unclear, 1HR momentum backed by
        a clear 4HR trend. A range->trend transition is taken only once the trend is CONFIRMED, never
        on the bare breakout. OPERATE FROM THE 1ST momentum candle. NO indicators.
  1M  = entry, and the 1M alone decides WHEN — the 1HR never puts a clock on it, and the 1M reads NO
        structure of its own: *"Everything has been settled in 1HR, in 1 min we are only looking for
        entries."* THE LINE says which side we are on: our side -> wait for the CROSS; the wrong side
        -> the counter-move's last FRACTAL must break first. Entry = a stop order one tick beyond the
        furthest price reached between the crossing candle and the ONE candle after it, so a pullback
        never fills us and a resumption does. No pullback there? It is ASSUMED and the card says so.
        SL = beyond the LINE, or beyond the pullback's far edge when it dipped through — never a pip
        count; TP = 2R, the two-1HR-candle move. See vix1_cross and vix1_entry.

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
from core.instrument_debut import InstrumentDebut
from strategies.vix1_bias import _ALLOW_H4, detect_bias
from strategies.vix1_entry import m1_signals
from strategies.vix1_lines import draw_line
from strategies.vix1_momentum import LOOKBACK, momentum_grade   # candle_counts[M1] derives from LOOKBACK
from strategies import vix1_building, vix1_preclose
from strategies.vix1_signal import build_signal
from strategies import vix1_spacing, vix1_log
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
    # THE SPREAD IS A TRADING INPUT HERE, not a filter preference. cTrader triggers a BUY stop on
    # the ASK while candles are BID, so without it every buy order fires a spread early — on a break
    # that never happened (vix1_cross.decide). Asking for it also switches on `risk/spread_filter`,
    # which had never run on real data because nothing ever populated `context.spread`.
    requires_spread     = True
    # The 1M window MUST span the oldest momentum candle the bias can return, because the entry reads
    # everything "since the line was drawn": the cross, the candle after it, and the fractals that
    # gate the wrong-side route. A flat 250 bars covered only 4.2h against a 12h
    # lookback, so on 51% of bias hits the entry judged a setup on a window that began hours after
    # its own line — silently rejecting valid entries and mis-siting the ones it took. DERIVED, never
    # a literal, so the two cannot drift apart a third time (fix log ef6ff8b).
    # H4: 120 bars = 20 days — ample to print the HH+HL/LH+LL structure clear_trend reads.
    # M1 must span BOTH consumers: the entry window (LOOKBACK+2 hours) and the invalidation watch
    # (WATCH_M1 bars, sized to the 24h lock TTL) — derived, never a literal, same no-drift rule.
    # H1 = 1500 bars (~62 days). NOT a round number picked for comfort: the 1HR trend is read from
    # 48-bar swings (vix1_bias._H1_SWING_N) and needs enough history for several of them to form.
    # At the old 120 the detector could see nothing older than two days and reported UP inside a
    # two-month decline. One request returns all 1500 and the fetcher throttles per REQUEST, not per
    # bar, so the extra bars cost queue time, never rate.
    # H1 3000 (was 1500) — the momentum test's SECOND yardstick is the median body over ~6 months
    # (vix1_momentum._LONG_BARS). The trend read does NOT widen with it: vix1_bias pins itself to the
    # last 1500 explicitly, because that is the window its 2026-07-29 calibration was measured on.
    candle_counts       = {TF.M1: max((LOOKBACK + 2) * 60, WATCH_M1 + 30), TF.H1: 3000, TF.H4: 120}

    # All three sessions. The playbook has no session rule at all — the London/NY gate was an
    # addition, and the strategy already filters thin hours by itself: no momentum candle (a bigger body
    # than the previous one, wicks <= 33%) means no bias means no trade, and quiet Asian hours produce
    # few of them. GBP/USD in Tokyo will simply stay silent; USD/JPY finally gets its HOME session.
    allowed_sessions    = [Session.LONDON, Session.NEW_YORK, Session.ASIAN]
    allowed_trends      = [Trend.ANY]        # VIX.1 reads its own trend — 1HR primary, 4HR fallback (cascade)
    # THREE INSTRUMENTS as of 2026-08-19 — XAU/USD added at the user's request.
    #
    # MEASURED BEFORE ADDING, because the momentum-candle floor was calibrated on the two FX pairs
    # and gold moves nothing like them. It transfers WITHOUT touching a constant, because the floor
    # is a RATIO (2.12x the 2000-bar median body) rather than a pip count:
    #
    #     instrument   median body   2000-bar floor   momentum candles/mo   % of bars
    #     XAU/USD        643.5p          1401.3p             46.7             9.5%
    #     EUR/USD          4.1p             7.6p             52.3            10.1%
    #     GBP/USD          5.5p            10.5p             52.1            10.1%
    #
    # ...and the full 1HR bias lands in the same place: gold gives 9.2 signals/month against 9.0
    # (EUR/USD) and 9.9 (GBP/USD) over 6.1 months of real broker H1. That is the whole argument for
    # "nothing hardcoded where the market can say it" — the pair-agnostic multiple earned its keep.
    allowed_instruments = ["EUR/USD", "GBP/USD", "XAU/USD"]
    news_stance         = NewsStance.NEWS_AGNOSTIC   # news candle + news-window guards applied in analyze()
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        # dedup = the shared delivery_ledger, committed only once a signal is REAL (never at build
        # time) by signal_validator.register_confirmed — see that docstring for why.
        self._recent: dict[str, tuple[bool, float]] = {}     # C4: symbol -> (bullish, ts) last signal
        self._locked: dict[str, dict] = {}                   # WATCH: symbol -> pending locked setup
        # When was each instrument first scanned? A momentum candle older than that is backfill, not
        # a live setup — the gold incident, 2026-08-19. Persisted, so a redeploy is not mistaken for
        # a new instrument. See core/instrument_debut.py.
        self._debut = InstrumentDebut(self.id)

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        m1 = context.candles.get(TF.M1)
        # The 1HR feed hands back the candle still FORMING as its newest bar. Its body, wicks and
        # close all keep changing, so it can be neither the momentum candle nor the line — a line that
        # moves every scan is not a line, and its "close" is simply the current price. The 1M's
        # forming bar is KEPT on purpose: there, live price is exactly what the entry reacts to.
        h1_raw = context.candles.get(TF.H1)            # the forming bar KEPT — vix1_preclose reads it
        h1 = closed_only(h1_raw)
        h4 = closed_only(context.candles.get(TF.H4))   # only read when the 4HR fallback is un-muted
        # H4 IS NOT REQUIRED WHILE THE FALLBACK IS MUTED. It used to be part of this guard, so a
        # failed or thin H4 fetch stopped the strategy producing ANY signal — on data nothing reads.
        # The 1HR trend and the 1M entry do not touch H4 at all (vix1_bias._ALLOW_H4).
        if len(m1) < 12 or len(h1) < 20:
            return StrategyResult.empty()
        if _ALLOW_H4 and len(h4) < 20:
            return StrategyResult.empty()
        pip    = pip_size(context.symbol)
        digits = price_digits(context.symbol)
        now    = time.time()
        sym    = context.symbol
        out: list[Signal] = []

        # PRE-CLOSE — "a momentum candle is about to close, be at the screen". FIRST, and deliberately
        # ahead of everything else: it is the only message here that is about a bar still forming, and
        # it has a five-minute window to land in. It depends on nothing below it — no bias, no lock,
        # no entry — so nothing below it can delay or swallow it.
        #
        # NOT GATED BY NEWS OR SPACING. Those two decide whether a TRADE may be taken; this announces
        # a CANDLE. Five minutes out we cannot yet know which setup, if any, the close will produce,
        # and staying silent about a candle he might want to watch is the more expensive mistake.
        pc = vix1_preclose.check(h1, h1_raw, sym, now)
        if pc is not None:
            bar, pc_bull, left = pc
            pkey = vix1_preclose.dedup_key(self.id, sym, pc_bull, bar)
            if not delivery_ledger.is_delivered(pkey):
                warn = vix1_preclose.preclose_signal(sym, pc_bull, bar, left, pip, self.name)
                warn.dedup_key = pkey     # committed only once the DM actually lands
                out.append(warn)
                vix1_log.say_always(f"[vix1] {sym} PRE-CLOSE warning — {'BUY' if pc_bull else 'SELL'} "
                                    f"momentum candle forming, {left/60:.1f} min to close")

        # WATCH — a LOCKED pending setup: alert on invalidation, but never block a fresh setup.
        locked = self._locked.get(sym)
        if locked is not None:
            reason = check_invalidation(locked, h1, h4, m1, now, sym)
            if reason in ("triggered", "expired"):
                del self._locked[sym]                       # cleared — look for a fresh setup
            elif reason is not None:
                del self._locked[sym]
                vix1_log.say_always(f"[vix1] {sym} setup invalidated — {reason}")
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
        # Record this instrument's debut against the newest CLOSED bar — bar time, not wall clock, so
        # a replay behaves exactly like a cold start instead of refusing all of history.
        self._debut.note(sym, h1[-1].time)
        bias = detect_bias(h1, h4, sym, debut=self._debut)   # trend on H4, momentum on H1; logs when None
        if bias is None:
            return StrategyResult(signals=out)
        bullish, origin, vol_count = bias.bullish, bias.origin, bias.run_len
        bias_reason = bias.reason
        vc = h1[bias.mc_idx]
        if is_news_candle(vc, context.news, sym):           # NEVER trade the news candle itself
            vix1_log.say(sym, f"[vix1] {sym} 1st momentum candle is a news candle — skip")
            return StrategyResult(signals=out)
        if in_news_window(context.news, sym):               # H2: skip entries in a high-impact window
            vix1_log.say(sym, f"[vix1] {sym} inside a high-impact news window — skip entry")
            return StrategyResult(signals=out)

        # SPACING — is this instrument still busy with the last signal? Checked here, AFTER the bias
        # is known (so the log says which setup was refused) and BEFORE the 1M entry work, which is
        # the expensive part and pointless if the instrument is shut. See strategies/vix1_spacing.py
        # for the rule in the user's own words.
        ok, why = vix1_spacing.check(h1, sym, self.id, now)
        if not ok:
            vix1_log.say(sym, f"[vix1] {sym} setup SKIPPED by spacing — {why}")
            return StrategyResult(signals=out)

        # 1M — align (structure, or a fractal break), then the pullback entry.
        delivery_ledger.cleanup(_STATE_TTL)
        vix1_log.say(sym, f"[vix1] {sym} 1HR bias OK ({'BUY' if bullish else 'SELL'}, {origin}, "
                 f"{vol_count} vol candle{'s' if vol_count != 1 else ''}, from 1st) — checking 1M")
        # STAGE 1 — THE MOMENTUM CANDLE HAS CLOSED AND THE BIAS IS CONFIRMED. His rule, 2026-08-03:
        # the first signal fires when the higher timeframe is building — "the first volume candle has
        # closed so we are waiting for entry". Deduped on the momentum candle's own time, so it goes
        # out once per candle and not on every 60s tick while the bias holds.
        #
        # NOT TIED TO THE ENTRY — his instruction, 2026-08-20: *"the headsup signal should not be
        # tied to entry, it should be fired immediately the momentum candle closes."* This used to sit
        # inside `if not raw:`, i.e. it was the ELSE-branch of the 1M entry search: the heads-up
        # existed only as "no entry yet", so it was emitted AFTER `m1_signals` had run and it was
        # cancelled outright whenever the entry happened to be available on the same tick. Both are
        # wrong for a message whose entire purpose is to be early. It is now emitted the moment the
        # bias is known, BEFORE any 1M work, and the entry search continues underneath it — if both
        # land on the same tick he gets the heads-up and then the entry, in that order.
        bkey = vix1_building.dedup_key(self.id, sym, bullish, vc)
        if not delivery_ledger.is_delivered(bkey):
            bgrade, _ = momentum_grade(vc, bullish)
            heads_up = vix1_building.building_signal(
                sym, bullish, vc, origin, vol_count, bgrade, digits, self.name, pip,
                retracement=bias.retracement, efficiency=bias.efficiency,
                regime=bias.regime)
            heads_up.dedup_key = bkey        # committed only once the DM actually lands
            out.append(heads_up)

        raw = m1_signals(m1, bullish, vc, pip=pip, symbol=sym, spread=context.spread)
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
                               grade, conf, mc_time=vc.time, line=draw_line(vc),
                               sl_note=s.get("sl_note", ""),
                               late=late, late_note=s.get("late_note", ""), rr=rr,
                               bias_reason=bias_reason,
                               retracement=bias.retracement, efficiency=bias.efficiency,
                    regime=bias.regime)
            sig.dedup_key = key          # committed ONLY once the signal is real — never here
            out.append(sig)
            self._recent[sym] = (bullish, now, key)
            # Assign, don't setdefault: this is a new momentum candle, so it SUPERSEDES any older
            # pending setup. setdefault left the watch tracking the stale entry/sl and the live one
            # unwatched. "key" lets the invalidation path ask whether this setup was ever DELIVERED.
            self._locked[sym] = {"bullish": bullish, "entry": entry, "sl": sl,
                                 "locked_at": now, "key": key}
            vix1_log.say_always(f"[vix1] {sym} 1M {s['kind'].upper()} signal — {'BUY' if bullish else 'SELL'} "
                     f"stop {entry:.{digits}f} SL {sl:.{digits}f}")

        return StrategyResult(signals=out)
