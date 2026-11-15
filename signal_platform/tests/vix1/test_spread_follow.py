"""A WAITING ORDER STAYS AT 1% — it follows the spread, and its size follows its stop.

HIS POINTS, 15 Nov 2026: *"sometimes after placing a fill order, spread increase or something happen
that affects SL before entry"* and *"you havent considered when the SL becomes bigger than we planned
before the fill."* Through `resting_watch.decide` (the rule) and `resting_watch.check` (the loop, with
the broker, the account and the records faked at their edges).
"""
import asyncio
import time
from types import SimpleNamespace

from _harness import Suite

from config.settings import settings
from execution import guards, intents, placer, resting_watch as RW
from execution.sizing import plan_size

s = Suite("AUTOTRADE — a waiting order follows the spread, and its size follows its stop")
for k, v in dict(autotrade_risk_pct=1.0, autotrade_fixed_lots=0.0, autotrade_max_lots=5.0).items():
    object.__setattr__(settings, k, v)
PIP, BASE = 0.0001, 10_000.0


def size_for(e, sl):
    return plan_size(equity=BASE, entry=e, stop=sl, symbol="EUR/USD", risk_pct=1.0, max_lots=5.0)


def risk_usd(volume, e, sl):        # EUR/USD: $10 a pip a lot; volume is lots x 10,000,000
    return volume / 10_000_000 * abs(e - sl) / PIP * 10


# A SELL stop at 1.10000, stop 12 pips above at 1.10120, built with a 0.8-pip spread.
E, SL, SP = 1.10000, 1.10120, 0.00008
lots0, vol0, _ = size_for(E, SL)

# ── 1. the spread widens by 1 pip on a resting SELL ─────────────────────────
p = RW.decide("SELL", E, SL, vol0, SP, SP + 0.0001, PIP, he_moved=False, size_for=size_for)
s.check("the SELL's stop moves out by the 1-pip change", round(p["sl"], 5), 1.10130)
s.check("...its entry is not touched", p["entry"], E)
s.check("...and the lots get smaller", p["volume"] < vol0, True)
s.check("...so the risk is still 1% ($100, within a lot step)",
        abs(risk_usd(p["volume"], p["entry"], p["sl"]) - 100) <= 1.0, True)
b = RW.decide("BUY", E, E - 0.0012, vol0, SP, SP + 0.0001, PIP, he_moved=False, size_for=size_for)
s.check("a BUY's ENTRY moves up by the change instead", round(b["entry"], 5), 1.10010)
s.check("a 0.2-pip flicker changes nothing",
        RW.decide("SELL", E, SL, vol0, SP, SP + 0.00002, PIP, False, size_for), None)
s.teeth("the 0.3-pip threshold is what decides",
        RW.decide("SELL", E, SL, vol0, SP, SP + 0.00003, PIP, False, size_for) is not None)

# ── 2. HIS POINT: the stop got bigger before the fill, whatever moved it ────
wider = RW.decide("SELL", E, SL + 0.0005, vol0, SP, SP, PIP, he_moved=True, size_for=size_for)
s.check("he moved the stop 5 pips wider → the volume is CUT", wider["volume"] < vol0, True)
s.check("...back to 1% at the wider stop",
        abs(risk_usd(wider["volume"], E, SL + 0.0005) - 100) <= 1.0, True)
s.check("...and HIS levels are left exactly where he put them", (wider["entry"], wider["sl"]),
        (E, SL + 0.0005))
s.check("he moved it TIGHTER → the volume is left alone (never sized up behind his back)",
        RW.decide("SELL", E, SL - 0.0004, vol0, SP, SP, PIP, True, size_for), None)
s.check("an order he moved does NOT follow the spread",
        RW.decide("SELL", E, SL, vol0, SP, SP + 0.0002, PIP, True, size_for), None)
s.teeth("without the cut the wider stop would risk far more than 1%",
        risk_usd(vol0, E, SL + 0.0005) > 130)

# ── 3. the loop, end to end: broker read → amend → every record kept in step ─
from data import ctrader_positions as cp, fix_quotes   # noqa: E402
from execution import account                           # noqa: E402
import execution.broker as broker                       # noqa: E402
from storage import autotrade_changes, signal_repo       # noqa: E402

OID = "4242"
intents._intent.clear()
intents._intent[OID] = dict(symbol="EUR/USD", side="SELL", entry=E, sl=SL, tp=E - 0.0048, lots=lots0,
                           volume=vol0, stop_pips=12.0, spread_used=SP, signal_id="sig-1",
                           placed_at=None, strategy="VIX.1")
guards._placed[:] = [(None, "EUR/USD", "SELL", OID, vol0)]
sent, recorded, adopted = [], [], []
he_stop = [SL]                                  # what the BROKER holds right now
cp.last_resting_levels = lambda oid: {"entry": E, "sl": he_stop[0]} if str(oid) == OID else None
cp.last_resting_meta = lambda oid: ({"volume": intents._intent[OID]["volume"], "tp": E - 0.0048,
                                     "expiry_ms": 1_900_000_000_000} if str(oid) == OID else None)
fix_quotes.live_quote = lambda sym, *a: (1.10050, 1.10050 + SP)        # spread unchanged
account.load_account = lambda: asyncio.sleep(0, result=SimpleNamespace(
    creds={}, account_type="demo", risk_base=BASE, equity=BASE))


class _Client:
    def __init__(self, *a):
        pass

    async def amend_order(self, oid, sym, vol, entry, sl, tp, exp):
        sent.append(dict(oid=oid, vol=vol, entry=entry, sl=sl, tp=tp, exp=exp))
        return SimpleNamespace(ok=True, error=None)


broker.StopOrderClient = _Client
autotrade_changes.record_amended = lambda oid, **k: recorded.append(k) or True
signal_repo.adopt_levels = lambda *a, **k: adopted.append(k) or True
run = asyncio.new_event_loop().run_until_complete
told = []


async def send(text):
    told.append(text)
    return True

run(RW.check(send))
s.check("nothing changed at the broker → nothing is sent", sent, [])
he_stop[0] = SL + 0.0005                       # he widens it by hand in Pepperstone
RW._last_amend.clear()
run(RW.check(send))
s.check("he widened the stop → ONE amend goes to the broker", len(sent), 1)
s.check("...with a smaller volume", sent[0]["vol"] < vol0, True)
s.check("...his stop, his entry, and the target and expiry re-sent unchanged",
        (sent[0]["sl"], sent[0]["entry"], sent[0]["tp"], sent[0]["exp"]),
        (SL + 0.0005, E, E - 0.0048, 1_900_000_000_000))
s.check("the record keeps the new SIZE but not his levels (so the canceller still knows they are his)",
        (recorded[0]["volume"] == sent[0]["vol"], recorded[0]["entry"], recorded[0]["stop"]),
        (True, None, None))
s.check("the duplicate guard's log has the new size", guards._placed[0][4], sent[0]["vol"])
s.check("the fill matcher's record has the new size", intents._intent[OID]["volume"], sent[0]["vol"])
s.check("...and he is told", "WAITING ORDER ADJUSTED" in (told[-1] if told else ""), True)
run(RW.check(send))
s.check("the next pass inside 30 s does not amend again", len(sent), 1)

fix_quotes.live_quote = lambda sym, *a: (1.10050, 1.10050 + SP + 0.0001)   # spread +1 pip
he_stop[0] = SL
intents._intent[OID].update(sl=SL, stop_pips=12.0, volume=vol0)
RW._last_amend.clear()
run(RW.check(send))
s.check("our own spread move goes out with the stop moved 1 pip", round(sent[-1]["sl"], 5), 1.10130)
s.check("...and is recorded WITH its levels, so it is not mistaken for his",
        (round(recorded[-1]["stop"], 5), round(recorded[-1]["spread_used"], 6)), (1.10130, 0.00018))
s.check("...and the signal is judged against the new stop", round(adopted[-1]["stop"], 5), 1.10130)
s.teeth("no resting order at the broker → nothing is touched",
        cp.last_resting_levels("999") is None)
s.done()
