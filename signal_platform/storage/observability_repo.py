"""
Writes to the audit trail and the heartbeat.

EVERY FUNCTION HERE IS BEST-EFFORT AND NEVER RAISES. Observability must not be able to break
trading: a failed audit write is a warning, never an exception that propagates into the scan loop or
the dispatch path. That is the whole contract of this module, and the reason each function swallows
its own errors instead of letting the caller decide.

The one thing it will NOT do is swallow silently — every failure logs at WARNING. Silent `except`
blocks are exactly what made 27 Jul undiagnosable.
"""

import logging
import re
from datetime import datetime, timedelta, timezone

from storage.db import get_session
from storage.observability_models import (
    PlatformDowntimeModel, PlatformHeartbeatModel, SignalEventModel,
    STAGE_BUILT, STAGE_DELIVERED, STAGE_DISPATCHED, STAGE_DROPPED, STAGE_EVALUATED,
    STAGE_SAVED, STAGE_VALIDATED,
)

log = logging.getLogger(__name__)

__all__ = ["record", "beat", "detect_downtime", "STAGE_BUILT", "STAGE_VALIDATED", "STAGE_SAVED",
           "STAGE_DISPATCHED", "STAGE_DELIVERED", "STAGE_DROPPED", "STAGE_EVALUATED"]

# A gap larger than this at boot counts as an outage worth recording. The scan loop runs every
# 45-60s, so anything past 5 minutes is a real absence rather than a slow tick or a clock nudge.
_DOWNTIME_THRESHOLD_S = 300


# Credentials that can ride along inside an exception string. `detail` frequently carries raw
# exception text — a DB fault can surface a connection URL, and a notifier fault a bot token — and
# these rows are long-lived and readable by anything with DB access. Scrubbed HERE, at the single
# write boundary, rather than at each call site: the next caller added would otherwise forget.
_SCRUB = (
    (re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)[^\s/:@]+:[^\s/@]+@"), r"\1***:***@"),  # url creds
    # `\w*` prefix on purpose: the real-world names are TELEGRAM_BOT_TOKEN, CTRADER_CLIENT_SECRET,
    # GOOGLE_API_KEY — a plain \b never matches those, because the preceding "_" is a word char.
    (re.compile(r"(?i)(\w*(?:password|passwd|pwd|secret|token|api[_-]?key|authorization))"
                r"(\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|\S+)"), r"\1\2***"),
    (re.compile(r"\b\d{6,}:[A-Za-z0-9_-]{30,}\b"), "***"),                            # telegram bot token
)


def _redact(text: str) -> str:
    """Strip credentials out of free text before it is persisted."""
    out = text or ""
    for pattern, repl in _SCRUB:
        out = pattern.sub(repl, out)
    return out


def record(stage: str, strategy: str, symbol: str,
           signal_id: str | None = None, detail: str = "") -> None:
    """Append one stage transition. Best-effort: a failure here must never lose a signal."""
    try:
        with get_session() as s:
            s.add(SignalEventModel(signal_id=signal_id, strategy=strategy or "",
                                   symbol=symbol or "", stage=stage,
                                   detail=_redact(detail)[:2000]))
    except Exception as exc:
        log.warning(f"[observability] could not record {stage} for {strategy}/{symbol}: "
                    f"{type(exc).__name__}: {exc}")


def beat(scans: int = 0, tick_ms: int | None = None) -> None:
    """Stamp the heartbeat. Called once per scan — its age at boot is the downtime measurement.

    `tick_ms` is how long the tick that is writing this beat took. It is the ONLY record of the scan
    loop's speed anywhere in the platform; without it the question "are ticks running slow?" can only
    be guessed at from the spacing of unrelated rows, which is how a 174-second figure got asserted
    on evidence that could not support it.
    """
    try:
        now = datetime.now(timezone.utc)
        with get_session() as s:
            row = s.get(PlatformHeartbeatModel, 1)
            if row is None:
                s.add(PlatformHeartbeatModel(id=1, beat_at=now, scans=scans, last_tick_ms=tick_ms))
            else:
                row.beat_at = now
                row.scans = (row.scans or 0) + 1
                if tick_ms is not None:
                    row.last_tick_ms = int(tick_ms)
    except Exception as exc:
        log.warning(f"[observability] heartbeat write failed: {type(exc).__name__}: {exc}")


def detect_downtime(threshold_s: int = _DOWNTIME_THRESHOLD_S) -> float | None:
    """At boot: how long were we gone? Records the span and returns it in seconds.

    Returns None when there is no previous heartbeat (first ever boot) or the gap is under the
    threshold. Reads the heartbeat BEFORE anything overwrites it, so call this at startup, ahead of
    the first `beat()`.
    """
    try:
        now = datetime.now(timezone.utc)
        with get_session() as s:
            row = s.get(PlatformHeartbeatModel, 1)
            if row is None or row.beat_at is None:
                log.info("[observability] no previous heartbeat — first boot, no downtime recorded")
                return None
            last = row.beat_at
            if last.tzinfo is None:                      # defensive; UtcDateTime should prevent it
                last = last.replace(tzinfo=timezone.utc)
            gap = (now - last).total_seconds()
            if gap < threshold_s:
                log.info(f"[observability] clean restart — {gap:.0f}s since the last heartbeat")
                return None
            s.add(PlatformDowntimeModel(
                down_from=last, down_to=now, seconds=int(gap),
                note=f"heartbeat stale at boot ({gap/60:.1f} min)"))
            log.warning(f"[observability] PLATFORM WAS DOWN for {gap/60:.1f} min "
                        f"({last:%Y-%m-%d %H:%M:%S} → {now:%Y-%m-%d %H:%M:%S} UTC) — "
                        f"no signal could have been sent in that window")
            return gap
    except Exception as exc:
        log.warning(f"[observability] downtime detection failed: {type(exc).__name__}: {exc}")
        return None


def downtime_covering(when: datetime) -> bool:
    """Was the platform down at `when`? The question to ask before blaming a strategy for silence."""
    try:
        with get_session() as s:
            hit = s.query(PlatformDowntimeModel).filter(
                PlatformDowntimeModel.down_from <= when,
                PlatformDowntimeModel.down_to >= when,
            ).first()
            return hit is not None
    except Exception as exc:
        log.warning(f"[observability] downtime lookup failed: {type(exc).__name__}: {exc}")
        return False


def recent_events(limit: int = 100) -> list:
    """Newest-first audit rows — the post-mortem entry point."""
    try:
        with get_session() as s:
            rows = (s.query(SignalEventModel)
                    .order_by(SignalEventModel.created_at.desc()).limit(limit).all())
            for r in rows:
                s.expunge(r)
            return rows
    except Exception as exc:
        log.warning(f"[observability] event read failed: {type(exc).__name__}: {exc}")
        return []


def purge_older_than(days: int = 30) -> int:
    """Keep the trail bounded. Append-only tables grow without this."""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        with get_session() as s:
            n = s.query(SignalEventModel).filter(SignalEventModel.created_at < cutoff).delete()
            return int(n or 0)
    except Exception as exc:
        log.warning(f"[observability] purge failed: {type(exc).__name__}: {exc}")
        return 0
