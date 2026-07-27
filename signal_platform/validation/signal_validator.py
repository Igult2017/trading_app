"""
Signal validation gate.

DEDUP IS SCOPED PER STRATEGY: "strategy:symbol:direction". Each strategy is an independent tenant
with its OWN opinion, so one must never be able to silently swallow another's. Two strategies both
seeing EUR/USD BUY is two signals — that is the point of running more than one. This holds however
many strategies are added.

It used to be "symbol:direction" across ALL strategies, which meant whichever tenant happened to fire
first that tick took the pair+direction and every other strategy's signal vanished with only a debug
line.

A strategy still cannot duplicate ITSELF: ONE ACTIVE SIGNAL PER SYMBOL+DIRECTION PER STRATEGY. The
user's rule, 2026-07-27: "One ticker cannot send 2 signals at the same time using this strategy."

THREE LAYERS ENFORCE IT, deliberately, because the top one alone failed in production:

  1. `_seen`, an in-memory set. Fast, and atomic within the single-threaded asyncio loop.
  2. `_active_in_db()`, asked of the DATABASE on every admission — `_seen` is only a cache of it.
  3. A UNIQUE PARTIAL INDEX, `trading_signals (strategy, symbol, type) WHERE status = 'active'`
     (docker-migrate.sql). This one cannot be bypassed by any process state, restart or race, and it
     is what makes `signal_repo.save`'s `except IntegrityError` a REACHABLE path — the runner now
     treats an empty return from save as "not saved, do not dispatch".

WHY THREE. On 27 Jul 2026 two `vix1 EUR/USD sell` signals were active simultaneously — a state this
module has always claimed to make impossible. Layer 1 was the only layer, and it was empty: it is
seeded by `_load_active_from_db()`, which raised `DetachedInstanceError` on every row (see
storage/db.py — `get_active()` returned expired, detached ORM instances) and swallowed the error in
its own `except`, leaving `_loaded` False and the guard blank forever. An in-memory guard cannot
survive a restart, a seeding failure, or a second process; a database constraint survives all three.
The earlier version of this docstring asserted there was no such constraint — there is now.

_is_duplicate() reserves the key immediately; callers must call release() if
the signal is rejected downstream (risk filter, save failure, etc.).
"""

import logging
from core.types import Signal, StrategyResult
from config.settings import settings

log = logging.getLogger(__name__)

# In-memory duplicate guard, keyed "strategy:symbol:direction" (lowercase).
# Populated from DB at first use, then kept in sync via _is_duplicate() / release().
_seen:   set[str] = set()
_loaded: bool = False


def _key(strategy: str, symbol: str, direction: str) -> str:
    """The one place the dedup scope is defined. Per STRATEGY, so tenants never collide."""
    return f"{(strategy or '').lower()}:{symbol.lower()}:{direction.lower()}"


def _load_active_from_db() -> None:
    """Seed the in-memory set from the DB once at first validation call."""
    global _loaded
    if _loaded:
        return
    try:
        from storage import signal_repo
        for row in signal_repo.get_active():
            _seen.add(_key(row.strategy, row.symbol, row.type))
        _loaded = True
        log.info(f"[validator] loaded {len(_seen)} active signals into duplicate guard")
    except Exception as exc:
        log.warning(
            f"[validator] could not load active signals — will retry next call: {exc}"
        )
        # Leave _loaded False so a transient DB outage at startup is retried on the
        # next validation tick, instead of permanently leaving the guard empty
        # (which would let already-active DB signals slip past the dup check).


def _active_in_db(signal: Signal) -> bool:
    """Is there ALREADY a live signal for this strategy+symbol+direction, per the DATABASE?

    THE IN-MEMORY SET IS NOT ENOUGH, and 27 Jul proved it. `_seen` lives in one process's RAM: a
    restart empties it, `_load_active_from_db` failing leaves it empty while only logging a warning,
    and a second process would never see it at all. On 27 Jul the reservation for
    `vix1:eur/usd:sell` was lost while the 11:17 signal was still live, so a second signal was
    admitted at 14:46 — two active rows for a key the validator guarantees is unique, and the worse
    of the two setups was the one delivered.

    So ask the DB, which is the actual system of record, on every admission. On a DB error this
    returns False and defers to `_seen` plus the unique partial index on
    `(strategy, symbol, type) WHERE status='active'` — a defence in depth where the last layer
    cannot be bypassed by any process state.
    """
    try:
        from storage import signal_repo
        want = _key(signal.strategy_id, signal.symbol, signal.direction.value)
        return any(_key(r.strategy, r.symbol, r.type) == want for r in signal_repo.get_active())
    except Exception as exc:
        log.warning(f"[validator] active-signal check failed ({type(exc).__name__}: {exc}) — "
                    f"falling back to the in-memory guard and the DB constraint")
        return False


def register_confirmed(signal: Signal) -> None:
    """Called by the runner the instant a signal becomes REAL — saved to the DB and about to
    dispatch. THIS is where a producer's dedup_key is committed, and nowhere earlier.

    A strategy that burns its own key at BUILD time (fired.add right after build_signal) kills the
    setup even when the signal is rejected a moment later by a risk filter, the AI validator or a
    save failure. The key survives in the DB, so that setup is dead FOREVER and never re-fires —
    silently. Stamp signal.dedup_key instead and let this commit it, and a rejected signal simply
    re-fires on the next scan, which is what at-least-once means.

    (alert_only signals never reach here — they are not saved, so their only delivery is the DM and
    the dispatcher commits them on a confirmed send. Same rule, different definition of "real".)
    """
    if signal.dedup_key:
        from core import delivery_ledger
        delivery_ledger.mark_delivered(signal.dedup_key)


def release(symbol: str, direction: str, strategy: str = "") -> None:
    """Free a reservation so THAT strategy can signal this symbol+direction again. Releasing one
    tenant's key must never free another's, which is why the strategy is part of the key."""
    _seen.discard(_key(strategy, symbol, direction))


def validate(result: StrategyResult, instrument: str) -> list[Signal]:
    """Filter strategy results. Returns only signals that pass all checks."""
    if not result.has_signals():
        return []

    _load_active_from_db()

    valid: list[Signal] = []
    for signal in result.signals:
        if signal.alert_only:
            valid.append(signal)   # setup alerts bypass all validation; strategy manages dedup
            continue
        if not _check_rr(signal):
            continue
        if not _check_confidence(signal):
            continue
        if _is_duplicate(signal):
            continue
        valid.append(signal)

    return valid


def _check_rr(signal: Signal) -> bool:
    if signal.risk_reward < settings.min_rr:
        # INFO: this DISCARDS a signal the strategy worked to produce. At DEBUG it was invisible in
        # production, so "the strategy found nothing" and "we threw away what it found" read the same.
        log.info(
            f"[validator] {signal.symbol} {signal.strategy_id} REJECTED — "
            f"RR={signal.risk_reward:.2f} < min {settings.min_rr}"
        )
        return False
    return True


def _min_confidence_for(strategy_id: str) -> float:
    """The confidence floor for THIS strategy — global default unless overridden ("id:floor" CSV).
    VIX.1 grades its momentum candle 0.85..0.60 by shape; the grade is information carried on the
    card, so its floor matches the bottom of that scale instead of the global gate."""
    for part in settings.min_confidence_overrides.split(","):
        sid, _, floor = part.strip().partition(":")
        if sid and sid.lower() == (strategy_id or "").lower():   # env-side ids may arrive any case
            try:
                return float(floor)
            except ValueError:
                break
    return settings.min_confidence


def _check_confidence(signal: Signal) -> bool:
    floor = _min_confidence_for(signal.strategy_id)
    if signal.confidence < floor:
        log.info(
            f"[validator] {signal.symbol} {signal.strategy_id} REJECTED — "
            f"conf={signal.confidence:.0%} < min {floor:.0%}"
        )
        return False
    return True


def _is_duplicate(signal: Signal) -> bool:
    # Per-strategy scope — see the module docstring. A strategy cannot duplicate itself; it can never
    # block another. The monitor releases with the row's own strategy, so the two stay symmetrical.
    key = _key(signal.strategy_id, signal.symbol, signal.direction.value)
    if key in _seen:
        # INFO, not DEBUG: "the strategy found nothing" and "the strategy found something and we
        # refused it because one is already live" are completely different facts about the system,
        # and at DEBUG the second was invisible in production.
        log.info(f"[validator] duplicate skipped — {key} already has a live signal")
        return True
    # The DB is the system of record; `_seen` is only a cache of it. See _active_in_db.
    if _active_in_db(signal):
        log.warning(f"[validator] {key} is ACTIVE in the database but was missing from the "
                    f"in-memory guard — refusing, and re-seeding the guard")
        _seen.add(key)
        return True
    # Reserve immediately — asyncio is single-threaded so this is atomic.
    # Caller must call release() if the signal is rejected downstream.
    _seen.add(key)
    return False
