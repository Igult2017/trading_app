"""HIS /level PRICE WATCHES (19 Nov 2026) — the watching and the placing, proved with known answers.

Runs the REAL `execution.level_watch` (its tick listener, its pass, its placement) with the table, the live quote, the
Telegram send and the broker faked at the edge. Every key rule has TEETH. No network, no database.
Run: python tests/test_level_watch.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x.invalid/x")
import storage.observability_repo as _obs  # noqa: E402
_obs.record = lambda *a, **k: None

import execution.level_watch as L  # noqa: E402
from storage import level_watches as repo  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def teeth(name, failed_when_broken):
    check(f"TEETH — {name} fails when deliberately broken", bool(failed_when_broken), True)


# ── the fakes ────────────────────────────────────────────────────────────────────────────────────────────────────
ROWS: dict = {}
repo.with_status = lambda *st: [dict(r) for r in ROWS.values() if r["status"] in st]


def _move(wid, frm, to, **f):
    r = ROWS.get(wid)
    if r is None or r["status"] != frm:
        return False
    r.update(status=to, **f)
    return True
repo.move = _move
QUOTE = {}
import data.fix_quotes as FQ  # noqa: E402
FQ.live_quote = lambda s, *a, **k: QUOTE.get(s)
SAID: list = []
from notifications import dispatcher as D  # noqa: E402


CHATS: list = []
from config.settings import settings  # noqa: E402
object.__setattr__(settings, "watchdog_chat_id", "HIS-DM")


async def _send(text, chat_id=None, reply_markup=None, **k):
    SAID.append((text, [b.callback_data for row in (reply_markup.inline_keyboard if reply_markup else []) for b in row]))
    CHATS.append(chat_id)
    return True
D._send_text = _send
run = lambda co: asyncio.new_event_loop().run_until_complete(co)  # noqa: E731


def watch(wid, low, high, status="new", **f):
    ROWS[wid] = {**dict(id=wid, chat_id="A-GROUP", symbol="XAU/USD", low=low, high=high, side=None, status=status,
                        last_price=None, hit_price=None, order_side=None, entry=None, sl=None, tp=None, signal_id=None),
                 **f}


def ticks(*bids):
    for b in bids:
        L.on_tick("XAU/USD", b)


print("WHERE PRICE IS, AND WHAT 'REACHED' MEANS")
check("price above a level → 'above'; below → 'below'; inside a range → 'inside'",
      (L.side_of(3735, 3730, 3730), L.side_of(3725, 3730, 3730), L.side_of(3727, 3725, 3730)), ("above", "below", "inside"))
check("from ABOVE: the lowest bid reaching the level → reached", L.reached("above", 3730, 3730, 3729.9, 3734), True)
check("from ABOVE: lowest bid 3730.10 → not yet", L.reached("above", 3730, 3730, 3730.1, 3734), False)
check("from BELOW: the highest bid reaching the level → reached", L.reached("below", 3730, 3730, 3725, 3730.0), True)
check("a RANGE from above is reached at its TOP", L.reached("above", 3725, 3730, 3729.5, 3733), True)
check("a RANGE from below is reached at its BOTTOM", L.reached("below", 3725, 3730, 3721, 3725.2), True)

print("\nTHE PASS — arm, then hit once")
L.take_extremes()
QUOTE["XAU/USD"] = (3734.10, 3734.40)
watch("w1", 3730.0, 3730.0)
run(L.check())
check("a new watch is ARMED on the live bid: 'above', and he is told it is watching (with ❌ Stop watching)",
      (ROWS["w1"]["status"], ROWS["w1"]["side"], SAID[-1][0].startswith("👀 <b>WATCHING</b>"), SAID[-1][1]),
      ("watching", "above", True, ["lw:x:w1"]))
ticks(3733.0, 3731.2)
run(L.check())
check("ticks that stay above the level → still watching, no message", (ROWS["w1"]["status"], len(SAID)), ("watching", 1))
ticks(3732.0, 3729.95, 3731.0)                 # a SPIKE down to 3729.95 between two passes, back up by the pass
run(L.check())
check("a spike to the level BETWEEN passes is not missed → reached, the card offers Buy / Sell stop",
      (ROWS["w1"]["status"], SAID[-1][0].startswith("🔔"), SAID[-1][1]), ("hit", True, ["lw:b:w1", "lw:s:w1", "lw:x:w1"]))
ticks(3729.0)
run(L.check())
check("...and it fires ONCE (more ticks through the level → no second card)", len(SAID), 2)
real_take = L.take_extremes
L.take_extremes = lambda: {"XAU/USD": [3731.0, 3731.0, 3731.0]}   # only the LAST price kept: the spike is lost
watch("w2", 3730.0, 3730.0, status="watching", side="above")
ticks(3729.9)
run(L.check())
teeth("lowest/highest kept between passes (only the last price checked)", ROWS["w2"]["status"] == "watching")
L.take_extremes = real_take
L.take_extremes()
QUOTE["XAU/USD"] = (3727.00, 3727.30)
watch("w3", 3725.0, 3730.0)
run(L.check())
check("price ALREADY inside the range when set → he is told at once, with Buy / Sell stop",
      (ROWS["w3"]["status"], "ALREADY" in SAID[-1][0]), ("hit", True))
watch("w4", 3740.0, 3740.0, status="cancelled")
ticks(3741)
run(L.check())
check("a watch he STOPPED is never armed or fired", ROWS["w4"]["status"], "cancelled")
QUOTE.pop("XAU/USD")
L.take_extremes()
watch("w5", 3740.0, 3740.0)
run(L.check())
check("no live price yet → the watch waits (stays new), nothing is guessed", ROWS["w5"]["status"], "new")

check("EVERY message so far went to HIS DM — never the chat stored on the watch (his ruling: DM only)",
      set(CHATS), {"HIS-DM"})
print("\nHIS ORDER — the normal placement, MANUAL + CONFIRMED")
from storage import signal_repo  # noqa: E402
import execution.account as ACC  # noqa: E402
import execution.placer as PL  # noqa: E402
SAVED, PLACED, EXPIRED = [], [], []
signal_repo.save = lambda sig, *a, **k: (SAVED.append(sig), "sig-1")[1]
signal_repo.update_status = lambda sid, st, *a, **k: EXPIRED.append((sid, st.value))


class Acct:
    creds, account_type, equity, risk_base = {"x": 1}, "demo", 10000.0, 10000.0


async def _acct():
    return Acct()
ACC.load_account = _acct


async def _place(sig, creds, account_type, equity, notify=None, risk_base=0.0):
    PLACED.append((sig.manual, sig.confirmed, sig.strategy_id, sig.entry_price, sig.stop_loss, sig.take_profit, sig.db_id))
    return "ORDER-9"
PL.place_for_signal = _place
QUOTE["XAU/USD"] = (3729.80, 3730.10)
watch("o1", 3730.0, 3730.0, status="order_pending", order_side="buy", entry=3733.0, sl=3727.5, tp=None)
run(L.check())
check("a BUY stop above the ask → placed through the normal placement as MANUAL + CONFIRMED, no target (his choice)",
      (ROWS["o1"]["status"], PLACED[-1]), ("placed", (True, True, "manual_level", 3733.0, 3727.5, 0.0, "sig-1")))
watch("o2", 3730.0, 3730.0, status="order_pending", order_side="buy", entry=3730.0, sl=3727.5, tp=3740.0)
n = len(PLACED)
run(L.check())
check("a BUY stop AT/below the ask (3730.00 vs ask 3730.10) → refused, nothing placed, he is told why",
      (ROWS["o2"]["status"], len(PLACED) == n, "would fill at once" in SAID[-1][0]), ("refused", True, True))
watch("o3", 3730.0, 3730.0, status="order_pending", order_side="sell", entry=3729.90, sl=3733.0, tp=3720.0)
run(L.check())
check("a SELL stop at/above the bid (3729.90 vs bid 3729.80) → refused", ROWS["o3"]["status"], "refused")
real_place = L.place


async def _no_check(w):                          # break it: skip the "already through the market" test
    QUOTE["XAU/USD"] = (3000.0, 3000.1)
    return await real_place(w)
watch("o4", 3730.0, 3730.0, status="order_pending", order_side="buy", entry=3730.0, sl=3727.5, tp=None)
L.place = _no_check
run(L.check())
L.place = real_place
teeth("the already-through-the-market refusal (market moved so the check cannot bite)", ROWS["o4"]["status"] == "placed")
QUOTE["XAU/USD"] = (3729.80, 3730.10)


async def _refused(sig, creds, account_type, equity, notify=None, risk_base=0.0):
    await notify("⚠️ NOT PLACED — the spread is too wide")
    return None
PL.place_for_signal = _refused
watch("o5", 3730.0, 3730.0, status="order_pending", order_side="buy", entry=3733.0, sl=3727.5, tp=None)
run(L.check())
check("the placement refuses → refused, the saved signal is EXPIRED (no phantom), and he gets the placer's reason",
      (ROWS["o5"]["status"], EXPIRED[-1], "spread is too wide" in SAID[-1][0]), ("refused", ("sig-1", "expired"), True))
signal_repo.save = lambda sig, *a, **k: ""
watch("o6", 3730.0, 3730.0, status="order_pending", order_side="buy", entry=3733.0, sl=3727.5, tp=None)
run(L.check())
check("he already has an active Manual level BUY on the pair → refused, said so", ("already have" in SAID[-1][0]), True)

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
