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
    "execution.breakeven, execution.guards, execution.account, execution.sizing; "
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

s.done()
