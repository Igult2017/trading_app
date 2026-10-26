# Keep an account's history when it logs out; newest trade at the top of the Trade Vault

His ask, 2026-10-26: *"I want autosync to have a good memory such that when i logout account, its
data is not errased and when i log it back in it is not autosynced from scratch, the data is
restored from where we left and only new data or trades that were made when it was logged out are
journaled. Secondly. The tradevault should also record trades from the latest at the top to the
oldest at the bottom. Plan and fix"*

## Phase 1 - Architecture: what I found, with the line to check it on

**There was no "log out" for an account at all.** The only control was Delete
(`client/src/pages/AccountsPage.tsx:850`), and its warning was accurate:

| step | where | what it erases |
|---|---|---|
| the account row goes | `server/routes.ts:4637` -> `server/storage.ts:1051` | the account |
| the raw broker trades go with it | `shared/schema.ts:838`, the database cascade | every `synced_trades` row |
| its session's journal goes too | `routes.ts:4657` -> `storage.ts:684` | every `journal_entries` row in that session |

**Signing back in never found the old account.** Both finish-lines of the cTrader sign-in wrote into
a brand-new placeholder row - `routes.ts:5098` and `routes.ts:5212`. A new row has no `lastSyncAt`,
and `server/services/autoSyncService.ts:301-302` reads exactly that: no last sync means
*"first sync, 2y"* - the whole history, re-imported and re-journaled.

**Three runners decide which accounts keep working and none asked whether the account was on** -
`autoSyncService.ts:69`, `ctraderRealtime.ts:231`, `missedCloseWatch.ts:90`.

**The Trade Vault showed rows in the order they were WRITTEN**, not traded: `storage.ts:519` orders
by `created_at`, and `TradeVault.tsx:500` rendered that as it arrived. I have NOT seen his rows -
production is not reachable from here - so I cannot say how far out his list is, only what decides it.

## Phase 2 - Tasks (all done unless marked)

1. `client/src/lib/tradeOrder.ts` - one comparator, newest first.
2. `client/src/lib/tradeOrder.test.ts` - 13 checks, including the mixed hand-typed/imported list.
3. Trade Vault sorts with it (`TradeVault.tsx:500`).
4. `server/services/accountDisconnect.ts` - log out: tear down the feed, clear the tokens, detach
   from the shared sign-in record, `is_active = false`, `sync_status = 'disconnected'`. KEEPS the
   row, the trades, the session, the journal and `last_sync_at`.
5. `server/lib/accountFilters.ts` - ONE definition of "still running", used by all three runners.
6. `POST /api/broker-accounts/:id/disconnect`, and both sign-in paths adopt an existing account
   and set `is_active: true` again.
7. Accounts page: Log out / Reconnect buttons, a "Logged out" state, and the delete modal now
   points at the safe option.
8. Health check - typecheck, the ordering test, the filter test.

## Deviations from the plan as first written - and why

- **The sort key is `entryTime` then `createdAt`, NOT `entryTime` then `exitTime` then
  `createdAt`.** The vault prints `entryTime`'s date falling back to `createdAt`; sorting on a
  third field it does not print would put a row above another whose printed date is later, which is
  the exact thing he asked to stop seeing.
- **Added `server/lib/accountFilters.ts`, which was not in the plan.** Writing the same condition
  into three runners is three chances for the next one to be written without it. One definition,
  and the test exercises that definition rather than a copy of it.
- **No adoption was needed for the Reconnect button itself.** The sign-in signs into an EXISTING
  account row (`routes.ts:4856` takes an `accountId`), so Reconnect passes the account's own id and
  lands on it. The adoption code stays for the other way in - using "Add account" again for a login
  he already has, which would otherwise strand the old row's history.

## What was MEASURED, and what was NOT

| claim | evidence |
|---|---|
| the ordering rule is right | `npx tsx client/src/lib/tradeOrder.test.ts` - 13/13 |
| a logged-out account is excluded, a legacy NULL one is not | `npx tsx server/lib/accountFilters.test.ts` - real Postgres engine, real condition |
| the resume mark is never cleared by a log-out | same test, asserted against the real field set |
| nothing else broke | `npx tsc --noEmit` clean |
| **log out -> reconnect -> only the gap is journaled, end to end** | **NOT measured here.** It needs his production database and a live cTrader sign-in. After deploy, the proof is one line in the log: the sweep must say `back from the last sync`, never `first sync, 2y`. |
