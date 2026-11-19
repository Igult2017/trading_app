"""PIX stays INDEPENDENT, runs, sends ENTRIES to the channel, and NEVER places an order (docs/strategies/pix.md).

His rule: strategies never share logic — PIX must never import a `bx_sd` module (a change to BX-S/D would then
silently change PIX). His orders of 18 Nov 2026: *"You develop and register it, I want it to start working
immediately"*, then *"test before you link to autotrade. We start by sending them to the channel."*
Its pairs are his: *"It will trade BTCUSD and XAUUSD."*  Run: python tests/pix/test_independence.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

BAD, TOTAL = [], [0]


def check(name, got, want):
    TOTAL[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


# PIX SHARES NO LOGIC (his rule, 18 Nov 2026: *"copy the code which is different from saying let them share a code"*).
# Every import in every PIX file must be PIX's own module, the standard library, or platform PLUMBING — the strategy
# base and types, the delivery ledger, the stage log, observability, price decimals, the card titles and colours.
# Any other `shared.*` module, or any other strategy's file, is strategy logic shared with someone else → FAIL.
PLUMBING = {"core.base_strategy", "core.types", "core.strategy_context", "core", "storage", "shared.pip",
            "notifications", "charting", "data.tick_listeners"}
STDLIB = {"__future__", "dataclasses", "statistics", "logging", "re", "time", "functools", "httpx"}   # httpx: the web library
IMPORT = re.compile(r"^\s*(?:from\s+([\w.]+)\s+import\s+([\w, ]+)|import\s+([\w.]+))", re.M)
PACKAGES = {"strategies", "data", "shared"}     # `from strategies import x` imports the MODULE strategies.x


def outside(text):
    mods = []
    for frm, names, imp in IMPORT.findall(text):
        if imp:
            mods.append(imp)
        elif frm in PACKAGES:
            mods += [f"{frm}.{n.strip()}" for n in names.split(",") if n.strip()]
        else:
            mods.append(frm)
    return [m for m in mods if not (m.startswith("strategies.pix") or m in PLUMBING or m in STDLIB)]


pix_files = sorted((ROOT / "strategies").glob("pix*.py"))
offenders = {f.name: outside(f.read_text(encoding="utf-8")) for f in pix_files}
offenders = {k: v for k, v in offenders.items() if v}
check(f"no PIX file ({len(pix_files)}) imports shared logic or another strategy", offenders, {})
check("TEETH — a shared trend-reader import is caught", outside("from shared.trend_detector import detect"),
      ["shared.trend_detector"])
check("TEETH — another strategy's file is caught", outside("from strategies.bx_sd_zones import find"),
      ["strategies.bx_sd_zones"])
check("TEETH — `from strategies import <another strategy>` is caught", outside("from strategies import vix1_bias"),
      ["strategies.vix1_bias"])
check("TEETH — `from data import <anything but the tick list>` is caught", outside("from data import ctrader_spread"),
      ["data.ctrader_spread"])

init = (ROOT / "strategies" / "__init__.py").read_text(encoding="utf-8")
check("PIX is registered with the scanner", "strategy_registry.register(PIXStrategy())" in init, True)

from strategies.pix import PIXStrategy  # noqa: E402
from core import strategy_registry  # noqa: E402
from config.settings import settings  # noqa: E402
from config.instruments import ALWAYS_OPEN, INSTRUMENTS  # noqa: E402
from data.instrument_filter import get_open_instruments  # noqa: E402
from datetime import datetime, timezone  # noqa: E402
check("PIX is switched on and the registry hands it to the scanner",
      "pix" in [x.id for x in strategy_registry.get_enabled()], True)
check("PIX trades only his two instruments", PIXStrategy.allowed_instruments, ["BTC/USD", "XAU/USD"])
check("both are on the platform's scan list", all(x in INSTRUMENTS for x in PIXStrategy.allowed_instruments), True)
check("its ENTRIES pass the channel allowlist", "pix" in [x.strip() for x in settings.dm_only_exempt.split(",")], True)
check("...but NOT everything (heads-ups stay in the DM)", "pix" in settings.channel_all.split(","), False)
check("NO ORDERS: PIX is not in autotrade_strategies",
      "pix" in [x.strip() for x in settings.autotrade_strategies.split(",")], False)
sat = datetime(2026, 11, 21, 12, tzinfo=timezone.utc)
check("Saturday: only Bitcoin is scanned", get_open_instruments(sat), ["BTC/USD"])
check("Tuesday: everything is scanned", get_open_instruments(datetime(2026, 11, 17, 12, tzinfo=timezone.utc)), INSTRUMENTS)
check("only Bitcoin is round-the-clock", ALWAYS_OPEN, {"BTC/USD"})
from core.dependency_resolver import resolve  # noqa: E402
check("PIX is handed the LIVE bid/ask (else the stop-order check reads a closed, minutes-old close)",
      resolve(PIXStrategy()).needs_spread, True)
import inspect  # noqa: E402
from orchestrator import strategy_runner  # noqa: E402
from strategies.vix1 import Vix1Strategy  # noqa: E402
check("...without the 0.05% spread cap (BTC's $33.82 spread on 18 Nov = 0.054% would refuse every BTC signal)",
      PIXStrategy.spread_cap, False)
check("VIX.1 keeps the cap exactly as before", getattr(Vix1Strategy, "spread_cap", True), True)
check("the runner really asks the strategy before capping",
      'getattr(strategy, "spread_cap", True) and context.spread is not None' in inspect.getsource(strategy_runner), True)

# THE REAL ROUTE — a confirmed PIX signal through `dispatcher.on_signal_confirmed`, Telegram and the DB faked at the edge.
import asyncio  # noqa: E402
from notifications import dispatcher as D  # noqa: E402
from strategies.pix import build_signal  # noqa: E402
from strategies.pix_skeleton import Plan  # noqa: E402
sent = []
async def _text(msg, chat_id=None, **k):  # noqa: E302
    sent.append(chat_id); return True
async def _nothing(*a, **k):  # noqa: E302
    return None
D._send_text, D._record_delivery = _text, _nothing
object.__setattr__(settings, "telegram_chat_id", "CHANNEL")
object.__setattr__(settings, "watchdog_chat_id", "HIS-DM")
plan = Plan("buy", "zone", "4H", 101.0, 100.0, 102.0, 100.0, 108.0, 3.0, 1, 2, 3, ["test"])
# 19 Nov 2026: PIX goes to his DM through the copy bot "for now" (`tests/test_copy_bot_route.py` proves that route).
# This block tests the CHANNEL ALLOWLIST underneath it, so that route is set aside here.
object.__setattr__(settings, "copy_bot_dm_strategies", "")
asyncio.new_event_loop().run_until_complete(D.on_signal_confirmed(build_signal("XAU/USD", plan, 2, "pix", "PIX")))
check("a confirmed PIX entry is sent to the CHANNEL", sent, ["CHANNEL"])
sent.clear()
object.__setattr__(settings, "dm_only_exempt", "bx_sd,vix1")
asyncio.new_event_loop().run_until_complete(D.on_signal_confirmed(build_signal("XAU/USD", plan, 2, "pix", "PIX")))
check("TEETH — without 'pix' in the allowlist it would have gone to his DM instead", sent, ["HIS-DM"])

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {TOTAL[0]} FAILED: {BAD}'} ({TOTAL[0]} checks)")
sys.exit(1 if BAD else 0)
