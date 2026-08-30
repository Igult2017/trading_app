"""SCANNING THE MOMENT THE BAR CLOSES — and never scanning when a scheduled tick would not.

WHY THIS EXISTS, measured against real broker M1 bars. Every stored VIX.1 signal was checked for
whether price had ALREADY traded past its own entry when the signal fired:

    EUR/USD BUY  17 Aug  entry 1.15975  best before firing 1.15973   0.2 pips short
    EUR/USD BUY  19 Aug  entry 1.16487  best before firing 1.16498   ALREADY PAST by 1.1 pips
    XAU/USD BUY  19 Aug  entry 4460.59  best before firing 4461.52   ALREADY PAST by 9.3 pips
    GBP/USD SELL 28 Aug  entry 1.35508  best before firing 1.35509   0.1 pips short

Two of four were unplaceable on arrival. His words: *"signal arrives late when its past entry."*

THE WHOLE SAFETY CASE IS THAT THIS CAN ONLY SCAN SOONER, NEVER DIFFERENTLY. It was shipped while he
was away and could not check it, with autotrade ON, so these checks are the argument that a fault
here degrades to today's behaviour rather than to something new. Every gate a scheduled tick obeys is
asserted, plus the guards that stop it scanning twice for one bar.
"""
import ast
import asyncio
import os
import time

from _harness import Suite

s = Suite("ENTRY WATCHER — scan on the bar close, under exactly a tick's own gates")

SP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import orchestrator.scan_on_demand as OD
from config.settings import settings

_ran: list[str] = []


async def _fake_run_strategy(strategy, instrument, news, sessions, now):
    _ran.append(instrument)


class _Strat:
    id = "vix1"


def _arrange(*, paused=False, scan_enabled=True, open_instruments=("GBP/USD",), strategies=(_Strat(),)):
    """Put the module in a known state. Every gate is a real function it calls, stubbed here."""
    OD._is_paused = lambda: paused
    OD.instrument_filter.get_open_instruments = lambda now: list(open_instruments)
    OD.strategy_registry.get_enabled = lambda: list(strategies)
    OD.run_strategy = _fake_run_strategy

    async def _news(now):
        return None
    OD.news_fetcher.fetch = _news
    OD.get_current_sessions = lambda now: []
    object.__setattr__(settings, "scan_enabled", scan_enabled)
    OD._last_scan.clear()
    OD._locks.clear()
    _ran.clear()


def _scan(inst="GBP/USD"):
    return asyncio.run(OD.scan_one(inst))


# ── IT SCANS WHEN A TICK WOULD ──────────────────────────────────────────────
_arrange()
s.check("an open instrument on an open market is scanned", _scan(), True)
s.check("...and the strategy really ran for it", _ran, ["GBP/USD"])

# ── AND REFUSES EVERYWHERE A TICK WOULD REFUSE ──────────────────────────────
# These are the gates that keep this from becoming a second scanner running under its own rules.
_arrange(paused=True)
s.check("PAUSED — refuses, exactly as a tick does", _scan(), False)
s.check("...and ran nothing", _ran, [])

_arrange(scan_enabled=False)
s.check("SCAN_ENABLED=false — refuses", _scan(), False)
s.check("...and ran nothing", _ran, [])

_arrange(open_instruments=())
s.check("MARKET CLOSED — refuses", _scan(), False)
s.check("...and ran nothing", _ran, [])

_arrange(open_instruments=("EUR/USD",))
s.check("an instrument that is not open — refuses", _scan("GBP/USD"), False)

_arrange(strategies=())
s.check("NO STRATEGIES REGISTERED — refuses", _scan(), False)
s.check("...and ran nothing", _ran, [])


# ── IT SCANS SOONER, NEVER MORE ─────────────────────────────────────────────
_arrange()
s.check("first scan runs", _scan(), True)
s.check("a second scan moments later is REFUSED", _scan(), False)
s.check("...so the strategy ran once, not twice", len(_ran), 1)

# A scheduled tick tells this module it covered the instrument, so a bar close landing right
# afterwards does not repeat the same work.
_arrange()
OD.note_scheduled_scan(["GBP/USD"])
s.check("a scheduled tick suppresses an immediate bar-triggered repeat", _scan(), False)
s.check("...and nothing ran", _ran, [])

# The gap is real, not permanent — once it passes, the next bar close scans again.
_arrange()
_scan()
OD._last_scan["GBP/USD"] = time.monotonic() - (OD._MIN_GAP_S + 1)
s.check("once the gap has passed it scans again", _scan(), True)
s.check("...twice in total", len(_ran), 2)


# ── A FAULT MUST DEGRADE TO TODAY, NEVER PROPAGATE ──────────────────────────
_arrange()
async def _boom(strategy, instrument, news, sessions, now):
    raise RuntimeError("strategy blew up")
OD.run_strategy = _boom
s.check("a strategy that raises does not take the scan down", _scan(), True)

_arrange()
async def _news_boom(now):
    raise RuntimeError("news is down")
OD.news_fetcher.fetch = _news_boom
s.check("news failing returns False rather than raising", _scan(), False)


# ── THE MINUTE ROLL IS READ FROM THE TICK, NOT THE LOCAL CLOCK ──────────────
from data.fix_quotes import FixQuoteStream

st = FixQuoteStream("5296567", "offline")
st._connected = True
s.check("no tick yet — no roll", st.minute_rolled("GBP/USD"), False)

st._absorb({"55": "2", "px_0": "1.35325", "px_1": "1.35338", "52": "20260830-16:00:30"})
s.check("the FIRST tick is not a roll — nothing to compare to", st.minute_rolled("GBP/USD"), False)

st._absorb({"55": "2", "px_0": "1.35330", "px_1": "1.35342", "52": "20260830-16:00:59"})
s.check("another tick in the SAME minute is not a roll", st.minute_rolled("GBP/USD"), False)

st._absorb({"55": "2", "px_0": "1.35340", "px_1": "1.35352", "52": "20260830-16:01:02"})
s.check("A TICK IN THE NEXT MINUTE IS A ROLL", st.minute_rolled("GBP/USD"), True)
s.check("...and reading it CONSUMES it, so one bar scans once",
        st.minute_rolled("GBP/USD"), False)

# A broker timestamp that cannot be read must not invent a minute.
from data.fix_wire import sending_time as _sending_time
s.check("a malformed sending time is refused, not guessed", _sending_time("not-a-time"), None)
s.check("...and a missing one too", _sending_time(None), None)
s.check("a real one parses as UTC", _sending_time("20260830-16:01:02"), 1788105662.0)


# ── THE FIX ACCOUNT ID IS A DIFFERENT NUMBER, AND THAT MUST NOT DRIFT BACK ──
# FIX knows this account by its cTrader login (5296567); the Open API knows the SAME account by its
# ctidTraderAccountId (47535363). The first version passed the Open API number and the broker refused
# it with RET_NO_SUCH_LOGIN — and it failed SILENTLY: the watcher logs a failed connect, falls back
# to the scheduled scan, and nothing ever says the feature is not working. Caught only by testing
# against the live session, which is why it is pinned here.
import monitor.entry_watcher as EW
import monitor.trade_watcher as TW

for _mod, _name in ((EW, "entry_watcher"), (TW, "trade_watcher")):
    _src = ast.parse(open(_mod.__file__, encoding="utf-8").read())
    _attrs = {n.attr for n in ast.walk(_src) if isinstance(n, ast.Attribute)}
    s.check(f"{_name} uses the FIX account id", "ctrader_fix_account_id" in _attrs, True)
    s.check(f"...and NOT the Open API one for FIX", "ctrader_account_id" in _attrs, False)

# Both must be present before it will even try — a missing one means "off", never a guess.
async def _no_creds():
    object.__setattr__(settings, "ctrader_fix_password", "")
    object.__setattr__(settings, "ctrader_fix_account_id", "5296567")
    w = EW.EntryWatcher()
    return await w._ensure(["GBP/USD"])
s.check("no FIX password -> does not attempt a connection", asyncio.run(_no_creds()), False)

async def _no_acct():
    object.__setattr__(settings, "ctrader_fix_password", "x")
    object.__setattr__(settings, "ctrader_fix_account_id", "")
    w = EW.EntryWatcher()
    return await w._ensure(["GBP/USD"])
s.check("no FIX account id -> does not attempt a connection", asyncio.run(_no_acct()), False)
object.__setattr__(settings, "ctrader_fix_password", "")


# ── IT MUST NOT REACH FOR THE SCANNER'S CONNECTION ──────────────────────────
# Parsed, not grepped — a text search matches the docstrings explaining what is NOT used.
_files = [os.path.join(SP_ROOT, "monitor", "entry_watcher.py"),
          os.path.join(SP_ROOT, "orchestrator", "scan_on_demand.py")]
_tree = ast.parse("\n".join(open(f, encoding="utf-8").read() for f in _files))
_called = {(n.func.attr if isinstance(n.func, ast.Attribute) else getattr(n.func, "id", ""))
           for n in ast.walk(_tree) if isinstance(n, ast.Call)}
s.check("never calls get_connection()", "get_connection" in _called, False)
s.check("never refreshes the shared token", "get_access_token" in _called, False)
# It must not place, amend or cancel anything — it decides nothing and trades nothing.
for forbidden in ("place_stop", "amend_sltp", "create_order", "close_position"):
    s.check(f"never calls {forbidden}", forbidden in _called, False)

s.done()
