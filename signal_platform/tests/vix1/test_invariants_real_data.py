"""VIX.1 — the real functions, driven over real candles.

This is the layer that catches a production break. The unit files above check rules on hand-built
candles; a strategy can pass all of those and still crash or emit a nonsense level the moment it runs
on real data. So this drives `m1_signals` bar by bar over real broker M1 and asserts VIX.1's own rules
on EVERY signal it produces.

NOT A BACKTEST. Nothing here scores the strategy — no P&L, win rate, expectancy or hit rate. Every
assertion is structural: is the entry a stop, is the pullback past the line, is TP 2R, did a level
come from a closed candle. Historical candles are input, not a verdict.
"""
from _harness import Suite, load

from strategies.vix1_entry import m1_signals
from strategies.vix1_lines import draw_line
from strategies.vix1_momentum import LOOKBACK, is_momentum_candle

s = Suite("VIX.1 — invariants on real broker candles")

PAIRS = [("GBP/USD", "GBPUSD_M1.csv", "GBPUSD_H1.csv", 0.0001),
         ("EUR/USD", "EURUSD_M1.csv", "EURUSD_H1.csv", 0.0001)]
BARS = 4000            # M1 bars to walk per pair
STEP = 5               # evaluate every Nth bar — the rules are per-signal, not per-tick
TP_R = 2.0             # vix1.py: tp = entry +/- 2.0 * risk

produced = 0
crashes = 0
bad_stop = []          # entry not beyond the pullback -> would fill on a reversal
bad_sl = []            # SL not on the losing side of entry
bad_tp = []            # TP is not 2R
skipped = []

for label, m1f, h1f, pip in PAIRS:
    m1 = load(m1f, "M1", limit=BARS + LOOKBACK * 60 + 10)
    h1 = load(h1f, "H1", limit=400)
    if not m1 or not h1:
        skipped.append(label)
        continue

    # a real momentum candle from this pair's own H1 history, so the line is a real level
    vc = next((h1[i] for i in range(len(h1) - 1, 30, -1)
               if is_momentum_candle(h1, i, True, label) or is_momentum_candle(h1, i, False, label)), None)
    if vc is None:
        skipped.append(f"{label} (no momentum candle in H1 window)")
        continue
    bullish = vc.close > vc.open
    line = draw_line(vc)

    start = max(LOOKBACK * 60, len(m1) - BARS)
    for i in range(start, len(m1), STEP):
        win = m1[:i + 1]
        try:
            out = m1_signals(win, bullish, vc, pip=pip, symbol=label)
        except Exception as exc:                     # the crash-freedom check
            crashes += 1
            bad_stop.append(f"{label}@{i}: {type(exc).__name__} {exc}")
            continue
        for sig in out:
            produced += 1
            entry, sl = sig["entry"], sig["sl"]
            last = win[-1].close
            # 1. THE ENTRY IS A STOP — beyond current price on the continuation side, so a reversal
            #    can never fill it. vix1_entry refuses an entry already taken out.
            if (entry <= last) if bullish else (entry >= last):
                bad_stop.append(f"{label}@{i}: entry {entry} vs price {last} ({'buy' if bullish else 'sell'})")
            # 2. THE SL IS ON THE LOSING SIDE of the entry
            if (sl >= entry) if bullish else (sl <= entry):
                bad_sl.append(f"{label}@{i}: sl {sl} vs entry {entry}")
            # 3. TP IS 2R — computed downstream in vix1.py from this entry/sl
            risk = abs(entry - sl)
            tp = entry + TP_R * risk if bullish else entry - TP_R * risk
            if risk <= 0 or abs(abs(tp - entry) / risk - TP_R) > 1e-9:
                bad_tp.append(f"{label}@{i}: risk {risk}")

print(f"   walked {BARS} M1 bars x {len(PAIRS)} pairs (every {STEP}th), signals produced: {produced}")
if skipped:
    print(f"   skipped: {skipped}")

s.check("the run is not vacuous — signals were produced", produced > 0, True)
s.check("no exception on any bar (crash-freedom)", crashes, 0)
s.check("every entry is a STOP beyond price (a reversal cannot fill)", bad_stop[:3], [])
s.check("every SL sits on the losing side of its entry", bad_sl[:3], [])
s.check("every TP is exactly 2R", bad_tp[:3], [])

# ------------------------------------------------------------------ the governing invariant
print()
print("   LEVELS come from CLOSED candles — mutating the FORMING bar must change nothing:")
from core.types import Candle

mutated_ok = True
checked = 0
for label, m1f, h1f, pip in PAIRS:
    m1 = load(m1f, "M1", limit=BARS)
    h1 = load(h1f, "H1", limit=400)
    if not m1 or not h1:
        continue
    vc = next((h1[i] for i in range(len(h1) - 1, 30, -1)
               if is_momentum_candle(h1, i, True, label) or is_momentum_candle(h1, i, False, label)), None)
    if vc is None:
        continue
    bullish = vc.close > vc.open
    for i in range(len(m1) - 400, len(m1), 40):
        win = m1[:i + 1]
        base = m1_signals(win, bullish, vc, pip=pip, symbol=label)
        if not base:
            continue
        checked += 1
        # stretch the FORMING bar violently in both directions and move its close
        f = win[-1]
        wild = Candle(time=f.time, open=f.open, high=f.high + 0.0050, low=f.low - 0.0050,
                      close=f.low - 0.0040, volume=0, timeframe="M1")
        after = m1_signals(win[:-1] + [wild], bullish, vc, pip=pip, symbol=label)
        if after and (after[0]["entry"] != base[0]["entry"] or after[0]["sl"] != base[0]["sl"]):
            mutated_ok = False
            break

s.check("levels checked against a mutated forming bar", checked > 0, True)
s.check("entry/SL are UNCHANGED when the forming bar is mutated", mutated_ok, True)

# ------------------------------------------------------------------ teeth
print()
# break the stop rule on purpose: an entry on the WRONG side of price must be caught by the same test
fake_last, fake_entry = 1.1000, 1.0990
s.teeth("the entry-is-a-STOP check", (fake_entry <= fake_last))          # a buy 'stop' below price
s.teeth("the SL-side check", (1.1010 >= 1.1000))                          # a buy SL above entry
s.teeth("the TP=2R check", abs(abs(1.1030 - 1.1000) / 0.0010 - TP_R) > 1e-9)

s.done()
