"""THE SIGNAL ENGINE'S SHARE OF THE ONE cTRADER APP (22 Nov 2026, data/ctrader_usage.py).

The website, this engine and the copier share one cTrader app. This engine used to open a new connection for every
order command with no limit; now at most CTRADER_SIGNAL_ORDER_CONNS (2) are open at once and the rest wait.
Drives the real `order_slot` and the real `StopOrderClient._run` with the broker conversation replaced by a slow fake.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from data import ctrader_usage as U                                     # noqa: E402

failed = []


def check(name, got, want):
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


async def main():
    from execution import broker
    peak = {"now": 0, "max": 0}

    async def slow(self, cmd):
        peak["now"] += 1
        peak["max"] = max(peak["max"], peak["now"])
        await asyncio.sleep(0.2)
        peak["now"] -= 1
        return broker.OrderResult(ok=True)
    broker.StopOrderClient._converse = slow
    c = broker.StopOrderClient({"ctraderId": "1"}, "demo")
    res = await asyncio.gather(*(c._run(("cancel", i)) for i in range(6)))
    check("six order commands at once all complete", sum(r.ok for r in res), 6)
    check(f"...but never more than {U.ORDER_CONNS} connections open at the same time", peak["max"], U.ORDER_CONNS)
    check("...and none left counted afterwards", U._open_orders, 0)
    check("the engine's limit is its price connection + its order connections", U.MAX_HELD, 1 + U.ORDER_CONNS)


asyncio.new_event_loop().run_until_complete(main())
print("ALL PASS" if not failed else f"{len(failed)} FAILED: {failed}")
sys.exit(1 if failed else 0)
