# PLAN - D62: switch the real-time half on (APPROVED by him, 2026-11-03)

## Phase 1 - Architecture
He approved turning on FIX / trade management / the momentum-candle-close watch / the ladder.
Two variables were ABSENT in production, so both fell to their code default of False:
  TRADE_WATCHER_ENABLED   settings.py:195  -> gates main.py:193-213 (FIX session, TradeWatcher,
                          EntryWatcher = the 1-minute-bar-close scan, price_publisher)
  AUTO_BREAKEVEN_ENABLED  settings.py:188  -> the ladder; refused at position_tracker.py:283
                          and breakeven.py:63
No code change. Config only, on Coolify app dm96yia8e3dmg5lhjc2bu2de, then a redeploy.

## Phase 2 - Tasks
1. Create both vars, value true, UNQUOTED, production scope, is_literal false.
   (A quoted boolean is rejected by pydantic and the app fails at import - OPEN.md A9.)
2. Read the values back and confirm no quotes and no duplicate keys.
3. Confirm the previous deploy finished (one deploy at a time), then deploy.
4. DONE MEANS THE LOG SAYS SO, not that the switch is set: look for
   "[boot] real-time watchers started (trade + entry + price publisher)" and
   "[fix] price stream open", with NO "[boot] real-time watchers are OFF".
5. Update docs/OPEN.md D62 and the migration memory note with the measured evidence.

## Phase 3 - Execute: done, steps 1-4.

## Phase 4 - Health check
Measured in the production log 2026-11-03 06:49:
  06:49:08 [boot] real-time watchers started (trade + entry + price publisher)
  06:49:08 [fix] price stream open, subscribed to 5 symbols
  no "watchers are OFF" line
The LADDER is set but NOT yet proven in behaviour - it only acts when a position is open and a
rung is hit, and auto_breakeven_demo_only defaults True so it refuses non-demo accounts.

## NOT in scope
Autotrade stays off (AUTOTRADE_ENABLED=false, his instruction, D59). No code changed.
