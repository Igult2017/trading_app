"""THE WHOLE LADDER PATH, RUN FOR REAL AGAINST THE BROKER'S OWN TICKS (docs/OPEN.md B27).

His ask, 20 Sep 2026: *"we dont need the market to know its working. We can test it with data we have to
know it will work or not."*

WHAT IS REAL HERE — everything the platform does on a live trade:
    monitor.position_tracker.check_all   the 30-second poll, unchanged
      -> monitor.position_book            the shared position list, with start_stops.attach
      -> monitor.start_stops.learn        the starting stop, from the broker's opening order
      -> Position.r_at / _lines           the count and the next stop price
      -> position_tracker._auto_move      the rung, the retry accounting, the messages
      -> execution.breakeven.move_stop_to the ratchet, the through-the-market refusal, the BOTH-LEGS
                                          amend, and the re-read that confirms the stop really moved

WHAT IS REPLACED — only the broker and Telegram. The stand-in broker holds the position, applies an amend
exactly as cTrader would, fires the stop and target on the side the broker fires them (a buy's on the bid,
a sell's on the ask) and closes the trade there. Its prices are the broker's OWN tick history, bid and ask,
validated to 0.0 pip against every real fill and close (`trading_app_data/ctrader/ticks`).

THE POLL RUNS ON THE TRADE'S OWN CLOCK — every 500 ms of tick time, the fast watcher's cadence — so the
result includes the delay between price moving and the platform acting. That is what makes this a test of
the system rather than of the arithmetic.
"""
import asyncio
import bisect
import csv
import datetime as dt
import logging
import os

from _harness import DATA, Suite

logging.disable(logging.CRITICAL)
s = Suite("THE LADDER — the live loop driven over real ticks, with a stand-in broker")
TICKS = os.path.join(DATA, "ticks")
K = dt.timezone(dt.timedelta(hours=3))
POLL_MS = 500


def his(ms):
    return dt.datetime.fromtimestamp(ms / 1000, K).strftime("%H:%M:%S")


def ticks(name):
    out = []
    for side in ("bid", "ask"):
        path = os.path.join(TICKS, f"{name}_{side}.csv")
        if not os.path.exists(path):
            return None
        with open(path) as f:
            out += [(int(r["ms"]), side, float(r["price"])) for r in csv.DictReader(f)]
    return sorted(out)


class Broker:
    """The account: one position, the stop as it stands, and the two prices right now."""

    def __init__(self, symbol, buy, fill, stop0, tp):
        self.symbol, self.buy, self.fill, self.tp = symbol, buy, fill, tp
        self.start, self.stop = stop0, stop0
        self.bid = self.ask = None
        self.exit_px = self.exit_ms = None
        self.armed = False          # the position exists only from the fill; before that, prices only
        self.amends = []

    @property
    def open(self):
        return self.exit_ms is None

    def fire_price(self):
        return self.bid if self.buy else self.ask

    def feed(self, ms, side, px):
        if side == "bid":
            self.bid = px
        else:
            self.ask = px
        if self.bid is None or self.ask is None or not self.open or not self.armed:
            return
        f = self.fire_price()
        if ((f <= self.stop) if self.buy else (f >= self.stop)) or \
           ((f >= self.tp) if self.buy else (f <= self.tp)):
            self.exit_px, self.exit_ms = f, ms

    def r(self):
        risk = abs(self.fill - self.start)
        return ((self.exit_px - self.fill) if self.buy else (self.fill - self.exit_px)) / risk


def wire(bk):
    """Point the platform's seams at the stand-in broker. Everything else is the real code."""
    from config.settings import settings
    from core import delivery_ledger
    from data import ctrader_orders, ctrader_positions, fix_quotes
    from data.ctrader_positions import Position
    from execution import account as acct_mod
    from execution import broker as broker_mod
    from monitor import exit_watch, position_book, start_stops

    object.__setattr__(settings, "auto_breakeven_enabled", True)

    async def open_positions():
        if not bk.open:
            return []
        return [Position(7, bk.symbol, bk.buy, 100000, bk.fill, bk.stop, bk.tp, 0.0, 0.0, 0)]

    async def opening_stop(position_id, bullish):
        return True, bk.start                      # what the broker's opening order really carries

    class Client:
        def __init__(self, creds, account_type):
            pass

        async def amend_sltp(self, position_id, symbol, sl, tp):
            bk.amends.append((sl, tp))
            bk.stop = sl                           # cTrader applies it; the platform re-reads to confirm
            return type("R", (), {"ok": True, "error": None})()

    async def load_account():
        return type("A", (), {"creds": {"ctraderId": 1, "accessToken": "x"}, "account_type": "demo"})()

    ctrader_positions.open_positions = open_positions
    ctrader_orders.opening_stop = opening_stop
    broker_mod.StopOrderClient = Client
    acct_mod.load_account = load_account
    fix_quotes.live_quote = lambda symbol, fresh=None: (bk.bid, bk.ask)
    delivery_ledger.is_delivered = lambda k: k in _told
    delivery_ledger.mark_delivered = lambda k: _told.add(k)
    delivery_ledger.cleanup = lambda ttl: None
    position_book._cached, position_book._cached_at, position_book._forced = None, 0.0, True
    start_stops._known.clear()
    start_stops._persist = lambda: None
    exit_watch._seen.clear()
    exit_watch._persist = lambda: None


_told = set()
from data.ctrader_positions import Position as _P          # noqa: E402
from monitor import start_stops as _SS                     # noqa: E402
_REAL_ATTACH, _REAL_RISK = _SS.attach, _P.risk


async def _send(_text):
    return True


def run(name, symbol, buy, fill_ms, fill, stop0, tp, old_way=False):
    """Drive the real poll over the ticks. `old_way` reproduces the pre-fix count (from the stop as it
    stands now), so the test can show the defect coming back if anyone reinstates it."""
    from data import ctrader_positions
    from monitor import position_tracker, start_stops

    tk = ticks(name)
    bk = Broker(symbol, buy, fill, stop0, tp)
    wire(bk)
    _told.clear()
    # ALWAYS PUT THE REAL ONES BACK FIRST. An earlier `old_way` run must not leak its patches into the
    # next call — it did, and every later run silently re-tested the defect instead of the fix.
    start_stops.attach = _REAL_ATTACH
    ctrader_positions.Position.risk = _REAL_RISK
    if old_way:
        start_stops.attach = lambda ps: ps         # no starting stop -> r_at falls back to nothing
        ctrader_positions.Position.risk = lambda self: (abs(self.entry - self.stop) or None)
    i0 = bisect.bisect_left([t[0] for t in tk], fill_ms)
    for ms, side, px in tk[:i0]:
        bk.feed(ms, side, px)                      # prices only — the trade is not open yet
    bk.armed = True

    async def go():
        await start_stops.learn([p for p in await ctrader_positions.open_positions()])
        moves, next_poll = [], fill_ms
        for ms, side, px in tk[i0:]:
            bk.feed(ms, side, px)
            if not bk.open:
                break
            if ms >= next_poll:
                next_poll = ms + POLL_MS
                before = bk.stop
                await position_tracker.check_all(_send)
                if bk.stop != before:
                    moves.append((his(ms), round(bk.stop, 5)))
        return moves

    moves = asyncio.run(go())
    return bk, moves


# name, symbol, buy, fill ms, fill, STARTING stop, target, what THIS LOOP produces, stop moves
#
# THESE ARE THE LIVE LOOP'S OWN NUMBERS, not the tick-perfect replay's (which gets +1.87R on 18 Sep,
# because it tries on every tick instead of twice a second).
#
# THE TRAIL NOW PLACES A SELL'S STOP OFF THE PRICE THAT FIRES IT (20 Sep 2026, his question: *"how can
# we move SL in sell the same way we do in buy?"*). Before that it was 0.1R behind a level off the
# entry, and on a sell the spread ate the whole gap: the move was refused as "past the market" 135
# times on this one trade and the stop never trailed at all, banking +0.98R. Now it trails twice and
# banks +1.83R. Measured 20 Sep 2026; UPDATE THESE when the ladder changes.
TRADES = [
    ("EURUSD_0918_sell", "EUR/USD", False, 1789730164366, 1.14693, 1.14746, 1.14486, 1.83, 4),
    ("EURUSD_0917_sell", "EUR/USD", False, 1789661174731, 1.14758, 1.14786, 1.14649, 0.00, 1),
    ("GBPUSD_0902_sell", "GBP/USD", False, 1788342844240, 1.34880, 1.34939, 1.34672, -0.03, 1),
]

if ticks("EURUSD_0918_sell") is None:
    print("   SKIP — the tick files are not on this machine (trading_app_data/ctrader/ticks)")
else:
    for name, sym, buy, fms, fill, st0, tp, expect, n_moves in TRADES:
        bk, moves = run(name, sym, buy, fms, fill, st0, tp)
        got = round(bk.r(), 2) if not bk.open else None
        print(f"\n   {name}: out {got:+.2f}R at {his(bk.exit_ms)} — stop moved "
              f"{len(bk.amends)} time(s): {', '.join(f'{t} -> {p}' for t, p in moves) or 'never'}")
        s.check(f"{name}: the live poll, amending a real broker, ends at {expect:+.2f}R after "
                f"{n_moves} stop move(s)", (abs(got - expect) <= 0.05, len(moves)), (True, n_moves))

    # 18 Sep is the trade that exposed the defect: it reached 2.85R and closed at $0 because the ladder
    # went blind after breakeven. Through the live path it must now climb the ladder AND trail.
    bk, moves = run(*TRADES[0][:7])
    s.check("18 Sep: the live path moves the stop four times — breakeven, +1R, then two trailing steps",
            len(moves), 4)
    s.check("...and the trail really moves, where a 0.1R gap was refused 135 times and never landed",
            len(moves) > 2, True)
    s.check("...ending in real profit, not at the entry where the defect left it", bk.r() > 1.5, True)
    s.check("...and every amend the platform sent was accepted and re-read at the broker",
            len(bk.amends) == len(moves), True)

    old, _ = run(*TRADES[0][:7], old_way=True)
    s.teeth("the OLD count (from the stop as it stands) gives this trade back its $0",
            abs(old.r()) < 0.05)

s.done()
