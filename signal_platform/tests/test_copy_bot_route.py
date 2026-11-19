"""PIX cards → HIS DM through the COPY bot (@tandjournal_copybot), "for now" (his request, 19 Nov 2026).

Runs the REAL dispatcher paths (`on_signal_confirmed`, `on_signal_closed`) with Telegram faked at the bot: each fake
bot records (which bot, which chat). Every key check has TEETH. No network, no database.
Run: python tests/test_copy_bot_route.py
"""
import asyncio
import os
import sys
from contextlib import contextmanager

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
import storage.observability_repo as _obs  # noqa: E402
_obs.record = lambda *a, **k: None

from config.settings import settings  # noqa: E402
from notifications import copy_dm, dispatcher as D  # noqa: E402
from strategies.pix import build_signal  # noqa: E402
from strategies.pix_skeleton import Plan  # noqa: E402

BAD, N = [], [0]
SENT: list = []


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def teeth(name, failed_when_broken):
    check(f"TEETH — {name} fails when deliberately broken", bool(failed_when_broken), True)


class FakeBot:
    def __init__(self, name, fail=False):
        self.name, self.fail = name, fail

    async def send_message(self, chat_id, text, **k):
        if self.fail:
            raise RuntimeError("Bad Request: chat not found")
        SENT.append((self.name, chat_id))

    async def send_photo(self, chat_id, photo, caption, **k):
        if self.fail:
            raise RuntimeError("Bad Request: chat not found")
        SENT.append((self.name, chat_id))


MAIN, COPY = FakeBot("main"), FakeBot("copy")
D._get_bot = lambda: MAIN
copy_dm._get_copy_bot = lambda: COPY
D._RETRY_DELAY = 0


async def _nothing(*a, **k):
    return None
D._record_delivery, D._autotrade = _nothing, _nothing
for k, v in {"telegram_chat_id": "CHANNEL", "watchdog_chat_id": "HIS-DM", "copy_bot_dm_strategies": "pix"}.items():
    object.__setattr__(settings, k, v)

run = lambda co: asyncio.new_event_loop().run_until_complete(co)  # noqa: E731
plan = Plan("buy", "zone", "4H", 101.0, 100.0, 102.0, 100.0, 108.0, 3.0, 1, 2, 3, ["test"])


def confirmed(strategy_id="pix"):
    SENT.clear()
    sig = build_signal("XAU/USD", plan, 2, strategy_id, strategy_id.upper())
    run(D.on_signal_confirmed(sig))
    return list(SENT)


print("A PIX ENTRY CARD")
check("goes to HIS DM, sent by the COPY bot — and nowhere else (not the channel)", confirmed(), [("copy", "HIS-DM")])
check("VIX.1 is untouched: the usual bot, the channel (it is on the channel allowlist)", confirmed("vix1"),
      [("main", "CHANNEL")])
real_route = copy_dm.route
copy_dm.route = lambda sid: False
teeth("the copy-bot route (switched off in the code)", confirmed() != [("copy", "HIS-DM")])
copy_dm.route = real_route
object.__setattr__(settings, "copy_bot_dm_strategies", "")
check("FOR NOW: COPY_BOT_DM_STRATEGIES emptied → PIX is back on the channel through the usual bot, as before",
      confirmed(), [("main", "CHANNEL")])
object.__setattr__(settings, "copy_bot_dm_strategies", "pix")

print("\nTHE SAFETY NET — he has not pressed Start on the copy bot yet")
COPY.fail = True
check("the copy bot is refused ('chat not found') → the SAME card reaches his DM through the usual bot",
      confirmed(), [("main", "HIS-DM")])
COPY.fail = False
copy_dm._get_copy_bot = lambda: None
check("no copy-bot token at all → his DM through the usual bot", confirmed(), [("main", "HIS-DM")])
copy_dm._get_copy_bot = lambda: COPY

print("\nA PIX OUTCOME CARD (stopped out / target hit)")


class Row:
    symbol, type, status, entry_price, strategy = "XAU/USD", "sell", "invalidated", 3728.38, "pix"
    take_profit, stop_loss, executed_at, invalidated_at, triggered_at = 3715.32, 3732.73, None, None, None


@contextmanager
def fake_session():
    class S:
        def get(self, model, sid):
            return Row()
    yield S()


import storage.db as _db  # noqa: E402
_db.get_session = fake_session


def closed(strategy):
    Row.strategy = strategy
    SENT.clear()
    run(D.on_signal_closed("id-1"))
    return list(SENT)


check("goes to HIS DM through the COPY bot, like its entry card", closed("pix"), [("copy", "HIS-DM")])
check("a VIX.1 outcome card still goes to his DM through the usual bot (unchanged)", closed("vix1"),
      [("main", "HIS-DM")])
copy_dm.route = lambda sid: False
teeth("the outcome-card route (switched off)", closed("pix") != [("copy", "HIS-DM")])
copy_dm.route = real_route

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
