## Architecture
Restore two deployment switch VALUES on the new server (app.dorixe.com). NO code changes needed.
Full plan: C:\Users\FSD\.claude\plans\logical-frolicking-pond.md  (APPROVED 2026-11-02)
Finding recorded in: docs/OPEN.md D62 (FIX off) and D63 (the separate rate-limit loop).

## Tasks
1. [DONE] Probe the FIX credential through the real FixQuoteStream. Both hosts log on; prices live.
2. [BLOCKED] Set TRADE_WATCHER_ENABLED=true and AUTO_BREAKEVEN_ENABLED=true on production,
   unquoted, app dm96yia8e3dmg5lhjc2bu2de. Blocked by the permission classifier
   (Modify Shared Resources). Values proven to parse: unquoted -> True; quoted -> ValidationError.
3. [WAITING ON 2] Redeploy; prove from logs the watchers started and the FIX stream opened.
4. [WAITING ON 2] Verify FIX prices, the ladder, and the 1-minute-close scan.
5. [PARTLY DONE] docs/OPEN.md + migration memory updated. MAP.md deliberately NOT touched -
   it holds no server addresses or UUIDs, so deployment detail does not belong there.
