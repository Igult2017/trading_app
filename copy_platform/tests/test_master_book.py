"""THE MASTER'S BOOK — every change the master made during a gap reaches the followers (22 Nov 2026, plan step 2).

Real `master_book.diff` on real snapshots. In words, after a gap (restart, dropped connection, renewed token):
  * a trade the master CLOSED -> CLOSE; PARTLY closed -> REDUCE; stop / target / BREAKEVEN moved -> MODIFY;
  * a trade OPENED by hand -> OPEN; a pending order PLACED / MOVED / CANCELLED -> PLACED / AMENDED / CANCELLED;
  * a pending order that FILLED is NOT cancelled on the follower (its mirror fills by itself) and the new trade carries
    the order id — so the follower is never entered twice; one that did NOT fill is cancelled;
  * nothing changed -> nothing sent; closes and cancels come before opens;
  * the book survives being written and read back exactly.
"""
from _harness import Suite
import master_book as B
from providers.ctrader import OrderSnapshot, PositionSnapshot

s = Suite("COPY — the master's book after a gap")


def pos(pid, vol=1.0, sl=1.0950, tp=1.1100):
    return PositionSnapshot(position_id=pid, symbol="EURUSD", action="BUY", volume_lots=vol,
                            entry_price=1.1000, stop_loss=sl, take_profit=tp)


def order(oid, price=1.1050, sl=1.1000, tp=1.1150, vol=1.0):
    return OrderSnapshot(order_id=oid, symbol="EURUSD", action="BUY", volume_lots=vol, order_type="STOP",
                         price=price, stop_loss=sl, take_profit=tp)


def kinds(evs):
    return [(e["type"], (e.get("snap") or e.get("order")).position_id if e.get("snap") else e["order"].order_id)
            for e in evs]


book_p = {1: pos(1), 2: pos(2), 3: pos(3), 4: pos(4)}
book_o = {50: order(50), 51: order(51), 52: order(52)}
now_p = {2: pos(2, vol=0.5),                     # partly closed
         3: pos(3, sl=1.1000),                   # stop moved to breakeven (entry 1.1000)
         4: pos(4),                              # unchanged
         9: pos(9),                              # opened by hand during the gap
         10: pos(10)}                            # order 51 filled into this trade
now_o = {50: order(50, price=1.1060),            # pending order moved
         53: order(53)}                          # pending order placed;  52 cancelled;  51 filled
ev = B.diff(book_p, book_o, now_p, now_o, filled_from={10: 51})
got = kinds(ev)
s.check("a trade the master CLOSED during the gap -> CLOSE", ("CLOSE", 1) in got, True)
s.check("PARTLY closed -> REDUCE, by the fraction closed",
        [round(e["fraction"], 2) for e in ev if e["type"] == "REDUCE"], [0.5])
s.check("stop moved to BREAKEVEN -> MODIFY, with the new stop",
        [(e["snap"].position_id, e["snap"].stop_loss) for e in ev if e["type"] == "MODIFY"], [(3, 1.1000)])
s.check("a trade OPENED BY HAND -> OPEN with no order id (a fresh entry)",
        [(e["snap"].position_id, e["master_order_id"]) for e in ev if e["type"] == "OPEN" and e["snap"].position_id == 9],
        [(9, None)])
s.check("a pending order MOVED -> AMENDED, at its new price",
        [(e["order"].order_id, e["order"].price) for e in ev if e["type"] == "AMENDED"], [(50, 1.1060)])
s.check("a pending order PLACED -> PLACED", ("PLACED", 53) in got, True)
s.check("a pending order CANCELLED -> CANCELLED", ("CANCELLED", 52) in got, True)
s.check("a pending order that FILLED is NOT cancelled on the follower (its mirror fills by itself)",
        ("CANCELLED", 51) in got, False)
s.check("...and the trade it became carries the order id, so the follower is NOT entered a second time",
        [e["master_order_id"] for e in ev if e["type"] == "OPEN" and e["snap"].position_id == 10], [51])
s.check("an unchanged trade sends nothing", [g for g in got if g[1] == 4], [])
first_open = min(i for i, e in enumerate(ev) if e["type"] in ("OPEN", "PLACED"))
s.check("closes and cancels come BEFORE opens", all(e["type"] in ("CLOSE", "CANCELLED") for e in ev[:2]) and first_open >= 2,
        True)
s.check("nothing changed -> nothing sent", B.diff(book_p, book_o, book_p, book_o, {}), [])
s.check("a target moved (stop unchanged) is a MODIFY too",
        kinds(B.diff({7: pos(7)}, {}, {7: pos(7, tp=1.1200)}, {}, {})), [("MODIFY", 7)])

p2, o2 = B.from_json(B.to_json(book_p, book_o))
s.check("the book survives being written and read back exactly", (p2, o2), (book_p, book_o))
s.done()
