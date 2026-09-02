"""THE TRADE MUST NOT DEPEND ON TELEGRAM. Not for correctness, and not for SPEED.

His instruction, 2026-09-02: *"the logic that places trades, moves it to BE and locks Rs is very
important that should not be affected by telegram messages or telegram not working. It should work
regardless because it is the lifeline of a trade. Telegram is only for messages."*

THE NUMBER THIS FILE EXISTS FOR. `notifications/dispatcher._send_text` retries 3 times with 5-second
sleeps, and python-telegram-bot's client timeouts are 5s each — so one message against a dead
Telegram costs up to ~25 SECONDS. The send used to be awaited BEFORE the stop was moved, on the fast
watcher whose whole purpose is to act within half a second, and inside a loop covering every open
position. A Telegram outage could therefore delay every stop on the account by half a minute.

These tests drive the REAL functions with a deliberately broken Telegram: one that hangs, one that
raises, one that refuses. In every case the stop must still move, and the pass must still be quick.
"""
import asyncio
import time

from _harness import Suite
from notifications import safe_notify as notify

s = Suite("TELEGRAM INDEPENDENCE — the trade happens whatever Telegram does")


# ── THE HELPER EVERY TRADING PATH NOW USES ─────────────────────────────────
async def hangs(msg):
    await asyncio.sleep(30)          # a Telegram that never answers
    return True


async def raises(msg):
    raise RuntimeError("telegram exploded")


async def refuses(msg):
    return False


async def works(msg):
    return True


t0 = time.monotonic()
got = asyncio.run(notify.tell(hangs, "hello"))
elapsed = time.monotonic() - t0
s.check("a HANGING Telegram returns instead of blocking for ever", got, False)
s.check(f"...and gives up quickly (took {elapsed:.1f}s)", elapsed < 5.0, True)
s.check("...well inside the ~25s the dispatcher would have taken", elapsed < 25.0, True)

s.check("a RAISING send does not propagate", asyncio.run(notify.tell(raises, "hi")), False)
s.check("a REFUSING send simply reports False", asyncio.run(notify.tell(refuses, "hi")), False)
s.check("a working send reports True", asyncio.run(notify.tell(works, "hi")), True)
s.check("nothing to say is not a failure", asyncio.run(notify.tell(works, None)), True)
s.check("no sender at all is handled", asyncio.run(notify.tell(None, "hi")), False)


# ── THE REAL PATH: the stop moves even when Telegram is dead ───────────────
from monitor import position_tracker as T
from data.ctrader_positions import Position

order: list = []


def P(pid=1, entry=1.1000, stop=1.0990):
    return Position(position_id=pid, symbol="EUR/USD", bullish=True, volume=100000,
                    entry=entry, stop=stop, target=None, commission=0.0, swap=0.0,
                    opened_at=0)


async def _price(v):
    return v


T.delivery_ledger.is_delivered = lambda k: False
T.delivery_ledger.mark_delivered = lambda k: None
T.delivery_ledger.cleanup = lambda ttl: None
T._price_now = lambda symbol, bullish=None: _price(1.1010)     # 1R reached


class _Stub:
    def __init__(self, positions): self.positions = positions
    async def open_positions(self): return self.positions


T.ctrader_positions = _Stub([P(pid=70)])


_amend_times: list = []


async def _auto_move_records(p, tag, new_sl, send, price=None, quiet=False):
    order.append(("amend", p.position_id))
    _amend_times.append(time.monotonic())
    return True


T._auto_move = _auto_move_records


async def _send_hangs(msg):
    order.append(("send", None))
    await asyncio.sleep(30)
    return True


# A DEAD TELEGRAM MUST NOT STOP — OR DELAY — THE STOP MOVE.
order.clear()
t0 = time.monotonic()
asyncio.run(T.check_all(_send_hangs))
elapsed = time.monotonic() - t0
kinds = [k for k, _ in order]
s.check("the stop is STILL moved while Telegram hangs", "amend" in kinds, True)
s.check(f"...and the whole poll stays quick (took {elapsed:.2f}s)", elapsed < 1.0, True)

# THE ORDER MATTERS, and this is the check that catches a future reordering: the amend must be
# attempted BEFORE anything is sent, so a slow send can never sit in front of it.
s.check("the amend happens BEFORE the message", kinds.index("amend") < kinds.index("send")
        if "send" in kinds else True, True)

# A RAISING Telegram must not break the poll either.
order.clear()
asyncio.run(T.check_all(raises))
s.check("the stop is still moved while Telegram RAISES", "amend" in [k for k, _ in order], True)

# ONE HUNG POSITION MUST NOT DELAY THE NEXT. Two positions, both must be amended.
T.ctrader_positions = _Stub([P(pid=71), P(pid=72)])
order.clear(); _amend_times.clear()
t0 = time.monotonic()
asyncio.run(T.check_all(_send_hangs))
elapsed = time.monotonic() - t0
amended = sorted(pid for k, pid in order if k == "amend")
s.check("BOTH positions are amended despite a hanging Telegram", amended, [71, 72])

# THE MEASUREMENT THAT MATTERS is when the LAST STOP MOVED, not when the poll finished. The exit
# and fill reports legitimately wait on Telegram — they need its answer to know whether to retry —
# but they now run AFTER every amend, so they cost the trade nothing. Measuring total poll time
# would fail for the right behaviour and hide the wrong one.
to_last_amend = (max(_amend_times) - t0) if _amend_times else 999
s.check(f"...and NEITHER amend waited on Telegram ({to_last_amend:.2f}s to the last one)",
        to_last_amend < 1.0, True)
s.check("the reports run after the amends, so the poll itself may still wait", elapsed >= to_last_amend,
        True)


# ── NO RAW SENDS LEFT ON THE TRADING PATHS ─────────────────────────────────
# A future edit that awaits Telegram directly would reintroduce the whole defect, and it would not
# be caught by behaviour tests if the stub happened to be fast. So the source is checked too.
import os
import re

_HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _no_raw_sends(rel: str) -> list[str]:
    src = open(os.path.join(_HERE, rel), encoding="utf-8").read()
    src = re.sub(r"#.*", "", src)                     # comments quote the old code deliberately
    return [ln.strip() for ln in src.splitlines()
            if re.search(r"await\s+(self\.)?send\s*\(", ln)
            or re.search(r"await\s+notify\s*\(", ln)]


for rel in ("monitor/position_tracker.py", "monitor/trade_watcher.py",
            "monitor/exit_watch.py", "monitor/entry_watcher.py",
            "execution/fill_watch.py", "execution/placer.py"):
    s.check(f"{rel.split('/')[-1]} awaits no raw Telegram send", _no_raw_sends(rel), [])


# ── TEETH ──────────────────────────────────────────────────────────────────
# Prove the hang is real: awaiting the same sender directly really does block for ages.
async def _direct():
    t = time.monotonic()
    try:
        await asyncio.wait_for(hangs("x"), timeout=6.0)
    except asyncio.TimeoutError:
        pass
    return time.monotonic() - t


s.teeth("the hanging sender really would have blocked", asyncio.run(_direct()) > 5.0)
s.teeth("...while no amend was delayed at all", to_last_amend < 1.0)


# ── ONE BAD POSITION MUST NOT COST THE OTHERS THEIR STOP MOVE ──────────────
#
# "It should never fail." Everything for a position used to run inside one try/except covering the
# WHOLE poll, so anything raising while handling position 1 aborted the pass and positions 2 and 3
# never had their stops looked at. On the 0.5s watcher that is worse still: `run_forever` catches
# the abort by sleeping 30 SECONDS, so one odd position switched the fast path off for half a
# minute — for every trade on the account.
print()
print("   a fault on one position does not stop the others:")

_seen_positions: list = []
_real_one = T._one_position


async def _one_explodes_on_71(p, send, r_seen):
    _seen_positions.append(p.position_id)
    if p.position_id == 71:
        raise RuntimeError("this position is broken")
    r_seen[int(p.position_id)] = 1.0


T._one_position = _one_explodes_on_71
T.ctrader_positions = _Stub([P(pid=70), P(pid=71), P(pid=72)])
_seen_positions.clear()
asyncio.run(T.check_all(works))
s.check("every position is still attempted after one raises", sorted(_seen_positions), [70, 71, 72])

# And the poll as a whole still completes — it must not propagate.
raised = None
try:
    _seen_positions.clear()
    asyncio.run(T.check_all(works))
except Exception as exc:
    raised = type(exc).__name__
s.check("...and the poll itself does not raise", raised, None)

T._one_position = _real_one

s.teeth("the exploding position really does raise",
        _seen_positions == [70, 71, 72])

s.done()
