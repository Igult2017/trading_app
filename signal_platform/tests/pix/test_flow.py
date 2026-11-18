"""PIX ORDER FLOW — proved on hand-built candles with known answers (18 Nov 2026). docs/strategies/pix.md.

Runs the REAL functions: `pix_flow.verdict` (absorption / initiation / CVD), `pix_btcflow` (Binance parsing, the
forming candle, the fallback source, never raising), `pix_goldflow` (the tick rule and its coverage), `pix.make_check`
(5M AND 1M). Every key rule has a TEETH case: the rule is broken on purpose and the check must then fail.
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
import strategies.pix_goldflow as GF  # noqa: E402

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


print("THE VERDICT — buy at demand")
DIV = flows((10, 30), (20, 20), (22, 18), (40, 10))      # selling dries up as price makes its new low
v = F.verdict(market(), DIV, True, TAP, "5M")
check("selling dried up while price made a new low, buyers 60% one-sided leaving → GO", v.kind, F.GO)
check("...called a CVD DIVERGENCE", any("DIVERGENCE" in r for r in v.reasons), True)
CONV = flows((10, 30), (10, 30), (22, 18), (40, 10))     # selling keeps pace with price into the zone
v = F.verdict(market(), CONV, True, TAP, "5M")
check("CVD followed price to a new low → REFUSE (convergence)", (v.kind, "CONVERGENCE" in v.reasons[-1]),
      (F.REFUSE, True))
ABS = flows((10, 30), (20, 20), (40, 10), (40, 10))      # the TAP candle: buyers 60% one-sided yet it closed down
v = F.verdict(market(), ABS, True, TAP, "5M")
check("buyers pushing but the candle closed DOWN at the zone → REFUSE (absorption)",
      (v.kind, "ABSORPTION" in v.reasons[0]), (F.REFUSE, True))
F.ABSORB_MIN = 2.0
teeth("absorption (threshold made unreachable)", F.verdict(market(), ABS, True, TAP, "5M").kind == F.GO)
F.ABSORB_MIN = 0.25
WEAK = flows((10, 30), (20, 20), (22, 18), (21, 19))     # leaving the zone with only 5% buying
v = F.verdict(market(), WEAK, True, TAP, "5M")
check("price left the zone with only +5% buying → REFUSE (no initiation)", (v.kind, "initiation" in v.reasons[0]),
      (F.REFUSE, True))
F.INIT_MIN = 0.0
teeth("initiation (minimum set to 0)", F.verdict(market(), WEAK, True, TAP, "5M").kind == F.GO)
F.INIT_MIN = 0.10
miss = dict(DIV)
miss.pop(T0 + 3 * 300)
check("ONE candle with no buy/sell figure → UNKNOWN (and UNKNOWN never says go)",
      (F.verdict(market(), miss, True, TAP, "5M").kind, F.Verdict(F.UNKNOWN).go), (F.UNKNOWN, False))
check("too few candles before the tap → UNKNOWN", F.verdict(market()[8:], DIV, True, TAP, "5M").kind, F.UNKNOWN)
now = int(time.time()) // 300 * 300
live = [Candle(now - (14 - i) * 300, c.open, c.high, c.low, c.close, 1, "M5") for i, c in enumerate(market())]
live[-1] = Candle(now, live[-1].open, live[-1].high, live[-1].low, live[-1].close, 1, "M5")   # still forming
lf = {c.time: DIV[T0 + i * 300] for i, c in enumerate(live)}
lv = F.verdict(live, lf, True, live[12].time, "5M")
without = F.verdict(live[:-1], lf, True, live[12].time, "5M")
as_closed = F.verdict(market(), DIV, True, TAP, "5M")
check("NO LOOK-AHEAD: with a still-forming last candle the answer is exactly the answer WITHOUT that candle",
      (lv.kind, lv.reasons), (without.kind, without.reasons))
check("...and it is NOT the answer that candle would give once closed (so it really was ignored)",
      (lv.kind, lv.reasons) != (as_closed.kind, as_closed.reasons), True)

print("\nTHE VERDICT — sell at supply (the mirror)")
mir = lambda f: {t: (s, b) for t, (b, s) in f.items()}  # noqa: E731
check("buying dries up as price makes a new high → GO", F.verdict(market(False), mir(DIV), False, TAP, "5M").kind, F.GO)
check("buying keeps pace → REFUSE", F.verdict(market(False), mir(CONV), False, TAP, "5M").kind, F.REFUSE)

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

print("\nGOLD — the price-tick estimate")
GF.reset()
base = T0 + 3600
GF.on_tick("XAU/USD", 4000.00, base + 30)                         # first minute: we joined part-way
for i, b in enumerate([4000.10, 4000.20, 4000.20, 4000.10]):     # next minute: up, up, unchanged, down
    GF.on_tick("XAU/USD", b, base + 60 + i)
GF.on_tick("EUR/USD", 1.1, base + 61)                             # not gold — ignored
src, m1f = GF.flows("M1", now=base + 400)
check("the minute we joined part-way is NOT used", base in m1f, False)
check("up, up, unchanged, down → 2 buyer ticks, 1 seller tick (unchanged not counted)", m1f.get(base + 60), (2.0, 1.0))
check("...labelled as an estimate", src, "price-tick estimate")
GF.on_tick("XAU/USD", 4000.30, base + 300)                       # 4 minutes of silence → stream was down
check("after a silence of over a minute, the minute where counting resumes is not used",
      (base + 300) in GF.flows("M1", now=base + 1000)[1], False)
GF.reset()
s5 = (T0 // 300 + 20) * 300
GF.on_tick("XAU/USD", 4000.0, s5 - 1)
for m in range(5):
    GF.on_tick("XAU/USD", 4000.0 + m + 0.1, s5 + m * 60 + 1)
    GF.on_tick("XAU/USD", 4000.0 + m + 0.05, s5 + m * 60 + 30)
check("a 5M candle = its five 1M counts added (5 up, 5 down)", GF.flows("M5", now=s5 + 400)[1].get(s5), (5.0, 5.0))
check("a 5M candle missing one of its minutes is not given a figure", GF.flows("M5", now=s5 + 250)[1].get(s5), None)
GF.reset()

print("\nBOTH TIMEFRAMES MUST AGREE (pix.make_check)")
from strategies.pix import make_check  # noqa: E402
m1c = [Candle(c.time, c.open, c.high, c.low, c.close, 1, "M1") for c in market()]
ok = make_check({"M5": ("Binance futures", DIV), "M1": ("Binance futures", DIV)})(market(), m1c, True, TAP)
check("5M GO and 1M GO → go, every reason names its source", (ok[0], all("(Binance futures)" in r for r in ok[1])),
      (True, True))
bad = make_check({"M5": ("Binance futures", DIV), "M1": ("Binance futures", ABS)})(market(), m1c, True, TAP)
check("5M GO but 1M ABSORPTION → no", (bad[0], "1M ABSORPTION" in bad[1][-1]), (False, True))
none = make_check({"M5": ("", {}), "M1": ("", {})})(market(), m1c, True, TAP)
check("no figures at all (source down / gold warming up) → no", none[0], False)

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} of {N[0]} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
