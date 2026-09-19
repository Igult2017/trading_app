"""NO ORDER FOR A SETUP WHOSE STOP HAS ALREADY BEEN TRADED THROUGH (docs/OPEN.md B30, 19 Sep 2026).

His words: *"I do feel the system is making entries wrong"*, and he asked for the withdrawals to be fixed
from the root cause. ROOT CAUSE: the entry checked its ENTRY price against the market and never its STOP,
so 7 of the 11 VIX.1 orders of 10-18 Sep were sent after price had already gone past their own stop.
Each was then withdrawn (or, 16 Sep, filled and lost -$125 in 1.2 s).

HIS RULINGS: Q1 (a) — every candle AFTER the cross; price PAST the stop, a wick counts, an exact touch
does not (*"when the price goes outside the SL band"*). Q2 (a) — the setup is dead, no order.

REAL DATA, REAL FUNCTION: the broker's 1-minute candles for eight real orders
(`trading_app_data/ctrader/entries`), the momentum candle each was built from, and the live
`vix1_entry.m1_signals` at the minute the order was sent. Times below are his clock (UTC+3).
"""
import csv
import datetime as dt
import logging
import os

from _harness import DATA, Suite
from core.types import Candle
from strategies import vix1_stop_check
from strategies.vix1_entry import m1_signals

logging.disable(logging.CRITICAL)
s = Suite("VIX.1 — no order for a setup whose stop was already traded through")
DIR = os.path.join(DATA, "entries")
K = dt.timezone(dt.timedelta(hours=3))

# case, file, buy, pip, spread, momentum candle (time, o, h, l, c), minute sent (UTC epoch),
# the order the broker held (entry, stop), and — for a dead one — the candle that went past the stop
CASES = [
    ("15 Sep GBP buy", "GBPUSD_0915_buy", True, 0.0001, 0.0001,
     (1789477200, 1.34818, 1.34956, 1.34788, 1.34923), 1789481340, (1.34949, 1.34912), None),
    ("17 Sep EUR sell", "EURUSD_0917_sell", False, 0.0001, 0.0,
     (1789657200, 1.14859, 1.14876, 1.14751, 1.14781), 1789661160, (1.14759, 1.14786), None),
    ("18 Sep EUR sell", "EURUSD_0918_sell", False, 0.0001, 0.0,
     (1789725600, 1.14829, 1.14849, 1.14704, 1.14736), 1789729680, (1.14694, 1.14746), None),
    ("14 Sep gold sell", "XAUUSD_0914_sell_withdrawn", False, 0.1, 0.0,
     (1789412400, 4307.64, 4308.0, 4282.83, 4283.5), 1789416180, (4282.11, 4284.39), None),
    ("10 Sep EUR sell (withdrawn)", "EURUSD_0910_sell_withdrawn", False, 0.0001, 0.0,
     (1789056000, 1.16278, 1.16284, 1.1618, 1.16189), 1789059960, (1.16170, 1.16199), "20:02"),
    ("14 Sep EUR sell (withdrawn)", "EURUSD_0914_sell_withdrawn", False, 0.0001, 0.0,
     (1789365600, 1.15695, 1.15698, 1.15503, 1.15522), 1789370580, (1.15508, 1.15560), "10:11"),
    # Decided in the 06:04 minute and logged as refused at 06:05: at 06:05 price was back under the
    # line, so the entry was (rightly) waiting. The live spread then was ~1.1 pips (entry 1.34813).
    ("16 Sep GBP buy (refused)", "GBPUSD_0916_buy_refused", True, 0.0001, 0.00011,
     (1789524000, 1.34653, 1.34793, 1.34653, 1.34791), 1789527840, (1.34813, 1.34783), "06:03"),
    ("16 Sep GBP sell (-$125)", "GBPUSD_0916_sell", False, 0.0001, 0.0,
     (1789556400, 1.34712, 1.34727, 1.34544, 1.34555), 1789560180, (1.34548, 1.34573), "15:02"),
]


def bars(name):
    path = os.path.join(DIR, f"{name}_M1.csv")
    if not os.path.exists(path):
        return None
    return [Candle(int(r["time"]), float(r["open"]), float(r["high"]), float(r["low"]),
                   float(r["close"]), 0.0, "M1") for r in csv.DictReader(open(path))]


def run(case, enforce):
    label, fn, buy, pip, sp, vc, sent, _, _ = case
    vix1_stop_check._ENFORCE = enforce
    now = sent + 30
    m1 = [c for c in bars(fn) if c.time + 60 <= now]
    out = m1_signals(m1, buy, Candle(*vc, 0.0, "H1"), pip=pip, symbol=label, spread=sp,
                     quote=None, now=now)
    d = 2 if pip >= 0.01 else 5                      # the order is sent at the symbol's own precision
    return (round(out[0]["entry"], d), round(out[0]["sl"], d)) if out else None


if bars("EURUSD_0918_sell") is None:
    print("   SKIP — the candle files are not on this machine (trading_app_data/ctrader/entries)")
else:
    print("\n   WITHOUT the check, the live entry reproduces what was sent:")
    for case in CASES:
        label, *_, held, dead = case
        got = run(case, enforce=False)
        if dead in (None, "20:02", "10:11"):                 # reproduced exactly, entry AND stop
            s.check(f"{label}: sends {held}", got, held)
        else:                                                # entry exact, stop within 0.2 pip
            s.check(f"{label}: sends entry {held[0]} (stop {got[1] if got else None} vs {held[1]})",
                    (got[0], abs(got[1] - held[1]) <= 0.00002) if got else None, (held[0], True))

    print("\n   WITH the check (his Q1/Q2 rulings):")
    for case in CASES:
        label, fn, buy, pip, sp, vc, sent, held, dead = case
        got = run(case, enforce=True)
        if dead is None:
            s.check(f"{label}: CLEAN — the same order is still sent", got, held)
        else:
            s.check(f"{label}: DEAD — price went past its stop at {dead}, so no order", got, None)

    # WHICH candle killed it, read back through the real check on the real candles.
    vix1_stop_check._ENFORCE = True
    label, fn, buy, pip, sp, vc, sent, held, dead = CASES[4]
    win = [c for c in bars(fn) if vc[0] + 3600 <= c.time and c.time + 60 <= sent + 30]
    from strategies import vix1_cross                          # noqa: E402
    x = vix1_cross.decide(win, buy, vc[4], pip, spread=sp)
    hit = vix1_stop_check.stop_already_hit(win, x.cross_idx, buy, held[1])
    s.check("10 Sep: the killing candle is 20:02, whose high 1.16203 is past the stop 1.16199",
            (dt.datetime.fromtimestamp(hit.time, K).strftime("%H:%M"), hit.high), ("20:02", 1.16203))
    s.check("an EXACT touch does not kill (his 'outside the SL band')",
            vix1_stop_check.stop_already_hit([hit, Candle(0, 1, 1.16199, 1, 1, 0, "M1")], 0, False, 1.16199),
            None)
    s.teeth("the check is what stops the 16 Sep order", run(CASES[7], False) is not None
            and run(CASES[7], True) is None)
vix1_stop_check._ENFORCE = True

s.done()
