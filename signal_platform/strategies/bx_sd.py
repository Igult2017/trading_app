"""
BX-S/D — Smart-Money supply/demand (EUR/USD, GBP/USD, USD/JPY), from the SMC (Vekariya) book.
READ docs/strategies/bx-sd.md FIRST — the book's rules verbatim, and what is already settled.
Cascade — 4H: the SETUP is confirmed there and ONLY there (a fresh 3-factor
zone: IFC + broke structure + liquidity grabbed, tapped, priced right, defensive-liquidity clear).
15M: a CHoCH INSIDE the zone confirms (never a blind limit), refines it to a tight POI, and grades it.
1M/5M: the trigger locks entry (proximal/50%), SL ~2 pip beyond the distal, TP = the next opposite
zone / fib, >= 2R. Pro-trend + confirmed only; shares platform RESOURCES only, never another
strategy's logic. PHASE 1 = signals (DM via `_watch`); Phase 2 (auto-execute) follows.
"""
import logging
import time

from core.base_strategy import BaseStrategy
from core.types import Session, Trend, NewsStance, NewsImpact, StrategyResult, TF, Signal
from core.strategy_context import StrategyContext
from core import delivery_ledger, stage_tracker
from storage import observability_repo as obs
from shared.pip import pip_size, price_digits
from strategies.bx_sd_setup import detect_setup
from strategies.bx_sd_registry import build as build_registry
from strategies.bx_sd_confirm import confirm_grade
from strategies.bx_sd_signal import build_signal
from strategies.bx_sd_htf import htf_zone_map
from strategies.bx_sd_watch import (check_invalidation, invalidation_signal,
                                    zone_broken_after_signal)
from strategies.bx_sd_reports import scan_reports

log = logging.getLogger(__name__)

_STATE_TTL = 14 * 24 * 3600   # forget a fired 4H setup after 2 weeks


class BXStrategy(BaseStrategy):
    name    = "BX-S/D"
    id      = "bx_sd"
    enabled = True

    # H4 is the only HARD one; OPTIONAL = a flaky feed degrades a path, never kills the strategy.
    required_timeframes = [TF.H4]
    optional_timeframes = [TF.H1, TF.M30, TF.M15, TF.M5, TF.M1, TF.D1, TF.W1, TF.MN]
    # H4 = 1000 bars (~166 days). A ZONE DOES NOT EXPIRE — the book (p27) says only a tap changes its
    # state, and the user's rule is that an unmitigated zone stays unmitigated "even in the next 10
    # years". At 200 bars a zone older than ~33 days did not expire, it simply CEASED TO EXIST when it
    # scrolled off the replay window, which makes premarking pointless: the whole purpose is to have
    # the zone written down when price finally comes back. Widening the replay keeps the registry a
    # pure function of closed bars (no stored state to desynchronise), which storing it would not.
    candle_counts       = {TF.H4: 1000, TF.H1: 200, TF.M30: 200, TF.M15: 200, TF.M5: 250,
                           TF.M1: 250, TF.D1: 200, TF.W1: 120, TF.MN: 60}

    # All 3 sessions: the 4H cascade IS the filter, and USD/JPY gets Tokyo — its home session.
    allowed_sessions    = [Session.LONDON, Session.NEW_YORK, Session.ASIAN]
    allowed_trends      = [Trend.ANY]
    allowed_instruments = ["EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY"]
    news_stance         = NewsStance.NEWS_AGNOSTIC
    news_impact_filter  = [NewsImpact.HIGH]

    def __init__(self):
        # dedup is the shared delivery_ledger — committed only on a confirmed DM (at-least-once)
        # (stage de-duplication now lives in core.stage_tracker — see _log)
        self._locked: dict[str, dict] = {}       # symbol -> tapped setup, watched to invalidation

    async def analyze(self, context: StrategyContext) -> StrategyResult:
        h4  = context.candles.get(TF.H4)
        m15 = context.candles.get(TF.M15)
        m5  = context.candles.get(TF.M5)
        m1  = context.candles.get(TF.M1)
        sym = context.symbol
        if len(h4) < 40:
            self._log(sym, "NO_H4", f"only {len(h4)} H4 bars (need 40+) — nothing can run")
            return StrategyResult.empty()
        # Entry TF: prefer 1M, fall back to 5M. The book uses whichever is clearer, and this also
        # keeps BX alive when the 1M feed lags (stale bars get dropped upstream by the fail-safe).
        entry_tf = m1 if len(m1) >= 30 else (m5 if len(m5) >= 30 else [])
        # Analysis TFs (Micro) — refine the 4H zone + MTF alignment; any of 15M/30M/1H, clearest wins.
        analysis_tfs = [(m15, "15M"),
                        (context.candles.get(TF.M30), "30M"),
                        (context.candles.get(TF.H1),  "1H")]
        htf    = {"Daily":   context.candles.get(TF.D1),
                  "Weekly":  context.candles.get(TF.W1),
                  "Monthly": context.candles.get(TF.MN)}
        pip    = pip_size(sym)
        digits = price_digits(sym)
        htf_map = htf_zone_map(htf, pip)                  # D1/W1/MN zones — the A-grade backing check
        # THE ZONE BOOK — built ONCE per scan and passed down. Every path reads the same marked
        # zones; nothing re-derives them. Building it per-consumer would duplicate the replay and,
        # worse, let two paths disagree about what a zone is — which is the bug this replaced.
        # m15 is the SESSION feed: without a sub-H4 series `find_liquidity` cannot isolate an
        # Asia/London/NY boundary, so factor 3 (did this zone's move grab liquidity first?) could
        # not see a single session high or low. It is the one production call, so passing it here
        # is what actually turns session liquidity on.
        book = build_registry(h4, pip, session_candles=m15)
        out: list[Signal] = []

        # REPORTS — the mitigation heads-up (admin DM) and the TAP ALERT (public, pre-pullback).
        # Independent of the entry cascade below; deduped once per zone VISIT on confirmed delivery.
        # The tap alert is the earlier of BX's two public moments and fires only while the zone is
        # NOT yet respected; the cascade below owns everything from `respected` onward.
        out += scan_reports(sym, entry_tf, m5, m1, h4, htf, pip, digits, self.name, self.id,
                            book=book)

        # WATCH — a tapped setup broke before it triggered: alert (at-least-once), then stop watching.
        locked = self._locked.get(sym)
        if locked is not None:
            ikey  = f"{sym}_{locked['direction']}_{locked['zone_time']}"
            fired = bool(locked.get("fired"))
            # A FIRED setup keeps its watch, so it cannot use `ikey` to decide it is finished — that
            # key was committed by the signal itself. It gets its own key for the break advisory.
            bkey  = f"{ikey}_broke"
            done  = delivery_ledger.is_delivered(bkey) if fired else delivery_ledger.is_delivered(ikey)
            if done:
                self._locked.pop(sym, None)     # alert delivered (or pre-fire invalidation) — stop
            else:
                inval = check_invalidation(locked, h4, m15)
                if inval == "broken" and fired:
                    # The trade is LIVE and its zone just broke. Advisory only: the monitor still owns
                    # TP/SL, and a fired signal is never retracted.
                    self._log(sym, "ZONE_BROKEN_AFTER_SIGNAL", "4H zone broke with the entry live")
                    sig = zone_broken_after_signal(locked, sym, self.name, self.id + "_watch")
                    sig.dedup_key = bkey
                    out.append(sig)
                elif inval == "broken":
                    self._log(sym, "INVALIDATED", "4H zone broken before the entry triggered")
                    sig = invalidation_signal(locked, sym, self.name, self.id + "_watch")
                    sig.dedup_key = ikey        # committed on delivery; the lock is popped next scan
                    out.append(sig)
                elif inval == "expired":
                    self._locked.pop(sym, None)

        # The cascade needs an ENTRY TF (the mandatory confirm). The analysis TFs (15M/30M/1H) are
        # optional now — their absence only caps the grade, it never drops the setup.
        if len(entry_tf) < 30:
            self._log(sym, "AWAIT_DATA", f"cascade needs an entry TF (M1={len(m1)} M5={len(m5)}) — reports still ran")
            return StrategyResult(signals=out)

        # STAGE 1 — 4H setup (valid fresh zone EITHER SIDE, tapped, priced, liquidity-safe)
        setup = detect_setup(h4, pip, book=book, htf_map=htf_map,
                             d1=context.candles.get(TF.D1))
        if not setup.active:
            self._log(sym, "SCANNING", f"4H: {setup.reason}")
            return StrategyResult(signals=out)
        # Key on the IFC (one zone per IFC = unique). origin_index is NOT: a wick zone sits ON its
        # impulse while the next IFC's zone sits on that same candle, so two real setups would share
        # a key and the second be dropped as already-delivered. Same reason bx_sd_reports keys on it.
        zone_time = h4[setup.zone.ifc_index].time
        key = f"{sym}_{setup.direction}_{zone_time}"     # one fire + one watch per 4H zone
        # lock the tapped setup so a break before the trigger is reported — but never re-watch a
        # zone that already fired (else we'd 'invalidate' a trade we already signalled).
        # A NEW zone SUPERSEDES an old lock (setdefault left the fresh setup unwatched while a stale
        # lock lived out its TTL — its invalidation alert was silently lost); the SAME zone keeps its
        # original locked_at so the watch TTL cannot be reset by every rescan.
        if not delivery_ledger.is_delivered(key):
            cur = self._locked.get(sym)
            if cur is None or cur.get("zone_time") != zone_time:
                self._locked[sym] = {"direction": setup.direction, "distal": setup.zone.distal,
                                     "zone_time": zone_time, "locked_at": time.time()}

        # STAGE 2-3 — analysis-TF refine + MANDATORY 1M/5M confirmation entry + grade (shared helper).
        # A FRESH 4H zone fires at any grade (C and up); the retest path reuses this at min_grade="B".
        # THE ENTRY ZONE IS REFINED ON 5M, and that is his own timeframe: *"I do use 5M and it
        # is perfect."* Measured first — refining on 1M gave a 0.8-pip median stop, inside
        # the spread, so every trade would have died on entry regardless of direction.
        res = confirm_grade(setup, h4, analysis_tfs, entry_tf, htf_map, pip, refine_tf=m5)
        if res is None:
            self._log(sym, "4H_ZONE_TAPPED", "await entry-TF confirmation (1M/5M BMS inside the zone)")
            return StrategyResult(signals=out)
        conf, trig, grade = res

        # SIGNAL — real channel entry. Dedup committed ON CONFIRMED DELIVERY.
        delivery_ledger.cleanup(_STATE_TTL)
        if delivery_ledger.is_delivered(key):
            return StrategyResult(signals=out)
        # KEEP WATCHING. This used to pop the lock — "setup resolved into a signal, stop watching" —
        # which switched the zone-break watch off at exactly the moment a real trade went live. The
        # trader then had no way to learn the zone had broken until the stop was hit. The lock now
        # survives, flagged `fired`, and a break sends an advisory (never a retraction) instead.
        if sym in self._locked:
            self._locked[sym]["fired"] = True
        self._log(sym, "SIGNAL", f"{trig.direction.upper()} [{grade}] entry {trig.entry:.{digits}f} "
                  f"SL {trig.sl:.{digits}f} TP {trig.tp:.{digits}f} RR {trig.rr}")
        sig = build_signal(sym, setup, conf, trig, pip, digits, self.id, self.name)
        sig.dedup_key = key
        out.append(sig)
        return StrategyResult(signals=out)

    def _log(self, sym: str, stage: str, detail: str) -> None:
        """Log on stage change, AND re-state an unchanged stage every heartbeat.

        The change-trigger alone was right in principle and blind in practice. This method used to
        keep its own `self._stage` dict and speak only on a transition, so once a symbol settled it
        went quiet indefinitely — correct, and useless when the question is "what is it doing right
        now". Measured 2026-07-29: a 3h29m log window contained ZERO lines from this strategy while
        every instrument sat in a perfectly healthy state, and answering "is it working" needed a
        broker query and a local replay instead of one grep.

        `core.stage_tracker` adds the floor: the transition still prints immediately, and an
        unchanged stage reprints every HEARTBEAT_S so a recent window always names the current state.
        The stage change is ALSO recorded durably (signal_events) because the log buffer is finite
        and a restart empties it entirely.
        """
        line = f"[bx_sd] {sym} -> {stage} | {detail}"
        # Key on the symbol, value on stage+detail: a stage that stays SCANNING while its detail
        # changes (a zone tapped, price closing in) is a real change worth printing.
        if stage_tracker.emit("bx_sd", sym, f"{stage}|{detail}", line, logger=log):
            obs.record(obs.STAGE_EVALUATED, self.id, sym, detail=f"{stage} | {detail}")
