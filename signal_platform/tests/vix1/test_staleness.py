"""VIX.1 — the decision must be about NOW, not about a moment that has passed.

THE INCIDENT (2026-08-19). Gold was switched on mid-session and its first scan reached eleven hours
back to the 18 Aug 14:00 candle — still inside `momentum_run`'s 12-bar lookback — and sold it. By
then price had fallen $33 and bounced $23 back. He read the alert, looked at his chart and said:

    "there is no momentum candle that has CLOSED there"
    "you can see the market in a pullback"

Both were true. The candle was real, but it was half a day behind him.

TWO SEPARATE DEFECTS, one test file:

  A  BACKFILL — a candle that closed before the instrument was first scanned is history the platform
     never watched. `core/instrument_debut.py`. Threshold-free: "when did this go live" is a fact.

  B  A FROZEN DECISION — the leg gate, the regime and the retracement were all read on a window
     truncated to the momentum candle, so as the candle aged the whole judgement aged with it. The
     live pullback reading sat at "1 bar, 0.19x ATR" for twelve hours while the real one reached
     1.72x. The causal reads are kept; the same checks are now ALSO asked about the present.

NOT A BACKTEST: no P&L, no win rate, no trades simulated.
"""
from _harness import Suite, load

from core.instrument_debut import InstrumentDebut
from core.types import TF
from strategies.vix1 import Vix1Strategy
from strategies import vix1_bias
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
from strategies.vix1_state import market_state
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state

s = Suite("VIX.1 — backfill and the frozen decision")

H1 = Vix1Strategy.candle_counts[TF.H1]
H4 = Vix1Strategy.candle_counts.get(TF.H4, 400)
MC = 1787061600          # 18 Aug 2026 14:00 UTC — the candle the gold signal was built on


class Mem(InstrumentDebut):
    """The registry with the database taken out — the rule under test is not the persistence."""
    def __init__(self):
        self.key, self._first = "", {}

    def _persist(self):
        pass


# ── A. the backfill rule, on its own ─────────────────────────────────────────────────────────────
print("   a candle from before we were watching is backfill:")
d = Mem()
s.check("an unknown instrument is never called backfill — we do not guess", d.is_backfill("X", 1), False)
d.note("X", 500)
s.check("the debut is recorded on first sight", d.note("X", 900), 500)
s.check("   ...and does NOT move on later scans (a restart is not a new instrument)",
        d.note("X", 9999), 500)
s.check("a candle older than the debut IS backfill", d.is_backfill("X", 499), True)
s.check("a candle at the debut is not", d.is_backfill("X", 500), False)
s.check("a candle after it is not", d.is_backfill("X", 501), False)

# ── B. the frozen reading, proved on the real bars it was found on ───────────────────────────────
print()
print("   the live pullback reading vs the frozen one, gold 18-19 Aug:")
gold = load("XAUUSD_H1.csv", "H1")
if not gold:
    print("      SKIP — no local gold data")
else:
    gi = next((i for i, c in enumerate(gold) if c.time == MC), None)
    s.check("the 18 Aug 14:00 bar is present", gi is not None, True)
    if gi is not None:
        def live_depth(idx):
            """The retracement as of bar `idx` — the reading the code did NOT take."""
            ww = gold[max(0, idx - _H1_TREND_BARS):idx + 1]
            tt = structure_turns(ww, _H1_SWING_N)
            st_ = trend_state(ww, n=_H1_SWING_N, turns=tt)
            if st_.direction == 0:
                return None
            return market_state(ww, st_, "XAU/USD")[0].atr

        at_candle = live_depth(gi)
        at_hour10 = live_depth(gi + 10)
        print(f"      at the candle: {at_candle:.2f}x ATR      ten hours later: {at_hour10:.2f}x ATR")
        s.check("at the candle there is no meaningful pullback", at_candle < 0.5, True)
        s.check("ten hours later there IS one — this is what he saw", at_hour10 > 1.5, True)
        # The whole point: these differ. A decision that reads only the first cannot see the second.
        s.check("the two readings differ by more than 1x ATR — a frozen read cannot see the bounce",
                at_hour10 - at_candle > 1.0, True)
        s.teeth("the live reading moves while the frozen one cannot",
                live_depth(gi + 10) > live_depth(gi) + 1.0)

# ── the guard, end to end through the real detect_bias ───────────────────────────────────────────
print()
print("   a cold start must not mine history (real bars, real detect_bias):")
if gold:
    # Switching on at each bar in turn: without the guard the first scan can fire on a candle that
    # closed before it; with the guard it never can. Measured over a slice rather than asserted on
    # one case, because one case is what misled this investigation for a whole session.
    # 600 bars, not 200: over a short recent slice the leg gate happens to refuse everything, so a
    # narrow window shows 0 -> 0 and proves nothing. A guard test needs a window where the thing it
    # guards against actually occurs.
    start = max(H1, len(gold) - 600)
    stale_without = stale_with = 0
    for k in range(start, len(gold)):
        hh = gold[max(0, k - H1):k + 1]
        b0 = vix1_bias.detect_bias(hh, hh[-H4:], "XAU/USD")
        if b0 is not None and hh[b0.mc_idx].time < hh[-1].time:
            stale_without += 1
        cold = Mem()
        cold.note("XAU/USD", hh[-1].time)
        b1 = vix1_bias.detect_bias(hh, hh[-H4:], "XAU/USD", debut=cold)
        if b1 is not None and hh[b1.mc_idx].time < hh[-1].time:
            stale_with += 1
    print(f"      cold starts firing on backfilled evidence: {stale_without} -> {stale_with}")
    s.check("without the guard, cold starts DO fire on backfill", stale_without > 0, True)
    s.check("with the guard, not one does", stale_with, 0)

    # ...and it must be inert in continuous running, or it is a filter pretending to be a guard.
    warm = Mem()
    w0 = max(H1, len(gold) - 120)
    warm.note("XAU/USD", gold[w0].time)
    differ = 0
    for k in range(w0 + 1, len(gold)):
        hh = gold[max(0, k - H1):k + 1]
        warm.note("XAU/USD", hh[-1].time)
        a = vix1_bias.detect_bias(hh, hh[-H4:], "XAU/USD", debut=warm)
        c = vix1_bias.detect_bias(hh, hh[-H4:], "XAU/USD")
        differ += (a is None) != (c is None)
    s.check("running continuously, the guard changes NOTHING", differ, 0)
    s.teeth("the backfill refusal", stale_with == 0 and stale_without > 0)
else:
    print("      SKIP — no local gold data")

# ── HIS RULE: a simple pullback is COUNTED, never measured against a threshold ───────────────────
# "why do we need a number? I thought we were tracing pullback in real time. I thought the challenge
# would only be complex pullback not a simple swing." (2026-08-19) — and he was right on both halves.
print()
print("   his pullback rule — held as state, ended by a momentum candle:")
from strategies.vix1_retracement import pullback_since                  # noqa: E402
from _harness import body                                              # noqa: E402

up3 = [body(1.1000, 1.1010, tf="H1", t=0), body(1.1010, 1.1020, tf="H1", t=1),
       body(1.1020, 1.1030, tf="H1", t=2)]
down2 = [body(1.1030, 1.1020, tf="H1", t=3), body(1.1020, 1.1010, tf="H1", t=4)]

# NOTE: `pullback_since` returns the BAR TIME it began, not an index — so every expectation below
# is written as `<list>[n].time`, never a bare number.
one_back = up3 + down2[:1]
two_back = up3 + down2
down_trend = ([body(1.1030 - i * 0.0010, 1.1020 - i * 0.0010, tf="H1", t=i) for i in range(3)]
              + [body(1.1010, 1.1020, tf="H1", t=3)])

s.check("no trend -> no pullback", pullback_since(up3, 0), None)
s.check("a trend making new closes is not pulling back", pullback_since(up3, 1), None)
s.check("one candle back IS a pullback — length never disqualifies",
        pullback_since(one_back, 1), one_back[3].time)
s.check("...and it is dated from the first candle that turned",
        pullback_since(two_back, 1), two_back[3].time)
s.check("mirrored on a downtrend", pullback_since(down_trend, -1), down_trend[3].time)

# THE CASE HE NAMED — the COMPLEX pullback. A trend-way candle INSIDE the retracement must NOT end
# it. A trailing-counter-candle count read 0 here, which is why that version was deleted.
mixed = up3 + [body(1.1030, 1.1020, tf="H1", t=3),      # turns down
               body(1.1020, 1.1025, tf="H1", t=4)]       # one UP candle inside the pullback
s.check("a trend-way candle INSIDE a pullback does not end it",
        pullback_since(mixed, 1), mixed[3].time)
# ...and it ends only when price CLOSES beyond the extreme again.
s.check("the pullback ends when price closes past the extreme",
        pullback_since(mixed + [body(1.1025, 1.1040, tf="H1", t=5)], 1), None)
# A WICK THROUGH THE EXTREME IS NOT THE TREND RESUMING — the 19 Aug gold bar wicked to a new low and
# closed $32 higher. Body-based, like his CHoCH rule.
wick = mixed + [body(1.1025, 1.1028, tf="H1", t=5, wick_up=0.0020)]
s.check("a wick past the extreme does NOT end it — only a close does",
        pullback_since(wick, 1), mixed[3].time)
s.teeth("the pullback state", pullback_since(mixed, 1) == mixed[3].time)

# ── the wiring cannot silently come undone ───────────────────────────────────────────────────────
print()
s.check("detect_bias accepts a debut registry",
        "debut" in vix1_bias.detect_bias.__code__.co_varnames[
            :vix1_bias.detect_bias.__code__.co_argcount], True)
s.check("...and defaults to None, so no existing replay is silently muted",
        vix1_bias.detect_bias.__defaults__[-1], None)

s.done()
