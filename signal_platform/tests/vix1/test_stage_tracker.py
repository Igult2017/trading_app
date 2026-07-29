"""The log throttle (`core.stage_tracker`) and VIX.1's reason-shape keying (`strategies.vix1_log`).

This guards a mechanism whose whole job is to SUPPRESS output, so the failure mode is silent by
construction: over-suppress and a real state change vanishes, exactly the blindness it was built to
fix. Every rule is therefore tested BOTH ways — it speaks when it must, and it stays quiet when it
should — and each has a teeth case proving the assertion can fail.

NOT A BACKTEST. Nothing here scores a strategy; it is all logging behaviour.
"""
from _harness import Suite

from core import stage_tracker
from strategies import vix1_log

s = Suite("Log throttle — says it on change, restates it on the heartbeat")

# ---------------------------------------------------------------- change vs repeat
stage_tracker.reset()
print("   a NEW value always speaks; an identical one inside the window does not:")
s.check("first sight of a value emits", stage_tracker.should_emit("o", "EUR/USD", "SCANNING"), True)
s.check("  the same value again is suppressed",
        stage_tracker.should_emit("o", "EUR/USD", "SCANNING"), False)
s.check("  and again", stage_tracker.should_emit("o", "EUR/USD", "SCANNING"), False)
s.check("a CHANGED value emits immediately — never waits for the heartbeat",
        stage_tracker.should_emit("o", "EUR/USD", "ZONE_TAPPED"), True)
s.check("  then that new value is itself suppressed",
        stage_tracker.should_emit("o", "EUR/USD", "ZONE_TAPPED"), False)

print()
print("   the heartbeat is the FLOOR — an unchanged value still restates:")
stage_tracker.reset()
stage_tracker.should_emit("o", "EUR/USD", "SCANNING", heartbeat_s=0)
s.check("with the heartbeat elapsed, an unchanged value emits again",
        stage_tracker.should_emit("o", "EUR/USD", "SCANNING", heartbeat_s=0), True)

print()
print("   keys are independent — one instrument never silences another:")
stage_tracker.reset()
stage_tracker.should_emit("o", "EUR/USD", "SCANNING")
s.check("a different symbol with the same value still emits",
        stage_tracker.should_emit("o", "GBP/USD", "SCANNING"), True)
s.check("a different owner with the same symbol+value still emits",
        stage_tracker.should_emit("other", "EUR/USD", "SCANNING"), True)

print()
print("   reset() forces the next line (used after a deliberate reconfiguration):")
stage_tracker.reset()
stage_tracker.should_emit("o", "EUR/USD", "SCANNING")
stage_tracker.reset("o")
s.check("after reset the same value emits again",
        stage_tracker.should_emit("o", "EUR/USD", "SCANNING"), True)

# ---------------------------------------------------------------- the reason shape
print()
print("   VIX.1 keys on the REASON SHAPE — live prices must not defeat de-duplication:")
a = "[vix1] EUR/USD 1M: price 1.13818 is the wrong side of the lines (1.13738)"
b = "[vix1] EUR/USD 1M: price 1.13822 is the wrong side of the lines (1.13738)"
s.check("two ticks of the same reason at different prices share a shape",
        vix1_log.shape(a) == vix1_log.shape(b), True)
s.check("  and a DIFFERENT reason does not",
        vix1_log.shape(a) == vix1_log.shape("[vix1] EUR/USD 1M: price has not traded past line 1"),
        False)

print()
print("   INTEGERS ARE KEPT — a trend flip is a change, not noise:")
up   = "[vix1] EUR/USD bias=NONE: up momentum but it is NOT with the trend (1HR=-1, 4HR=1)"
flip = "[vix1] EUR/USD bias=NONE: up momentum but it is NOT with the trend (1HR=1, 4HR=-1)"
s.check("a trend reading flip changes the shape (would print)", vix1_log.shape(up) == vix1_log.shape(flip), False)

stage_tracker.reset()
s.check("say() emits the first time", vix1_log.say("EUR/USD", a), True)
s.check("  the same reason at a moved price is suppressed", vix1_log.say("EUR/USD", b), False)
s.check("  a trend flip is NOT suppressed", vix1_log.say("EUR/USD", flip), True)

# ---------------------------------------------------------------- the real measured case
print()
print("   the 27-29 Jul production case: 209 identical lines collapse to 1")
stage_tracker.reset()
line = "[vix1] EUR/USD bias=NONE: up momentum but it is NOT with the trend (1HR=-1, 4HR=1)"
emitted = sum(1 for _ in range(209) if vix1_log.say("EUR/USD", line))
s.check("209 repeats of the measured line emit exactly once", emitted, 1)

# ---------------------------------------------------------------- teeth
print()
stage_tracker.reset()
stage_tracker.should_emit("t", "X", "A")
s.teeth("the suppression rule", stage_tracker.should_emit("t", "X", "A") is False)
s.teeth("the change rule", stage_tracker.should_emit("t", "X", "B") is True)
s.teeth("the integer-preserving shape", vix1_log.shape(up) != vix1_log.shape(flip))
s.teeth("the decimal-collapsing shape", vix1_log.shape(a) == vix1_log.shape(b))

s.done()
