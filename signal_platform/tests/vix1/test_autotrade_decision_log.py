"""EVERY AUTOTRADE DECISION IS WRITTEN DOWN — through the real placer and canceller.

HIS QUESTION, 2026-09-15: *"Is autotrader even taking trades anymore?"* A refusal lived only in a
Telegram DM and a container log line that every deploy erases, so "why was there no order behind the
13:03 signal?" had to be answered from the broker's own order history. `execution/decision_log.py` now
writes one `signal_events` row per decision, and the admin Autotrade screen reads them back.

What must hold: each path writes exactly ONE row of the right kind, carrying the reason and the signal
id — and a failing audit write can never stop an order. The broker and the account are faked; the
placer, the guards, sizing and the canceller are the real ones.
"""
import asyncio

from _harness import Suite

import execution.account as acct_mod
import execution.broker as broker_mod
import storage.observability_repo as obs
from config.settings import settings
from data import ctrader_positions as CP
from execution import canceller, guards, placer
from monitor import position_book as PB
from storage import autotrade_repo

s = Suite("AUTOTRADE — every decision is written where a deploy cannot erase it")
run = asyncio.new_event_loop().run_until_complete

_KEYS = ("autotrade_enabled", "autotrade_sessions", "autotrade_demo_only", "autotrade_strategies",
         "autotrade_symbols", "autotrade_max_per_day")
_orig = {k: getattr(settings, k) for k in _KEYS}
for k, v in dict(autotrade_enabled=True, autotrade_demo_only=True, autotrade_strategies="vix1",
                 autotrade_symbols="", autotrade_sessions="", autotrade_max_per_day=6).items():
    object.__setattr__(settings, k, v)

rows: list[tuple] = []


def _collect(stage, strategy, symbol, signal_id=None, detail=""):
    rows.append((stage, symbol, signal_id, detail))


class _Dir:
    value = "sell"


class Sig:
    """His 14 Sep 13:03 EUR/USD sell, as the dispatcher hands it over."""
    symbol, direction, strategy_id, strategy_name, db_id = "EUR/USD", _Dir(), "vix1", "VIX.1", "sig-1303"
    entry_price, stop_loss, take_profit = 1.15295, 1.15327, 1.15167
    expires_at = None           # real signals carry it; the placer falls back to a 24h broker expiry


class _Res:
    def __init__(self, ok, order_id=None, error=None):
        self.ok, self.order_id, self.error = ok, order_id, error


class _Broker:
    answer = None

    def __init__(self, creds, account_type):
        pass

    async def place_stop(self, **kw):
        return _Broker.answer

    async def cancel(self, order_id):
        return _Res(True)


def _book(positions, ids):
    async def answer():
        CP._resting_order_ids = ids
        return positions
    return answer


_harness_record = obs.record
_real = dict(open=CP.open_positions, broker=broker_mod.StopOrderClient, load=acct_mod.load_account,
             record_placed=autotrade_repo.record_placed, order_for_signal=autotrade_repo.order_for_signal,
             record_closed=autotrade_repo.record_closed)
obs.record = _collect
broker_mod.StopOrderClient = _Broker
autotrade_repo.record_placed = lambda *a, **k: None


def place(account_type="demo", resting=frozenset()):
    rows.clear()
    CP.open_positions = _book([], set(resting))
    PB.invalidate()
    return run(placer.place_for_signal(Sig(), {"ctraderId": 1, "accessToken": "x"}, account_type,
                                       10_000.0, notify=None, risk_base=10_000.0))


# ── OUR OWN GUARDS SAY NO ──────────────────────────────────────────────────
guards._placed.clear()
s.check("a guard refusal places nothing", place("live"), None)
s.check("...and writes ONE refused row", [r[0] for r in rows], ["autotrade_refused"])
s.check("...carrying the reason and the signal id", ("demo_only" in rows[0][3], rows[0][2]),
        (True, "sig-1303"))

# ── AN ORDER GOES OUT ──────────────────────────────────────────────────────
_Broker.answer = _Res(True, order_id="360999999")
s.check("a placement returns the broker's order id", place(), "360999999")
s.check("...writes ONE placed row", [r[0] for r in rows], ["autotrade_placed"])
s.check("...and the guard remembers that order's id", guards._placed[-1][3], "360999999")
s.check("...and a real volume", (guards._placed[-1][4] or 0) > 0, True)

s.check("the same sell while 360999999 still rests → refused", place(resting={360999999}), None)
s.check("...recorded as refused, naming the order",
        (rows[0][0], "360999999" in rows[0][3]), ("autotrade_refused", True))

# ── THE BROKER SAYS NO ─────────────────────────────────────────────────────
guards._placed.clear()
_Broker.answer = _Res(False, error="TRADING_BAD_STOPS")
s.check("a broker refusal places nothing", place(), None)
s.check("...and writes ONE rejected row with the broker's words",
        ([r[0] for r in rows], "TRADING_BAD_STOPS" in rows[0][3]), (["autotrade_rejected"], True))


# ── THE AUDIT WRITE FAILS ──────────────────────────────────────────────────
def _boom(*a, **k):
    raise RuntimeError("database down")


obs.record = _boom
guards._placed.clear()
_Broker.answer = _Res(True, order_id="361000000")
s.check("a failing audit write does not stop the order", place(), "361000000")
obs.record = _collect


# ── A RESTING ORDER IS WITHDRAWN ───────────────────────────────────────────
async def _acct():
    class A:
        creds, account_type = {"ctraderId": 1, "accessToken": "x"}, "demo"
    return A()


acct_mod.load_account = _acct
autotrade_repo.order_for_signal = lambda sid: "360658076"
autotrade_repo.record_closed = lambda oid, st: None
rows.clear()
run(canceller.cancel_for_signal("sig-0723", "EUR/USD",
                                "the high reached 1.15568, through the stop at 1.1556, before the entry"))
s.check("a withdrawal writes ONE cancelled row", [r[0] for r in rows], ["autotrade_cancelled"])
s.check("...naming the order and why", ("360658076" in rows[0][3], "1.15568" in rows[0][3]), (True, True))

# ── RESTORE ────────────────────────────────────────────────────────────────
CP.open_positions, broker_mod.StopOrderClient = _real["open"], _real["broker"]
acct_mod.load_account, autotrade_repo.record_placed = _real["load"], _real["record_placed"]
autotrade_repo.order_for_signal, autotrade_repo.record_closed = _real["order_for_signal"], _real["record_closed"]
obs.record = _harness_record
PB._cached, PB._cached_at, PB._forced, PB._resting = None, 0.0, False, None
placer._intent.clear()
guards._placed.clear()
for k, v in _orig.items():
    object.__setattr__(settings, k, v)
s.done()
