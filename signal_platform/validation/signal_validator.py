"""
Signal validation gate.

DEDUP IS SCOPED PER STRATEGY: "strategy:symbol:direction". Each strategy is an independent tenant
with its OWN opinion, so one must never be able to silently swallow another's. Two strategies both
seeing EUR/USD BUY is two signals — that is the point of running more than one. This holds however
many strategies are added.

It used to be "symbol:direction" across ALL strategies, which meant whichever tenant happened to fire
first that tick took the pair+direction and every other strategy's signal vanished with only a debug
line. A comment claimed that scope was also "enforced by the DB unique constraint" — it is not.
There is no unique constraint on trading_signals (checked models.py, schema.ts and
docker-migrate.sql), so signal_repo.save's `except IntegrityError` never fired for this.

A strategy still cannot duplicate ITSELF: one active signal per symbol+direction per strategy.

Uses an in-memory duplicate set — avoids hitting the DB on every signal, and fails safe: if the DB is
unavailable at startup, signals are still deduplicated within the current process lifetime.

Dedup is atomic within the asyncio event loop (single-threaded, no lock needed).
_is_duplicate() reserves the key immediately; callers must call release() if
the signal is rejected downstream (risk filter, AI validator, etc.).
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
        log.debug(
            f"[validator] {signal.symbol} RR={signal.risk_reward:.2f} < min {settings.min_rr}"
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
        log.debug(
            f"[validator] {signal.symbol} conf={signal.confidence:.0%} "
            f"< min {floor:.0%} ({signal.strategy_id})"
        )
        return False
    return True


def _is_duplicate(signal: Signal) -> bool:
    # Per-strategy scope — see the module docstring. A strategy cannot duplicate itself; it can never
    # block another. The monitor releases with the row's own strategy, so the two stay symmetrical.
    key = _key(signal.strategy_id, signal.symbol, signal.direction.value)
    if key in _seen:
        log.debug(f"[validator] duplicate skipped: {key}")
        return True
    # Reserve immediately — asyncio is single-threaded so this is atomic.
    # Caller must call release() if the signal is rejected downstream.
    _seen.add(key)
    return False
