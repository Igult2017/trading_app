"""AUTOTRADE — when it may trade, and the field whose absence refused every order.

TWO THINGS, BOTH FOUND ON 31 AUG WHILE ANSWERING "is autotrading working now?".

  A  IT WAS SWITCHED ON AND PLACING NOTHING. `AUTOTRADE_ENABLED=true` in production, the order path
     proved on the demo account, the demo-only guard passing — and still not one order, because the
     credential bridge never sent a balance. `execution/account._equity` reads the first positive
     value among equity / balance / account_equity / accountBalance, found none, returned 0.0, and
     `guards.check` answered "account equity unknown" every time. Confirmed against production: the
     endpoint's keys were access_token, account_id, account_type, ctrader_id, environment,
     expires_at, is_live, refresh_token — no money in it at all.

     It is the same shape as the defect before it (OPEN.md D4): a guard reading a field the endpoint
     never sent. That one refused every order too, and for the same reason nobody noticed — a
     refusal is one log line and looks exactly like a quiet market.

  B  LONDON AND NEW YORK ONLY — his instruction, 2026-08-31: *"I want you to make it trade during
     London and New York Sessions only."*

     NO HOURS ARE WRITTEN HERE OR IN THE GUARD. `scheduler/session_windows` already computes the
     windows from each centre's real timezone, so daylight saving is handled once. A second
     definition would drift from the first twice a year, and these tests would be the thing that
     agreed with the wrong one.
"""
from datetime import datetime, timezone

from _harness import Suite
from config.settings import settings
from core.types import Session
from execution import guards
from execution.sizing import plan_size
from scheduler.session_windows import get_current_sessions

s = Suite("AUTOTRADE — sessions, and the equity that refused everything")

# A signal that passes every OTHER gate, so only the one under test can refuse.
OK = dict(symbol="GBP/USD", direction="SELL", strategy="vix1",
          account_type="demo", equity=10_000.0, lots=0.1)


def _set(**kw):
    for k, v in kw.items():
        object.__setattr__(settings, k, v)


_orig = {k: getattr(settings, k) for k in
         ("autotrade_enabled", "autotrade_sessions", "autotrade_demo_only",
          "autotrade_strategies", "autotrade_symbols", "autotrade_max_per_day")}
_set(autotrade_enabled=True, autotrade_demo_only=True, autotrade_strategies="vix1",
     autotrade_symbols="", autotrade_max_per_day=6)
guards._placed.clear()


# ── B. THE SESSION GATE ─────────────────────────────────────────────────────
# What is actually open right now decides which way this test reads, so it is asserted against the
# real reader rather than a fixed clock — that is the same source the guard consults.
now_active = {x.value.lower() for x in get_current_sessions()}
in_major = bool({"london", "new_york"} & now_active)

_set(autotrade_sessions="london,new_york")
verdict = guards.check(**OK)
if in_major:
    s.check(f"London/NY is open now ({sorted(now_active - {'all'})}) -> allowed", verdict, None)
else:
    s.check(f"only {sorted(now_active - {'all'})} open now -> refused", verdict is not None, True)
    s.check("...and the refusal names the sessions", "permitted sessions" in (verdict or ""), True)

# Independent of the wall clock: a list that cannot match anything must always refuse, and an empty
# list must always allow. These two pin the behaviour whatever time the suite is run.
_set(autotrade_sessions="asian")
asian_verdict = guards.check(**OK)
s.check("restricted to a session that is not open -> refused"
        if "asian" not in now_active else "asian is open now -> allowed",
        (asian_verdict is not None) if "asian" not in now_active else asian_verdict,
        True if "asian" not in now_active else None)

_set(autotrade_sessions="")
s.check("an EMPTY session list allows any session (the old behaviour)", guards.check(**OK), None)

_set(autotrade_sessions="london,new_york,asian")
s.check("naming every session also allows any session", guards.check(**OK), None)

# The setting ships restricted, because that is what he asked for.
s.check("the shipped default is London + New York",
        _orig["autotrade_sessions"], "london,new_york")


# ── THE GATE MUST NOT OVERRIDE THE ONES BEFORE IT ───────────────────────────
# Order matters for the message: the kill switch must still win, so the log says "autotrade is off"
# rather than blaming the session.
_set(autotrade_enabled=False, autotrade_sessions="asian")
s.check("the kill switch still answers first", "autotrade is OFF" in (guards.check(**OK) or ""), True)
_set(autotrade_enabled=True)

# A live account is refused before the session is even considered.
_set(autotrade_sessions="london,new_york")
live = dict(OK); live["account_type"] = "live"
s.check("a LIVE account is still refused", "demo_only" in (guards.check(**live) or ""), True)


# ── A. THE EQUITY THAT REFUSED EVERY ORDER ──────────────────────────────────
print()
print("   the equity gap:")


def _equity_from(payload: dict) -> float:
    """The exact rule in execution/account._equity."""
    for key in ("equity", "balance", "account_equity", "accountBalance"):
        raw = payload.get(key)
        if raw in (None, ""):
            continue
        try:
            v = float(raw)
        except (TypeError, ValueError):
            continue
        if v > 0:
            return v
    return 0.0


OLD = {"account_id": "x", "access_token": "t", "refresh_token": "r", "expires_at": 0,
       "account_type": "demo", "environment": "demo", "is_live": False, "ctrader_id": "47535363"}
s.check("THE OLD RESPONSE gave no equity — this is why nothing was ever placed",
        _equity_from(OLD), 0.0)

NEW = dict(OLD, balance=10_000.0, equity=10_000.0, currency="USD")
s.check("with balance present it sizes", _equity_from(NEW), 10_000.0)
s.check("a null balance still degrades to 0.0 rather than guessing",
        _equity_from(dict(OLD, balance=None, equity=None)), 0.0)

# And 0.0 equity must REFUSE, not size something arbitrary.
zero = dict(OK); zero["equity"] = 0.0; zero["lots"] = 0.0
s.check("zero equity refuses", guards.check(**zero) is not None, True)
lots, volume, pips = plan_size(equity=0.0, entry=1.35298, stop=1.35540, symbol="GBP/USD",
                               risk_pct=0.5, fixed_lots=0.0)
s.check("...and sizing produces no lots from no equity", lots, 0.0)

# The real numbers from the Sunday signal, once the balance is available.
lots2, volume2, pips2 = plan_size(equity=10_000.0, entry=1.35298, stop=1.35540, symbol="GBP/USD",
                                  risk_pct=0.5, fixed_lots=0.0)
s.check("a 24.2-pip stop is measured as such", round(pips2, 1), 24.2)
s.check("...and 0.5% of $10,000 over it produces a real size", lots2 > 0, True)

# Clock-independent: an empty list must allow and a list nothing can match must refuse, whatever
# session happens to be open when the suite runs.
_set(autotrade_sessions="")
_allow = guards.check(**OK)
_set(autotrade_sessions="a_session_that_is_never_open")
_deny = guards.check(**OK)
s.teeth("the session gate", _allow is None and _deny is not None)

for k, v in _orig.items():
    object.__setattr__(settings, k, v)
guards._placed.clear()
s.done()
