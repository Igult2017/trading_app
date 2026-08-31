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

# ── THE BROKER REFUSING, WHICH REACHED NOBODY ───────────────────────────────
# On 31 Aug the FIRST order autotrade ever attempted was refused, and the only record was a log line
# that the next deploy destroyed. Guard refusals and successes both reported; this one did not.
print()
print("   when the BROKER says no:")
from execution.placer import rejection_message

rej = rejection_message("XAU/USD", "SELL", "VIX.1", 0.15, 4433.96, 4437.39, 4420.24,
                        "INVALID_REQUEST Order price has more digits than symbol allows. Allowed 2 digits")
for want in ("BROKER REFUSED", "XAU/USD", "SELL", "4433.96", "4437.39", "0.15 lots", "Allowed 2 digits"):
    s.check(f"the rejection DM states {want!r}", want in rej, True)
s.check("...and is clear nothing is resting at the broker", "nothing is resting" in rej, True)
s.check("...and does not claim the signal was wrong", "the signal stands" in rej, True)


# ── GOLD PRECISION: the defect that caused it ───────────────────────────────
# The broker refused "4433.959 has more digits than symbol allows. Allowed 2 digits", and its live
# quote the same day was 4436.69 — two decimals. Both say gold is 2; the table said 3.
from shared.pip import price_digits as _pd, pip_size as _ps
print()
print("   gold precision:")
s.check("gold prices round to 2 decimals, as the broker requires", _pd("XAU/USD"), 2)
s.check("...and the slashless form agrees", _pd("XAUUSD"), 2)
s.check("the majors are unchanged at 5", (_pd("EUR/USD"), _pd("GBP/USD")), (5, 5))
s.check("the JPY pairs are unchanged at 3", (_pd("USD/JPY"), _pd("GBP/JPY")), (3, 3))

# The SAME number sets pip size, and sizing assumes $10 per pip per lot — true for 100oz gold only
# when a pip is $0.10. At 3 digits a pip was $0.01 and every gold position came out 10x too small.
s.check("a gold pip is $0.10, which is what makes the $10/lot assumption true", _ps("XAU/USD"), 0.1)

from execution.sizing import stop_distance_pips, size_lots
ENTRY, STOP, EQUITY = 4433.959, 4437.388, 9999.0
pips = stop_distance_pips(ENTRY, STOP, "XAU/USD")
lots = size_lots(EQUITY, 0.5, pips)
true_lots = (EQUITY * 0.005) / (abs(ENTRY - STOP) * 100)      # 1 lot = 100 oz, from first principles
s.check("the real refused stop measures ~34 pips, not ~343", round(pips, 1), 34.3)
s.check("...and sizes to the mathematically correct lots", abs(lots - true_lots) < 0.01, True)

# TEETH: the old value reproduces the 10x under-size that sent the order out at the minimum.
old_pip = 10.0 ** -(3 - 1)
old_lots = size_lots(EQUITY, 0.5, abs(ENTRY - STOP) / old_pip)
s.teeth("3 digits sized gold 10x too small (it went out at the 0.01 floor)",
        old_lots < true_lots / 5)

# The entry is placed one TICK beyond the pullback's reach, and a tick is a tenth of a pip. At 3
# digits gold's tick was $0.001 — FINER than the smallest price gold can be quoted at — so the entry
# could not survive rounding to the broker's 2 decimals. That is how 4433.959 was produced.
from strategies.vix1_cross import tick as _tick
s.check("a gold tick is $0.01 — exactly one price step at 2 decimals", round(_tick(_ps("XAU/USD")), 4), 0.01)
s.check("...whereas 3 digits made it finer than gold can be priced", round(_tick(0.01), 4), 0.001)
s.check("the majors' tick is unchanged at a pipette", round(_tick(_ps("EUR/USD")), 6), 0.00001)

s.done()
