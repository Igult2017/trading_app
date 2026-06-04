"""
Signal validation gate.
Uses an in-memory duplicate set — avoids hitting the DB on every signal,
and fails safe: if the DB is unavailable at startup, signals are still
deduplicated within the current process lifetime.
"""

import logging
import threading
from core.types import Signal, StrategyResult
from config.settings import settings

log = logging.getLogger(__name__)

# In-memory duplicate guard: "symbol:direction" → True
# Populated from DB at first use, then kept in sync via register_confirmed()
_seen:      set[str] = set()
_seen_lock: threading.Lock = threading.Lock()
_loaded:    bool = False


def _load_active_from_db() -> None:
    """Seed the in-memory set from the DB once at first validation call."""
    global _loaded
    if _loaded:
        return
    try:
        from storage import signal_repo
        for row in signal_repo.get_active():
            _seen.add(f"{row.symbol}:{row.type}")
        _loaded = True
        log.info(f"[validator] loaded {len(_seen)} active signals into duplicate guard")
    except Exception as exc:
        log.warning(f"[validator] could not load active signals — duplicate guard starts empty: {exc}")
        _loaded = True   # don't retry on every call; accept empty start


def register_confirmed(signal: Signal) -> None:
    """Call after a signal is saved so future duplicates are caught."""
    key = f"{signal.symbol}:{signal.direction.value}"
    with _seen_lock:
        _seen.add(key)


def release(symbol: str, direction: str) -> None:
    """Call when a signal is closed/expired so that symbol+direction can trade again."""
    key = f"{symbol}:{direction}"
    with _seen_lock:
        _seen.discard(key)


def validate(result: StrategyResult, instrument: str) -> list[Signal]:
    """Filter strategy results. Returns only signals that pass all checks."""
    if not result.has_signals():
        return []

    _load_active_from_db()

    valid: list[Signal] = []
    for signal in result.signals:
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
        log.debug(f"[validator] {signal.symbol} RR={signal.risk_reward:.2f} < min {settings.min_rr}")
        return False
    return True


def _check_confidence(signal: Signal) -> bool:
    if signal.confidence < settings.min_confidence:
        log.debug(f"[validator] {signal.symbol} conf={signal.confidence:.0%} < min {settings.min_confidence:.0%}")
        return False
    return True


def _is_duplicate(signal: Signal) -> bool:
    key = f"{signal.symbol}:{signal.direction.value}"
    with _seen_lock:
        if key in _seen:
            log.debug(f"[validator] duplicate skipped: {key}")
            return True
    return False
