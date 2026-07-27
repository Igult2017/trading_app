"""
VIX.1 — SIGNAL SPACING. How long the instrument stays shut after a signal is taken.

THE RULE (user, 2026-07-27, in his words):

    "if a viable signal is detected immediate[ly] the previous one was taken and is still running,
     it must be after 3 momentum candles preceding the 1HR momentum candle where the first signal
     was taken has been achieved. This ensures that the previous signal has been completed and there
     are no two signals at the same time. However, if the first signal was a loss, the second one if
     meets conditions can be fired. This only applies for signals from the same instrument."

Which is:

  SCOPE      the INSTRUMENT. EUR/USD's state never gates GBP/USD, and the gate covers BOTH
             directions on that instrument — this is about the instrument being busy, not about
             direction. It applies to buy and sell signals alike.
  WHEN       only while the previous signal on that instrument is STILL RUNNING (status active —
             a resting stop order is just as live as a filled one).
  THE GATE   at least _MIN_CANDLES momentum candles must have CLOSED after the 1HR momentum candle
             that produced the previous signal. That candle is the ANCHOR, not the signal's
             creation time.
  RELEASE    a CLOSED previous signal voids the gate entirely — explicitly including a LOSS. (A win
             closes by reaching target, which is the very thing the 3 candles stand in for, so
             either outcome releases it.)

WHY 3 CANDLES: it is the user's proxy for "the previous signal has had room to reach 2R". It is a
TIME test expressed in the market's own units rather than in minutes — a quiet session and a fast one
deserve different waits, and momentum candles measure that directly.

WHAT IT WOULD HAVE PREVENTED. On 27 Jul three EUR/USD sell setups appeared: 07:00 (grade A), 11:00
(grade A), 13:00 (grade B). A signal was taken off the 07:00 candle at 11:17. Only TWO momentum
candles closed after that anchor before the 13:00 setup, so this gate refuses it — and the 13:00
setup is the one that was delivered, 21 pips lower after three completed legs down, and it failed.

DERIVED, NEVER STORED. The count is replayed from the H1 window on every call and the "is one still
running" question is asked of the DATABASE, not of process memory. Nothing here survives in RAM, so a
restart, a redeploy or a second process cannot desynchronise it. This is deliberate: the 27 Jul
duplicate-signal defect was caused precisely by an in-memory set that a restart emptied.
"""

import logging

from core.types import Candle
from shared.mtf_utils import to_minutes
from strategies.vix1_momentum import is_momentum_candle

log = logging.getLogger(__name__)

# The user's number. A signal may not be taken until this many momentum candles have closed since
# the anchor, while a previous signal on the same instrument is still running.
_MIN_CANDLES = 3

# Any momentum candle counts toward the total, buy or sell (user, 2026-07-27: "its for both sell and
# buy signals"). Kept as a named constant so the direction scope is a one-line change if revisited.
_COUNT_BOTH_DIRECTIONS = True


def _closed_by(candle: Candle, when: float, tf: str = "H1") -> bool:
    """Had this candle CLOSED at `when`? A level may only be read from a closed candle."""
    return candle.time + to_minutes(tf) * 60 <= when


def _is_momentum(h1: list[Candle], i: int) -> bool:
    if _COUNT_BOTH_DIRECTIONS:
        return is_momentum_candle(h1, i, True) or is_momentum_candle(h1, i, False)
    bullish = h1[i].close > h1[i].open
    return is_momentum_candle(h1, i, bullish)


def anchor_time(h1: list[Candle], taken_at: float) -> int | None:
    """The momentum candle that produced the signal taken at `taken_at`.

    Derived rather than stored: it is the freshest momentum candle that had already CLOSED when the
    signal was created, which is by construction the one the bias was reading. Returns None when the
    window no longer reaches back that far — in which case the gate opens rather than guessing.
    """
    for i in range(len(h1) - 1, 0, -1):
        if not _closed_by(h1[i], taken_at):
            continue
        if _is_momentum(h1, i):
            return h1[i].time
    return None


def candles_since(h1: list[Candle], anchor: int, now: float) -> int:
    """How many momentum candles have CLOSED strictly after the anchor candle."""
    return sum(1 for i in range(len(h1))
               if h1[i].time > anchor and _closed_by(h1[i], now) and _is_momentum(h1, i))


def check(h1: list[Candle], symbol: str, strategy_id: str, now: float) -> tuple[bool, str]:
    """May a new signal be taken on this instrument right now?

    Returns (allowed, reason). The reason is always populated — a refusal the log cannot explain is
    the failure mode this whole change exists to remove.
    """
    try:
        from storage import signal_repo
        live = [r for r in signal_repo.get_active()
                if (r.strategy or "") == strategy_id and (r.symbol or "") == symbol]
    except Exception as exc:
        # Fail OPEN: the one-at-a-time rule and the DB uniqueness constraint still stand behind
        # this, so a DB blip must not silently mute the strategy. Loudly, though — never silently.
        log.warning(f"[vix1_spacing] {symbol}: could not read active signals "
                    f"({type(exc).__name__}: {exc}) — allowing, other guards still apply")
        return True, "spacing not evaluated (DB unavailable)"

    if not live:
        return True, "no signal running on this instrument"

    # Oldest running signal is the one whose anchor governs the wait.
    prev = min(live, key=lambda r: r.created_at)
    taken_at = prev.created_at.timestamp()
    anchor = anchor_time(h1, taken_at)
    if anchor is None:
        log.info(f"[vix1_spacing] {symbol}: previous signal's momentum candle is outside the H1 "
                 f"window — cannot measure spacing, allowing")
        return True, "anchor outside the window"

    n = candles_since(h1, anchor, now)
    if n >= _MIN_CANDLES:
        return True, f"{n} momentum candles since the running signal's setup (need {_MIN_CANDLES})"
    return False, (f"only {n} of {_MIN_CANDLES} momentum candles since the running signal's setup "
                   f"— that signal has not had room to reach 2R yet")
