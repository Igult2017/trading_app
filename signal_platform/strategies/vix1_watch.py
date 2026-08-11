"""
VIX.1 — setup LOCK + invalidation WATCH.

Once a setup fires it is LOCKED (one pending setup per instrument). Every scan tick we watch BOTH
timeframes together, so we never keep assuming the bias still holds after price has actually turned:
  - 1HR: if the TREND now points the OTHER way, the higher-timeframe view has flipped → invalidate.
  - 1M : if price reversed past the stop before the entry triggered → invalidate.
Also detects 'triggered' (the entry stop was hit → hand off / stop watching) and 'expired' (the
pending setup went stale). On a genuine invalidation the strategy sends a DM alert and drops the lock.
"""
from core.types import Candle, Signal, Direction, TF
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
from strategies.vix1_trend import trend_state

_LOCK_TTL = 24 * 3600  # matches the platform's own signal lifetime (signal_repo.expire_stale, 24h).
                       # The playbook's wait is OPEN-ENDED — "a bias flip ends a setup; a timer never
                       # does" — so the only clock left is the signal's own DB expiry, and the watch
                       # covers that ENTIRE life. The old 3h TTL contradicted the settled rule and
                       # left the signal publicly active but unwatched for hours 3-24: an
                       # invalidation in that window alerted nobody.
WATCH_M1  = 1500       # recent M1 bars inspected for a trigger / reversal — must SPAN _LOCK_TTL
                       # (1440 1M bars) or a tick missed while the scanner was down leaves the
                       # earliest post-lock bars outside the slice and their trigger unseen.
                       # PUBLIC: vix1.candle_counts derives its M1 request size from this so the
                       # fetched window can actually contain the slice (same never-drift rule as
                       # vix1_momentum.LOOKBACK).


def check_invalidation(locked: dict, h1: list[Candle], h4: list[Candle], m1: list[Candle],
                       now_ts: float, symbol: str = "") -> str | None:
    """
    Watch a LOCKED (pending) setup on BOTH timeframes. Returns:
      a reason string  — the bias/price turned against the setup (invalidate + alert),
      'triggered'      — the entry stop was hit (trade is live; stop watching),
      'expired'        — pending too long,
      None             — still pending-valid (keep watching).
    locked = {bullish, entry, sl, locked_at, ...}
    """
    bullish = locked["bullish"]
    if now_ts - locked["locked_at"] > _LOCK_TTL:
        return "expired"

    # 1M FIRST — SINCE THE LOCK, did the entry trigger, or did price reverse past the stop?
    # This runs BEFORE the bias check on purpose: once the entry has filled, the trade is LIVE and
    # belongs to the monitor — a bias flip after the fill is Phase-3 management, not an invalidation,
    # and reporting it as one would retract a position that actually exists. (The old order checked
    # the bias first, so an already-triggered setup could still come back "invalidated".)
    # Strictly bars that OPENED at/after the lock. This window used to reach back a full hour
    # (locked_at - 3600) and so judged the setup on price action from BEFORE it existed: measured on
    # 214 real GBP/USD setups, 70% were resolved by pre-lock bars — 65 valid setups got a false
    # "INVALIDATED" DM and 44 were silently dropped as "triggered" and left unwatched. A bar that
    # opened before the lock cannot say anything about a setup that did not exist yet.
    entry, sl = locked["entry"], locked["sl"]
    for c in [c for c in m1[-WATCH_M1:] if c.time >= locked["locked_at"]]:
        if bullish:
            if c.high >= entry:
                return "triggered"
            if c.low <= sl:
                return "1M reversed below the stop before entry"
        else:
            if c.low <= entry:
                return "triggered"
            if c.high >= sl:
                return "1M reversed above the stop before entry"

    # HTF TREND — has it flipped to the other side while the setup is still PENDING?
    #
    # THIS ASKS THE TREND, NOT `detect_bias`, AND THE DIFFERENCE IS A REAL DEFECT THAT WAS SHIPPED
    # AND CAUGHT IN REVIEW (2026-08-11). `detect_bias` answers "may a NEW trade be taken", and since
    # the pullback refusal was added it returns None whenever one may not — no momentum candle, or
    # the faster structure contradicting. Asking it here meant a pending setup whose trend had
    # GENUINELY FLIPPED was no longer invalidated, because the flip itself suppressed the answer.
    #
    # A resting order must be judged on WHERE THE TREND POINTS. Whether a fresh entry is currently
    # permitted is a different question and has no business in this one.
    trend = trend_state(h1[-_H1_TREND_BARS:], n=_H1_SWING_N).direction
    if trend != 0 and (trend == 1) != bullish:
        return "1HR trend flipped against the setup"
    return None


def invalidation_signal(locked: dict, reason: str, symbol: str, strategy_name: str) -> Signal:
    """A DM alert telling the trader a previously-signalled setup is no longer valid."""
    side = "BUY" if locked["bullish"] else "SELL"
    return Signal(
        symbol            = symbol,
        direction         = Direction.BUY if locked["bullish"] else Direction.SELL,
        strategy_id       = "vix1_watch",     # → private DM
        strategy_name     = strategy_name,
        entry_price       = locked["entry"],
        stop_loss         = locked["sl"],
        take_profit       = locked["entry"],
        risk_reward       = 2.0,
        confidence        = 0.72,
        primary_timeframe = TF.H1,
        alert_only        = True,
        technical_reasons = [
            f"⚠️ {side} setup INVALIDATED — {reason}.",
            "Price no longer obeys the 1HR/1M bias — do NOT take this setup.",
        ],
        market_context    = f"VIX.1 INVALIDATED — {side} {symbol}: {reason}",
    )
