# PLAN — D63: the cTrader rate-limit storm (Open API, Node side)

## Phase 1 — Architecture

**The problem.** 4,714 of 5,000 production log lines are
`[cTraderRT] could not attach account <uuid>: cTrader: You are being rate limited`, four accounts
cycling. Open API, NOT FIX. Being refused makes this code open MORE connections, so the refusal
feeds itself and never clears. The scanner shares the same approved cTrader app, so this spends
budget the signal platform needs.

**Files, and what each one is responsible for:**

| file | role | change |
|---|---|---|
| `server/services/ctraderRateGuard.ts` | NEW (~110 lines) — how long Node must stand down, note-a-refusal, clear-on-success | create |
| `server/services/ctraderConnPool.ts` (178) | the ONE choke point all 4 cTrader connection-openers pass through | consult the guard in `acquire` |
| `server/services/ctraderRealtime.ts` (297) | feed lifecycle: who should be connected, retry, 60s reconcile | one timer per account; growing wait; classify refusals; record a row |
| `server/services/ctraderHub.ts` (401) | owns the sockets and the sign-in handshake | close abandoned sockets; match replies to the asking account; bound the uncapped loop |
| `server/services/brokerAdapters/ctrader.ts` | wire protocol + `waitFor` | remove the handler left attached on the timeout path |
| `server/services/ctraderRateGuard.test.ts` | NEW — checks in the existing tsx/check()/teeth() idiom | create |
| `server/services/ctraderHub.test.ts` | hub checks | add socket-close + reply-matching cases |

**Data flow (unchanged shape, braked):**
`backgroundServices.ts:58 startCTraderRealtime` -> `reconcile` (60s) -> `connect` -> `openFeed`
-> `ctraderHub.attach` -> `hubWithRoom` -> `openHub` -> `acquire('feed')` [NEW: stand-down check]
-> `openWS` -> `appAuth` -> account sign-in -> symbols -> member joined.

**No DB schema change.** Refusals are recorded as rows through the existing `record(...)`
(`autoJournal`) into `sync_events` with a new `rate-limited` stage; read at
`GET /api/admin/sync-events` (`routes.ts:1178`). Capacity read at
`GET /api/admin/ctrader-capacity` (`routes.ts:1160`).

**Dependency order:** the guard module must exist before the pool, realtime and hub can consult it.
Socket-close (Step 3) is independent. Reply-matching (Step 4) is independent. Docs last.

## Phase 2 — Tasks, in order

1. `ctraderRateGuard.ts` — shared stand-down that grows and is capped, with randomness so four
   accounts never retry in lockstep. Node-only (Python scanner is a separate process).
2. Wire it into `ctraderConnPool.acquire` — one enforcement point for all four openers — AND into
   `ctraderRealtime.reconcile`, which would otherwise walk straight through it.
3. One pending retry per account: keep and clear the timer handle; replace the flat 15s.
4. Close what we abandon, in `ctraderHub`: on failed app sign-in, and on an account that never
   joined. NEVER close a socket that still has healthy members — reuse `detach`'s last-one-out
   logic. Bound the uncapped `for(;;)` loop.
5. Match replies to the asking account on both sign-in steps; fix the leaked handler in `waitFor`.
6. Classify refusals: rate-limited -> stand down; login rejected (incl. ACCESS_DENIED) -> one fresh
   login; other -> growing wait. After a stand-down let ONE account probe, not four. Record a row.
7. Checks (not a backtest): wait grows + capped; one timer per account; the brake blocks reconcile;
   failed app sign-in closes its socket; failed account sign-in leaves no empty socket and does not
   close a socket with healthy members; one refusal frame does not fail an account that did not ask.
8. Docs in the same change: `OPEN.md` D63 (cause/fix/measured) + D62 (three blockers now set);
   `ctrader-open-api-apps.md` (the undocumented message); `ctrader-scaling.md` (Step 4a slice done);
   memory `project-migration-to-dorixe-vps.md` (clear resolved blockers).

## Phase 3 — Execute
One task at a time, in the order above. New logic in the NEW file, not inflating the two files
already over the 200-line limit (splitting them is RESTRUCTURE.md's job).

## Phase 4 — Health check
`npm run check` (types) + both check scripts pass. Then measured in production:
that message under 1% of log lines and not accelerating; at least one `live feed attached` line or a
stated reason per account; `connectionsHeld` flat over 10+ min; a row naming the REAL reason.

## Open decision for him
`CTRADER_ACCOUNTS_PER_CONN` is 5 (`ctraderHub.ts:75`) but the agreed ramp verifies at each notch and
the hub test still says 2. (a) leave at 5 and fix routing properly [recommended] (b) drop to 1
temporarily (c) (a) plus re-verify the notch afterwards.

## NOT in scope
D62's two production variables (separate change, his hand on the dashboard; one deploy at a time);
splitting the oversized files; raising the ramp; FIX, the scanner, any strategy.
