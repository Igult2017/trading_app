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

⚠ UPDATED 2026-09-26, AND THE CHANGE IS THE POINT. The stop moved out to a share of the momentum
candle behind the line (`vix1_entry._SL_LINE_GAP_BODY`), so every stop below is WIDER than the one
the broker actually held on the day, and **none of these eight is killed by this check any more** —
the candle that used to trade through the narrow stop no longer reaches the wide one. Each case
carries the minute it used to die at, in a comment, so the old behaviour is still readable.

    the stop the broker held  ->  the stop the platform now computes
    15 Sep GBP buy   1.34912  ->  1.34891        10 Sep EUR sell  1.16199  ->  1.16216  (was dead)
    17 Sep EUR sell  1.14786  ->  1.14804        14 Sep EUR sell  1.15560  ->  1.15574  (was dead)
    18 Sep EUR sell  1.14746  ->  1.14764        16 Sep GBP buy   1.34783  ->  1.34750  (was dead)
    14 Sep gold      4284.39  ->  4290.74        16 Sep GBP sell  1.34573  ->  1.34602  (was dead)

THE RULE ITSELF IS UNCHANGED AND STILL PROVED, by the two direct `vix1_stop_check` assertions at the
bottom of this file — a candle past the stop kills, an exact touch does not. What changed is which
stop it is measured against, not the rule.

Replayed through the real ladder, the four it used to kill are worth +9.87R between them
(`trading_app_data/tools/vix1_his_trades_22sep.py` and the four-setup replay of the same day).
⚠ WITH ONE CAVEAT THAT MUST NOT BE LOST: the 16 Sep GBP sell really filled and lost -$125 in 1.2
SECONDS. A minute-bar replay cannot see a 1.2-second round trip, so its +2.00R here is not evidence
that the wider stop would have survived it. The new stop is 5.4 pips against the 2.5 that died; that
is better odds, not a proof.
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
     (1789477200, 1.34818, 1.34956, 1.34788, 1.34923), 1789481340, (1.34949, 1.34891), None),
    ("17 Sep EUR sell", "EURUSD_0917_sell", False, 0.0001, 0.0,
     (1789657200, 1.14859, 1.14876, 1.14751, 1.14781), 1789661160, (1.14759, 1.14804), None),
    ("18 Sep EUR sell", "EURUSD_0918_sell", False, 0.0001, 0.0,
     (1789725600, 1.14829, 1.14849, 1.14704, 1.14736), 1789729680, (1.14694, 1.14764), None),
    ("14 Sep gold sell", "XAUUSD_0914_sell_withdrawn", False, 0.1, 0.0,
     (1789412400, 4307.64, 4308.0, 4282.83, 4283.5), 1789416180, (4282.11, 4290.74), None),
    ("10 Sep EUR sell (withdrawn)", "EURUSD_0910_sell_withdrawn", False, 0.0001, 0.0,
     (1789056000, 1.16278, 1.16284, 1.1618, 1.16189), 1789059960, (1.16170, 1.16216), None),  # was dead at "20:02" on the OLD narrow stop
    ("14 Sep EUR sell (withdrawn)", "EURUSD_0914_sell_withdrawn", False, 0.0001, 0.0,
     (1789365600, 1.15695, 1.15698, 1.15503, 1.15522), 1789370580, (1.15508, 1.15574), None),  # was dead at "10:11" on the OLD narrow stop
    # Decided in the 06:04 minute and logged as refused at 06:05: at 06:05 price was back under the
    # line, so the entry was (rightly) waiting. The live spread then was ~1.1 pips (entry 1.34813).
    ("16 Sep GBP buy (refused)", "GBPUSD_0916_buy_refused", True, 0.0001, 0.00011,
     (1789524000, 1.34653, 1.34793, 1.34653, 1.34791), 1789527840, (1.34813, 1.34750), None),  # was dead at "06:03" on the OLD narrow stop
    ("16 Sep GBP sell (-$125)", "GBPUSD_0916_sell", False, 0.0001, 0.0,
     (1789556400, 1.34712, 1.34727, 1.34544, 1.34555), 1789560180, (1.34548, 1.34602), None),  # was dead at "15:02" on the OLD narrow stop
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
    #
    # THE STOP IS PASSED IN BY HAND HERE, and that is the point of this block after 2026-09-26. The
    # rule is "price traded past THIS stop"; the stop it is handed is a separate question. The wide
    # stop the platform now computes (1.16216) is NOT traded through, which is exactly why this
    # setup is no longer killed — so proving the RULE still works means handing it the NARROW stop
    # the broker actually held on the day (1.16199), which was.
    OLD_NARROW_STOP = 1.16199
    vix1_stop_check._ENFORCE = True
    label, fn, buy, pip, sp, vc, sent, held, dead = CASES[4]
    win = [c for c in bars(fn) if vc[0] + 3600 <= c.time and c.time + 60 <= sent + 30]
    from strategies import vix1_cross                          # noqa: E402
    x = vix1_cross.decide(win, buy, vc[4], pip, spread=sp)
    hit = vix1_stop_check.stop_already_hit(win, x.cross_idx, buy, OLD_NARROW_STOP)
    s.check("10 Sep: the killing candle is 20:02, whose high 1.16203 is past the stop 1.16199",
            (dt.datetime.fromtimestamp(hit.time, K).strftime("%H:%M"), hit.high), ("20:02", 1.16203))
    s.check("an EXACT touch does not kill (his 'outside the SL band')",
            vix1_stop_check.stop_already_hit([hit, Candle(0, 1, OLD_NARROW_STOP, 1, 1, 0, "M1")],
                                             0, False, OLD_NARROW_STOP),
            None)
    # AND THE WIDE STOP IS GENUINELY CLEAR OF IT — not merely untested. This is the whole reason the
    # four dead setups came back: the same candles, the same rule, a stop they no longer reach.
    s.check("...and the WIDER stop the platform now computes is never traded through",
            vix1_stop_check.stop_already_hit(win, x.cross_idx, buy, held[1]), None)
    s.teeth("the check still kills a setup whose stop WAS traded through",
            vix1_stop_check.stop_already_hit(win, x.cross_idx, buy, OLD_NARROW_STOP) is not None
            and vix1_stop_check.stop_already_hit(win, x.cross_idx, buy, held[1]) is None)
vix1_stop_check._ENFORCE = True

s.done()
