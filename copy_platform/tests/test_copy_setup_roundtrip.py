"""THE SETUP PANEL'S CHOICES MUST SURVIVE, AND MUST ACTUALLY APPLY.

HIS REPORT: *"I would try connect a slave account and when I reload the page everything is undone."*

Three separate defects sat behind that, and this file covers the two that live in the engine:

  1. "Allowed instruments" never reached the engine — the browser collected categories
     ("Forex", "Metals") while `symbol_whitelist` holds broker symbol names ("EURUSD"), and nothing
     translated between them. `is_symbol_allowed` now accepts BOTH forms.
  2. "Allowed sessions" did nothing anywhere — the engine's follower model did not even map
     `session_filter` / `active_sessions`, so four buttons that look like risk controls were
     decoration. `session_filter.is_session_allowed` is the gate.

THE DANGEROUS DIRECTION IS "BLOCKS TOO MUCH". A whitelist that stops matching, or a session gate
that refuses by default, silently blocks every copied trade — the failure looks like "copy trading
is broken" with nothing in the logs but SKIP. So the off-by-default paths and the
backwards-compatibility of plain symbol lists both get teeth cases.
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _harness import Suite

from lot_calc import is_symbol_allowed, asset_class
from session_filter import active_sessions, is_session_allowed

s = Suite("COPY SETUP — the panel's choices, stored and applied")


class F:
    """Only the fields these two gates read off a follower row."""
    def __init__(self, whitelist=None, blacklist=None, session_filter=False, active=None):
        self.symbol_whitelist = whitelist
        self.symbol_blacklist = blacklist
        self.session_filter = session_filter
        self.active_sessions = active


# ── 1. CATEGORIES ───────────────────────────────────────────────────────────
print()
print("   what the buttons send (categories):")
s.check("gold is Metals", asset_class("XAUUSD"), "Metals")
s.check("silver is Metals", asset_class("XAGUSD"), "Metals")
s.check("a major is Forex", asset_class("EURUSD"), "Forex")
s.check("a slashed pair is Forex too", asset_class("GBP/JPY"), "Forex")
s.check("an index is Indices", asset_class("US500"), "Indices")
s.check("bitcoin is Crypto", asset_class("BTCUSDT"), "Crypto")
s.check("something unrecognised is uncategorised", asset_class("WHAT99"), "")

s.check("a Metals-only follower copies gold",
        is_symbol_allowed("XAUUSD", F(whitelist=["Metals"])), True)
s.check("...and refuses a currency pair",
        is_symbol_allowed("EURUSD", F(whitelist=["Metals"])), False)
s.check("his screenshot's choice (Forex+Metals+Indices+Crypto) copies gold",
        is_symbol_allowed("XAUUSD", F(whitelist=["Forex", "Metals", "Indices", "Crypto"])), True)
s.check("an uncategorised symbol is NOT copied under a category-only list",
        is_symbol_allowed("WHAT99", F(whitelist=["Forex"])), False)

# BACKWARDS COMPATIBILITY. Any follower already carrying real symbol names must behave exactly as
# before — this gate decides whether a trade copies at all.
print()
print("   plain symbol lists still behave as they always did:")
s.check("a named symbol passes", is_symbol_allowed("EURUSD", F(whitelist=["EURUSD"])), True)
s.check("...and one not named is refused", is_symbol_allowed("GBPUSD", F(whitelist=["EURUSD"])), False)
s.check("no whitelist means everything is allowed", is_symbol_allowed("EURUSD", F()), True)
s.check("the blacklist still wins", is_symbol_allowed("EURUSD", F(blacklist=["EURUSD"])), False)
s.check("...even when the category is allowed",
        is_symbol_allowed("XAUUSD", F(whitelist=["Metals"], blacklist=["XAUUSD"])), False)
s.check("symbols and categories mix in one list",
        (is_symbol_allowed("XAUUSD", F(whitelist=["EURUSD", "Metals"])),
         is_symbol_allowed("EURUSD", F(whitelist=["EURUSD", "Metals"])),
         is_symbol_allowed("GBPUSD", F(whitelist=["EURUSD", "Metals"]))),
        (True, True, False))


# ── 2. SESSIONS ─────────────────────────────────────────────────────────────
print()
print("   the session gate:")
LONDON_NOON = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)   # London + New York both open
TOKYO_NIGHT = datetime(2026, 9, 1, 2, 0, tzinfo=timezone.utc)    # Tokyo open, London shut

s.check("London is open at 12:00 UTC", "London" in active_sessions(LONDON_NOON), True)
s.check("London is shut at 02:00 UTC", "London" in active_sessions(TOKYO_NIGHT), False)
s.check("Tokyo is open at 02:00 UTC", "Tokyo" in active_sessions(TOKYO_NIGHT), True)
s.check("sessions overlap rather than being one answer",
        len(active_sessions(LONDON_NOON)) >= 2, True)

s.check("a London-only follower copies during London",
        is_session_allowed(F(session_filter=True, active=["London"]), LONDON_NOON)[0], True)
s.check("...and refuses outside it",
        is_session_allowed(F(session_filter=True, active=["London"]), TOKYO_NIGHT)[0], False)
s.check("...with a reason that names both sides",
        "London" in (is_session_allowed(F(session_filter=True, active=["London"]), TOKYO_NIGHT)[1] or ""),
        True)

# OFF BY DEFAULT, TWO WAYS. Either would otherwise refuse every trade for followers saved before
# this feature existed.
print()
print("   off by default — the way this could silently block everything:")
s.check("no filter set -> allowed", is_session_allowed(F(), TOKYO_NIGHT)[0], True)
s.check("filter on but no sessions chosen -> allowed",
        is_session_allowed(F(session_filter=True, active=[]), TOKYO_NIGHT)[0], True)
s.check("a follower row with neither field present -> allowed",
        is_session_allowed(object(), TOKYO_NIGHT)[0], True)


# ── 3. THE GATE IS WIRED, AND ONLY ON OPENS ─────────────────────────────────
# A session gate on a CLOSE would strand him in a live position because London shut.
print()
print("   wiring:")
disp = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "dispatcher.py"), encoding="utf-8").read()
s.check("the dispatcher calls the session gate", "is_session_allowed(follower)" in disp, True)
s.check("...only for OPENs", 'if etype == "OPEN":' in disp, True)

dbsrc = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "db.py"), encoding="utf-8").read()
s.check("the follower model maps session_filter", "session_filter" in dbsrc, True)
s.check("...and active_sessions", "active_sessions" in dbsrc, True)


# ── TEETH ───────────────────────────────────────────────────────────────────
s.teeth("a category-blind whitelist would refuse gold for a Metals follower",
        ("XAUUSD" not in ["Metals"]) and is_symbol_allowed("XAUUSD", F(whitelist=["Metals"])))
s.teeth("a session gate that ignored the off switch would refuse an unfiltered follower",
        (not is_session_allowed(F(session_filter=True, active=["London"]), TOKYO_NIGHT)[0])
        and is_session_allowed(F(), TOKYO_NIGHT)[0])

s.done()
