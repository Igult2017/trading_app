"""OVP stays INDEPENDENT, runs, sends ENTRIES to the channel, and NEVER places an order (docs/strategies/ovp.md).

His rule: strategies never share logic — OVP must never import a `bx_sd` module (a change to BX-S/D would then
silently change OVP). His orders of 18 Nov 2026: *"You develop and register it, I want it to start working
immediately"*, then *"test before you link to autotrade. We start by sending them to the channel."*
Its pairs are his: *"It will trade BTCUSD and XAUUSD."*  Run: python tests/ovp/test_independence.py
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


IMPORT_BX = re.compile(r"^\s*(from\s+strategies(\.|\s+import\s+)[^\n]*bx_sd|import\s+strategies\.bx_sd)", re.M)
ovp_files = sorted((ROOT / "strategies").glob("ovp*.py"))
offenders = [f.name for f in ovp_files if IMPORT_BX.search(f.read_text(encoding="utf-8"))]
check(f"no OVP file ({len(ovp_files)}) imports a BX-S/D module", offenders, [])
check("...the check really finds such an import (teeth)",
      bool(IMPORT_BX.search("from strategies.bx_sd_zones import find\n")), True)

init = (ROOT / "strategies" / "__init__.py").read_text(encoding="utf-8")
check("OVP is registered with the scanner", "strategy_registry.register(OVPStrategy())" in init, True)

from strategies.ovp import OVPStrategy  # noqa: E402
from core import strategy_registry  # noqa: E402
from config.settings import settings  # noqa: E402
from config.instruments import ALWAYS_OPEN, INSTRUMENTS  # noqa: E402
from data.instrument_filter import get_open_instruments  # noqa: E402
from datetime import datetime, timezone  # noqa: E402
check("OVP is switched on and the registry hands it to the scanner",
      "ovp" in [x.id for x in strategy_registry.get_enabled()], True)
check("OVP trades only his two instruments", OVPStrategy.allowed_instruments, ["BTC/USD", "XAU/USD"])
check("both are on the platform's scan list", all(x in INSTRUMENTS for x in OVPStrategy.allowed_instruments), True)
check("its ENTRIES pass the channel allowlist", "ovp" in [x.strip() for x in settings.dm_only_exempt.split(",")], True)
check("...but NOT everything (heads-ups stay in the DM)", "ovp" in settings.channel_all.split(","), False)
check("NO ORDERS: OVP is not in autotrade_strategies",
      "ovp" in [x.strip() for x in settings.autotrade_strategies.split(",")], False)
sat = datetime(2026, 11, 21, 12, tzinfo=timezone.utc)
check("Saturday: only Bitcoin is scanned", get_open_instruments(sat), ["BTC/USD"])
check("Tuesday: everything is scanned", get_open_instruments(datetime(2026, 11, 17, 12, tzinfo=timezone.utc)), INSTRUMENTS)
check("only Bitcoin is round-the-clock", ALWAYS_OPEN, {"BTC/USD"})

# THE REAL ROUTE — a confirmed OVP signal through `dispatcher.on_signal_confirmed`, Telegram and the DB faked at the edge.
import asyncio  # noqa: E402
from notifications import dispatcher as D  # noqa: E402
from strategies.ovp import build_signal  # noqa: E402
from strategies.ovp_skeleton import Plan  # noqa: E402
sent = []
async def _text(msg, chat_id=None, **k):  # noqa: E302
    sent.append(chat_id); return True
async def _nothing(*a, **k):  # noqa: E302
    return None
D._send_text, D._record_delivery = _text, _nothing
object.__setattr__(settings, "telegram_chat_id", "CHANNEL")
object.__setattr__(settings, "watchdog_chat_id", "HIS-DM")
plan = Plan("buy", "zone", "4H", 101.0, 100.0, 102.0, 100.0, 108.0, 3.0, 1, 2, ["test"])
asyncio.new_event_loop().run_until_complete(D.on_signal_confirmed(build_signal("XAU/USD", plan, 2, "ovp", "OVP")))
check("a confirmed OVP entry is sent to the CHANNEL", sent, ["CHANNEL"])
sent.clear()
object.__setattr__(settings, "dm_only_exempt", "bx_sd,vix1")
asyncio.new_event_loop().run_until_complete(D.on_signal_confirmed(build_signal("XAU/USD", plan, 2, "ovp", "OVP")))
check("TEETH — without 'ovp' in the allowlist it would have gone to his DM instead", sent, ["HIS-DM"])

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {TOTAL[0]} FAILED: {BAD}'} ({TOTAL[0]} checks)")
sys.exit(1 if BAD else 0)
