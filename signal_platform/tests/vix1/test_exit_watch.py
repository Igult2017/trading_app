"""SAYING WHEN THE TRADE IS OVER — and never saying it when it is not.

His report, 2026-09-02: *"When we are out it should announce because like right now i dont know
whether we are out or not."*

He was never told because nothing was watching the right thing. `signal_monitor` closes a signal on
the SIGNAL's ORIGINAL stop/target, and for VIX.1 those never move — the state that advances a
signal's stop is built for `bx_sd` only. Meanwhile the ladder moves the REAL stop to breakeven, then
+1R, then trails it. So every exit at a moved stop happens at a price the signal's original levels
never see, and `position_tracker` just stops seeing the position.

THE CASE THIS FILE GUARDS HARDEST is the one that must NEVER fire: `open_positions()` returns None
for *"I could not read the broker"* and `[]` for *"you have nothing open"*. Announcing an exit
because the broker did not answer would tell him he is out of a trade he is still in — the worst
false alarm this platform could send.
"""
import asyncio

from _harness import Suite
from monitor import exit_watch

s = Suite("EXIT WATCH — announce the close, and only a real one")


class P:
    """The smallest thing that behaves like an open position here."""
    def __init__(self, pid, symbol="GBP/USD", bullish=False, entry=1.34980, stop=1.34210):
        self.position_id, self.symbol = pid, symbol
        self.bullish, self.entry, self.stop = bullish, entry, stop


def fresh():
    """A clean module — the snapshot map and the delivery ledger both persist otherwise."""
    exit_watch._seen.clear()
    from core import delivery_ledger
    delivery_ledger.is_delivered = lambda k: False
    delivery_ledger.mark_delivered = lambda k: None


sent: list = []


async def send(msg):
    sent.append(msg)
    return True


async def send_fails(msg):
    sent.append(msg)
    return False


# ── A POSITION THAT CLOSES IS ANNOUNCED, ONCE ──────────────────────────────
fresh(); sent.clear()
p = P(42)
exit_watch.observe([p], {42: 2.6})
asyncio.run(exit_watch.announce_closed([], send))
s.check("a vanished position is announced", len(sent), 1)
s.check("...naming the symbol", "GBP/USD" in sent[0], True)
s.check("...and the position id", "#42" in sent[0], True)
s.check("...saying it is no longer open", "no longer open" in sent[0], True)
s.check("...reporting the stop it was carrying", "1.34210" in sent[0], True)
s.check("...and the best it reached", "+2.6R" in sent[0], True)
s.check("...and it is honest that the level is the STOP, not a fill",
        "not a confirmed fill price" in sent[0], True)

# ONCE. The snapshot is dropped when announced, so a second poll has nothing to say.
asyncio.run(exit_watch.announce_closed([], send))
s.check("a second poll does not announce it again", len(sent), 1)


# ── THE ONE THAT MUST NEVER FIRE ───────────────────────────────────────────
fresh(); sent.clear()
exit_watch.observe([P(43)], {43: 1.0})
asyncio.run(exit_watch.announce_closed(None, send))
s.check("a FAILED broker read announces NOTHING", len(sent), 0)
s.check("...and the position is still being watched", 43 in exit_watch._seen, True)
# ...and once the broker answers properly, the same position closing IS announced.
asyncio.run(exit_watch.announce_closed([], send))
s.check("...then a real empty read does announce it", len(sent), 1)


# ── A POSITION STILL OPEN IS NEVER ANNOUNCED ───────────────────────────────
fresh(); sent.clear()
exit_watch.observe([P(44), P(45)], {44: 0.5, 45: 1.2})
asyncio.run(exit_watch.announce_closed([P(44), P(45)], send))
s.check("two open positions produce no message", len(sent), 0)
# One closes, the other does not.
asyncio.run(exit_watch.announce_closed([P(44)], send))
s.check("only the closed one is announced", len(sent), 1)
s.check("...and it is the right one", "#45" in sent[0], True)
s.check("the survivor is still tracked", 44 in exit_watch._seen, True)


# ── A FAILED SEND IS RETRIED, NOT LOST ─────────────────────────────────────
fresh(); sent.clear()
exit_watch.observe([P(46)], {46: 3.0})
asyncio.run(exit_watch.announce_closed([], send_fails))
s.check("a failed send is attempted", len(sent), 1)
s.check("...and the position is put back for the next poll", 46 in exit_watch._seen, True)
asyncio.run(exit_watch.announce_closed([], send))
s.check("...where it succeeds", len(sent), 2)


# ── WHAT KIND OF EXIT IT WAS ───────────────────────────────────────────────
fresh(); sent.clear()
# A SELL whose stop sits BELOW entry is in profit.
exit_watch.observe([P(47, bullish=False, entry=1.34980, stop=1.34210)], {47: 2.4})
asyncio.run(exit_watch.announce_closed([], send))
s.check("a sell stopped below entry reads as profit", "in profit" in sent[0], True)

fresh(); sent.clear()
exit_watch.observe([P(48, bullish=True, entry=1.16048, stop=1.16048)], {48: 0.4})
asyncio.run(exit_watch.announce_closed([], send))
s.check("a stop at the entry reads as breakeven", "breakeven" in sent[0], True)

fresh(); sent.clear()
exit_watch.observe([P(49, bullish=True, entry=1.16048, stop=1.15986)], {49: -1.0})
asyncio.run(exit_watch.announce_closed([], send))
s.check("a buy stopped below entry reads as a loss", "losing" in sent[0], True)

# A position with no stop at all must still announce, and must not claim an R.
fresh(); sent.clear()
exit_watch.observe([P(50, stop=None)], None)
asyncio.run(exit_watch.announce_closed([], send))
s.check("a position with no stop is still announced", len(sent), 1)
s.check("...and says there is no R to report", "no R to report" in sent[0], True)


# ── THE PEAK IS THE BEST SEEN, NOT THE LAST ────────────────────────────────
fresh(); sent.clear()
exit_watch.observe([P(51)], {51: 2.6})
exit_watch.observe([P(51)], {51: 1.1})       # it came back down before closing
asyncio.run(exit_watch.announce_closed([], send))
s.check("the peak is the BEST it reached, not where it ended", "+2.6R" in sent[0], True)


# ── TEETH ──────────────────────────────────────────────────────────────────
fresh(); sent.clear()
exit_watch.observe([P(52)], {52: 1.0})
asyncio.run(exit_watch.announce_closed(None, send))
s.teeth("a None read really would have announced, if it were treated as empty", len(sent) == 0)
asyncio.run(exit_watch.announce_closed([], send))
s.teeth("...and the announcement path does work", len(sent) == 1)

s.done()
