"""VIX.1 — the PRE-CLOSE notification, its STAND-DOWN, and the heads-up untied from the entry.

Runs the REAL `vix1_preclose.check` and the REAL `is_momentum_candle` against real cTrader H1 bars,
not a re-implementation of either. The three things that must hold:

  * it fires ONLY inside the last `LEAD_S` of a bar that has NOT closed
  * it fires only when the bar as it stands NOW would pass the momentum test
  * one notification per candle per direction, so the ~5 ticks inside the window send one message
  * and when the candle then FAILS to qualify, he is told — the half that did not exist
"""
from _harness import Suite, C, body, flat_series, load
from shared.mtf_utils import seconds as tf_seconds
from notifications import titles
from strategies import vix1_preclose as pc
from strategies.vix1_momentum import is_momentum_candle

s = Suite("VIX.1 — PRE-CLOSE NOTIFICATION + STAND-DOWN (real functions, real bars)")

H = 3600
SYM = "EUR/USD"


def at(bar, secs_left):
    """A wall clock at which `bar` has `secs_left` remaining."""
    return bar.time + tf_seconds(bar.timeframe) - secs_left


# ── forming() — only an UNFINISHED trailing bar counts ────────────────────────
base = flat_series(120, tf="H1")
big = body(1.1000, 1.1060, tf="H1", t=120)          # a large bullish bar
raw = base + [big]

s.check("forming() finds the unfinished trailing bar", pc.forming(raw, at(big, 300)) is big, True)
s.check("forming() returns None once that bar has closed", pc.forming(raw, at(big, -1)), None)
s.check("forming() on an empty feed is None", pc.forming([], 0), None)
# THE WHOLE POINT OF THE MODULE: it reads a bar that closed_only would throw away. If forming() ever
# started agreeing with closed_only, the notification could never fire and nothing would notice.
s.check("forming() disagrees with closed_only — that IS the feature",
        pc.forming(raw, at(big, 300)) is not None, True)

# ── seconds_to_close ─────────────────────────────────────────────────────────
s.check("an H1 bar 300s from its close reports 300s", pc.seconds_to_close(big, at(big, 300)), 300)
s.check("a bar past its close reports a negative", pc.seconds_to_close(big, at(big, -60)), -60)

# ── check() — the window ─────────────────────────────────────────────────────
fires_5m = pc.check(base, raw, SYM, at(big, 300))
s.check("inside the window, a qualifying bar fires", fires_5m is not None, True)
if fires_5m:
    bar, bull, left = fires_5m
    s.check("...on the forming bar", bar is big, True)
    s.check("...in the direction the bar is actually going", bull, True)
    s.check("...reporting the time it has left", round(left), 300)

s.check("TOO EARLY — 20 min out, nothing fires", pc.check(base, raw, SYM, at(big, 1200)), None)
s.check("AT THE EDGE — LEAD_S exactly still fires",
        pc.check(base, raw, SYM, at(big, pc.LEAD_S)) is not None, True)
s.check("ONE SECOND TOO EARLY — LEAD_S+1 does not",
        pc.check(base, raw, SYM, at(big, pc.LEAD_S + 1)), None)
s.check("ALREADY CLOSED — a finished bar is not a notification", pc.check(base, raw, SYM, at(big, 0)), None)
s.check("PAST ITS CLOSE — still nothing", pc.check(base, raw, SYM, at(big, -300)), None)

# ── check() — the shape ──────────────────────────────────────────────────────
# A bar the same age but with no body: in the window, and correctly silent.
tiny = body(1.1000, 1.1002, tf="H1", t=120)
s.check("a bar with no body does not fire, even inside the window",
        pc.check(base, flat_series(120, tf="H1") + [tiny], SYM, at(tiny, 300)), None)

# A big bar going the OTHER way fires SELL, not BUY.
down = body(1.1000, 1.0940, tf="H1", t=120)
got = pc.check(base, base + [down], SYM, at(down, 300))
s.check("a large bearish forming bar fires SELL", got is not None and got[1] is False, True)

# Not enough history to judge against — silent rather than guessing.
s.check("under 20 closed bars, no notification",
        pc.check(base[:10], base[:10] + [big], SYM, at(big, 300)), None)

# ── check() agrees with the real momentum test, bar for bar ──────────────────
# The notification must never claim something `is_momentum_candle` would refuse: it IS that test, on
# an unfinished bar. Asserted against the real function rather than trusting the wiring.
agree = True
for size in (0.0002, 0.0010, 0.0020, 0.0040, 0.0060, 0.0090):
    cand = body(1.1000, 1.1000 + size, tf="H1", t=120)
    want = is_momentum_candle(base + [cand], len(base), True, SYM)
    fired = pc.check(base, base + [cand], SYM, at(cand, 240))
    agree = agree and (bool(fired) == want)
s.check("the notification fires exactly when is_momentum_candle would pass", agree, True)

# ── dedup — one message per candle, per direction ────────────────────────────
k1 = pc.dedup_key("vix1", SYM, True, big)
k2 = pc.dedup_key("vix1", SYM, True, big)
s.check("the key is stable across ticks inside the window", k1 == k2, True)
s.check("the key is on the CANDLE, not the clock", str(big.time) in k1, True)
s.check("a different direction is a different key", k1 != pc.dedup_key("vix1", SYM, False, big), True)
s.check("a different candle is a different key",
        k1 != pc.dedup_key("vix1", SYM, True, body(1.1, 1.11, tf="H1", t=121)), True)
s.check("a different symbol is a different key", k1 != pc.dedup_key("vix1", "GBP/USD", True, big), True)

# ── the card ─────────────────────────────────────────────────────────────────
sig = pc.preclose_signal(SYM, True, big, 300, 0.0001, "VIX.1")
s.check("no entry price — nothing is decided yet", sig.entry_price, 0.0)
s.check("no stop", sig.stop_loss, 0.0)
s.check("no target", sig.take_profit, 0.0)
s.check("it is an alert, not a trade", sig.alert_only, True)
s.check("it renders as the amber stage", sig.stage, "building")
s.check("_watch — the admin DM, never the channel", sig.strategy_id, "vix1_watch")
s.check("it does NOT go to the channel", sig.to_channel, False)
# A forecast must not claim the single watching row the real heads-up needs five minutes later.
s.check("it writes NO watching row", sig.persist_watch, False)
# ASSERTED AGAINST THE CONSTANT, not a copy of its text. These titles are the shared vocabulary
# (notifications/titles) and the whole point is that one edit there moves every surface; a test
# holding its own copy of the words would silently pin them.
s.check("the headline names ITS moment, not another strategy's",
        sig.headline, titles.MOMENTUM_CLOSING)
s.check("the chip counts down", sig.label, "~5 MIN LEFT")
s.check("it marks the forming bar (that is what puts it on the chart)",
        sig.chart_marks, [(big.time, "FORMING")])
s.check("the card says nothing is decided until the close",
        any("BE AT THE SCREEN" in r for r in sig.technical_reasons), True)
s.check("the card states the measured hit rate rather than implying certainty",
        any("4 in 5" in r for r in sig.technical_reasons), True)

# ── TEETH ────────────────────────────────────────────────────────────────────
s.teeth("the window gate", pc.check(base, raw, SYM, at(big, 3599)) is None)
s.teeth("the shape gate", pc.check(base, base + [tiny], SYM, at(tiny, 60)) is None)
s.teeth("the closed-bar gate", pc.check(base, raw, SYM, at(big, -1)) is None)

# ── REAL BARS — it must be rare, and it must never fire on a closed bar ──────
h1 = load("EURUSD_H1.csv", "H1", limit=600)
if h1:
    fired = 0
    on_closed = 0
    for i in range(200, len(h1)):
        hist, cand = h1[:i], h1[i]
        if pc.check(hist, hist + [cand], SYM, at(cand, 300)):
            fired += 1
        if pc.check(hist, hist + [cand], SYM, at(cand, 0)):     # bar has closed
            on_closed += 1
    s.check("on 400 real bars it NEVER fires on a closed bar", on_closed, 0)
    s.check("on 400 real bars it fires on a minority of them", fired < len(h1[200:]) * 0.25, True)
    print(f"      (fired on {fired} of {len(h1) - 200} real EUR/USD H1 bars)")
else:
    print("   SKIP  real-bar checks — EURUSD_H1.csv not present")

# ── THE STAND-DOWN — the half that did not exist ─────────────────────────────
# His instruction, 2026-08-21: *"It does not report back when the momentum candle fails to qualify.
# It should, then we start watching to another one if it will come."* Two real events are the reason:
# EUR/USD's 12:00 UTC candle on 21 Aug was flagged SELL at 12:55:11 and closed at a 10.8 pip body
# that did NOT qualify; GBP/USD's did the same at 12:56:16. Both ended in silence.

# closed_outcome answers ONLY "what did the candle do" — never "was he told", which is the ledger's.
s.check("too little history -> no outcome to report", pc.closed_outcome(flat_series(5, tf="H1"), SYM), None)

# A flat run ending in a nothing-candle: closed, and did not qualify.
quiet = flat_series(40, tf="H1")
out = pc.closed_outcome(quiet, SYM)
s.check("a closed non-momentum candle is reported as NOT qualified", out[1], False)
s.check("...and it is the NEWEST closed bar that is reported", out[0] is quiet[-1], True)

# The same series with a real momentum candle on the end.
strong = flat_series(40, tf="H1") 
strong = strong[:-1] + [body(strong[-1].open, strong[-1].open + 0.0060, tf="H1", t=len(strong) - 1)]
out2 = pc.closed_outcome(strong, SYM)
s.check("a closed MOMENTUM candle is reported as qualified", out2[1],
        is_momentum_candle(strong, len(strong) - 1, True, SYM)
        or is_momentum_candle(strong, len(strong) - 1, False, SYM))

# ── the dedup keys ───────────────────────────────────────────────────────────
b = quiet[-1]
s.check("the stand-down key is NOT direction-keyed — one fact, one message",
        pc.standdown_key("vix1", SYM, b), f"vix1_preclose_standdown_{SYM}_{b.time}")
s.check("...and it cannot collide with the notification's own key",
        pc.standdown_key("vix1", SYM, b) != pc.dedup_key("vix1", SYM, True, b)
        and pc.standdown_key("vix1", SYM, b) != pc.dedup_key("vix1", SYM, False, b), True)
s.check("the notification key IS direction-keyed — a colour flip is a new message",
        pc.dedup_key("vix1", SYM, True, b) != pc.dedup_key("vix1", SYM, False, b), True)

# ── the card ─────────────────────────────────────────────────────────────────
sd = pc.standdown_signal(SYM, b, False, 0.0001, "VIX.1")
# Signal defaults these to 0.0, not None — the same "unset" the notification card leaves them at.
# The first draft of this check asserted None and failed against correct code.
s.check("it carries NO entry, stop or target",
        bool(sd.entry_price) or bool(sd.stop_loss) or bool(sd.take_profit), False)
s.check("it goes to the DM, never the channel", sd.strategy_id, "vix1_watch")
s.check("it claims no watching row — nothing is being watched", sd.persist_watch, False)
s.check("it is not marked qualified", sd.qualified, False)
s.check("it marks no candle on the chart (the bar has closed)", sd.chart_marks, [])
s.check("the headline says plainly that it did not qualify",
        sd.headline, titles.MOMENTUM_FAILED)
s.check("...and the two VIX.1 momentum titles are distinct",
        sd.headline != titles.MOMENTUM_CLOSING, True)
s.check("it tells him watching continues — his actual ask",
        any("STILL WATCHING" in r for r in sd.technical_reasons), True)
s.check("...and that another notification will come",
        any("next notification" in r for r in sd.technical_reasons), True)

# HIS WORD, NOT MINE. 2026-08-21: *"dont call it a warning, call it a notification."* Asserted so it
# cannot creep back into anything he reads.
note = pc.preclose_signal(SYM, True, big, 300, 0.0001, "VIX.1")
faces = " ".join(note.technical_reasons + [note.headline, note.label, note.market_context]
                 + sd.technical_reasons + [sd.headline, sd.label, sd.market_context]).lower()
s.check("the word 'warning' appears nowhere he can read it", "warning" in faces, False)
s.check("...and 'notification' does", "notification" in faces, True)


s.done()
