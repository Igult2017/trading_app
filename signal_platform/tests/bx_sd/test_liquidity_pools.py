"""
BX-S/D — liquidity pools: do the four book pool types measure what they claim?
Run: python tests/bx_sd/test_liquidity_pools.py

The period pools (PDH/PWH/PMH) used to bucket on `time // span` — epoch arithmetic. The Unix epoch
was a THURSDAY, so "previous weekly high" was measured Thursday->Wednesday: half of one real trading
week glued to half of the next. Nobody watches that level, so no stops rest on it, so `swept_before`
could see price cross a phantom line and conclude liquidity was grabbed.

These fixtures are built on FIXED DATES with the answer worked out by hand, and several of them
assert the NEW answer differs from the OLD one — a test that passes under both anchors would not
have caught the bug it exists for.
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from core.types import Candle                                                    # noqa: E402
from strategies.bx_sd_pools import forex_day, _period_key, _period_pools         # noqa: E402
from strategies.bx_sd_liquidity import find_liquidity                            # noqa: E402

N, F = 0, []


def chk(name, got, want):
    global N
    N += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if not ok:
        F.append(name)


def ts(y, m, d, h=0, mi=0):
    return int(datetime(y, m, d, h, mi, tzinfo=timezone.utc).timestamp())


def C(t, hi, lo):
    return Candle(t, (hi + lo) / 2, hi, lo, (hi + lo) / 2, 0, "H4")


# ── 1. THE TRADING DAY ROLLS AT 21:00 UTC ──────────────────────────────────────────────────────
print("\nTHE FOREX DAY ROLLS AT 21:00 UTC, NOT MIDNIGHT")
# 21:00 and not 22:00 because the broker's H4 grid MOVES with DST — bar starts are
# {01,05,09,13,17,21} in EEST summer and {02,06,10,14,18,22} in EET winter, both its own midnight
# (counted over the saved cTrader history: 407 bars per summer hour, 176 per winter hour). A 22:00
# roll is exact in winter and files every SUMMER day's first bar under the previous day. Nothing
# starts between 19:00 and 21:00, so a 21:00 roll is exact in BOTH regimes, not a compromise.
chk("20:59 Monday is still Monday", forex_day(ts(2026, 8, 3, 20, 59)).isoformat(), "2026-08-03")
chk("21:00 Monday is already TUESDAY (summer grid)",
    forex_day(ts(2026, 8, 3, 21, 0)).isoformat(), "2026-08-04")
chk("22:00 Monday is Tuesday too (winter grid)",
    forex_day(ts(2026, 8, 3, 22, 0)).isoformat(), "2026-08-04")
chk("02:00 Tuesday is Tuesday", forex_day(ts(2026, 8, 4, 2, 0)).isoformat(), "2026-08-04")
chk("17:00 summer bar stays on its own day", forex_day(ts(2026, 8, 3, 17, 0)).isoformat(), "2026-08-03")
chk("18:00 winter bar stays on its own day", forex_day(ts(2026, 1, 5, 18, 0)).isoformat(), "2026-01-05")
# THE TEETH: under the old `time // 86_400` this bar was 3 Aug. A whole H4 bar per day sat in the
# wrong day, which is the bar that most often makes the daily extreme (the 22:00 open).
old_day = datetime.utcfromtimestamp((ts(2026, 8, 3, 21, 30) // 86_400) * 86_400).date()
chk("  ...and the OLD epoch bucket disagreed", old_day.isoformat(), "2026-08-03")

# ── 2. THE WEEK IS SUNDAY 21:00 -> FRIDAY 21:00 ────────────────────────────────────────────────
print("\nONE TRADING WEEK = ONE BUCKET")
# Sun 2 Aug 2026 21:00 UTC opens the week; Fri 7 Aug 20:00 is inside it; Fri 7 Aug 21:00 closes it.
wk = lambda t: _period_key("week", t)
open_wk = wk(ts(2026, 8, 2, 21, 0))
chk("Sunday 21:00 opens the week", wk(ts(2026, 8, 2, 21, 0)), open_wk)
chk("  Monday midday, same week", wk(ts(2026, 8, 3, 12, 0)), open_wk)
chk("  Wednesday, same week", wk(ts(2026, 8, 5, 12, 0)), open_wk)
chk("  Friday 20:00, still the same week", wk(ts(2026, 8, 7, 20, 0)), open_wk)
# The next week opens SUNDAY 22:00, not Friday 22:00. Friday 22:00 begins Saturday's session, which
# is dead weekend time — the market is shut, so no bar exists there, and it stays with the week that
# just closed. (My first version of this test asserted Friday 22:00 flipped the week; it does not,
# and the code was right.)
chk("Friday 21:00 is the weekend, still the closing week", wk(ts(2026, 8, 7, 21, 0)), open_wk)
chk("Sunday 21:00 OPENS the next week", wk(ts(2026, 8, 9, 21, 0)) != open_wk, True)
chk("  and Monday belongs to that new week",
    wk(ts(2026, 8, 10, 12, 0)), wk(ts(2026, 8, 9, 21, 0)))
# THE TEETH: the old anchor split this exact week in two, at Thursday 00:00.
old_wk = lambda t: t // 604_800
chk("  the OLD anchor SPLIT that week (Wed vs Thu differ)",
    old_wk(ts(2026, 8, 5, 12, 0)) == old_wk(ts(2026, 8, 6, 12, 0)), False)
chk("  ...while the new one keeps them together",
    wk(ts(2026, 8, 5, 12, 0)) == wk(ts(2026, 8, 6, 12, 0)), True)

# ── 3. THE MONTH IS A CALENDAR MONTH ───────────────────────────────────────────────────────────
print("\nREAL CALENDAR MONTHS")
chk("31 Jul 21:30 UTC is AUGUST (it is 1 Aug's session)", _period_key("month", ts(2026, 7, 31, 21, 30)), (2026, 8))
chk("31 Jul 20:00 UTC is still July", _period_key("month", ts(2026, 7, 31, 20, 0)), (2026, 7))
chk("1 Sep is September", _period_key("month", ts(2026, 9, 1, 6, 0)), (2026, 9))
# THE TEETH: the old 30-day block both SPLIT a month and MERGED two. Measured on these dates it put
# 1 Aug in block 688 and 10 Aug in 689 — same calendar month, different "months" — while 10 Aug and
# 1 Sep shared block 689. So "previous monthly high" could be the high of a fortnight, or of a
# window straddling two months. (My first attempt asserted 1 Aug / 1 Sep were non-adjacent; they
# happen to be adjacent, which proved nothing.)
old_mo = lambda t: t // 2_592_000
chk("  the OLD block SPLIT August (1 Aug vs 10 Aug differ)",
    old_mo(ts(2026, 8, 1, 6, 0)) == old_mo(ts(2026, 8, 10, 6, 0)), False)
chk("  ...and MERGED August with September (10 Aug vs 1 Sep same)",
    old_mo(ts(2026, 8, 10, 6, 0)) == old_mo(ts(2026, 9, 1, 6, 0)), True)
chk("  the new key keeps August together",
    _period_key("month", ts(2026, 8, 1, 6, 0)), _period_key("month", ts(2026, 8, 10, 6, 0)))
chk("  and separates August from September",
    _period_key("month", ts(2026, 8, 10, 6, 0)) != _period_key("month", ts(2026, 9, 1, 6, 0)), True)

# ── 4. THE POOL VALUES THEMSELVES ──────────────────────────────────────────────────────────────
print("\nTHE LEVEL IS THE PERIOD'S REAL EXTREME")
# Two full trading days, then a third that is still forming.
bars = []
for h in range(21, 24):                                   # Mon 21:00-23:00 -> TUESDAY's session
    bars.append(C(ts(2026, 8, 3, h), 1.1050, 1.1000))
for h in range(0, 21, 4):                                 # Tuesday proper
    bars.append(C(ts(2026, 8, 4, h), 1.1080, 1.0990))     # <- Tuesday's true H/L
for h in range(21, 24):                                   # WEDNESDAY's session begins
    bars.append(C(ts(2026, 8, 4, h), 1.1200, 1.1100))
for h in range(0, 9, 4):
    bars.append(C(ts(2026, 8, 5, h), 1.1150, 1.1120))     # Wednesday still forming

pd = [p for p in _period_pools(bars, "day", "pdh", "pdl")]
chk("one COMPLETED day (Wednesday is still forming and excluded)", len(pd), 2)
chk("  previous-day HIGH is Tuesday's real high", round(max(p.price for p in pd), 4), 1.1080)
chk("  previous-day LOW is Tuesday's real low", round(min(p.price for p in pd), 4), 1.0990)
chk("  the still-forming day's 1.1150 is NOT published",
    any(abs(p.price - 1.1150) < 1e-9 for p in pd), False)
chk("  the pool index points at the LAST bar of its period",
    max(p.index for p in pd) < len(bars) - 1, True)

# ── 5. THE OTHER THREE POOL TYPES STILL WORK ───────────────────────────────────────────────────
print("\nSWING · EQH/EQL · SESSION — unchanged by the re-anchor")
zig = []
t0 = ts(2026, 7, 1)
prices = [1.10, 1.11, 1.10, 1.12, 1.10, 1.12, 1.10, 1.13, 1.11, 1.13, 1.10]   # two pairs of equal highs
for i, p in enumerate(prices):
    for k in range(4):                                     # pad so swings are detectable
        zig.append(C(t0 + (i * 4 + k) * 14400, p + 0.0002, p - 0.0002))
pools = find_liquidity(zig, 0.0001)
kinds = {p.kind for p in pools}
chk("swing pools exist", "swing" in kinds, True)
chk("EQH detected (two highs within 2 pips)", "eqh" in kinds, True)
chk("session pools absent without a finer feed", any(k.endswith("_high") and "_" in k
    and k.split("_")[0] in ("asia", "lon", "ny") for k in kinds), False)
finer = [Candle(c.time + m * 900, c.open, c.high, c.low, c.close, 0, "M15")
         for c in zig for m in range(16)]
kinds2 = {p.kind for p in find_liquidity(zig, 0.0001, session_candles=finer)}
chk("session pools APPEAR once a finer feed is passed",
    any(k in kinds2 for k in ("asia_high", "lon_high", "ny_high")), True)

print(f"\n{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + ', '.join(F)}  ({N} checks)")
sys.exit(1 if F else 0)
