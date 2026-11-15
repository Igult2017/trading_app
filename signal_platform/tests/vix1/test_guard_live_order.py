"""A WITHDRAWN ORDER MUST NOT BLOCK THE NEXT SIGNAL — his EUR/USD sell of 14 Sep 13:03, through the real guard.

HIS QUESTION, 2026-09-15: *"Is autotrader even taking trades anymore?"* Proven from the broker's own
order history: on 14 Sep his VIX.1 EUR/USD sell of 07:23 became order 360658076 (38,500,000 units) and
was withdrawn at 07:26, when price touched its stop side before its entry. At 13:03 a new EUR/USD sell
reached its entry and NO ORDER WAS SENT. `guards.check` rule 7 refused anything PLACED in the last 24
hours, and nothing ever took a dead order off its list.

THE RULE NOW: an earlier order blocks only while the broker still has it RESTING, or it FILLED into a
trade that is still OPEN. When the broker cannot be read it refuses exactly as before.

The real gap between the two signals (5h40m) is kept but anchored to NOW. The guard only looks back 24
hours, so pinning the calendar date would make every check pass without rule 7 ever running.
The decisions each of these produces are checked in `test_autotrade_decision_log.py`.
"""
import asyncio
from datetime import datetime, timedelta, timezone

from _harness import Suite, trade_mode_is

from config.settings import settings
from data import ctrader_positions as CP
from execution import fill_watch, guards, liveness
from monitor import position_book as PB
from storage import autotrade_repo

s = Suite("AUTOTRADE — a withdrawn order must not block the next signal (14 Sep 13:03)")
run = asyncio.new_event_loop().run_until_complete

_KEYS = ("autotrade_sessions", "autotrade_demo_only", "autotrade_strategies",
         "autotrade_symbols", "autotrade_max_per_day",
         "autotrade_cutoff_utc")
_orig = {k: getattr(settings, k) for k in _KEYS}
trade_mode_is("auto")
for k, v in dict(autotrade_demo_only=True, autotrade_strategies="vix1",
                 autotrade_symbols="", autotrade_sessions="", autotrade_max_per_day=6,
                 autotrade_cutoff_utc="").items():
    object.__setattr__(settings, k, v)      # every OTHER gate open; no session list, so no clock decides

NOW = datetime.now(timezone.utc)
AT_0723 = NOW - timedelta(hours=5, minutes=40)
ORDER, VOLUME = "360658076", 38_500_000
SIGNAL_1303 = dict(symbol="EUR/USD", direction="SELL", strategy="vix1",
                   account_type="demo", equity=10_000.0, lots=3.85)


class Pos:
    """The fields the guard reads off a real `data.ctrader_positions.Position`."""
    def __init__(self, symbol="EUR/USD", bullish=False, volume=VOLUME, opened_at=None):
        self.symbol, self.bullish, self.volume = symbol, bullish, volume
        self.opened_at = opened_at if opened_at is not None else int(AT_0723.timestamp()) + 1_140
        self.label = ""


guards._placed.clear()
guards._placed.append((AT_0723, "EUR/USD", "SELL", ORDER, VOLUME))

# ── 1. THE REAL EVENT ──────────────────────────────────────────────────────
# The broker at 13:03, as its own history shows: 360658076 no longer resting, nothing open.
s.check("14 Sep 13:03 — the 07:23 order is gone at the broker, so the new sell is ALLOWED",
        guards.check(**SIGNAL_1303, book=([], set())), None)
resting = guards.check(**SIGNAL_1303, book=([], {int(ORDER)}))
s.check("...while 360658076 is still RESTING it is refused", resting is not None, True)
s.check("...and the reason names the order", ORDER in (resting or ""), True)
still_open = guards.check(**SIGNAL_1303, book=([Pos()], set()))
s.check("...while it FILLED into a trade still OPEN it is refused", still_open is not None, True)
s.check("...saying the trade is still open", "still open" in (still_open or ""), True)
unknown = guards.check(**SIGNAL_1303, book=None)
s.check("the broker could not be read → refused, exactly as before the fix", unknown is not None, True)
s.check("...and it says so", "could not be read" in (unknown or ""), True)
s.teeth("the guard tells a live order from a dead one",
        guards.check(**SIGNAL_1303, book=([], set())) is None
        and guards.check(**SIGNAL_1303, book=([], {int(ORDER)})) is not None)

# ── 2. ONE TRADE AT A TIME, AND WHAT IS NOT OURS (his rule, 15 Nov 2026) ───
# *"we only trade 1 signal at a time."* A live order now blocks EVERY pair and direction, not only
# its own. What is not ours (his hand trades, a fill of another size) still blocks nothing.
s.check("the OPPOSITE direction is refused while 360658076 rests (one trade at a time)",
        "one trade at a time" in (guards.check(**dict(SIGNAL_1303, direction="BUY"),
                                               book=([], {int(ORDER)})) or ""), True)
s.check("another PAIR is refused while it rests",
        "one trade at a time" in (guards.check(**dict(SIGNAL_1303, symbol="GBP/USD"),
                                               book=([], {int(ORDER)})) or ""), True)
s.check("...and allowed once the broker shows it gone",
        guards.check(**dict(SIGNAL_1303, symbol="GBP/USD"), book=([], set())), None)
s.check("with the broker unreadable another pair is refused too — doubt refuses",
        guards.check(**dict(SIGNAL_1303, symbol="GBP/USD"), book=None) is not None, True)
_auto = Pos(symbol="GBP/JPY", bullish=True, volume=5, opened_at=0)
_auto.label = "auto-vix1-1a2b3c4d"
guards._placed.clear()
s.check("an open trade carrying the bot's mark blocks a new order on another pair",
        "GBP/JPY BUY autotrade trade is still open"
        in (guards.check(**SIGNAL_1303, book=([_auto], set())) or ""), True)
_his = Pos(symbol="GBP/JPY", bullish=True, volume=5, opened_at=0)
_his.label = ""
s.teeth("his own unmarked trade blocks nothing",
        guards.check(**SIGNAL_1303, book=([_his], set())) is None)
from data import ctrader_positions as _CPL   # noqa: E402
_real_labels = _CPL.last_resting_labels
_CPL.last_resting_labels = lambda: ["auto-vix1-9f8e7d6c"]
s.check("a resting order carrying the mark blocks it too",
        "still resting" in (guards.check(**SIGNAL_1303, book=([], set())) or ""), True)
_CPL.last_resting_labels = lambda: ["his-own"]
s.check("...a resting order of HIS does not", guards.check(**SIGNAL_1303, book=([], set())), None)
_CPL.last_resting_labels = _real_labels
guards._placed.append((AT_0723, "EUR/USD", "SELL", ORDER, VOLUME))
s.check("an open EUR/USD sell of a DIFFERENT size is not our fill",
        guards.check(**SIGNAL_1303, book=([Pos(volume=1_000_000)], set())), None)
s.check("an open EUR/USD sell opened BEFORE we placed is not our fill",
        guards.check(**SIGNAL_1303, book=([Pos(opened_at=int(AT_0723.timestamp()) - 60)], set())), None)
s.check("an open EUR/USD BUY is not our sell",
        guards.check(**SIGNAL_1303, book=([Pos(bullish=True)], set())), None)
guards._placed[0] = (AT_0723, "EUR/USD", "SELL", "", VOLUME)
s.check("a placement with no recorded order id cannot be confirmed gone → refused",
        guards.check(**SIGNAL_1303, book=([], set())) is not None, True)

# ── 3. THE DAILY CAP COUNTS FILLS ONLY (his ruling, 15 Nov 2026) ───────────
# *"Trades that are not filled are never counted by the broker."* Six withdrawn orders used to use up
# the day. Now only FILLED orders count; if the fills cannot be read it falls back to the old,
# stricter count of placements.
guards._placed.clear()
for i in range(6):
    guards._placed.append((NOW - timedelta(hours=20 - i), "XAU/USD", "SELL", str(i), 100))
_real_fills = autotrade_repo.fills_since
autotrade_repo.fills_since = lambda hours=24: 0
s.check("six WITHDRAWN orders (0 fills) no longer hit the daily cap",
        guards.check(**SIGNAL_1303, book=([], set())), None)
autotrade_repo.fills_since = lambda hours=24: 6
capped = guards.check(**SIGNAL_1303, book=([], set())) or ""
s.check("six FILLED trades in 24h hit the cap of 6", "daily cap" in capped, True)
s.check("...and the reason says filled trades", "filled trades" in capped, True)
autotrade_repo.fills_since = lambda hours=24: None
s.teeth("fills unreadable → the stricter placement count still refuses",
        "orders placed" in (guards.check(**SIGNAL_1303, book=([], set())) or ""))
autotrade_repo.fills_since = _real_fills

# ── 4. A RESTART KEEPS THE ORDER ID AND SIZE ───────────────────────────────
guards._placed.clear()
_real_recent = autotrade_repo.recent_placements
autotrade_repo.recent_placements = lambda hours=24: [(AT_0723, "EUR/USD", "SELL", ORDER, VOLUME)]
s.check("the boot reload restores one placement", guards.rehydrate(), 1)
s.check("...with its order id and volume", guards._placed[-1][3:], (ORDER, VOLUME))
s.check("...so rule 7 still sees 360658076 resting after a restart",
        guards.check(**SIGNAL_1303, book=([], {int(ORDER)})) is not None, True)
autotrade_repo.recent_placements = _real_recent

# ── 5. ONE MATCHING RULE: THE FILL REPORT AND THE GUARD AGREE ──────────────
intent = dict(symbol="EUR/USD", side="SELL", volume=VOLUME, placed_at=AT_0723)
for label, pos in (("our fill", Pos()), ("another size", Pos(volume=5)), ("opened earlier", Pos(opened_at=0)),
                   ("the other side", Pos(bullish=True)), ("another pair", Pos(symbol="GBP/USD"))):
    s.check(f"fill_watch and the guard agree on {label}", fill_watch._matches(intent, pos),
            liveness.fill_matches("EUR/USD", "SELL", VOLUME, AT_0723, pos))

# ── 6. RESTING ORDERS COME FROM THE SAME BROKER READ AS THE POSITIONS ──────
from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAReconcileRes   # noqa: E402

reply = ProtoOAReconcileRes()
reply.order.add(orderId=360841074)
reply.order.add(orderId=int(ORDER))
s.check("a real reconcile reply's pending orders are read by id", CP._resting_ids(reply),
        {360841074, int(ORDER)})


def _broker(positions, ids):
    async def answer():
        if positions is not None:
            CP._resting_order_ids = ids
        return positions
    return answer


_real_open = CP.open_positions
PB._cached, PB._cached_at, PB._forced, PB._resting = None, 0.0, False, None
CP._resting_order_ids = None
CP.open_positions = _broker(None, None)
s.check("never read → the snapshot is UNKNOWN, not empty", run(PB.snapshot()), None)
CP.open_positions = _broker([], {360841074})
PB.invalidate()
s.check("a read → positions and resting ids together", run(PB.snapshot()), ([], {360841074}))
CP.open_positions = _broker(None, None)
PB.invalidate()
s.check("a failed re-read keeps the last good PAIR", run(PB.snapshot()), ([], {360841074}))

# ── RESTORE ────────────────────────────────────────────────────────────────
CP.open_positions = _real_open
PB._cached, PB._cached_at, PB._forced, PB._resting = None, 0.0, False, None
guards._placed.clear()
for k, v in _orig.items():
    object.__setattr__(settings, k, v)
s.done()
