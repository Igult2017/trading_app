"""
Signal validation gate.
Uses an in-memory duplicate set — avoids hitting the DB on every signal,
and fails safe: if the DB is unavailable at startup, signals are still
deduplicated within the current process lifetime.

Dedup is atomic within the asyncio event loop (single-threaded, no lock needed).
_is_duplicate() reserves the key immediately; callers must call release() if
the signal is rejected downstream (risk filter, AI validator, etc.).
"""

import logging
from core.types import Signal, StrategyResult
from config.settings import settings

log = logging.getLogger(__name__)

# In-memory duplicate guard: "symbol:direction" keyed lowercase
# Populated from DB at first use, then kept in sync via _is_duplicate() / release()
_seen:   set[str] = set()
_loaded: bool = False


def _load_active_from_db() -> None:
    """Seed the in-memory set from the DB once at first validation call."""
    global _loaded
    if _loaded:
        return
    try:
        from storage import signal_repo
        for row in signal_repo.get_active():
            _seen.add(f"{row.symbol}:{row.type.lower()}")
        _loaded = True
        log.info(f"[validator] loaded {len(_seen)} active signals into duplicate guard")
    except Exception as exc:
        log.warning(
            f"[validator] could not load active signals — duplicate guard starts empty: {exc}"
        )
        _loaded = True   # don't retry on every call; accept empty start


def register_confirmed(signal: Signal) -> None:
    """No-op — _is_duplicate pre-registers the key. Kept for call-site clarity."""
    pass


def release(symbol: str, direction: str) -> None:
    """Remove a reserved signal so that symbol+direction can trade again."""
    _seen.discard(f"{symbol}:{direction.lower()}")


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


def _check_confidence(signal: Signal) -> bool:
    if signal.confidence < settings.min_confidence:
        log.debug(
            f"[validator] {signal.symbol} conf={signal.confidence:.0%} "
            f"< min {settings.min_confidence:.0%}"
        )
        return False
    return True


def _is_duplicate(signal: Signal) -> bool:
    key = f"{signal.symbol}:{signal.direction.value.lower()}"
    if key in _seen:
        log.debug(f"[validator] duplicate skipped: {key}")
        return True
    # Reserve immediately — asyncio is single-threaded so this is atomic.
    # Caller must call release() if the signal is rejected downstream.
    _seen.add(key)
    return False
