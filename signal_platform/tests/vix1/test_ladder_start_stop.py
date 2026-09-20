"""THE STARTING STOP — where it comes from, how it is kept, and that BOTH stop-movers count from it.

Root cause fixed (docs/OPEN.md B27, 19 Sep 2026): the ladder counted R from the stop a position carries
NOW, so after its own breakeven move it read zero risk and went blind. His EUR/USD sell of 18 Sep ran to
2.85R and closed at $0. Numbers below are that trade's: filled 1.14693, started with its stop at 1.14746
(1R = 5.3 pips), target 1.14486.
"""
import asyncio
from types import SimpleNamespace as NS

from _harness import Suite
from data import ctrader_orders
from data.ctrader_positions import Position
from monitor import position_tracker as T
from monitor import start_stops

s = Suite("THE STARTING STOP — the fixed yardstick the ladder counts from")
FILL, START, TP = 1.14693, 1.14746, 1.14486


def pos(stop, start=START, pid=242362800):
    return Position(pid, "EUR/USD", False, 38500000, FILL, stop, TP, 0.0, 0.0, 0, start_stop=start)


# ── 1. the opening order, as the broker returns it ─────────────────────────────────────────────
def order(closing=False, sl=0.0, rel=0, fill=0.0, opened=1):
    return NS(closingOrder=closing, stopLoss=sl, relativeStopLoss=rel, executionPrice=fill,
              tradeData=NS(openTimestamp=opened), utcLastUpdateTimestamp=opened)


s.check("the OPENING order's stop is the start, not the moved closing stop",
        ctrader_orders.starting_stop_from([order(True, 1.14693), order(False, 1.14746)], False), 1.14746)
# A distance is in 1/100000 of a price unit: 5.3 pips = 0.00053 = 53.
s.check("a stop given as a DISTANCE is converted (sell: above the fill)",
        round(ctrader_orders.starting_stop_from([order(rel=53, fill=1.14693)], False), 5), 1.14746)
s.check("...and below the fill on a buy",
        round(ctrader_orders.starting_stop_from([order(rel=60, fill=1.16046)], True), 5), 1.15986)
s.check("an opening order with no stop -> None (the caller then takes the first stop seen)",
        ctrader_orders.starting_stop_from([order()], True), None)

# ── 2. the count, and the lock prices, from the starting stop ───────────────────────────────────
at_be = pos(stop=FILL)                                   # breakeven has already moved the stop
s.check("stop at breakeven, price at 1.14608 -> 1.60R (was: unknown)",
        round(at_be.r_at(1.14608), 2), 1.60)
lines = {t: x for t, x, _ in T._lines(at_be, at_be.r_at(1.14555), 1.14555)}
s.check("at 2.6R the ladder asks for lock +1R at 1.14640 (entry - 1R)", round(lines["lock_1r"], 5), 1.14640)
# The trail keeps 0.2R behind since 2026-09-20 (0.1R before it), so 2.6R earns the +2.4R step.
s.check("...and trails to +2.4R at 1.14566 (1.14693 - 2.4 x 0.00053)", round(lines["trail_2.4r"], 5), 1.14566)
# ON A LIVE POSITION that level is not what is sent: the stop is placed 0.2R from the price that
# FIRES it, which on a sell is the ask. Same rung, same R, a stop the broker will actually accept.
_live = {t: x for t, x, _ in T._lines(at_be, at_be.r_at(1.14555), 1.14555, 1.14565)}
s.check("...and on the live path it is placed 0.2R above the ASK, not off the entry",
        round(_live["trail_2.4r"], 5), round(1.14565 + 0.2 * 0.00053, 5))
s.check("starting stop unknown -> R unknown -> no rung at all", pos(FILL, start=None).r_at(1.14555), None)

# ── 3. the fast watcher, on a REAL position whose stop has moved ────────────────────────────────
from monitor.trade_watcher import TradeWatcher          # noqa: E402

calls = []


async def _fake_move(p, tag, new_sl, send, price=None, quiet=False):
    calls.append((tag, None if new_sl is None else round(new_sl, 5), price))
    return True

T._auto_move = _fake_move
T.delivery_ledger.is_delivered = lambda k: False
T.delivery_ledger.mark_delivered = lambda k: None
w = TradeWatcher(lambda m: asyncio.sleep(0))


async def _prices(p, streamed):
    return 1.14610, 1.14620                              # chart (bid) 1.51R ; buy-back (ask) 1.40R

w._prices_for = _prices
asyncio.run(w._one(at_be, streamed=True))
# Breakeven is offered too (it is reached); the live stop-mover finds the stop already there and
# settles it without an amend. What matters is that the ladder goes PAST it.
lock = next((c for c in calls if c[0] == "lock_1r"), None)
s.check("the watcher reads the CHART price: 1.51R reaches lock +1R (the buy price alone would not)",
        [c[0] for c in calls], ["breakeven", "lock_1r"])
s.check("...at 1.14640, from the STARTING risk", lock[1] if lock else None, 1.14640)
s.check("...and hands the FIRING price (ask) to the safety check", lock[2] if lock else None, 1.14620)

# ── 4. learning, keeping and forgetting ─────────────────────────────────────────────────────────
start_stops._known.clear()
asked = {"n": 0}


async def _broker(pid, bullish):
    asked["n"] += 1
    return {1: (True, 1.14746), 2: (True, None), 3: (False, None)}[pid]

ctrader_orders.opening_stop = _broker
saved = {}
start_stops._persist = lambda: saved.update({str(k): v for k, v in start_stops._known.items()})
live = [pos(FILL, None, 1), pos(1.14700, None, 2), pos(1.14750, None, 3)]
asyncio.run(start_stops.learn(live))
s.check("broker answered: the opening order's stop is learned", start_stops.get(1), 1.14746)
s.check("opening order had no stop: the first stop seen is taken", start_stops.get(2), 1.14700)
s.check("broker UNREADABLE: nothing is guessed", start_stops.get(3), None)
s.check("attach hands every position its starting stop",
        [p.start_stop for p in start_stops.attach(live)], [1.14746, 1.14700, None])
asyncio.run(start_stops.learn(live))
s.check("a known position is never asked about again (only #3 is re-asked)", asked["n"], 4)
asyncio.run(start_stops.learn(live[:1]))
s.check("closed positions are forgotten", sorted(start_stops._known), [1])

# ── 5. surviving a restart ──────────────────────────────────────────────────────────────────────
from storage import strategy_state_repo                 # noqa: E402
strategy_state_repo.load = lambda key: {"1": 1.14746, "7": 1.34939} if key == "position_start_stops" else {}
start_stops._known.clear()
s.check("restored at boot", (start_stops.rehydrate(), start_stops.get(7)), (2, 1.34939))
s.teeth("without the restore the ladder would sit still", Position(
    7, "GBP/USD", False, 1, 1.34880, 1.34880, 1.34672, 0.0, 0.0, 0).r_at(1.34790) is None)

s.done()
