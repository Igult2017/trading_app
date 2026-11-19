"""ORDERS HE DECIDES SKIP AUTOTRADE'S PAIRS, STRATEGIES, SESSIONS AND CUT-OFF (19 Nov 2026).

His words: *"make an exemption for orders placed by DM so that they can be placed whether autotrade doesnt allow
them and no matter the time."* His answers: 1A an outside signal is still offered as a Confirm card, marked; 2A in
autotrade mode it comes to his DM as a Confirm card instead of being refused; 3B the strategy list is skipped too.

Runs the REAL `guards.check`, `guards.scope_refusal` and `placer.place_for_signal`. Faked at the edges only: the
clock (fixed times), the broker, Telegram, the database. Every key rule has TEETH.
Run: python tests/test_dm_exemption.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "vix1")))
from _harness import Suite, trade_mode_is  # noqa: E402  (also stubs the observability writes)

from config import live_settings  # noqa: E402
from config.settings import settings  # noqa: E402
from core.types import Direction, Signal  # noqa: E402
from execution import best_signal, confirmations, decision_log, guards, placer  # noqa: E402
import scheduler.session_windows as SW  # noqa: E402
from storage import autotrade_repo  # noqa: E402

s = Suite("DM ORDERS — exempt from autotrade's pairs, strategies, hours; outside signals offered, not refused")
run = asyncio.new_event_loop().run_until_complete

# ── the edges ────────────────────────────────────────────────────────────────────────────────────────────────────
live_settings._load = lambda: {}                       # no admin-panel rows: the values below are the ones used
for k, v in dict(autotrade_demo_only=True, autotrade_strategies="vix1", autotrade_symbols="eur/usd,gbp/usd,gbp/jpy",
                 autotrade_sessions="london,new_york", autotrade_cutoff_utc="16:00", autotrade_max_per_day=6).items():
    object.__setattr__(settings, k, v)
FILLS = [0]
autotrade_repo.fills_since = lambda hours=24: FILLS[0]
autotrade_repo.record_placed = lambda *a, **k: None
NOW = [datetime(2026, 11, 19, 20, 0, tzinfo=timezone.utc)]        # 20:00 UTC — 11pm Kenya, after every session


class _Clock(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW[0]


guards.datetime = _Clock
_real_sessions = SW.get_current_sessions
SW.get_current_sessions = lambda now=None: _real_sessions(NOW[0])
EVENING = datetime(2026, 11, 19, 20, 0, tzinfo=timezone.utc)
LONDON = datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc)
FREE = ([], set())
GOLD = ("XAU/USD", "SELL", "pix", "demo", 10_000.0, 0.5)

# ── 1. the rules themselves ──────────────────────────────────────────────────────────────────────────────────────
trade_mode_is("auto")
why = guards.check(*GOLD, book=FREE)
s.check("autotrade: PIX on gold at 20:00 UTC → refused by the scope", why is not None and why == guards.scope_refusal("XAU/USD", "pix"), True)
s.check("...a DM order, same trade → ALLOWED", guards.check(*GOLD, book=FREE, dm=True), None)
s.check("a /level order (manual) on gold at 20:00, strategy manual_level → ALLOWED",
        guards.check("XAU/USD", "BUY", "manual_level", "demo", 10_000.0, 0.5, book=FREE, manual=True), None)
s.check("a DM order on a LIVE account → still refused (demo only)",
        "demo_only" in (guards.check("XAU/USD", "SELL", "pix", "live", 10_000.0, 0.5, book=FREE, dm=True) or ""), True)
s.check("a DM order with no honest size → still refused",
        "no honest size" in (guards.check("XAU/USD", "SELL", "pix", "demo", 10_000.0, 0.0, book=FREE, dm=True) or ""), True)
FILLS[0] = 6
s.check("a DM order at the daily cap → still refused", "daily cap" in (guards.check(*GOLD, book=FREE, dm=True) or ""), True)
FILLS[0] = 0
busy = SimpleNamespace(symbol="GBP/USD", bullish=True, volume=1, opened_at=0, label="auto-vix1-x")
s.check("a DM order while another trade is open → still refused (one at a time)",
        guards.check(*GOLD, book=([busy], set()), dm=True) is not None, True)
trade_mode_is("off")
s.check("his Confirm while trading is OFF → still refused (OFF places nothing)",
        "OFF" in (guards.check(*GOLD, book=FREE, dm=True) or ""), True)
trade_mode_is("auto")
NOW[0] = LONDON
s.check("autotrade inside its limits (EUR/USD VIX.1 at 10:00 UTC) → allowed, as before",
        guards.check("EUR/USD", "BUY", "vix1", "demo", 10_000.0, 0.5, book=FREE), None)
s.check("...and scope_refusal agrees it is inside", guards.scope_refusal("EUR/USD", "vix1"), None)
NOW[0] = EVENING
_real_check = guards.check
guards.check = lambda *a, dm=False, **k: _real_check(*a, **k)        # SABOTAGE: the exemption ignored
s.teeth("a DM order is allowed outside autotrade's limits", guards.check(*GOLD, book=FREE, dm=True) is not None)
guards.check = _real_check

# ── 2. through the real placer ───────────────────────────────────────────────────────────────────────────────────
sent, offers, refused, turns = [], [], [], []


class _Broker:
    def __init__(self, *a):
        pass

    async def place_stop(self, **k):
        sent.append(k["symbol"])
        return SimpleNamespace(ok=True, order_id="901", error=None)


import execution.broker as broker  # noqa: E402
broker.StopOrderClient = _Broker
placer._live_book = lambda: asyncio.sleep(0, result=FREE)
placer._usd_jpy_for = lambda sym: asyncio.sleep(0, result=None)
confirmations.offer = lambda signal, lots, pips, outside=None: asyncio.sleep(0, result=offers.append((signal.symbol, outside)))
decision_log.refused = lambda *a, **k: asyncio.sleep(0, result=refused.append(a[1]))
decision_log.placed = lambda *a, **k: asyncio.sleep(0)
_real_turn = best_signal.take_turn


async def _turn(sig):
    turns.append(sig.symbol)
    return await _real_turn(sig)

best_signal.take_turn = _turn
best_signal._WINDOW_S = 0.01


def gold(**k):
    base = dict(symbol="XAU/USD", direction=Direction.SELL, strategy_id="pix", strategy_name="PIX",
                entry_price=4012.50, stop_loss=4020.00, take_profit=3990.00, confidence=0.8, db_id="g-1")
    base.update(k)
    return Signal(**base)


def eur(**k):
    base = dict(symbol="EUR/USD", direction=Direction.BUY, strategy_id="vix1", strategy_name="VIX.1",
                entry_price=1.10000, stop_loss=1.09880, take_profit=1.10480, confidence=0.85, db_id="e-1")
    base.update(k)
    return Signal(**base)


def place(x):
    guards.reset()
    return run(placer.place_for_signal(x, {}, "demo", 10_000.0, risk_base=10_000.0))


def clear():
    for x in (sent, offers, refused, turns):
        x.clear()


trade_mode_is("auto")
clear()
got = place(gold())
s.check("AUTO + PIX gold at 20:00 → OFFERED as a Confirm card (2A, 3B)", [o[0] for o in offers], ["XAU/USD"])
s.check("...the card carries WHY it is outside", "not in autotrade_strategies" in (offers[0][1] or "") if offers else False, True)
s.check("...and nothing reaches the broker", (got, sent), (None, []))
s.check("...and it never enters the best-signal window", turns, [])
clear()
got = place(gold(confirmed=True))
s.check("his Confirm of that card → PLACED", (got, sent), ("901", ["XAU/USD"]))
clear()
trade_mode_is("confirm")
place(gold())
s.check("CONFIRM mode + outside → offered, marked (1A)", (len(offers), bool(offers and offers[0][1])), (1, True))
clear()
trade_mode_is("auto")
NOW[0] = LONDON
got = place(eur())
s.check("AUTO + inside (EUR/USD VIX.1 at 10:00) → placed by itself, nothing offered", (got, sent, offers), ("901", ["EUR/USD"], []))
NOW[0] = EVENING
clear()
FILLS[0] = 6
place(gold())
s.check("outside + daily cap reached → REFUSED, not offered", (offers, len(refused)), ([], 1))
FILLS[0] = 0
clear()
trade_mode_is("off")
place(gold())
s.check("trading OFF + outside → nothing offered", (offers, sent), ([], []))
trade_mode_is("auto")
clear()
_real_scope = guards.scope_refusal
guards.scope_refusal = lambda *a, **k: None                              # SABOTAGE: nothing is ever outside
place(gold())
s.teeth("an outside signal is offered, not placed", offers == [] and sent == ["XAU/USD"])
guards.scope_refusal = _real_scope

# ── 3. the card ──────────────────────────────────────────────────────────────────────────────────────────────────
from execution.confirm_messages import card  # noqa: E402
marked = card(gold(), 0.5, 7.5, "symbol 'XAU/USD' is not in autotrade_symbols")
s.check("the card says it is outside autotrade hours/pairs, and why",
        ("Outside autotrade hours/pairs" in marked, "not in autotrade_symbols" in marked), (True, True))
s.check("an inside card says nothing of the kind", "Outside autotrade" in card(eur(), 0.5, 12.0), False)
s.check("the card shows the live risk %, not a fixed number", "1% risk" in marked, True)
object.__setattr__(settings, "autotrade_risk_pct", 1.5)
s.check("the risk on the card follows the setting (1.5)", "1.5% risk" in card(eur(), 0.5, 12.0), True)
object.__setattr__(settings, "autotrade_risk_pct", 1.0)
s.done()
