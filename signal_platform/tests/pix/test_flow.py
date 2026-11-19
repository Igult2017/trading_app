"""PIX ORDER FLOW — proved on hand-built candles with known answers (18 Nov 2026). docs/strategies/pix.md.

Runs the REAL functions: `pix_flow.absorbed` (the one refusal), `pix_flow.confirm` (divergence + reaction delta, shown
on the card — his 19 Nov rule), `pix_btcflow` (Binance parsing, the forming candle, the fallback source, never raising),
`pix.make_check`. Every key rule has a TEETH case: the rule is broken on purpose and the check must then fail.
Run: python tests/pix/test_flow.py
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")
import storage.observability_repo as _obs  # noqa: E402
_obs.record = lambda *a, **k: None

from core.types import Candle  # noqa: E402
import strategies.pix_flow as F  # noqa: E402
import strategies.pix_btcflow as BT  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def teeth(name, failed_when_broken):
    check(f"TEETH — {name} fails when deliberately broken", bool(failed_when_broken), True)


T0 = 1_600_000_000 // 300 * 300


def market(bull=True):
    """12 candles falling 110 → ~101 into a demand zone 100-101 (mirrored for a sell), then a TAP and a RESPECT."""
    rows = []
    for k in range(12):
        hi = 110.5 - k * 0.8
        rows.append((hi, hi + 0.2, hi - 1.0, hi - 0.6))        # o, h, l, c — each a little lower
    rows.append((101.0, 101.2, 100.2, 100.6))                  # TAP: dips to 100.2, closes down a touch
    rows.append((100.6, 102.4, 100.5, 102.2))                  # RESPECT: closes back up out of the zone
    if not bull:
        rows = [(200 - o, 200 - lo, 200 - h, 200 - c) for o, h, lo, c in rows]
    return [Candle(T0 + i * 300, o, h, lo, c, 1, "M5") for i, (o, h, lo, c) in enumerate(rows)]


TAP = T0 + 12 * 300


def flows(early, late, tap, respect):
    """early = the first 7 candles' (buy, sell); late = the next 5; then the tap and the respect candle."""
    return {T0 + i * 300: v for i, v in enumerate([early] * 7 + [late] * 5 + [tap, respect])}


print("ABSORPTION — the one order-flow reading that still refuses (his 18 Nov rule)")
DIV = flows((10, 30), (20, 20), (22, 18), (40, 10))      # selling dries up as price makes its new low
CONV = flows((10, 30), (10, 30), (22, 18), (40, 10))     # selling keeps pace with price into the zone
ABS = flows((10, 30), (20, 20), (40, 10), (40, 10))      # the TAP candle: buyers 60% one-sided yet it closed down
check("buyers pushing but the candle closed DOWN at the zone → ABSORPTION",
      "ABSORPTION" in (F.absorbed(market(), ABS, True, TAP, "5M") or ""), True)
check("ordinary flow → no absorption", F.absorbed(market(), DIV, True, TAP, "5M"), None)
check("a candle BEFORE the visit is never judged (visit starts after the absorbing candle)",
      F.absorbed(market(), ABS, True, TAP + 300, "5M"), None)
F.ABSORB_MIN = 2.0
teeth("absorption (threshold made unreachable)", F.absorbed(market(), ABS, True, TAP, "5M") is None)
F.ABSORB_MIN = 0.25

print("\nDIVERGENCE + DELTA — confirm, never refuse (his 19 Nov rule: 'indicate so in the signal card')")
REACT = [TAP + 300]                                      # the reaction candle(s)
c = F.confirm(market(), DIV, True, TAP, REACT, "Binance futures")
check("selling dried up into the zone (DIVERGENCE) and the reaction was 60% buying → AGREE",
      (c.divergence, round(c.delta, 2), c.agree), ("divergence", 0.6, True))
check("...the card line says CONFIRMS and names the source",
      c.line(True).startswith("Order flow CONFIRMS (Binance futures)"), True)
c = F.confirm(market(), CONV, True, TAP, REACT)
check("CVD followed price to a new low (CONVERGENCE) → does NOT agree, and says which",
      (c.agree, "CVD convergence ✗" in c.line(True), "does NOT agree" in c.line(True)), (False, True, True))
real_state = F.cvd_state
F.cvd_state = lambda *a: "divergence"
teeth("divergence is really read (forced to 'divergence')", F.confirm(market(), CONV, True, TAP, REACT).agree)
F.cvd_state = real_state
# heavy selling early, then a reaction candle that is mildly SELLING (−10%) yet not enough to take CVD to a new low
SELLR = flows((0, 60), (20, 20), (22, 18), (18, 22))
c = F.confirm(market(), SELLR, True, TAP, REACT)
check("divergence but the reaction's delta is SELLING → does NOT agree (both must agree)",
      (c.divergence, c.agree, "delta -10% buying on the reaction ✗" in c.line(True)), ("divergence", False, True))
# a market that never makes a new low into the zone (every low 100.2) → the CVD reading is NEUTRAL
level = [Candle(T0 + i * 300, 100.6, 101.0, 100.2, 100.6, 1, "M5") for i in range(13)] +     [Candle(T0 + 13 * 300, 100.6, 102.4, 100.5, 102.2, 1, "M5")]
cn = F.confirm(level, DIV, True, TAP, REACT)
check("no new low into the zone (neutral) → no divergence → does NOT agree", (cn.divergence, cn.agree), ("neutral", False))
miss = dict(DIV)
miss.pop(T0 + 3 * 300)
c = F.confirm(market(), miss, True, TAP, REACT)
check("one approach candle with no figure → divergence NOT AVAILABLE (never guessed); delta still read",
      (c.divergence, round(c.delta, 2), "divergence not available" in c.line(True), c.agree), (None, 0.6, True, False))
c = F.confirm(market(), {}, True, TAP, REACT)
check("no figures at all → 'Order flow not available yet'", c.line(True).startswith("Order flow not available yet"),
      True)
check("reaction volume vs the average BEFORE the touch: 50 vs 40 → 1.25×",
      round(F.confirm(market(), DIV, True, TAP, REACT).volume_x, 3), 1.25)
x1000 = {t: (b * 1000, s * 1000) for t, (b, s) in DIV.items()}
k1, k2 = F.confirm(market(), x1000, True, TAP, REACT), F.confirm(market(), DIV, True, TAP, REACT)
check("MARKET-AGNOSTIC: every volume ×1000 → the same reading",
      (k1.divergence, round(k1.delta, 6), round(k1.volume_x, 6)), (k2.divergence, round(k2.delta, 6), round(k2.volume_x, 6)))
now = int(time.time()) // 300 * 300
live = [Candle(now - (14 - i) * 300, c_.open, c_.high, c_.low, c_.close, 1, "M5") for i, c_ in enumerate(market())]
live[-1] = Candle(now, live[-1].open, live[-1].high, live[-1].low, live[-1].close, 1, "M5")   # still forming
lf = {x.time: DIV[T0 + i * 300] for i, x in enumerate(live)}
lv = F.confirm(live, lf, True, live[12].time, [live[12].time])
without = F.confirm(live[:-1], lf, True, live[12].time, [live[12].time])
check("NO LOOK-AHEAD: a still-forming candle changes nothing", (lv.divergence, lv.delta), (without.divergence, without.delta))

print("\nTHE SELL MIRROR")
mir = lambda f: {t: (s, b) for t, (b, s) in f.items()}  # noqa: E731
check("buying dries up as price makes a new high, reaction selling → AGREE",
      F.confirm(market(False), mir(DIV), False, TAP, REACT).agree, True)
check("buying keeps pace → does NOT agree", F.confirm(market(False), mir(CONV), False, TAP, REACT).agree, False)
check("sell absorption: sellers one-sided, candle closed UP", F.absorbed(market(False), mir(ABS), False, TAP, "5M") is not None,
      True)

print("\nBITCOIN — Binance's own buy/sell figures")
k = lambda t, vol, buy: [t * 1000, "1", "2", "0.5", "1.5", str(vol), t * 1000 + 59999, "0", 5, str(buy), "0", "0"]  # noqa: E731
rows = [k(T0, "0.005", "0.003"), k(T0 + 60, "12.5", "2.5"), k(int(time.time()) // 60 * 60, "9", "9")]
got = BT.parse(rows, 60, time.time())
check("decimal volumes kept: 0.005 traded, 0.003 bought → (0.003, 0.002)",
      tuple(round(x, 6) for x in got[T0]), (0.003, 0.002))
check("sold = volume − bought (12.5 − 2.5 = 10)", got[T0 + 60], (2.5, 10.0))
check("the still-forming candle is dropped", len(got), 2)


class FakeResp:
    def __init__(self, code, body):
        self.status_code, self._b = code, body

    def json(self):
        return self._b


class FakeClient:
    def __init__(self, answers):
        self.answers, self.calls = list(answers), []

    async def get(self, url, params=None):
        self.calls.append(url)
        a = self.answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a


run = lambda co: asyncio.new_event_loop().run_until_complete(co)  # noqa: E731
BT._cache.clear()
fc = FakeClient([FakeResp(451, {}), FakeResp(200, rows[:2])])
src, fl = run(BT.flows("M1", 2, client=fc, now=T0 + 1000))
check("futures refused (451) → the spot mirror is used, and named", (src, len(fl), len(fc.calls)),
      ("Binance spot", 2, 2))
src2, _ = run(BT.flows("M1", 2, client=FakeClient([]), now=T0 + 1005))
check("asked again 5s later → served from the cache, no new request", src2, "Binance spot")
BT._cache.clear()
check("both sources fail → ('', {}), never raises",
      run(BT.flows("M5", 2, client=FakeClient([TimeoutError("slow"), FakeResp(500, {})]), now=T0 + 1000)), ("", {}))

print("\nTHE CHECK PIX RUNS ONCE THE ZONE HAS PROVED ITSELF (pix.make_check)")
from strategies.pix import make_check  # noqa: E402
from strategies.pix_entry import Entry  # noqa: E402
m1c = [Candle(x.time, x.open, x.high, x.low, x.close, 1, "M1") for x in market()]
ent = Entry(TAP, TAP, [m1c[-1]], m1c[-1], 102.5, 100.0, "")
FLAT_FP = {t: {100.0: (1.0, 1.0)} for t in DIV}          # a footprint with no stacked imbalance anywhere
ok = make_check({"M5": ("Binance futures", DIV, FLAT_FP), "M1": ("Binance futures", DIV, FLAT_FP)})(market(), m1c, True, ent)
check("no absorption, divergence + buying reaction → (no refusal, CONFIRMS line with its source)",
      (ok[0], ok[1].startswith("Order flow CONFIRMS (Binance futures)")), (None, True))
bad = make_check({"M5": ("Binance futures", DIV, FLAT_FP), "M1": ("Binance futures", ABS, FLAT_FP)})(market(), m1c, True, ent)
check("1M ABSORPTION → refused, naming the timeframe and source", (bad[0] or "").startswith("1M ABSORPTION"), True)
dis = make_check({"M5": ("x", CONV, {}), "M1": ("x", CONV, {})})(market(), m1c, True, ent)
check("convergence → NOT refused, the line warns instead", (dis[0], "does NOT agree" in dis[1]), (None, True))
none = make_check({"M5": ("", {}, {}), "M1": ("", {}, {})})(market(), m1c, True, ent)
check("no figures at all (source down / gold warming up) → not refused, 'not available yet'",
      (none[0], none[1].startswith("Order flow not available yet")), (None, True))

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
