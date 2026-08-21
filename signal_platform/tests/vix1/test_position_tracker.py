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
    def __init__(self, positions):
        self.positions = positions

    async def open_positions(self):
        return self.positions


def run(positions, price):
    sent.clear()
    for k in list(T.delivery_ledger._delivered if hasattr(T.delivery_ledger, "_delivered") else []):
        pass
    T.ctrader_positions = _Stub(positions)
    T._price_now = lambda symbol: _price(price)
    asyncio.run(T.check_all(_send))
    return list(sent)


async def _price(v):
    return v


T.delivery_ledger.is_delivered = lambda k: False        # every run starts fresh
T.delivery_ledger.mark_delivered = lambda k: None
T.delivery_ledger.cleanup = lambda ttl: None

s.check("below 1R — nothing is sent", len(run([P(pid=10)], 1.1005)), 0)
one = run([P(pid=11)], 1.1010)
s.check("at 1R — exactly one alert", len(one), 1)
s.check("...and it is BREAKEVEN", "BREAKEVEN" in one[0], True)

# ── THE LADDER — his rungs, 2026-08-21 ──────────────────────────────────────
# 2R -> lock +1R, 3R -> lock +2R, 4R -> lock +3R. The 4R rung does NOT close: the take profit sits
# on the order at 4R, so this rung exists to have +3R banked before the broker exits.
two = run([P(pid=12)], 1.1020)
s.check("at 2R — breakeven plus the first rung", len(two), 2)
s.check("...and the rung says LOCK +1R", "LOCK +1R" in two[1], True)
s.check("...naming the +1R price", "1.10100" in two[1], True)

three = run([P(pid=13)], 1.1030)
s.check("at 3R — three messages", len(three), 3)
s.check("...the last is LOCK +2R", "LOCK +2R" in three[2], True)
s.check("...naming the +2R price", "1.10200" in three[2], True)

four = run([P(pid=14)], 1.1040)
s.check("at 4R — four messages", len(four), 4)
s.check("...the last is LOCK +3R", "LOCK +3R" in four[3], True)
s.check("...and it explains the broker does the exit", "broker does the exit" in four[3], True)
s.check("...it does NOT claim to close the trade itself", "closing the trade" in four[3], False)

# ordered, and a rung not reached ends the ladder
s.check("at 2.9R the 3R rung has NOT fired",
        any("LOCK +2R" in m for m in run([P(pid=15)], 1.1029)), False)

# SELL mirrors — the locks go DOWN
sells = run([P(pid=16, bullish=False, entry=1.1000, stop=1.1010)], 1.0980)
s.check("SELL: at 2R it locks +1R below the entry", "LOCK +1R" in sells[1], True)
s.check("...at 1.09900, not above", "1.09900" in sells[1], True)

nostop = run([P(pid=13, stop=None)], 1.1010)
s.check("a position with NO STOP gets one notice, not silence", len(nostop), 1)
s.check("...and it says so plainly", "NO STOP" in nostop[0], True)

# A FAILED BROKER READ IS NOT "no trades open" — the difference that stops the tracker lying.
T.ctrader_positions = _Stub(None)
sent.clear()
asyncio.run(T.check_all(_send))
s.check("a failed broker read sends NOTHING", len(sent), 0)
s.check("...and an empty book also sends nothing", len(run([], 1.1010)), 0)

# ── TEETH ───────────────────────────────────────────────────────────────────
s.teeth("the 1R gate", len(run([P(pid=20)], 1.1009)) == 0)
s.teeth("the ladder rungs are ordered and gated",
        len(run([P(pid=21)], 1.1020)) < len(run([P(pid=22)], 1.1040)))
s.teeth("breakeven really moves with cost",
        P(commission=3.5).breakeven() != P(commission=0.0).breakeven())
s.teeth("R really is signed", P().r_at(1.0995) < 0)

s.done()
