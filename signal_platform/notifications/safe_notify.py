"""TELLING HIM MUST NEVER BE ABLE TO DELAY OR BREAK A TRADE.

His instruction, 2026-09-02: *"the logic that places trades, moves it to BE and locks Rs is very
important that should not be affected by telegram messages or telegram not working. It should work
regardless because it is the lifeline of a trade. Telegram is only for messages."*

WHY THIS FILE EXISTS — the number. `notifications/dispatcher._send_text` retries **3 times** with a
**5-second** sleep between attempts, and python-telegram-bot's client defaults (read off the
installed package) are connect 5s / read 5s / write 5s. So ONE message against a dead or slow
Telegram costs up to:

    3 attempts x ~5s  +  2 sleeps x 5s  =  ~25 seconds

The fast watcher exists to move a stop **within half a second**. Awaiting a send on that path made
it up to fifty times slower — and because the watcher loops over every open position in one pass,
that stall applied to all of them, not just the one being messaged about.

THE RULE, and it is the whole file:

    Do the trade first. Tell him after. Never wait longer than a moment to tell him, and never let
    telling him fail the trade.

WHY A TIMEOUT AND NOT FIRE-AND-FORGET. A detached task would never block anything, but nothing could
then tell whether the message arrived — and `exit_watch` needs that answer to decide whether to
retry the one notice he gets that a trade is over. A bounded wait keeps the answer and caps the cost.

THREE SECONDS, chosen against the dispatcher's own ~25s worst case: long enough for a healthy send
(production completes them in well under a second — the log shows `message sent` immediately after
each `PLACED`) and short enough that several stalled positions cannot add up to a missed minute.
"""
import asyncio
import logging

log = logging.getLogger(__name__)

# The longest a trading path will ever wait to tell him something.
_TELL_TIMEOUT = 3.0


async def tell(send, message: str | None, timeout: float = _TELL_TIMEOUT) -> bool:
    """Send a message without ever blocking or breaking the caller. True iff it was delivered.

    NEVER RAISES and never waits longer than `timeout`. A trading path calls this and carries on:
    a False means "he was not told", never "the trade failed".

    `message` of None is "there is nothing to say" and returns True — a quiet rung has been handled
    as fully as a loud one, and the caller's bookkeeping should treat it as done.
    """
    if message is None:
        return True
    if send is None:
        return False
    try:
        return bool(await asyncio.wait_for(send(message), timeout=timeout))
    except asyncio.TimeoutError:
        # SAY IT IN THE LOG EVEN THOUGH THE DM DID NOT ARRIVE. A silent Telegram must not also be an
        # invisible one — this line is the only trace that he was not told.
        log.warning(f"[notify] Telegram did not answer within {timeout:g}s — message dropped, "
                    f"the trade is unaffected")
        return False
    except asyncio.CancelledError:
        raise                       # shutdown is not a send failure; let it propagate
    except Exception as exc:
        log.warning(f"[notify] send failed: {type(exc).__name__}: {exc} — "
                    f"the trade is unaffected")
        return False


# Tasks we have started and not awaited. Held so the event loop cannot garbage-collect a send
# mid-flight, and cleared as each finishes.
_in_flight: set = set()


def tell_soon(send, message: str | None, timeout: float = _TELL_TIMEOUT) -> None:
    """Send WITHOUT waiting at all. Returns immediately; the message goes out in the background.

    THIS IS THE STRONGEST FORM OF HIS RULE. `tell` caps the wait at 3 seconds, which is enough to
    stop one dead Telegram delaying a stop by half a minute — but with several open positions those
    3-second waits still queue up in front of the NEXT position's amend. Measured: two positions and
    a hung Telegram took 10 seconds for a pass that should take milliseconds.

    So where the ANSWER is not needed — the lock and breakeven messages, whose bookkeeping is
    decided by the broker's confirmation and not by Telegram — nothing is awaited at all. The trade
    is then genuinely independent of Telegram rather than merely protected from it.

    WHERE THE ANSWER IS NEEDED, `tell` is still the right call: `exit_watch` retries the one notice
    he gets that a trade is over, and `fill_watch` retries the fill report. Those are bookkeeping,
    not trading actions, and they run after the trade is already safe.

    THE EXCEPTION IS RETRIEVED. A detached task whose exception nobody reads is swallowed by the
    event loop with only an "exception was never retrieved" warning — the exact shape of the defect
    found in `copy_platform` today. The done-callback below reads it.
    """
    if message is None or send is None:
        return
    try:
        task = asyncio.get_running_loop().create_task(tell(send, message, timeout))
    except RuntimeError:
        return                       # no running loop (a test calling this synchronously)
    _in_flight.add(task)

    def _done(t: "asyncio.Task") -> None:
        _in_flight.discard(t)
        if not t.cancelled():
            exc = t.exception()      # READ it, so the loop does not report it as unretrieved
            if exc is not None:
                log.warning(f"[notify] background send failed: {type(exc).__name__}: {exc}")

    task.add_done_callback(_done)
