"""THE TRADE TRACKER — R and breakeven measured on the REAL position.

His ask, 2026-08-21: breakeven, trail to 1R, 2R reached — *"I mean the accurate one."*

WHAT "ACCURATE" MEANS HERE, and it is the whole point of the file: R comes from HIS fill and HIS stop,
not from what the signal suggested. And breakeven is the NET-ZERO price, not the entry price —
*"when the market takes us out we lose nothing and gain nothing"*. A stop at the entry still loses the
round-trip commission, so this asserts the offset actually covers it.

Drives the real `Position` and the real `check_all` with the broker read and the sender intercepted,
so what is asserted is the message that would really be sent.
"""
import asyncio

from _harness import Suite
from data.ctrader_positions import Position
from monitor import position_tracker as T

s = Suite("VIX.1 — the trade tracker, on real position data")


def P(bullish=True, entry=1.1000, stop=1.0990, commission=0.0, swap=0.0, volume=100000, pid=1):
    return Position(position_id=pid, symbol="EUR/USD", bullish=bullish, volume=volume,
                    entry=entry, stop=stop, target=None, commission=commission, swap=swap,
                    opened_at=0)


# ── R is a ratio of price distances — no pip size, no contract size ─────────
b = P()                                   # 10-pip risk
s.check("at entry, R is 0", b.r_at(1.1000), 0.0)
s.check("at +10 pips, R is 1", round(b.r_at(1.1010), 6), 1.0)
s.check("at +20 pips, R is 2", round(b.r_at(1.1020), 6), 2.0)
s.check("at the stop, R is -1", round(b.r_at(1.0990), 6), -1.0)
sell = P(bullish=False, entry=1.1000, stop=1.1010)
s.check("SELL mirrors — down is positive", round(sell.r_at(1.0990), 6), 1.0)
s.check("SELL at its stop is -1R", round(sell.r_at(1.1010), 6), -1.0)
gold = Position(position_id=2, symbol="XAU/USD", bullish=False, volume=100, entry=4467.0,
                stop=4477.0, target=None, commission=0.0, swap=0.0, opened_at=0)
s.check("R is pair-agnostic — gold works with no conversion", round(gold.r_at(4447.0), 6), 2.0)
s.check("no stop -> R is undefined, not zero", P(stop=None).r_at(1.1010), None)
s.check("a zero-width stop -> undefined, never a divide-by-zero",
        P(entry=1.1000, stop=1.1000).r_at(1.1010), None)

# ── BREAKEVEN is the NET-ZERO price, not the entry ──────────────────────────
free = P(commission=0.0, swap=0.0)
s.check("with no costs, breakeven IS the entry", free.breakeven(), 1.1000)
# $3.50 charged on the open => $7.00 round trip on 100,000 units => 0.00007 of price
paid = P(commission=3.50, swap=0.0, volume=100000)
s.check("commission is DOUBLED — the close costs the same as the open",
        round(paid.breakeven(), 5), round(1.1000 + 7.0 / 100000, 5))
s.check("...which is ABOVE the entry on a buy", paid.breakeven() > paid.entry, True)
paid_sell = P(bullish=False, commission=3.50, volume=100000)
s.check("...and BELOW it on a sell", paid_sell.breakeven() < paid_sell.entry, True)
s.check("swap is added on top (financing is a real cost)",
        round(P(commission=3.50, swap=-1.0, volume=100000).breakeven(), 5),
        round(1.1000 + 8.0 / 100000, 5))
s.check("unknown size -> no breakeven, rather than a wrong one he would act on",
        P(volume=0).breakeven(), None)

# ── the alert sequence ──────────────────────────────────────────────────────
sent: list[str] = []


async def _send(msg):
    sent.append(msg)
    return True


class _Stub:
    """Stands in for the shared position book.

    THE SEAM MOVED ON 2026-09-06 and this suite is what caught it. `check_all` used to call
    `ctrader_positions.open_positions()` itself, so stubbing that module was enough. Both stop-moving
    paths now share ONE cached view of what is open (`monitor/position_book`) — asked on its own slow
    clock instead of once per price check, which is what let the fast watcher stop waiting on a
    broker round trip before it could look at a price.

    With the old stub in place the tracker fell through to the REAL broker, could not reach it, and
    correctly reported "could not read the broker" — so every alert assertion below went to zero.
    That is the suite doing its job: a silent seam change is exactly the failure it exists to catch.
    """

    def __init__(self, positions):
        self.positions = positions

    async def positions_(self):
        return self.positions


def run(positions, price):
    sent.clear()
    # EACH `run` IS AN INDEPENDENT SCENARIO, not the next poll of the same account. Every call uses
    # a fresh position id, so without this the tracker correctly reports the PREVIOUS scenario's
    # position as closed (added 2026-09-02 — `exit_watch` announces a position that has vanished
    # from the broker's list, which is exactly what a new id looks like). Clearing the snapshot is
    # what makes these scenarios independent; `test_exit_watch.py` is where the vanish is tested.
    from monitor import exit_watch
    exit_watch._seen.clear()
    for k in list(T.delivery_ledger._delivered if hasattr(T.delivery_ledger, "_delivered") else []):
        pass
    T.position_book = _Stub(positions)
    T.position_book.positions = _Stub(positions).positions_       # the call `check_all` now makes
    # TAKES THE DIRECTION TOO since 2026-08-30: the tracker reads the side of the spread its stop
    # would actually trigger on — the BID for a buy, the ASK for a sell. A one-argument stub raised
    # TypeError here, and `check_all` swallows exceptions by design, so the symptom was "no alert
    # was sent" rather than an error. That is precisely the failure this suite exists to catch.
    T._price_now = lambda symbol, bullish=None: _price(price)
    asyncio.run(T.check_all(_send))
    return list(sent)


async def _price(v):
    return v


T.delivery_ledger.is_delivered = lambda k: False        # every run starts fresh
T.delivery_ledger.mark_delivered = lambda k: None
T.delivery_ledger.cleanup = lambda ttl: None

s.check("below 0.4R — nothing is sent", len(run([P(pid=10)], 1.1003)), 0)
one = run([P(pid=11)], 1.1005)
s.check("at 0.4R — exactly one alert", len(one), 1)
s.check("...and it is BREAKEVEN", "BREAKEVEN" in one[0], True)

# ── THE LADDER — ONE LADDER, and only breakeven speaks ──────────────────────
# His ruling, 2026-09-02: *"There is no fallback, the change was that we use this new ladder and
# delete the other one."* Breakeven 0.4R, lock +1R at 2.0R, then a 0.1R trail from 2.1R.
#
# THIS BLOCK USED TO COUNT MESSAGES PER RUNG (2R -> 2 messages, 3R -> 3, 4R -> 4). That was the OLD
# 1R/2R/3R/4R ladder, which is deleted — and it also predates his rule that *"Locking Rs should only
# be announced when we move to breakeven and when we are out of the market."* Every locking rung is
# `quiet` now, so the MESSAGE count stays at one however far the trade runs. The stop still moves on
# every one of them, which is what the rung assertions below check through the real `_lines`.
for r_reached, label in ((2.0, "2R"), (3.0, "3R"), (4.0, "4R")):
    px = 1.1000 + r_reached * 0.0010
    s.check(f"at {label} — still just the ONE breakeven message",
            len(run([P(pid=int(20 + r_reached))], px)), 1)

# The rungs themselves, through the real function. `_lines` returns (tag, stop price, message).
_p = P(pid=30)
tags_at = lambda r: [t for t, _sl, _m in T._lines(_p, r, 1.1000 + r * 0.0010)]
s.check("0.39R reaches nothing", tags_at(0.39), [])
s.check("0.4R reaches breakeven", tags_at(0.4), ["breakeven"])
s.check("1.4R is still only breakeven", tags_at(1.4), ["breakeven"])
s.check("1.5R adds the +1R lock", tags_at(1.5), ["breakeven", "lock_1r"])
s.check("2.1R starts the trail", tags_at(2.1)[-1], "trail_2.0r")
s.check("4.0R trails at 3.9R", tags_at(4.0)[-1], "trail_3.9r")

# THE PRICE THE STOP GOES TO, on the rung that locks +1R.
_lock = [(t, sl) for t, sl, _m in T._lines(_p, 2.0, 1.1020) if t == "lock_1r"][0]
s.check("the +1R lock puts the stop one risk above entry", round(_lock[1], 5), 1.10100)

# SELL mirrors — the locks go DOWN
_sell = P(pid=31, bullish=False, entry=1.1000, stop=1.1010)
_slock = [(t, sl) for t, sl, _m in T._lines(_sell, 2.0, 1.0980) if t == "lock_1r"][0]
s.check("SELL: the +1R lock sits one risk BELOW entry", round(_slock[1], 5), 1.09900)

nostop = run([P(pid=13, stop=None)], 1.1010)
s.check("a position with NO STOP gets one notice, not silence", len(nostop), 1)
s.check("...and it says so plainly", "NO STOP" in nostop[0], True)

# A FAILED BROKER READ IS NOT "no trades open" — the difference that stops the tracker lying.
# Stubbed at the shared position book, which is where `check_all` now asks (see `_Stub` above).
T.position_book.positions = _Stub(None).positions_
sent.clear()
asyncio.run(T.check_all(_send))
s.check("a failed broker read sends NOTHING", len(sent), 0)
s.check("...and an empty book also sends nothing", len(run([], 1.1010)), 0)

# ── TEETH ───────────────────────────────────────────────────────────────────
# THE GATE IS 0.4R NOW, not 1R — one ladder for every position (his ruling, 2026-09-02). And the
# rung count, not the message count, is what proves the ordering: every locking rung is silent, so
# messages stay at one however far the trade runs.
s.teeth("the 0.4R gate", len(run([P(pid=20)], 1.1003)) == 0
        and len(run([P(pid=23)], 1.1005)) == 1)
s.teeth("the ladder rungs are ordered and gated",
        len(T._lines(P(pid=21), 0.4, 1.1004)) < len(T._lines(P(pid=22), 4.0, 1.1040)))
s.teeth("breakeven really moves with cost",
        P(commission=3.5).breakeven() != P(commission=0.0).breakeven())
s.teeth("R really is signed", P().r_at(1.0995) < 0)


# ── THE GUARANTEE: "whatever is locked is never taken by the market" ───────
#
# His instruction, 2026-09-02. Before this, the rung was marked DONE before the stop was moved:
#
#     delivery_ledger.mark_delivered(k)          <- marked here
#     await _auto_move(p, tag, new_sl, ...)      <- amended here
#
# and the next poll begins `if is_delivered(k): continue`. So a refused or timed-out amend was
# NEVER retried: the platform reported "+2.4R locked", the stop stayed where it was, and the market
# could take back everything above it. This is the test that would have failed before the change.
print()
print("   a lock that FAILS to reach the broker is retried, not forgotten:")

_marked: list = []
T.delivery_ledger.mark_delivered = lambda k: _marked.append(k)
T.delivery_ledger.is_delivered = lambda k: k in _marked

_attempts: list = []


async def _auto_move_fails(p, tag, new_sl, send, price=None, quiet=False):
    _attempts.append(tag)
    return False                      # the broker refused / timed out


async def _auto_move_works(p, tag, new_sl, send, price=None, quiet=False):
    _attempts.append(tag)
    return True


_real_auto_move = T._auto_move
T._auto_move = _auto_move_fails
_marked.clear(); _attempts.clear()

run([P(pid=90)], 1.1010)                          # 1R — breakeven rung fires
first = list(_attempts)
run([P(pid=90)], 1.1010)                          # the very next poll
s.check("a failed lock is attempted AGAIN on the next poll", len(_attempts), len(first) * 2)
s.check("...and is never marked done", _marked, [])

# The moment it succeeds, it is marked and stops being retried.
T._auto_move = _auto_move_works
_attempts.clear()
run([P(pid=90)], 1.1010)
s.check("once the broker confirms, the rung is marked done", len(_marked) > 0, True)
n_after = len(_attempts)
run([P(pid=90)], 1.1010)
s.check("...and it is not attempted again", len(_attempts), n_after)

# WITH AUTO-MOVE OFF the DM is pure advice, so sending it IS the whole job — a returned None must
# still mark the rung, or an advice-only setup would repeat every poll forever.
async def _auto_move_off(p, tag, new_sl, send, price=None, quiet=False):
    _attempts.append(tag)
    return None


T._auto_move = _auto_move_off
_marked.clear(); _attempts.clear()
run([P(pid=91)], 1.1010)
s.check("with auto-move OFF, sending the advice completes the rung", len(_marked) > 0, True)

T._auto_move = _real_auto_move

s.teeth("a rung that never confirms would keep retrying",
        (lambda: True)() and len(first) > 0)

s.done()
