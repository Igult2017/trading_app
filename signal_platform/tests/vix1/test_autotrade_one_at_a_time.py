"""ONE TRADE AT A TIME, AND THE BEST OF SIGNALS THAT ARRIVE TOGETHER — through the real placer.

HIS RULE, 15 Nov 2026: *"if all the pairs have signals at the same time, we should choose the best one
because we only trade 1 signal at a time."* And: *"Trades that are not filled are never counted by the
broker."* (the daily cap — covered in `test_guard_live_order.py` §3).

Best = his grade (the confidence), then the smaller spread share of the stop, then first to arrive.
"""
import asyncio

from _harness import Suite

from core.types import Direction, Signal
from execution import best_signal, decision_log, guards, placer

s = Suite("AUTOTRADE — one trade at a time; the best signal of a batch is the one placed")
best_signal._WINDOW_S = 0.05            # the real window is 5 s; the rule, not the wait, is tested
loop = asyncio.new_event_loop()


def sig(symbol, conf, entry, sl, spread=0.0, side=Direction.SELL):
    return Signal(symbol=symbol, direction=side, strategy_id="vix1", strategy_name="VIX.1",
                  entry_price=entry, stop_loss=sl, take_profit=entry - 4 * (sl - entry),
                  confidence=conf, spread_used=spread)


async def together(*signals, gap=0.0):
    async def one(x, i):
        await asyncio.sleep(gap * i)
        return await best_signal.take_turn(x)
    return await asyncio.gather(*[one(x, i) for i, x in enumerate(signals)])


# ── 1. the choice ──────────────────────────────────────────────────────────
A = sig("GBP/USD", 0.85, 1.30000, 1.30100)              # grade A
B = sig("EUR/USD", 0.70, 1.10000, 1.10100)              # grade B/C
got = loop.run_until_complete(together(B, A))
s.check("of two together, the A-grade is placed even though it arrived second", got[1], None)
s.check("...and the other is refused", got[0] is not None, True)
s.check("...saying which signal beat it", "GBP/USD SELL" in (got[0] or ""), True)

tight = sig("EUR/USD", 0.85, 1.10000, 1.10040, spread=0.00012)   # spread = 30% of a 4-pip stop
wide = sig("GBP/USD", 0.85, 1.30000, 1.30120, spread=0.00012)    # spread = 10% of a 12-pip stop
got = loop.run_until_complete(together(tight, wide))
s.check("same grade → the one the spread eats LEAST wins", (got[0] is not None, got[1]), (True, None))
s.teeth("the tie-break really reads the spread share",
        best_signal.score(wide) > best_signal.score(tight))

x, y = sig("EUR/USD", 0.85, 1.1, 1.101), sig("GBP/USD", 0.85, 1.3, 1.301)
got = loop.run_until_complete(together(x, y))
s.check("a full tie goes to the one that arrived first", (got[0], got[1] is not None), (None, True))

s.check("a lone signal is simply placed", loop.run_until_complete(best_signal.take_turn(A)), None)
got = loop.run_until_complete(together(B, A, gap=0.2))
s.check("signals further apart than the window are each placed", got, [None, None])

# ── 2. the placer really asks it, after the guards and before the broker ─
calls = []


async def _no(*a, **k):
    calls.append("refused")


class _Fake:
    def __init__(self, *a, **k):
        pass

    async def place_stop(self, **k):
        calls.append("SENT")
        raise AssertionError("must not reach the broker")


_real = (decision_log.refused, guards.check, placer._live_book, placer._usd_jpy_for)
decision_log.refused = _no
guards.check = lambda *a, **k: None
guards.scope_refusal = lambda *a, **k: None   # the clock is not what this tests
placer._live_book = lambda: asyncio.sleep(0, result=([], set()))
placer._usd_jpy_for = lambda sym: asyncio.sleep(0, result=None)
import execution.broker as _broker   # noqa: E402
_real_client = _broker.StopOrderClient
_broker.StopOrderClient = _Fake


async def both():
    return await asyncio.gather(
        placer.place_for_signal(B, {}, "demo", 10_000.0, risk_base=10_000.0),
        placer.place_for_signal(A, {}, "demo", 10_000.0, risk_base=10_000.0),
        return_exceptions=True)

loop.run_until_complete(both())
s.check("through the real placer: ONE reaches the broker, the other is refused", sorted(calls),
        ["SENT", "refused"])
src = open(placer.__file__, encoding="utf-8").read()
s.teeth("the window is asked AFTER the guards and BEFORE the order goes out",
        src.index("why = guards.check(") < src.index("await best_signal.take_turn(signal)")
        < src.index("StopOrderClient(creds, account_type).place_stop("))

decision_log.refused, guards.check, placer._live_book, placer._usd_jpy_for = _real
_broker.StopOrderClient = _real_client
s.done()
