"""AUTOTRADE REPORTS TO HIS DM — what was placed, what was refused, and where it actually filled.

HIS ASK, 2026-08-31: *"make sure those trades placed by autotrade are also sent to DM so that I can
review them later and see how well they were placed to help me improve autotrading."*

WHAT WAS ACTUALLY MISSING. `placer.fill_report` already produced the exact comparison he wants —
modelled entry beside actual fill, slippage in pips and as a share of the trade's own risk. **It had
never run once: nothing called it.** Its own docstring calls it *"the deliverable"* and *"the
point"*, and the measurement the whole autotrade feature exists to produce was never wired up. A
placement existed only as a line in the container log, which every deploy destroys.

THE CHECK THAT MATTERS MOST IS THE MATCH. A `Position` carries no order id, so a fill is matched to
an order by symbol + side + volume, opened after we placed. The tracker also sees trades he opened
BY HAND, and reporting a manual fill as autotrade's would corrupt the very number this exists to
produce — so every way that match can be wrong is asserted below.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
import asyncio
from datetime import datetime, timedelta, timezone

from _harness import Suite

from execution import placer
from execution.placer import fill_report, placement_message, refusal_message, _intent
from execution.fill_watch import _matches, check_fills

s = Suite("AUTOTRADE — placed, stood down, and where it really filled")

PLACED_AT = datetime(2026, 8, 31, 9, 0, tzinfo=timezone.utc)


def intent(**kw):
    base = dict(symbol="GBP/USD", side="SELL", entry=1.35298, sl=1.35540, tp=1.34331,
                lots=0.2, volume=20_000, stop_pips=24.2, placed_at=PLACED_AT, strategy="VIX.1")
    base.update(kw)
    return base


class Pos:
    """The fields fill_watch reads off a real `Position`."""
    def __init__(self, symbol="GBP/USD", bullish=False, volume=20_000,
                 entry=1.35280, opened_at=None):
        self.symbol = symbol
        self.bullish = bullish
        self.volume = volume
        self.entry = entry
        self.opened_at = opened_at if opened_at is not None else int(PLACED_AT.timestamp()) + 120


# ── THE MESSAGE HE GETS WHEN AN ORDER GOES OUT ──────────────────────────────
_intent.clear()
_intent["ord-1"] = intent()
msg = placement_message("ord-1")
for want in ("AUTOTRADE PLACED", "GBP/USD", "SELL", "VIX.1", "1.35298", "1.35540", "1.34331",
             "0.2 lots", "24.2 pips", "ord-1"):
    s.check(f"the placement DM states {want!r}", want in msg, True)
s.check("...and says it is resting, not filled", "not yet filled" in msg, True)
s.check("...and states the reward-to-risk it was placed at", "4.0R" in msg, True)
s.check("an unknown order id produces no message rather than a broken one",
        placement_message("nope"), None)

# An order with no target must not crash the message or invent an R.
_intent["ord-notp"] = intent(tp=None)
no_tp = placement_message("ord-notp")
s.check("no target -> the DM still sends", "AUTOTRADE PLACED" in no_tp, True)
s.check("...and claims no R it cannot compute", "R" in no_tp.split("lots")[1], False)


# ── AND WHEN IT REFUSES ─────────────────────────────────────────────────────
# One per signal, never per scan: guards.check runs once, at dispatch.
r = refusal_message("EUR/USD", "BUY", "VIX.1", "outside the permitted sessions — now: asian")
for want in ("STOOD DOWN", "EUR/USD", "BUY", "outside the permitted sessions"):
    s.check(f"the stand-down DM states {want!r}", want in r, True)
s.check("...and is clear the SIGNAL still stands", "the signal stands" in r, True)


# ── THE MATCH: is this position really our order's fill? ────────────────────
i = intent()
s.check("same symbol, side, volume, opened after -> ours", _matches(i, Pos()), True)
s.check("a different SYMBOL is not ours", _matches(i, Pos(symbol="EUR/USD")), False)
s.check("the opposite SIDE is not ours", _matches(i, Pos(bullish=True)), False)
s.check("a different VOLUME is not ours (his manual trade on the same pair)",
        _matches(i, Pos(volume=10_000)), False)
s.check("a position already open BEFORE we placed is not ours",
        _matches(i, Pos(opened_at=int(PLACED_AT.timestamp()) - 60)), False)
s.check("opened in the same second as the placement still counts",
        _matches(i, Pos(opened_at=int(PLACED_AT.timestamp()))), True)


# ── SLIPPAGE: the number the whole feature exists to produce ────────────────
# A SELL filled LOWER than modelled is WORSE — it triggers into the move and pays the spread.
_intent.clear()
_intent["ord-2"] = intent()
rep = fill_report("ord-2", 1.35280, PLACED_AT + timedelta(minutes=3, seconds=5))
s.check("the fill report names both prices", "1.35298" in rep and "1.35280" in rep, True)
s.check("a SELL filled BELOW the model is reported as worse", "WORSE than modelled" in rep, True)
s.check("...with the slippage in pips", "-1.8 pips" in rep, True)
s.check("...as a share of the trade's own risk", "7% of the 24.2p stop" in rep, True)
s.check("...and how long it rested", "3m05s" in rep, True)

_intent["ord-3"] = intent(side="BUY", entry=1.30000, sl=1.29800, tp=1.30400, stop_pips=20.0)
better = fill_report("ord-3", 1.29990)
s.check("a BUY filled BELOW the model is better", "better" in better, True)


# ── SENT ONCE, AND NEVER LOST ───────────────────────────────────────────────
_intent.clear()
_intent["ord-4"] = intent()
sent: list[str] = []


async def ok(m):
    sent.append(m)
    return True


asyncio.run(check_fills([Pos()], ok))
s.check("a matching position produces exactly one fill report", len(sent), 1)
s.check("...and it is the fill report, not the placement", "FILL vs MODEL" in sent[0], True)

asyncio.run(check_fills([Pos()], ok))
s.check("polling again does NOT send it twice", len(sent), 1)

# A failed send must not lose the record — it is the only evidence the order filled.
_intent.clear()
_intent["ord-5"] = intent()
tries: list[str] = []


async def fails(m):
    tries.append(m)
    return False


asyncio.run(check_fills([Pos()], fails))
s.check("a failed send is retried, not dropped", "ord-5" in _intent, True)
asyncio.run(check_fills([Pos()], ok))
s.check("...and lands on the next poll", len(sent), 2)

# Nothing to match, and a broker read that failed, must both be quiet.
before = len(sent)
asyncio.run(check_fills([], ok))
asyncio.run(check_fills(None, ok))
s.check("no positions -> nothing sent", len(sent), before)


# ── TEETH ───────────────────────────────────────────────────────────────────
# Matching on symbol+side alone would claim his manual trade as autotrade's fill.
naive = lambda i, p: i["symbol"] == p.symbol and (i["side"] == "BUY") == bool(p.bullish)
s.teeth("a symbol+side-only match would claim a manual trade of a different size",
        naive(intent(), Pos(volume=10_000)) and not _matches(intent(), Pos(volume=10_000)))

# And a placement DM that never sent would leave the log as the only record — which deploys destroy.
_intent.clear()
s.teeth("no intent -> no message, rather than a half-built one", placement_message("gone") is None)

s.done()
