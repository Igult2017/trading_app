"""Run the whole VIX.1 suite. Exit non-zero if anything failed.

    python signal_platform/tests/vix1/run_all.py

No test framework, no network, no DB. Cheap enough to run on every change to VIX.1 — and per the
standing rule, the strategy doc is updated in the same change as the code, so run this before you
write the doc entry, not after.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TESTS = [
    "test_atr.py",                  # the volatility yardstick every depth is divided by
    "test_swings.py",               # highs and lows in REAL TIME — no 48-bar wait
    "test_retracement.py",          # the retracement, counted in real time (bars + depth)
    "test_regime.py",               # directional efficiency — the range detector
    "test_momentum.py",             # the gates and grading, hand-built candles
    "test_line_pullback.py",        # the line, and the past-the-line rule
    "test_manage.py",               # the R ratchet and the structure exit
    "test_invariants_real_data.py", # the real functions over real candles
    "test_trend.py",              # the 1HR trend read — stability + do reversals mean anything
    "test_structure.py",            # the leg gate (no pullbacks/ranges) + the freeze regression
    # MISSING FROM THIS LIST UNTIL 2026-08-19, and it had been passing unrun since the route
    # shipped. The CHoCH route is the ONE entry that does not ask for a pullback, so it is exactly
    # the file that must run whenever the pullback gate is touched.
    "test_choch.py",                # the change-of-character entry route
    "test_staleness.py",            # backfill on a cold start + the frozen-at-the-candle decision
    "test_stage_tracker.py",       # the log throttle + VIX.1 reason-shape keying
    "test_spacing.py",              # signal spacing + the 27 Jul duplicate-signal regression
    "test_cross.py",                # THE REBUILT ENTRY's core: the cross, the level, assumed vs seen
    "test_entry_real_events.py",    # his own 5 Aug 2019 trade must come out at 1.11734, to the tick
    "test_position_tracker.py",     # R and breakeven from the REAL position, not the signal
    "test_auto_breakeven.py",       # the first code that CHANGES the account — every guard
    "test_preclose.py",             # the warning BEFORE the momentum candle closes (the only place
                                    # VIX.1 reads the forming bar on purpose)
    "test_headsup_untied.py",       # the heads-up fires on the CANDLE, never as the entry's else-branch
    # ADDED 2026-08-29 — all four had been sitting unrun since the day each shipped, which is the
    # SECOND time this list has silently lost a file (see test_choch.py above). Between them they
    # hold his three most recent rulings, so the sweep was green while none of them was being asked.
    "test_choch_bearish_proof.py",  # 25 Aug: a turn DOWN must run, pull back and turn back down
    "test_preclose_bearish_hold.py",# 26 Aug: hold the notification until that turn has proved itself
    "test_preclose_needs_a_route.py",# the notification may only speak when a route exists to trade
    "test_leg_gate_obeys_choch.py", # 29 Aug: the 8-bar gate ignores structure from before the turn
    # Found by the guard below the moment it was added — a FIFTH file nobody had noticed was unrun.
    "test_live_quote.py",           # the live price read, and what happens when the feed is stale
    # ADDED 2026-08-30. test_auto_breakeven stubs out StopOrderClient, so it could not see that the
    # real order path neither imported nor resolved a symbol. This one uses the real functions.
    "test_execution_placement.py",  # the order path loads in production's cwd, and names the pair
]

# AND THIS IS WHY IT WILL NOT HAPPEN A THIRD TIME. Adding a test file without listing it above is
# invisible — the suite stays green because nothing ran it. Fail loudly instead of silently passing.
_on_disk = {f for f in os.listdir(HERE) if f.startswith("test_") and f.endswith(".py")}
_unlisted = sorted(_on_disk - set(TESTS))
if _unlisted:
    print("REFUSING TO RUN — these test files exist but are not in TESTS, so they would not run:")
    for f in _unlisted:
        print(f"    {f}")
    print("Add them to the list above (or delete them if they are dead).")
    sys.exit(2)

worst = 0
results = []
for t in TESTS:
    print("=" * 78)
    r = subprocess.run([sys.executable, "-u", os.path.join(HERE, t)],
                       cwd=HERE, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    results.append((t, r.returncode))
    worst = max(worst, r.returncode)

print("=" * 78)
for t, code in results:
    print(f"   {'PASS' if code == 0 else 'FAIL'}  {t}")
print()
print("VIX.1 SUITE: ALL PASS" if worst == 0 else "VIX.1 SUITE: FAILURES PRESENT")
sys.exit(worst)
