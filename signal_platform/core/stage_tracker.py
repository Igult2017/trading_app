"""
Emit a line when a value CHANGES, and again every heartbeat even when it has not.

WHY THIS EXISTS (2026-07-29). The container's log buffer is a fixed budget: a 6,000-line pull came
back covering 3h29m. Two opposite habits both cost you the same thing inside that budget —

  CHANGE-ONLY logging is invisible once the state settles. A producer that correctly says its piece
      once and then stays quiet for days leaves nothing in any window that misses the transition.
      Asking "what is it doing right now" then needs an out-of-band investigation.
  PER-TICK logging drowns the buffer in repetition. One producer repeated a single identical line
      209 times in that same window; the information content was one line, the cost was 209.

Neither is a bug in the producer — both are reasonable in isolation. The fix is one mechanism that
gives change-triggered producers a floor and per-tick producers a ceiling: **say it when it changes,
and say it again every `HEARTBEAT_S` regardless**, so the current state is always present in a recent
window and repetition never crowds it out.

DELIBERATELY A MECHANISM, NOT A POLICY. This module knows nothing about strategies, stages, or
trading. Callers own their own wording, their own state names and their own keys; all this decides is
WHETHER to speak. That separation is what lets independent callers share it without their rules
leaking into one another.

State is in-process and intentionally so: a restart re-emits everything on first sight, which is the
behaviour you want after a deploy. For durability across restarts the caller writes its own record
(see storage/observability_repo.record) — that is a different question from log volume.
"""

import logging
import time

log = logging.getLogger(__name__)

# Re-emit an unchanged value at least this often. 15 minutes: with 4 instruments x 2 strategies that
# is ~32 lines/hour, negligible against the buffer, and it guarantees the current state appears in
# any window longer than 15 minutes.
HEARTBEAT_S = 900

# (owner, key) -> (value, last_emitted_monotonic)
_seen: dict[tuple[str, str], tuple[str, float]] = {}


def should_emit(owner: str, key: str, value: str, heartbeat_s: float = HEARTBEAT_S) -> bool:
    """True when `value` is new for this (owner, key), or the heartbeat has elapsed.

    Calling this RESERVES the emission — it stamps the clock — so call it once per decision and act
    on the answer. Asking twice and speaking once would silently skip the next heartbeat.
    """
    now = time.monotonic()
    prev = _seen.get((owner, key))
    if prev is not None and prev[0] == value and (now - prev[1]) < heartbeat_s:
        return False
    _seen[(owner, key)] = (value, now)
    return True


def emit(owner: str, key: str, value: str, message: str = "",
         logger: logging.Logger | None = None, level: int = logging.INFO,
         heartbeat_s: float = HEARTBEAT_S) -> bool:
    """Log `message` (default `value`) if it is new or the heartbeat has elapsed. Returns whether it
    was logged, so the caller can attach a durable record to exactly the same moments."""
    if not should_emit(owner, key, value, heartbeat_s):
        return False
    (logger or log).log(level, message or value)
    return True


def current(owner: str, key: str) -> str | None:
    """The last value seen for this (owner, key) — for a caller that wants to report state without
    re-emitting it."""
    got = _seen.get((owner, key))
    return got[0] if got else None


def reset(owner: str | None = None) -> None:
    """Forget state so the next call emits. Whole-table when `owner` is None. Tests use this; so
    would a caller that wants a guaranteed line after a deliberate reconfiguration."""
    if owner is None:
        _seen.clear()
        return
    for k in [k for k in _seen if k[0] == owner]:
        del _seen[k]
