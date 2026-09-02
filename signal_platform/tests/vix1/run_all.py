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
    "test_entry_return_to_line.py", # pullback in 1-3, else the return to the line, else nothing
    "test_rungs.py",                # THE LADDER — 0.4R, 1R at 2R, then trailing 0.1R behind
    # ADDED 2026-09-02. His report: "right now i dont know whether we are out or not". A position
    # closing at a MOVED stop touched none of the signal's original levels, so nothing announced it.
    # The hardest case here is the one that must NEVER fire: a failed broker read is not an exit.
    "test_exit_watch.py",           # say when the trade is over — and only when it really is
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
    # ADDED 2026-09-02, after cTrader refused the first gold order: "Order volume = 13000.00 is
    # bigger than maximum allowed volume = 5000.00". A gold lot is 100 ounces and sizing assumed a
    # currency lot's 100,000, so every metals order went out 1,000x too large.
    "test_order_volume.py",         # a gold lot is 100 oz, and the broker's own limits are checked
    "test_autotrade_sessions.py",   # when autotrade may trade, and the equity it could not read
    "test_autotrade_dm.py",         # what it reports to his DM: placed, stood down, and the real fill
    # ADDED 2026-08-30. The watchdog is the point: a dead price stream looks exactly like a quiet
    # market, so it is tested by KILLING the session, not by reading the code.
    "test_trade_watcher.py",        # live price, correct side of the spread, and the stale-stream alarm
    # ADDED 2026-09-02. His report: "the FIX data system still makes noise when I deploy". The
    # staleness test judged a session dead in the same millisecond it was born, because `age()`
    # returns None both for "no tick yet" and "gone quiet" and the check collapsed the two.
    "test_stream_grace.py",         # a stream that just opened is warming up, not broken
    # ADDED 2026-08-30. Signals were arriving AT or PAST their own entry — two of four measured
    # already through it. This scans on the bar close instead; the checks are the argument that a
    # fault in it degrades to today's behaviour rather than to something new.
    "test_entry_watcher.py",        # scan on the 1M close, under exactly a scheduled tick's gates
    # ADDED 2026-08-30. The number every lateness argument turns on, and nothing recorded it.
    "test_data_lag.py",             # the platform's own delay, stamped on the audit row
    # ADDED 2026-08-30. Candles built from the FIX tick stream, so a bar exists the moment
    # it ends instead of 10-70s later. A fast WRONG candle is worse than a slow right one,
    # so the trust rules are asserted as hard as the arithmetic.
    "test_tick_bars.py",            # tick-built candles + the rules that gate their use
    "test_tick_serving.py",         # and the rules that gate SERVING them to a strategy
    # ADDED 2026-08-30. The credentials endpoint returned "whichever cTrader account was
    # updated most recently", across ALL users — so any user syncing became this platform's
    # credentials, live, within ~3 minutes. Every read must now name the account it wants.
    "test_account_pin.py",          # one owned account, and every read asks for it
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
