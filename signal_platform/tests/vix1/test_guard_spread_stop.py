"""A SELL'S STOP MUST BE WORTH SEVERAL SPREADS — and this must refuse NOTHING ELSE.

His instruction, 2026-09-20: *"Yes build it and make sure it only refuses orders it is meant to refuse.
The refusal only works for autotraded orders but the signal is still sent to telegram."*

WHY THE RULE EXISTS. A sell is closed by BUYING BACK, so its stop fires on the buy price while the level
it was measured from is drawn on chart prices. Measured over 222 real fills with the broker's own bid AND
ask ticks at every one (`docs/strategies/vix1-measured.md`): the year reads +16.3R on the chart price and
-21.6R on the price the trades really close at, and all 37.9R of that is on the sells. Not taking the
sells whose stop is under 5x the spread: -14.9R -> +6.7R.

WHAT THIS FILE IS REALLY FOR — the second half of his sentence. Most of these cases assert that the guard
does NOT fire: on a buy, on a wide-enough sell, on the exact boundary, when the spread cannot be read, and
when the setting is off. A guard that refuses more than it was built to refuse is worse than no guard.

Real `guards.check`, his real numbers, every other gate held open so only rule 8 can speak.
"""
import os
import re

from _harness import Suite
from config.settings import settings
from execution import guards

s = Suite("AUTOTRADE — a sell's stop must clear the spread, and nothing else may be refused")

_KEYS = ("autotrade_enabled", "autotrade_demo_only", "autotrade_strategies", "autotrade_symbols",
         "autotrade_sessions", "autotrade_max_per_day", "autotrade_min_stop_spread")
_orig = {k: getattr(settings, k) for k in _KEYS}
for k, v in dict(autotrade_enabled=True, autotrade_demo_only=True, autotrade_strategies="vix1",
                 autotrade_symbols="", autotrade_sessions="", autotrade_max_per_day=99,
                 autotrade_min_stop_spread=5.0).items():
    object.__setattr__(settings, k, v)
guards.reset()

P = 0.0001                       # one pip on a currency pair


def ask(direction, stop_pips, spread_pips, symbol="GBP/USD"):
    """-> None if the order would be placed, else the refusal."""
    guards.reset()
    return guards.check(symbol, direction, "vix1", "demo", 10_000.0, 1.0, book=([], set()),
                        stop_distance=None if stop_pips is None else stop_pips * P,
                        spread=None if spread_pips is None else spread_pips * P)


# ── THE ONE IT IS BUILT TO REFUSE: his 16 Sep GBP/USD sell ──────────────────
# 2.5-pip stop, 1.4-pip spread at the fill = 1.8x. It filled and lost $125 in 1.2 seconds, past its own
# stop the moment it opened.
why = ask("SELL", 2.5, 1.4)
s.check("16 Sep GBP/USD sell (2.5p stop, 1.4p spread) is refused", why is not None, True)
s.check("...and the reason carries BOTH numbers, so he can check it", bool(why) and "1.8x" in why, True)
s.check("...and says why a sell is different", bool(why) and "BUY price" in why, True)

# ── EVERYTHING IT MUST LEAVE ALONE ──────────────────────────────────────────
s.check("18 Sep EUR/USD sell (5.3p stop, 1.0p spread) is placed",
        ask("SELL", 5.3, 1.0, "EUR/USD"), None)
s.check("a BUY with the SAME tight numbers is placed — a buy's stop fires on the chart price",
        ask("BUY", 2.5, 1.4), None)
s.check("exactly 5.0x the spread is placed — the boundary is not a refusal", ask("SELL", 5.0, 1.0), None)
s.check("a hair over 5x is placed", ask("SELL", 5.01, 1.0), None)
s.check("a hair under 5x is refused", ask("SELL", 4.99, 1.0) is not None, True)
s.check("the spread could not be read -> PLACED, never refused on a number we do not have",
        ask("SELL", 2.5, None), None)
s.check("a zero spread reads as unmeasured, not as infinitely good", ask("SELL", 2.5, 0.0), None)
s.check("no stop distance given -> placed, not refused", ask("SELL", None, 1.4), None)
s.check("gold: a 28-pip stop against 2.1p never trips it (it never did in 12 months)",
        ask("SELL", 28.0, 2.1, "XAU/USD"), None)

object.__setattr__(settings, "autotrade_min_stop_spread", 0.0)
s.check("the setting really switches it off: 0.0 places the 1.8x sell", ask("SELL", 2.5, 1.4), None)
object.__setattr__(settings, "autotrade_min_stop_spread", 5.0)

# ── THE OTHER GATES ARE UNTOUCHED — rule 8 is last and must not mask them ───
object.__setattr__(settings, "autotrade_enabled", False)
s.check("the kill switch still speaks first, not the spread rule",
        "autotrade is OFF" in (ask("SELL", 2.5, 1.4) or ""), True)
object.__setattr__(settings, "autotrade_enabled", True)
s.check("a tight sell with NO size is refused for the size, not the spread",
        "no honest size" in (guards.check("GBP/USD", "SELL", "vix1", "demo", 10_000.0, 0.0,
                                          book=([], set()), stop_distance=2.5 * P,
                                          spread=1.4 * P) or ""), True)

# ── AND THE HALF OF HIS SENTENCE THE GUARD CANNOT PROVE BY ITSELF ───────────
# *"the signal is still sent to telegram"*. That is structural: the dispatcher sends the card and only
# THEN calls autotrade, so nothing this module returns can suppress a signal. Asserted on the source,
# the same way test_rungs asserts both stop-movers read one ladder.
_disp = open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                          "notifications", "dispatcher.py"), encoding="utf-8").read()
_send_at = _disp.find("await _record_delivery(")
_auto_at = _disp.find("await _autotrade(signal)")
s.check("the card is delivered BEFORE autotrade is ever called",
        _send_at > 0 and _auto_at > _send_at, True)
s.check("...and autotrade sits inside its own try, so a refusal cannot reach the card path",
        bool(re.search(r"try:\s*\n\s*await _autotrade\(signal\)", _disp)), True)

# ── TEETH ───────────────────────────────────────────────────────────────────
s.teeth("without the rule the 16 Sep sell would be placed",
        (object.__setattr__(settings, "autotrade_min_stop_spread", 0.0),
         ask("SELL", 2.5, 1.4) is None)[1])
object.__setattr__(settings, "autotrade_min_stop_spread", 5.0)
s.teeth("and the rule really is SELL-only — the identical buy is never refused",
        ask("BUY", 1.0, 1.4) is None and ask("SELL", 1.0, 1.4) is not None)

for k, v in _orig.items():
    object.__setattr__(settings, k, v)
guards.reset()
s.done()
