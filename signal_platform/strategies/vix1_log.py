"""
VIX.1's log voice — say a reason when it CHANGES, and restate it every heartbeat.

WHY (2026-07-29). VIX.1 explains itself on every scan, which is the right instinct and the wrong
volume. Measured over a 3h29m production log window: 627 VIX.1 lines, of which EUR/USD repeated

    bias=NONE: up momentum but it is NOT with the trend (1HR=-1, 4HR=1)

**209 identical times**. The information content was one line. The container's log buffer is a fixed
budget (~6,000 lines ≈ 3.5h), so that repetition is not free — it evicts everything else, including
the lines that would answer a different question.

De-duplication here loses REPETITION, never INFORMATION: a reason that changes still prints
instantly, and an unchanged one restates on the heartbeat so the current state is always in a recent
window.

THE KEY IS THE REASON SHAPE, NOT THE TEXT. Most of these lines carry a live price
("price 1.13818 is the wrong side of the lines (1.13738)"), which moves every tick — keying on the
raw string would make every line "new" and de-duplicate nothing. So DECIMAL numbers are collapsed to
`#` before keying.

Integers are deliberately KEPT. `1HR=-1, 4HR=1` is a trend reading, not a price: a flip from
`1HR=-1` to `1HR=1` is exactly the kind of change that must never be swallowed. Collapsing all
digits would have hidden it.
"""

import logging
import re

from core import stage_tracker

log = logging.getLogger("strategies.vix1")

# Decimals only — prices, pip distances, R multiples. Integers stay (trend states, bar counts).
_NUM = re.compile(r"-?\d+\.\d+")


def shape(message: str) -> str:
    """The reason's identity: the same sentence with live prices blanked out."""
    return _NUM.sub("#", message)


def say(symbol: str, message: str, logger: logging.Logger | None = None) -> bool:
    """Log `message` if this reason is new for `symbol`, or the heartbeat has elapsed.

    A line that actually prints is ALSO recorded durably. The log buffer holds ~3.5h and a restart
    empties it; the recorded row answers "what was it doing at 3am on Tuesday" long after both. Only
    the emitted lines are recorded, so the volume is the de-duplicated one — a handful per day per
    instrument, not one per scan.
    """
    # THE KEY IS (symbol, reason) — NOT the symbol alone. VIX.1 emits more than one reason per scan
    # (the bias line, then the 1M line), so a symbol-only key makes consecutive calls alternate
    # A,B,A,B; every one looks "changed" and nothing is ever suppressed. Measured on the real
    # 3h29m window that mistake gave a 33% reduction where per-reason keying gives ~99%. Each reason
    # now throttles independently, which is also what makes a genuine change still print instantly:
    # a NEW reason is a new key and speaks on first sight.
    sh = shape(message)
    # THE LAST REASON IS REMEMBERED, so a message can SAY why (added 2026-09-08). Recorded BEFORE the
    # throttle, on purpose: a reason that repeats is deliberately not re-logged, but it is still the
    # current reason, and a caller asking "why did nothing happen" must get today's answer rather
    # than the last one that happened to be new. His two EUR/USD setups of 6-7 Sep were refused nine
    # times for the identical reason, so every one of those after the first is a suppressed line.
    _last_reason[symbol] = message
    if not stage_tracker.emit("vix1", f"{symbol}:{sh}", sh, message, logger=logger or log):
        return False
    from storage import observability_repo as obs
    obs.record(obs.STAGE_EVALUATED, "vix1", symbol, detail=message)
    return True


# symbol -> the most recent reason this module was asked to say. Presentation only: nothing reads it
# to make a decision, and it is never persisted.
_last_reason: dict[str, str] = {}


def last_reason(symbol: str) -> str | None:
    """The most recent thing VIX.1 said about `symbol`, or None if it has not spoken yet.

    Exists so the stand-down message can name the actual refusal instead of "no signal". Strips the
    "[vix1] SYMBOL bias=NONE: " prefix and the trailing market-state block, both of which are for the
    log rather than for him.
    """
    msg = _last_reason.get(symbol)
    if not msg:
        return None
    head, sep, tail = msg.partition("bias=NONE:")
    text = (tail if sep else msg).split("|")[0].strip()
    return text or None


def say_always(message: str, logger: logging.Logger | None = None) -> None:
    """For the lines that must never be suppressed — a signal, or a setup invalidation. These are
    events, not states: each one is new information even when the text repeats."""
    (logger or log).info(message)
