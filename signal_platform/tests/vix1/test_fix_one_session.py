"""test_fix_one_session.py — run with:
    cd signal_platform && python tests/vix1/test_fix_one_session.py

ONE live-price (FIX) connection per login, never two (17 Nov 2026). His report: *"Why does FIX data flow begin
experiencing outage immediately autotrader places a trade?"* — live log: the GBP/JPY trade filled 09:04:41; the trade
watcher opened its OWN second connection with the same login; the broker refused it at 09:04:54 ("closed the connection
without replying"); ~30 s on polled prices until a retry got in at 09:05:25. The entry watcher's 5-pair connection was
healthy the whole time. Fix: the trade watcher BORROWS that connection (`fix_quotes.shared_stream`).
"""
import asyncio
from pathlib import Path

from _harness import Suite

import data.fix_quotes as FQ                        # noqa: E402
from monitor.trade_watcher import TradeWatcher      # noqa: E402

s = Suite("FIX — one connection, borrowed by the trade watcher, never a second logon")


class _Fake:
    """Stands in for a live connection: what `shared_stream` and the watcher read, and nothing else."""
    def __init__(self, pairs, connected=True):
        self.subscribed = tuple(pairs)
        self.book = type("B", (), {"connected": connected})()
        self.sinks, self.closed = [], 0
    connected = property(lambda self: self.book.connected)
    def on_bid_tick(self, fn): self.sinks.append(fn)
    async def close(self): self.closed += 1


def reset(*streams):
    FQ._STREAMS.clear()
    FQ._STREAMS.update(streams)


five = _Fake(["EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY", "XAU/USD"])
print("1. which connection is offered:")
reset(five)
s.check("the entry watcher's 5-pair connection covers GBP/JPY", FQ.shared_stream(["GBP/JPY"]) is five, True)
s.check("...and two traded pairs at once", FQ.shared_stream(["GBP/JPY", "XAU/USD"]) is five, True)
s.check("a pair it does not stream -> none (never a guess)", FQ.shared_stream(["BTC/USD"]), None)
reset(_Fake(["GBP/JPY"], connected=False))
s.check("a connection that is down is never offered", FQ.shared_stream(["GBP/JPY"]), None)
narrow = _Fake(["GBP/JPY"])
reset(narrow, five)
s.check("of two covering connections, the broader one is borrowed", FQ.shared_stream(["GBP/JPY"]) is five, True)

print("\n2. the trade watcher BORROWS, never opens, never closes:")
built = []
_real = FQ.FixQuoteStream
FQ.FixQuoteStream = lambda *a, **k: built.append(1) or _real(*a, **k)
try:
    reset(five)
    w = TradeWatcher(None)
    s.check("a filled GBP/JPY trade -> borrows the live connection", asyncio.run(w._ensure_stream(["GBP/JPY"])), True)
    s.check("...it is the entry watcher's connection", w._stream is five, True)
    s.check("...its tick wake-up is registered once", len(five.sinks), 1)
    asyncio.run(w._ensure_stream(["GBP/JPY"]))
    s.check("...and not again on the next pass", len(five.sinks), 1)
    asyncio.run(w._drop_stream())
    s.check("dropping it NEVER closes the entry watcher's connection", five.closed, 0)
    reset()
    s.check("no connection covering the pair -> polled prices (False)", asyncio.run(w._ensure_stream(["GBP/JPY"])), False)
    s.check("TEETH — no second FIX connection was ever built", built, [])
finally:
    FQ.FixQuoteStream = _real

print("\n3. wiring — exactly ONE production file may open a FIX connection:")
root = Path(__file__).resolve().parents[2]
makers = sorted(f.relative_to(root).as_posix() for f in root.rglob("*.py")
                if not f.relative_to(root).as_posix().startswith("tests/")
                and "FixQuoteStream(" in f.read_text(encoding="utf-8", errors="replace")
                and f.name != "fix_quotes.py")
s.teeth("only monitor/entry_watcher.py opens the FIX connection", makers == ["monitor/entry_watcher.py"])

reset()
s.done()
