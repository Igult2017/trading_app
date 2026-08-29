"""VIX.1 — the 8-bar pullback gate ignores structure from before a change of character.

HIS RULE, 2026-08-29:

    "8 bar should stop defining the trend when CHOCH logic has confirmed change of character, because
     8 bar is for pullback and the main pullback logic is already coordinating with CHOCH logic — so
     logically it doesn't make sense that the main pullback logic obeys CHOCH logic and 8 bars
     pullback logic ignores it."

He is right, and the inconsistency was real. There are two pullback readings on the 1-hour chart. The
MAIN one (`vix1_trend`, where counter-swings are banked without moving the protecting level) is what
the change of character is measured against, so it obeys the turn by construction. This gate did not:
it compared the last two highs and lows with no idea a turn had happened.

THAT ATTRIBUTION WAS WRONG AND IS WITHDRAWN — corrected 2026-08-29 on real bars.

This file used to claim the change was worth having because of his GBP/USD case of 26 Aug 2026 15:00
(UTC+3), a 21.5-pip drop. **It was not, and the claim was made on a file that ended 10 August — 16
days before the event it described.** Replayed on bars pulled through 28 Aug:

    the trend BEFORE his candle was UP, and his candle was a SELL
    -> VIX.1 is pro-trend only, so it is refused there, before this gate is ever consulted
    the gate's verdict at that bar is "up" WITH the turn's position and "up" WITHOUT it — identical
    once it closes, its close 1.36068 is below the protecting 1.36199, so it IS the turn down,
    and his 25 Aug rule holds a turn down back until it has proved itself

So his 26 Aug candle is refused by the pro-trend rule and then by his own turn-down rule. This gate
had nothing to do with it.

WHAT THE CHANGE IS ACTUALLY WORTH, measured instead of asserted: over the last 2,000 bars (~4 months)
of real GBP/USD it changes the gate's verdict on **134 of the 1,859 bars where the gate is actually
consulted (7.2%)**. That is real work, and it is the honest reason to keep it — not a case it never
touched.

AND IT IS STRUCTURAL. A swing needs 8 bars either side, so the newest 8 bars can never hold one.
Right after a reversal this gate is necessarily still describing the move that ended.

THE FILE'S JOB IS THE REGRESSION, NOT THE FEATURE. The gate exists because of a real loss on
10 Aug 2026 — a rally sold into a downtrend. Test 2 below asserts that case is still refused. **If
test 2 ever passes as "allowed", this change is wrong and must come out**, whatever the recovery
numbers say.

NOT A BACKTEST: nothing here scores a win, a loss or an R. It counts verdicts.
"""
import csv
import os

from _harness import Suite

from core.types import Candle
from strategies import vix1_swings, vix1_trend
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
from strategies.vix1_momentum import is_momentum_candle
from strategies.vix1_structure import _FAST_N, fast_pattern, leg_state

s = Suite("VIX.1 — the leg gate obeys the change of character")

DATA = r"C:\Users\FSD\trading_app_data\ctrader"
YEAR = 24 * 365


def bars_from(fname, limit=YEAR + _H1_TREND_BARS):
    """Real broker candles. Returns [] when the file is absent so this skips rather than errors."""
    path = os.path.join(DATA, fname)
    if not os.path.exists(path):
        return []
    rows = list(csv.DictReader(open(path)))[-limit:]
    out = [Candle(time=int(r["time"]), open=float(r["open"]), high=float(r["high"]),
                  low=float(r["low"]), close=float(r["close"]), volume=0, timeframe="H1")
           for r in rows]
    out.sort(key=lambda c: c.time)
    return out


def verdicts(h, name):
    """Every pro-trend momentum candle that actually reaches the gate, judged both ways."""
    out = []
    for i in range(_H1_TREND_BARS, len(h)):
        up = is_momentum_candle(h[:i + 1], i, True, name)
        dn = is_momentum_candle(h[:i + 1], i, False, name)
        if not (up or dn):
            continue
        w = h[:i + 1][-_H1_TREND_BARS:]
        st = vix1_trend.trend_state(w, n=_H1_SWING_N, turns=vix1_swings.structure_turns(w, _H1_SWING_N))
        if st.direction == 0 or (1 if up else -1) != st.direction:
            continue                                   # the gate is only consulted pro-trend
        opp = "down" if st.direction == 1 else "up"
        old = fast_pattern(w, _FAST_N) == opp                        # index withheld = old behaviour
        new = fast_pattern(w, _FAST_N, st.choch_index) == opp        # index supplied = his rule
        out.append((i, st, old, new))
    return out


# ── 1. IT ONLY EVER LOOSENS ──────────────────────────────────────────────────────────────────────
# The property that makes this safe: it cannot introduce a new KIND of trade, only stop the gate
# refusing on evidence that predates the turn. Asserted per instrument on the real files.
print()
print("ON REAL BARS — it recovers setups and blocks nothing new")
_any = False
for name, fname in (("GBP/USD", "GBPUSD_H1_to10Aug.csv"),
                    ("EUR/USD", "EURUSD_H1_to16Aug.csv"),
                    ("XAU/USD", "XAUUSD_H1.csv")):
    h = bars_from(fname)
    if len(h) < _H1_TREND_BARS + 200:
        print(f"      (skipped {name} — {fname} not on this machine)")
        continue
    _any = True
    v = verdicts(h, name)
    freed = sum(1 for _, _, o, n in v if o and not n)
    blocked = sum(1 for _, _, o, n in v if n and not o)
    s.check(f"{name}: nothing is NEWLY refused", blocked, 0)
    s.check(f"{name}: it recovers refused setups", freed > 0, True)
    print(f"      {name}: {len(v)} reached the gate, {freed} recovered, {blocked} newly refused")

if not _any:
    s.check("SKIPPED — no broker files on this machine", True, True)

# ── 2. THE REGRESSION — 10 AUGUST MUST STILL BE REFUSED ──────────────────────────────────────────
# This is the loss the gate was built to prevent. It is the reason the gate exists, and the reason
# this change must be reverted if this ever flips.
print()
print("THE 10 AUGUST CASE — the loss this gate exists to prevent")
_g = bars_from("GBPUSD_H1_to10Aug.csv")
if len(_g) < _H1_TREND_BARS + 200:
    s.check("SKIPPED — GBPUSD_H1_to10Aug.csv not on this machine", True, True)
else:
    import datetime
    found = False
    for i in range(_H1_TREND_BARS, len(_g)):
        d = datetime.datetime.utcfromtimestamp(_g[i].time)
        if not (d.year == 2026 and d.month == 8 and d.day == 10):
            continue
        up = is_momentum_candle(_g[:i + 1], i, True, "GBP/USD")
        dn = is_momentum_candle(_g[:i + 1], i, False, "GBP/USD")
        if not (up or dn):
            continue
        found = True
        w = _g[:i + 1][-_H1_TREND_BARS:]
        st = vix1_trend.trend_state(w, n=_H1_SWING_N, turns=vix1_swings.structure_turns(w, _H1_SWING_N))
        # The trend was UP and the candle was a SELL, so the pro-trend rule refuses it regardless —
        # but the gate's own verdict must not have loosened either.
        s.check("10 Aug: the trend read UP while the candle was a SELL", (st.direction, dn), (1, True))
        s.check("10 Aug: the gate's verdict is unchanged by the new rule",
                fast_pattern(w, _FAST_N), fast_pattern(w, _FAST_N, st.choch_index))
        s.teeth("the case the gate exists for is still refused",
                st.direction == 1 and dn)
    if not found:
        s.check("SKIPPED — no momentum candle on 10 Aug in this file", True, True)

# ── 3. TEETH — the turn's position is what changed the verdict ────────────────────────────────────
# A recovered case must go BACK to refused when the index is withheld. Without this, the numbers
# above could come from anything.
print()
print("TEETH — withhold the turn's position and the recovered cases are refused again")
if len(_g) >= _H1_TREND_BARS + 200:
    v = verdicts(_g, "GBP/USD")
    rec = [(i, st) for i, st, o, n in v if o and not n]
    s.check("there are recovered cases to test", len(rec) > 0, True)
    if rec:
        i, st = rec[0]
        w = _g[:i + 1][-_H1_TREND_BARS:]
        opp = "down" if st.direction == 1 else "up"
        s.check("  with the turn's position: allowed", fast_pattern(w, _FAST_N, st.choch_index) == opp, False)
        s.check("  without it: refused again", fast_pattern(w, _FAST_N) == opp, True)
        s.check("  and that case really had a change of character on record",
                st.choch_index is not None, True)
        s.teeth("the new argument is what moved the verdict, not something incidental",
                fast_pattern(w, _FAST_N) == opp and fast_pattern(w, _FAST_N, st.choch_index) != opp)

# ── 4. OMITTING IT IS EXACTLY TODAY'S BEHAVIOUR ──────────────────────────────────────────────────
# Every other caller, and every existing test, relies on this.
print()
print("OMITTING THE ARGUMENT REPRODUCES THE OLD BEHAVIOUR")
if len(_g) >= _H1_TREND_BARS + 200:
    w = _g[-_H1_TREND_BARS:]
    s.check("fast_pattern with no index == fast_pattern with None",
            fast_pattern(w, _FAST_N), fast_pattern(w, _FAST_N, None))
    s.check("leg_state with no index == leg_state with None",
            leg_state(w, 1, _FAST_N).ready, leg_state(w, 1, _FAST_N, None).ready)

s.done()
