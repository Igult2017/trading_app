"""VIX.1 — the size test's 0.2 margin and its 24-hour memory (his rulings, 15 Sep 2026).

HIS TWO PROBLEMS, in his words:
  1. "missing a good setup because it does not meet the threshold by 1 or 2 as in 2.5 missed by 1 or 2
     so we have 2.4 or 2.3" -> a margin of 0.2 (his pick B): 2.3x the normal body qualifies.
  2. "having 2.5 qualified previously when the market required 10 pips ... and now the market requires
     more" -> remember the requirement. His pick C: the LOWEST requirement among candles that qualified
     ON THEIR OWN in the last 24 hours, either direction, with the same margin. No pip cap ("use the
     previous immediate pip, not capping it to 10 pips"); gold the same way, from gold's own candles.

Pinned on the REAL broker candles of his 10-11 Sep GBP/USD sells and gold's candles in the same stretch,
through the real `qualifies_for_trade`. Times below are UTC; his chart is UTC+3.
"""
import datetime

from _harness import Suite, load

import strategies.vix1_momentum as vm
from core.types import Candle
from shared.candle_math import body_size, full_range
from shared.pip import pip_size
from strategies.vix1_momentum import (
    qualifies_for_trade, long_requirement, momentum_run, size_note, size_yardstick, veto_reason,
)

s = Suite("VIX.1 — size test: the 0.2 margin and the 24-hour memory")
UTC = datetime.timezone.utc
GBP, XAU = "GBP/USD", "XAU/USD"
REAL_MARGIN, REAL_HOURS = vm._SIZE_MARGIN, vm._MEMORY_HOURS


def with_rule(margin, hours, fn):
    """Run `fn` under a different margin / memory, always putting the real values back."""
    vm._SIZE_MARGIN, vm._MEMORY_HOURS = margin, hours
    try:
        return fn()
    finally:
        vm._SIZE_MARGIN, vm._MEMORY_HOURS = REAL_MARGIN, REAL_HOURS


def at_candle(bars, day, hour):
    """The window production holds when this candle closes: ~3,000 bars ending AT it."""
    t = int(datetime.datetime(2026, 9, day, hour, tzinfo=UTC).timestamp())
    i = next((k for k, c in enumerate(bars) if c.time == t), None)
    return None if i is None else bars[max(0, i + 1 - 3000):i + 1]


def when(w, j):
    return datetime.datetime.fromtimestamp(w[j].time, UTC).strftime("%a %d %H:%M")


s.check("the margin is his 0.2", vm._SIZE_MARGIN, 0.2)
s.check("the memory is his 24 hours", vm._MEMORY_HOURS, 24)
s.check("2.5x stays his calibrated standard (the margin is separate from it)", vm._MIN_BODY_MULT, 2.5)

gbp = load("GBPUSD_H1_sep12.csv", "H1")
xau = load("XAUUSD_H1_sep12.csv", "H1")
if not gbp or not xau:
    print("   SKIP — GBPUSD/XAUUSD_H1_sep12.csv (broker bars incl. 10-11 Sep) not present on this machine")
else:
    # ── THE THREE IT RESCUES ─────────────────────────────────────────────────────────────────────
    print()
    print("   rescued (his clock = UTC+3):")
    w = at_candle(xau, 11, 3)
    n = len(w) - 1
    s.check("XAU/USD 11 Sep 03:00 UTC ($18.32, 2.47x) now qualifies", qualifies_for_trade(w, n, False, XAU), True)
    s.check("...on its own, through the margin (needed $17.04 at 2.3x)", size_yardstick(w, n, False, XAU), n)
    s.check("...and the margin alone is enough (memory switched off)",
            with_rule(0.2, 0, lambda: qualifies_for_trade(w, n, False, XAU)), True)
    s.teeth("the margin", with_rule(0.0, 0, lambda: qualifies_for_trade(w, n, False, XAU)) is False)

    w = at_candle(gbp, 10, 10)
    n = len(w) - 1
    y = size_yardstick(w, n, False, GBP)
    s.check("GBP/USD 10 Sep 10:00 UTC (9.9p, 2.25x) now qualifies", qualifies_for_trade(w, n, False, GBP), True)
    s.check("...on the requirement remembered from the 09 Sep 11:00 UTC candle (9.0p)",
            None if y is None else when(w, y), "Wed 09 11:00")

    w = at_candle(gbp, 11, 8)
    n = len(w) - 1
    y = size_yardstick(w, n, False, GBP)
    s.check("GBP/USD 11 Sep 08:00 UTC (10.3p, 2.22x) now qualifies", qualifies_for_trade(w, n, False, GBP), True)
    s.check("...on the requirement remembered from the 10 Sep 14:00 UTC candle (10.1p)",
            None if y is None else when(w, y), "Thu 10 14:00")
    s.check("...and the log note names that candle",
            "10 Sep 14:00 UTC" in (size_note(w, n, False, GBP) or ""), True)
    s.teeth("the memory", with_rule(0.2, 0, lambda: qualifies_for_trade(w, n, False, GBP)) is False)
    s.check("...and the entry now takes it as the newest momentum candle", momentum_run(w, False, GBP), (n, 1))

    after = at_candle(gbp, 11, 9)
    s.check("an hour later the refusal text counts it as a candle that DID qualify, never as too small",
            "DID qualify" in veto_reason(after, False, GBP), True)
    s.check("...and states the rule it was judged by", "2.3x" in veto_reason(after, False, GBP), True)

    # ── THE TEN IT DOES NOT TOUCH — each still refused, for its own reason ───────────────────────
    print()
    print("   still refused, by tests the margin and the memory never touch:")
    w = at_candle(gbp, 10, 11)
    n = len(w) - 1
    s.check("GBP/USD 10 Sep 11:00 UTC is refused", qualifies_for_trade(w, n, False, GBP), False)
    s.check("...because it is not bigger than the candle before it (9.8p vs 9.9p)",
            body_size(w[n]) <= body_size(w[n - 1]), True)

    w = at_candle(gbp, 10, 12)
    n = len(w) - 1
    s.check("GBP/USD 10 Sep 12:00 UTC (17.6p) is refused", qualifies_for_trade(w, n, False, GBP), False)
    s.check("...because of its shape (body 45% of its height)", body_size(w[n]) < 0.5 * full_range(w[n]), True)

    for bars, sym, day, hour in ((gbp, GBP, 10, 16), (gbp, GBP, 10, 18), (gbp, GBP, 11, 1), (gbp, GBP, 11, 7),
                                 (gbp, GBP, 11, 15), (xau, XAU, 10, 17), (xau, XAU, 10, 19), (xau, XAU, 10, 20)):
        w = at_candle(bars, day, hour)
        n = len(w) - 1
        pips = body_size(w[n]) / pip_size(sym)
        need = long_requirement(w, n, sym)
        s.check(f"{sym} {day:02d} Sep {hour:02d}:00 UTC is refused", qualifies_for_trade(w, n, False, sym), False)
        s.check(f"...under the 4-month minimum ({pips:.1f} < {need:.1f} pips)", pips < need, True)

    # ── THE MEMORY ONLY EVER ADDS ────────────────────────────────────────────────────────────────
    print()
    print("   a candle that passes the stricter rule can never fail the looser one (real GBP/USD bars):")
    tail = gbp[-3300:]
    judged = [(i, b) for i in range(len(tail) - 300, len(tail)) for b in (True, False)]
    strict = {k for k in judged if with_rule(0.0, 0, lambda: qualifies_for_trade(tail, k[0], k[1], GBP))}
    margin = {k for k in judged if with_rule(0.2, 0, lambda: qualifies_for_trade(tail, k[0], k[1], GBP))}
    full = {k for k in judged if qualifies_for_trade(tail, k[0], k[1], GBP)}
    # Subsets only — no counts are printed: how many more candles qualify is a frequency measurement,
    # and that needs his approval (feedback: no backtest or frequency sweep without it).
    s.check("every 2.5x candle still qualifies with the margin", strict <= margin, True)
    s.check("every margin candle still qualifies with the memory", margin <= full, True)

# ── THE QUIET-MARKET TEST USES NEITHER ───────────────────────────────────────────────────────────────
# His ruling: "How is the new margin rule related to market warking up?" — it is not. A candle the margin
# lets us TRADE must not make a dead market look awake. This one is from his own dead market (image 1,
# test_tradeable.py): counted as activity it made 5 Aug 06:00 and 11:00 UTC trade.
print()
print("   the quiet-market test still counts activity at 2.5x:")
eur = load("EURUSD_H1_live_sep04.csv", "H1")
if eur:
    _t = int(datetime.datetime(2026, 8, 4, 13, tzinfo=UTC).timestamp())
    _k = next(j for j, c in enumerate(eur) if c.time == _t)
    w = eur[max(0, _k + 1 - 3000):_k + 1]
    n = len(w) - 1
    s.check("EUR/USD 04 Aug 13:00 UTC (8.7p, 2.32x) can be TRADED through the margin",
            qualifies_for_trade(w, n, True, "EUR/USD"), True)
    s.check("...but does NOT count as the market waking up", vm.is_momentum_candle(w, n, True, "EUR/USD"), False)
else:
    print("   SKIP — EURUSD_H1_live_sep04.csv not present on this machine")

# ── NOTHING ELSE THAT COUNTS OR SCANS MOMENTUM CANDLES USES THEM EITHER ──────────────────────────────
# His rule, 15 Sep: the alternatives "only apply at the moment the momentum is qualified ... they have
# nothing to do with how the actual VIX has been working". So the EARLIER candles of a run, and signal
# spacing's three-candle count, are judged exactly as before. Hand-built: a 2-pip normal body.
print()
print("   only the candle being qualified for a trade gets the alternatives:")
from _harness import body, flat_series      # noqa: E402
from strategies import vix1_spacing         # noqa: E402

_B = 0.0002
run_w = flat_series(110, size=_B, tf="H1")
run_w.append(body(1.1, 1.1 + _B * 2.4, tf="H1", t=110))      # 2.4x: tradeable only through the margin
run_w.append(body(1.1, 1.1 + _B * 3.0, tf="H1", t=111))      # 3.0x: momentum on the unchanged rule
s.check("a 2.4x candle WOULD qualify for a trade if it were the newest candle",
        qualifies_for_trade(run_w, 110, True, GBP), True)
s.check("...but behind a newer momentum candle it is NOT part of the run — the run still starts at the newest",
        momentum_run(run_w, True, GBP), (111, 1))

sp = flat_series(110, size=_B, tf="H1")
sp.append(body(1.1, 1.1 + _B * 2.4, tf="H1", t=110))          # the traded candle, qualified through the margin
for _k in (111, 113, 115):                                     # three more 2.4x candles, each after a small one
    sp.append(body(1.1, 1.1 + _B, tf="H1", t=_k))
    sp.append(body(1.1, 1.1 + _B * 2.4, tf="H1", t=_k + 1))
_anchor = vix1_spacing.anchor_time(sp, sp[110].time + 3600 + 60, GBP)
s.check("spacing recognises the traded candle even though only the margin qualified it", _anchor, sp[110].time)
s.check("...but COUNTS none of the three later 2.4x candles — his three candles are counted unchanged",
        vix1_spacing.candles_since(sp, _anchor, sp[-1].time + 7200, GBP), 0)
s.teeth("the count", sum(qualifies_for_trade(sp, k, True, GBP) for k in (112, 114, 116)) == 3)

# ── ONLY CANDLES THAT QUALIFIED ON THEIR OWN ARE REMEMBERED — built candle by candle ────────────────
# 100 background candles alternate 1 and 3 pips, so the normal body is 2 pips; ONE bigger candle then
# lifts it to 3 pips. A (5p) qualifies on its own at 2.3 x 2p. B (5.5p) is under 2.3 x 3p = 6.9p and
# gets through only on A's remembered 4.6p. C (6p) is also under 6.9p: it may lean on A, never on B.
#
# THE BACKGROUND CARRIES A LONG WICK AGAINST ITS MOVE so none of it can qualify on its own. The first
# version used clean candles and went red: a 3-pip candle early in the series is judged against a
# SHORTER window whose median is 1 pip, so it qualified — and the memory rightly picked its lower
# requirement over A's. The code was right; the fixture was not measuring what its comment claimed.
print()
print("   only candles that qualified ON THEIR OWN are remembered:")


def series(sizes_and_hours, wicked_below=100):
    """Bullish candles. The first `wicked_below` get an upper wick twice their body (67% against the move)."""
    return [Candle(time=1700000000 + int(h * 3600), open=1.1, close=1.1 + sz, low=1.1,
                   high=1.1 + sz + (2 * sz if k < wicked_below else 0.0), volume=0, timeframe="H1")
            for k, (sz, h) in enumerate(sizes_and_hours)]


BACK = [(0.0001 if k % 2 == 0 else 0.0003, k) for k in range(100)]
chain = series(BACK + [(0.0005, 100), (0.00055, 101), (0.0006, 102)])
s.check("A qualifies on its own", size_yardstick(chain, 100, True, GBP), 100)
s.check("B qualifies only on A's remembered requirement", size_yardstick(chain, 101, True, GBP), 100)
s.check("C qualifies on A, the lowest requirement in its 24 hours", size_yardstick(chain, 102, True, GBP), 100)
s.check("with only B inside C's window, C is REFUSED — a candle that needed the memory is never remembered",
        with_rule(0.2, 1, lambda: qualifies_for_trade(chain, 102, True, GBP)), False)
s.teeth("the no-chaining rule", with_rule(0.2, 2, lambda: qualifies_for_trade(chain, 102, True, GBP)) is True)

# CLOCK HOURS, NOT CANDLES — the same two candles side by side, with the gap between them changed. A
# weekend puts exactly this between two neighbouring bars.
print()
print("   the memory is 24 clock hours, not 24 candles:")
s.check("A 23 hours before B still counts",
        qualifies_for_trade(series(BACK + [(0.0005, 100), (0.00055, 123)]), 101, True, GBP), True)
s.check("A 25 hours before B is ignored — B is judged on 2.3x alone and refused",
        qualifies_for_trade(series(BACK + [(0.0005, 100), (0.00055, 125)]), 101, True, GBP), False)

s.done()
