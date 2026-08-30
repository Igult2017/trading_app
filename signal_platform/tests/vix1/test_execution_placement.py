"""CAN THE ORDER PATH ACTUALLY RUN? Two defects that made every autotrade order impossible.

Both were found on 30 Aug 2026 when he asked for a recorded signal to be placed. Both were invisible
because `dispatcher._autotrade` returns on the kill switch before either line is reached — and both
would have fired in full the moment autotrade was switched on.

  1. `execution/broker.py` imported its host and port from `copy_platform`. Production launches as
     `cd /app/signal_platform && python3 -u main.py` (start.sh:27), so `/app` is not on the path and
     that import raised ModuleNotFoundError. `placer.py`'s catch-all swallowed it: one log line, no
     order, scan carries on.

  2. `execution/orders.py` used copy_platform's `resolve_symbol_id`, which handles broker affixes
     (`EURUSD.r`) and nicknames (`GOLD`) but has no rule for a SLASH. Every symbol this platform
     trades is slashed, so it returned None for all of them and `build_stop` refused the order with
     "not on this account".

WHY THE EXISTING SUITE COULD NOT CATCH EITHER. `test_auto_breakeven.py` replaces `StopOrderClient`
with a stub, so the real `_run()` — which held the broken import — never executes. A test that mocks
the failing code cannot see it fail. This file therefore asserts against the REAL functions and, for
the import, against a REAL subprocess in production's own working directory.
"""
import os
import subprocess
import sys

from _harness import Suite
from execution.orders import build_stop
from shared.symbols import broker_symbol, resolve_symbol_id

s = Suite("EXECUTION — the order path can load, and can name the instrument")

SP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# The broker's real symbol list, in the shape broker.py builds it from ProtoOASymbolsListRes.
# These five ids are the live Pepperstone demo values.
BROKER = {"GBPUSD": 2, "EURUSD": 1, "USDJPY": 4, "GBPJPY": 7, "XAUUSD": 41}


# ── DEFECT 2: the slashed name must resolve ─────────────────────────────────
# config/instruments.py declares ("GBP/USD", ...), signal_repo stores it unchanged, so this is the
# exact string `build_stop` receives at dispatch. It is the whole defect in one line.
s.check("the platform's own 'GBP/USD' resolves", resolve_symbol_id("GBP/USD", BROKER), 2)
s.check("...so does 'EUR/USD'", resolve_symbol_id("EUR/USD", BROKER), 1)
s.check("...and 'XAU/USD', which is not a currency pair", resolve_symbol_id("XAU/USD", BROKER), 41)
s.check("a broker-form name still resolves", resolve_symbol_id("GBPUSD", BROKER), 2)
s.check("an instrument genuinely absent returns None",
        resolve_symbol_id("EUR/GBP", BROKER), None)
s.check("no symbol map means None, never a guess", resolve_symbol_id("GBP/USD", {}), None)
s.check("no symbol means None", resolve_symbol_id("", BROKER), None)

s.check("broker_symbol strips the slash", broker_symbol("GBP/USD"), "GBPUSD")
s.check("...and is idempotent, so a broker name survives", broker_symbol("GBPUSD"), "GBPUSD")

# EXACT MATCH WINS. If a broker ever lists the slashed spelling itself, that id must be used rather
# than the stripped one — otherwise resolution would quietly prefer a different instrument.
s.check("an exact match beats the stripped form",
        resolve_symbol_id("GBP/USD", {"GBP/USD": 999, "GBPUSD": 2}), 999)


# ── THE REAL REQUEST, built end to end with a slashed symbol ────────────────
req, err = build_stop(acct=1, symbol="GBP/USD", side="SELL", volume=100_000,
                      stop_price=1.35508, sl=1.35538, tp=1.35388,
                      expiry_ms=None, symbol_map=BROKER)
s.check("build_stop accepts the slashed symbol", err, None)
s.check("...and targets the right instrument", req.symbolId if req else None, 2)
s.check("...as a SELL", req.tradeSide if req else None, 2)
s.check("...carrying the entry", round(req.stopPrice, 5) if req else None, 1.35508)
# ALL THREE PRICES IN ONE MESSAGE is the property that makes a position impossible to leave naked.
# FIX cannot do this at all, which is why the Open API is the placement route.
s.check("...the STOP LOSS, in the same message", round(req.stopLoss, 5) if req else None, 1.35538)
s.check("...and the TAKE PROFIT, in the same message",
        round(req.takeProfit, 5) if req else None, 1.35388)

_bad, _reason = build_stop(acct=1, symbol="EUR/GBP", side="BUY", volume=100_000,
                           stop_price=1.0, sl=0.9, tp=1.2, expiry_ms=None, symbol_map=BROKER)
s.check("an unknown instrument is REFUSED, not guessed", _bad, None)
s.check("...and says why", "not on this account" in (_reason or ""), True)


# ── DEFECT 1: the modules must import the way PRODUCTION runs them ──────────
# A subprocess, cwd = signal_platform, no path help — exactly start.sh:27. Importing this file's own
# modules in-process proves nothing, because the test runner's path is not production's.
_probe = (
    "import execution.broker, execution.orders, execution.placer, "
    "execution.breakeven, execution.guards, execution.account, execution.sizing, "
    "execution.connection; "
    "from data.ctrader_session import HOSTS, PORT; "
    "print(HOSTS['demo'], PORT)"
)
_r = subprocess.run([sys.executable, "-c", _probe], cwd=SP_ROOT,
                    capture_output=True, text=True,
                    env={**os.environ, "PYTHONIOENCODING": "utf-8"})
s.check("every execution module imports in production's own working directory",
        _r.returncode, 0)
if _r.returncode != 0:
    print("      subprocess said:", (_r.stderr or "").strip().splitlines()[-1:])
s.check("...and the host/port come from THIS platform",
        _r.stdout.strip(), "demo.ctraderapi.com 5035")


# ── AND NOTHING UNDER signal_platform MAY IMPORT copy_platform AGAIN ────────
# copy_platform is launched from its own directory with its own bare imports, so anything here that
# reaches into it works on a developer's machine and dies in the container.
#
# THIS STATIC CHECK IS NOT REDUNDANT WITH THE SUBPROCESS ABOVE, and proving that was worth the
# effort: restoring the old `from copy_platform ...` line and re-running left the subprocess check
# GREEN and only this one went red. Both offending imports sat INSIDE functions, so importing the
# module never executed them. That is precisely why the defect survived — the cheap check everyone
# would reach for cannot see it.
_offenders = []
for _dir, _subdirs, _files in os.walk(SP_ROOT):
    if "__pycache__" in _dir or f"{os.sep}tests" in _dir:
        continue
    for _f in _files:
        if not _f.endswith(".py"):
            continue
        _path = os.path.join(_dir, _f)
        with open(_path, encoding="utf-8") as _fh:
            for _n, _line in enumerate(_fh, 1):
                _stripped = _line.lstrip()
                if _stripped.startswith(("from copy_platform", "import copy_platform")):
                    _offenders.append(f"{os.path.relpath(_path, SP_ROOT)}:{_n}")
s.check("no module under signal_platform imports copy_platform", _offenders, [])
if _offenders:
    for _o in _offenders:
        print(f"      {_o}")


# ── THE ORDER PATH MUST NOT TOUCH THE SCANNER'S CONNECTION ─────────────────
# This is the promise the rewrite was approved on: "if it will bring the signal platform down just
# drop it. But if it is stand alone, it is approved." These four checks are that promise in code.
#
# `get_connection()` returns the SHARED socket the scanner fetches candles on. Putting order traffic
# on it would re-create a documented production outage: recv_expect's own docstring records
# 2026-08-21, when ONE unsolicited execution event (2126) desynchronised that stream permanently and
# emptied the candle fetch. Placing an order is the surest way to make cTrader emit that push.
# PARSED, NOT GREPPED — and the first version of these checks got this wrong. Searching the file's
# TEXT for "get_connection" matched the docstring sentence explaining that it is deliberately NOT
# used, and reported three failures against correct code. Prose is not code. The syntax tree only
# contains what actually executes.
import ast

# BOTH FILES, since broker.py was split on 2026-08-30 when it passed 200 lines: connection.py now
# owns getting a socket and broker.py owns the conversation. Checking only one would let the other
# quietly reach for the scanner's connection.
_order_path_files = [os.path.join(SP_ROOT, "execution", f) for f in ("broker.py", "connection.py")]
_tree = ast.parse("\n".join(open(f, encoding="utf-8").read() for f in _order_path_files))

_called, _imported, _names = set(), set(), set()
for _n in ast.walk(_tree):
    if isinstance(_n, ast.Call):
        _f = _n.func
        _called.add(_f.attr if isinstance(_f, ast.Attribute) else
                    (_f.id if isinstance(_f, ast.Name) else ""))
    elif isinstance(_n, ast.Import):
        _imported.update(a.name for a in _n.names)
    elif isinstance(_n, ast.ImportFrom):
        _imported.add(_n.module or "")
        _names.update(a.name for a in _n.names)
    elif isinstance(_n, ast.Name):
        _names.add(_n.id)

s.check("broker.py never CALLS get_connection() — the scanner's socket",
        "get_connection" in _called, False)
s.check("broker.py opens its OWN socket instead",
        "open_connection" in _called, True)
# A refresh here would rotate the token out from under the scanner, the monitor and Node — cTrader
# rotates on refresh and four consumers share it.
s.check("broker.py never refreshes the shared token",
        "get_access_token" in _called, False)
s.check("broker.py imports no Twisted — it needs a reactor this platform never starts",
        any("twisted" in m.lower() for m in _imported), False)
s.check("...and never calls startService", "startService" in _called, False)
s.check("...and no longer imports copy_platform's non-existent ctrader_app_creds",
        "ctrader_app_creds" in _names, False)

# THE SOCKET IS CLOSED ON EVERY PATH, including the timeout. A leak here accumulates in a process
# that runs for weeks. Asserted on the tree: a try with a real finally body that closes something.
_finally_closes = any(
    isinstance(_n, ast.Try) and _n.finalbody and
    any(isinstance(x, ast.Call) and getattr(x.func, "attr", "") == "close"
        for b in _n.finalbody for x in ast.walk(b))
    for _n in ast.walk(_tree))
s.check("the socket is closed in a finally block, so no path leaks it", _finally_closes, True)

# "NOT SENT" vs "UNKNOWN" — the distinction that stops a slow network looking like a possible
# duplicate order. Anything failing before the request is written reports "not sent", which is a
# fact; only a failure AFTER it is written reports UNKNOWN, which is a warning to reconcile.
# These two ARE string checks on purpose — they assert the wording an operator will read, and the
# strings live in code, not in prose. Both are constants in the tree rather than comments.
_consts = {n.value for n in ast.walk(_tree) if isinstance(n, ast.Constant) and isinstance(n.value, str)}
_joined = " ".join(_consts)
s.check("a failure before sending is reported as 'not sent', not UNKNOWN",
        "not sent — " in _joined, True)
s.check("...and UNKNOWN is still reserved for a sent order with no verdict",
        "order state UNKNOWN" in _joined, True)

# A REFUSAL IS AN ANSWER — payload 2132, ProtoOAOrderErrorEvent. This is how cTrader actually
# refuses an order operation, and it is NOT the generic error type the code already handled. Found
# by testing the error paths against the live demo account: cancelling an order id that does not
# exist sat for the full 22.3s and returned "state UNKNOWN, reconcile before any retry" — the most
# alarming message this file can produce, for a request the broker had already rejected outright.
# With 2132 handled it answers in 2.5s with "ORDER_NOT_FOUND Order not found with id 999999999".
# The same path carries insufficient margin, a bad price and a closed market.
_consts_num = {n.value for n in ast.walk(_tree) if isinstance(n, ast.Constant) and isinstance(n.value, int)}
s.check("the order-refusal event (2132) is handled, not left to time out",
        2132 in _consts_num, True)
s.check("...alongside the execution event (2126)", 2126 in _consts_num, True)

# The public interface must not have moved: placer.py and breakeven.py call these by name and were
# deliberately not touched.
from execution.broker import StopOrderClient
for _m in ("place_stop", "cancel", "amend_sltp"):
    s.check(f"StopOrderClient.{_m} still exists for its callers",
            callable(getattr(StopOrderClient, _m, None)), True)

s.done()
