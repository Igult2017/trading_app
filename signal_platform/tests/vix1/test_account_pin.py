"""THE SIGNAL PLATFORM OWNS ONE ACCOUNT — and nothing another user does can take it.

WHY, traced end to end. `/api/internal/ctrader-credentials` returned "whichever cTrader account was
updated most recently", with NO filter on `broker_accounts.user_id`. And `updated_at` is stamped by
`storage.updateBrokerAccount` and `updateBrokerAccountSyncStatus`, called from twelve places —
every connect, every sync start and finish, every balance read, every account edit.

So ANY user syncing their own cTrader account became this platform's credentials. The token is
re-read every ~3 minutes (`ctrader_session.py:131`) while the account we authenticate AS is fixed at
boot (`startup_helpers.py`), so the two disagreed and cTrader crash-looped the platform — live, with
no restart.

TWO THINGS THIS FILE GUARDS:
  1. Every credential read carries the pin. Missing ONE leaves the whole hole open, and there were
     four call sites plus a second one in the Node watchdog that a narrower fix would have missed.
  2. The demo-only guard reads a field the endpoint actually sends. It read `environment` or
     `account_type`, the endpoint sent only `is_live`, so the guard computed "live" and REFUSED
     EVERY ORDER while autotrade was switched on.
"""
import ast
import os

from _harness import Suite
from config.settings import settings
from data.node_bridge import signal_account_param

s = Suite("ACCOUNT PIN — one owned account, and every read asks for it")

SP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── THE PIN ITSELF ──────────────────────────────────────────────────────────
object.__setattr__(settings, "ctrader_signal_account_id", "")
s.check("unset -> no parameter, so behaviour is exactly as before", signal_account_param(), {})

object.__setattr__(settings, "ctrader_signal_account_id", "47535363")
s.check("set -> the account is asked for by number",
        signal_account_param(), {"ctrader_id": "47535363"})

# Whitespace from a copy-paste into Coolify must not become a pin that matches nothing — that would
# 404 every read and look like an outage.
object.__setattr__(settings, "ctrader_signal_account_id", "  47535363  ")
s.check("surrounding whitespace is trimmed", signal_account_param(), {"ctrader_id": "47535363"})
object.__setattr__(settings, "ctrader_signal_account_id", "   ")
s.check("whitespace only counts as unset, not as a pin of spaces", signal_account_param(), {})
object.__setattr__(settings, "ctrader_signal_account_id", "")


# ── EVERY CALLER PASSES IT ──────────────────────────────────────────────────
# Asserted on the syntax tree, per call site. This is the check that would have caught the miss:
# the token refetch runs every ~3 minutes for the life of the process, so leaving THAT one unpinned
# reopens the entire defect while the other three look correct.
def _passes_pin(rel: str) -> bool:
    """Does this file call the credentials endpoint with `params=signal_account_param()`?"""
    tree = ast.parse(open(os.path.join(SP_ROOT, rel), encoding="utf-8").read())
    for n in ast.walk(tree):
        if not isinstance(n, ast.Call):
            continue
        for kw in n.keywords:
            if kw.arg == "params" and isinstance(kw.value, ast.Call):
                fn = kw.value.func
                if getattr(fn, "id", "") == "signal_account_param" or \
                   getattr(fn, "attr", "") == "signal_account_param":
                    return True
    return False


for rel, why in (
    ("core/startup_helpers.py", "boot — sets the account we authenticate as"),
    ("data/node_bridge.py",     "the ~3-MINUTE REFETCH — the one that bites"),
    ("execution/account.py",    "autotrade — decides which account orders land on"),
):
    s.check(f"{rel} passes the pin  ({why})", _passes_pin(rel), True)

# One place builds the parameter, so no caller can invent its own spelling of it.
_bridge = open(os.path.join(SP_ROOT, "data", "node_bridge.py"), encoding="utf-8").read()
s.check("the parameter is built in ONE place", _bridge.count("def signal_account_param"), 1)


# ── THE DEMO GUARD MUST READ WHAT THE ENDPOINT SENDS ────────────────────────
# execution/account.py:58 -> (environment or account_type or "live"). The endpoint used to send
# neither, so this computed "live" and guards.check refused every order.
def _acct_type(payload: dict) -> str:
    return (payload.get("environment") or payload.get("account_type") or "live").lower()


s.check("THE OLD RESPONSE computed 'live' — the bug that refused every order",
        _acct_type({"is_live": False, "ctrader_id": "47535363"}), "live")
s.check("with account_type it computes 'demo'",
        _acct_type({"is_live": False, "account_type": "demo"}), "demo")
s.check("with environment it computes 'demo' too",
        _acct_type({"is_live": False, "environment": "demo"}), "demo")
s.check("a genuinely live account still reads 'live' — the guard must still refuse it",
        _acct_type({"is_live": True, "account_type": "live"}), "live")
# UNKNOWN MUST FAIL CLOSED. An unreadable response must never be treated as demo, or the demo-only
# guard would permit on an account nobody identified.
s.check("an empty response fails CLOSED to 'live'", _acct_type({}), "live")


# ── THE NODE SIDE HONOURS THE PIN, IN BOTH PLACES ───────────────────────────
# The watchdog was the second enforcement point. Fixing only the endpoint would leave it refreshing
# a different account's token than the platform runs on — keeping a stranger's token alive while the
# pinned one quietly expired.
_routes = open(os.path.join(SP_ROOT, "..", "server", "routes.ts"), encoding="utf-8").read()
_wd = open(os.path.join(SP_ROOT, "..", "server", "services", "healthWatchdog.ts"), encoding="utf-8").read()

s.check("the endpoint reads the pin from the query", "req.query.ctrader_id" in _routes, True)
s.check("...refuses a pin it cannot find rather than substituting an account",
        "check CTRADER_SIGNAL_ACCOUNT_ID" in _routes, True)
s.check("...and returns account_type", "account_type:  accountType" in _routes, True)
s.check("the health watchdog honours the same pin",
        "CTRADER_SIGNAL_ACCOUNT_ID" in _wd, True)

s.done()
