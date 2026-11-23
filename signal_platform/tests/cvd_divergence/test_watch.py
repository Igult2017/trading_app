"""THE LIVE WATCH — started / cancelled / 1M turn, on the hand-built hours of test_cvd.py (23 Nov 2026).

The real `alerts.cvd_divergence.watch.step`, `messages.render` and `job._candles`. Swing A (high 2.0, CVD +1,600) is
confirmed; the hour in progress goes to 3.0 with CVD −600:
  * STARTED once, never twice; nothing when CVD is higher (they agree); nothing with too little history;
  * CANCELLED when CVD catches up to +1,600; a divergence found late and already over is never announced;
  * the 1M TURN: the first later 1M candle closing below the low of the candle that made the highest high — a candle that
    makes a new high is never its own turn; 1M candles before the diverging hour are ignored;
  * a restart (state through JSON, as the database keeps it) re-sends nothing;
  * the job skips a market whose last closed hour the broker has not published, but not a weekend gap.
Run: python tests/cvd_divergence/test_watch.py
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core.types import Candle  # noqa: E402
from alerts.cvd_divergence import watch as W, messages as M, job as J  # noqa: E402
from _cases import worked, bar, T0, mirror  # noqa: E402

BAD, N = [], [0]


def check(name, got, want):
    N[0] += 1
    ok = got == want
    print(("   PASS  " if ok else "   FAIL  ") + f"{name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        BAD.append(name)


def m1(t_min, h, l, c):
    return Candle(time=T0 + 60 * 3600 + t_min * 60, open=c, high=h, low=l, close=c, volume=10, timeframe="M1")


closed = worked()[:60]                                   # A confirmed; the hour of index 60 is in progress
forming = bar(60, 3.0, 0.9, 0.9)                         # higher high, all selling → CVD −600
kinds = lambda ev: [(e["kind"], e["side"]) for e in ev]  # noqa: E731

st, ev = W.step({}, "EUR/USD", closed, forming, [])
check("the hour in progress goes above swing A with CVD lower: STARTED (bearish)", kinds(ev), [("started", "bearish")])
check("…with the exact levels", (ev[0]["price"], ev[0]["ref_price"], round(ev[0]["cvd"]), round(ev[0]["ref_cvd"])),
      (3.0, 2.0, -600, 1600))
st, ev2 = W.step(st, "EUR/USD", closed, forming, [])
check("the next minute: nothing again (never announced twice)", ev2, [])
text = M.render(ev[0])
check("the DM names the market, both prices and both CVDs",
      all(x in text for x in ("EURUSD 1H (CVD divergence started)", "3.00000", "2.00000", "-600", "+1,600")), True)

agree = bar(60, 3.0, 0.9, 3.0)                           # CVD −400: still lower → still a divergence (as test_cvd shows)
st_b, ev_b = W.step({}, "EUR/USD", closed, bar(60, 1.5, 0.9, 0.9), [])
check("price NOT above the swing: nothing", ev_b, [])
check("too little history: nothing", W.step({}, "EUR/USD", closed[:30], forming, [])[1], [])
mi = W.step({}, "EUR/USD", mirror(closed), mirror([forming])[0], [])[1]
check("the mirror image: STARTED (bullish)", kinds(mi), [("started", "bullish")])

# ── CANCELLED: CVD catches up while the watch is open ──────────────────────────────────────────────────────────────
caught = bar(60, 3.0, 0.9, 3.0, v=2200.0)                # this hour's delta +2,200 → CVD −500 + 2,200 = +1,700 ≥ +1,600
st_c, ev_c = W.step(json.loads(json.dumps(st)), "EUR/USD", closed, caught, [])
check("CVD catches up (+1,700 vs +1,600): CANCELLED, watch closed", (kinds(ev_c), st_c["watches"]),
      ([("cancelled", "bearish")], {}))
check("…and that swing is never watched again", W.step(st_c, "EUR/USD", closed, forming, [])[1], [])
late = worked()[:61] + [bar(61, 1.0, 0.9, 1.0, v=3000.0)]  # B already closed; then heavy buying caught CVD up
st_l, ev_l = W.step({}, "EUR/USD", late[:61], late[61], [])
check("a divergence found LATE and already over: nothing sent (no started+cancelled pair)", ev_l, [])

# ── THE 1M TURN ────────────────────────────────────────────────────────────────────────────────────────────────────
early = Candle(time=T0 + 59 * 3600, open=9, high=9, low=0.1, close=0.1, volume=1, timeframe="M1")
bars = [early,
        m1(0, 2.5, 2.4, 2.45),
        m1(1, 2.8, 2.6, 2.7),      # new high 2.8, its low 2.6
        m1(2, 2.75, 2.62, 2.65),   # closes 2.65 ≥ 2.6: no turn
        m1(3, 2.9, 2.5, 2.55),     # NEW high 2.9 — closes below 2.6 but is a new high: never its own turn; low 2.5
        m1(4, 2.85, 2.45, 2.48)]   # closes 2.48 < 2.5: THE TURN
st_r, ev_r = W.step(json.loads(json.dumps(st)), "EUR/USD", closed, forming, bars)
check("the 1M turn: the 04 candle closing 2.48, below 2.5 (low of the 2.9 high candle)",
      [(e["kind"], e["turn"]["close"], e["guard"], e["ext"]) for e in ev_r], [("reversal", 2.48, 2.5, 2.9)])
check("…the 1M candle BEFORE the diverging hour was ignored, and the watch is closed", st_r["watches"], {})
check("the turn DM names the close and the level it broke",
      all(x in M.render(ev_r[0]) for x in ("2.48000", "2.50000", "2.90000")), True)
partial = W.step(json.loads(json.dumps(st)), "EUR/USD", closed, forming, bars[:5])
check("up to the 2.9 candle: no turn yet (a new high is never its own turn)", partial[1], [])
real_turn = W._turn
W._turn = lambda w, ms: None
check("TEETH: with the turn rule removed, no reversal would be sent",
      W.step(json.loads(json.dumps(st)), "EUR/USD", closed, forming, bars)[1], [])
W._turn = real_turn

# ── EVERY MESSAGE SAYS SELL OR BUY, AND WHY (his rule, 23 Nov 2026) ────────────────────────────────────────────────
first = lambda e: M.render(e).splitlines()[0]  # noqa: E731
check("started, bearish: the first line says SELL", ("SELL idea" in first(ev[0]), "BUY" in first(ev[0])), (True, False))
check("…and the Why: line has HIGHER high, LOWER CVD, both prices and both CVDs",
      all(x in M.render(ev[0]) for x in ("Why:", "HIGHER high", "LOWER", "3.00000", "2.00000", "-600", "+1,600",
                                         "fall is expected")), True)
check("started, bullish (mirror): the first line says BUY, the Why: line LOWER low and HIGHER CVD",
      ("BUY idea" in first(mi[0]), "SELL" in first(mi[0]),
       all(x in M.render(mi[0]) for x in ("Why:", "LOWER low", "HIGHER", "rise is expected"))), (True, False, True))
check("cancelled, bearish: SELL idea cancelled, with Why:", ("SELL idea cancelled" in first(ev_c[0]),
                                                             "Why:" in M.render(ev_c[0])), (True, True))
check("1M reversal, bearish: SELL — the 1M has turned down, with Why:",
      ("SELL — the 1M has turned down" in first(ev_r[0]), "Why:" in M.render(ev_r[0])), (True, True))
mirror_bars = mirror([b for b in bars])
mr = W.step(json.loads(json.dumps(W.step({}, "EUR/USD", mirror(closed), mirror([forming])[0], [])[0])), "EUR/USD",
            mirror(closed), mirror([forming])[0], mirror_bars)[1]
check("1M reversal, bullish (mirror): BUY — the 1M has turned up",
      [first(e).startswith("🔄 BUY — the 1M has turned up") for e in mr], [True])

# ── RESTART ────────────────────────────────────────────────────────────────────────────────────────────────────────
saved = json.loads(json.dumps(st))                       # what the database hands back after a deploy
check("after a restart: nothing re-sent", W.step(saved, "EUR/USD", closed, forming, [])[1], [])


# ── THE JOB: a missing hour is never calculated with; a weekend gap is not a missing hour ──────────────────────────
def run_candles(h1, m1s, now):
    import data.candle_fetcher as F
    import shared.mtf_utils as U
    import time as _t

    async def fake(symbol, tf, count=100):
        return h1 if tf == "H1" else m1s
    F.fetch_candles, real_time = fake, _t.time
    _t.time = lambda: now
    try:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(J._candles("EUR/USD"))
        finally:
            loop.close()
    finally:
        _t.time = real_time


h1s = [bar(i, 1.0, 0.9, 0.95) for i in range(10)]        # last closed hour: index 9
lag = [Candle(time=T0 + 10 * 3600 + k * 60, open=1, high=1, low=1, close=1, volume=1, timeframe="M1") for k in range(70)]
check("the broker has not published hour 10, though 1M candles in it closed: SKIPPED",
      run_candles(h1s, lag, T0 + 11 * 3600 + 15 * 60), None)
wk = [Candle(time=T0 + 60 * 3600 + k * 60, open=1, high=1, low=1, close=1, volume=1, timeframe="M1") for k in range(5)]
got = run_candles(h1s, wk, T0 + 60 * 3600 + 6 * 60)
check("a weekend gap (no 1M candles inside it): NOT skipped, the new hour is in progress",
      (got is not None, got and got[1] is not None and got[1].time), (True, T0 + 60 * 3600))

print(f"\n{'ALL PASS' if not BAD else f'{len(BAD)} FAILED: {BAD}'} ({N[0]} checks)")
sys.exit(1 if BAD else 0)
