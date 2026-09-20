"""THE LADDER, REPLAYED ON THE BROKER'S REAL TICKS THROUGH THE LIVE CODE (docs/OPEN.md B27).

His words, 19 Sep 2026: *"when I checked two of the trades, which one was a loss and one a breakeven,
they were not supposed to be loss and breakeven. They were wins."* And: *"lets fix things from the root
cause."*

ROOT CAUSE. The ladder counted R from the stop the position carries NOW. Its own first move put that
stop on the entry, so risk read zero, R read "unknown", and every later step was skipped. It also read
a sell's progress on the BUY price, where his chart shows the sell price.

WHAT THIS DRIVES — the live functions, nothing re-implemented: `Position.r_at` (the count),
`position_tracker._lines` (which rungs, at what stop price), `breakeven.why_not` (the check that refuses
a stop set through the market) and `Position.breakeven`. The broker's own rules are applied as the broker
applies them: a buy's stop and target fire on the bid, a sell's on the ask.

TWO WAYS, SAME TICKS:
  before  R counted from the CURRENT stop, read on the firing side  -> must reproduce the broker's REAL
          closes, to the second. That is what proves this harness is faithful to the account.
  after   R counted from the STARTING stop, read on the CHART (bid)  -> the fix.

Every stop move lands on the tick that earns it (the best case for both ways alike), so the difference
between them is the data they read, not timing. Ticks: `trading_app_data/ctrader/ticks/` (see README).
"""
import bisect
import csv
import datetime as dt
import os

from _harness import DATA, Suite
from config.settings import settings
from data.ctrader_positions import Position
from execution import breakeven
from monitor.position_tracker import _lines

s = Suite("THE LADDER on real ticks, through the live code — before and after the fix")
TICKS = os.path.join(DATA, "ticks")
K = dt.timezone(dt.timedelta(hours=3))
object.__setattr__(settings, "auto_breakeven_enabled", True)     # why_not's switch; demo account


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


def replay(name, symbol, buy, fill_ms, fill, stop0, tp, fixed):
    """-> (exit ms, exit price, R counted from the starting stop, stop moves)."""
    tk = ticks(name)
    if tk is None:
        return None
    i0 = bisect.bisect_left([t[0] for t in tk], fill_ms)
    bid = ask = None
    for ms, side, px in tk[:i0]:
        bid, ask = (px, ask) if side == "bid" else (bid, px)
    sl, done, moves = stop0, set(), []
    for ms, side, px in tk[i0:]:
        bid, ask = (px, ask) if side == "bid" else (bid, px)
        if bid is None or ask is None:
            continue
        fire = bid if buy else ask                               # the side the broker closes on
        if (fire <= sl) if buy else (fire >= sl):
            return ms, fire, ((fire - fill) if buy else (fill - fire)) / abs(fill - stop0), moves
        if (fire >= tp) if buy else (fire <= tp):
            return ms, fire, ((fire - fill) if buy else (fill - fire)) / abs(fill - stop0), moves
        p = Position(1, symbol, buy, 100000, fill, sl, tp, 0.0, 0.0, 0,
                     start_stop=(stop0 if fixed else sl))
        read = bid if fixed else fire
        r = p.r_at(read)
        if r is None:
            continue
        # THE FIRING PRICE GOES IN ONLY ON THE FIXED PATH (20 Sep 2026). With it, a trailing stop is
        # placed 0.2R from the price that fires it — the live rule. Without it, `_lines` prices the
        # stop off the entry, which is what the code did before, so the "BEFORE" run below still
        # reproduces the broker's own closes exactly.
        for tag, target, _ in _lines(p, r, read, fire if fixed else None):
            if tag in done or target is None:
                continue
            blocked = breakeven.why_not(p, "demo", target, fire)
            if blocked:
                if "already at or beyond" in blocked:
                    done.add(tag)
                continue                                         # refused; tried again next tick
            sl = target
            done.add(tag)
            moves.append((his(ms), tag, round(target, 5)))
    return None


# name, symbol, buy, fill ms, fill, STARTING stop, target, real close (his clock), real close price
TRADES = [
    ("GBPUSD_0902_sell", "GBP/USD", False, 1788342844240, 1.34880, 1.34939, 1.34672, "14:09:58", 1.34882),
    ("GBPUSD_0909_buy", "GBP/USD", True, 1788955795892, 1.35652, 1.35591, 1.35906, "15:15:54", 1.35589),
    ("GBPUSD_0915_buy", "GBP/USD", True, 1789481383119, 1.34948, 1.34912, 1.35096, "17:12:02", 1.34912),
    ("GBPUSD_0916_sell", "GBP/USD", False, 1789560197525, 1.34548, 1.34573, 1.34450, "15:03:18", 1.34573),
    ("EURUSD_0917_sell", "EUR/USD", False, 1789661174731, 1.14758, 1.14786, 1.14649, "19:14:48", 1.14786),
    ("EURUSD_0918_sell", "EUR/USD", False, 1789730164366, 1.14693, 1.14746, 1.14486, "15:56:56", 1.14693),
]
# 18 Sep was +2.09R until 2026-09-20, when the trail became 0.2R behind the FIRING price (from 2.2R)
# instead of 0.1R behind a level off the entry. This is the tick-perfect number: the live loop, which
# checks twice a second instead of on every tick, gets +1.83R — see test_ladder_live_loop.py.
AFTER = {"GBPUSD_0902_sell": -0.03, "EURUSD_0917_sell": -0.04, "EURUSD_0918_sell": 1.87}

if ticks("EURUSD_0918_sell") is None:
    print("   SKIP — the tick files are not on this machine (trading_app_data/ctrader/ticks)")
else:
    print("\n   BEFORE the fix — must reproduce what the broker actually did:")
    # THE PRICE IS COMPARED TO 0.2 PIP, THE SECOND EXACTLY. The replay closes on the tick that TRIGGERS
    # the stop; the broker then executes a moment later at whatever price is showing. Measured on
    # 16 Sep: the ask reached 1.34574 at 15:03:18.472, the broker filled at 15:03:18.751 on the next
    # tick, 1.34573. That 0.3 s is execution, not the ladder; the other five match to the tick.
    for name, sym, buy, fms, fill, st0, tp, real_t, real_px in TRADES:
        ms, px, r, moves = replay(name, sym, buy, fms, fill, st0, tp, fixed=False)
        s.check(f"{name}: the old ladder closes at the broker's real second, price within 0.2 pip",
                (his(ms), abs(px - real_px) <= 0.00002), (real_t, True))

    print("\n   AFTER the fix — counted from the starting stop, read on the chart price:")
    total = 0.0
    for name, sym, buy, fms, fill, st0, tp, real_t, real_px in TRADES:
        ms, px, r, moves = replay(name, sym, buy, fms, fill, st0, tp, fixed=True)
        total += r
        if name in AFTER:
            s.check(f"{name}: {r:+.2f}R  (moves: {', '.join(f'{t} {g}' for t, g, _ in moves) or 'none'})",
                    round(r, 2), AFTER[name])
    s.check("18 Sep keeps the ladder going past breakeven: lock +1R then the trail",
            [m[1] for m in replay("EURUSD_0918_sell", "EUR/USD", False, 1789730164366, 1.14693,
                                  1.14746, 1.14486, fixed=True)[3]],
            ["breakeven", "lock_1r", "trail_2.0r", "trail_2.1r"])
    old18 = replay("EURUSD_0918_sell", "EUR/USD", False, 1789730164366, 1.14693, 1.14746,
                   1.14486, fixed=False)
    s.teeth("the OLD count really does go blind after breakeven on 18 Sep",
            [m[1] for m in old18[3]] == ["breakeven"] and round(old18[2], 2) == 0.0)

s.done()
