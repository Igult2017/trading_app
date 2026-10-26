# Three: bulk delete in the vault, Demo/Live from cTrader, copy setup survives a log out

His ask, 2026-10-26: *"Tradevault should allow me to select more than one item then delete them
once not one by one. Also When syncing accounts request ctrader for account status as Demo or Live.
This will prevent users from editing but display real status. ctrader should also have memory such
that when one logs out ctrader account that was followed or following, when they log back in, the
previous settings and setups are restored. three issues. Research plan and fix"*

---

## Phase 1 - Architecture: what I found, with the line to check it on

### 1. The vault deletes one at a time, and deleting has side effects

`TradeVault.tsx:578` sends one `DELETE /api/journal/entries/:id` per trade, behind a two-click
confirm on the row itself (`:878`). There is no selection and no bulk route.

Deleting is NOT just a row removal - `routes.ts:1824` also:
- marks the broker trade as deleted ON PURPOSE (`markSyncedTradeJournalDeleted`), which is what
  stops the 15-minute sweep re-recording it. **His rule, 2026-10-04.**
- writes ONE audit row at the moment of the decision
- clears the computed caches for that session

**So a bulk delete must do all of that for every id.** A client-side loop would also work but would
fire N requests and N cache clears, and a half-failed run would leave no clear answer about which
ones went.

### 2. Demo/Live is set once at sign-in, then never checked again - and the user can edit it

| | where |
|---|---|
| set correctly from cTrader at sign-in | `routes.ts:5158` and `:5300` - `ct.isLive ? 'live' : 'demo'` |
| **the user can change it** | `routes.ts:4616` - `if (accountType) updates.accountType = accountType;` |
| nothing refreshes it on sync | `autoSyncService.ts:244` only READS it to choose which endpoint to talk to |

**This is not cosmetic.** The stored value decides which cTrader server every later call goes to
(`ctrader.ts:311`, `:816`), and the autotrade demo-only guard reads it as the account's
environment (`routes.ts:2757-2765`). A wrong value there is a safety guard reading a fiction.

cTrader will tell us: `getCTraderAccounts` (`ctrader.ts:281`) returns `isLive` straight from the
broker, for every account under that sign-in. It costs two WebSocket connections per call, and it
is per TOKEN, not per account - so one call covers all four of his accounts.

### 3. The copy setup already survives the new Log out - but the copier does not notice

`copy_followers` / `copy_masters` point at `broker_accounts.id`. Logging out KEEPS that row
(`accountDisconnect.ts`), so the rows stay valid and `copyLinkRepair` cannot touch them - it only
retires rows whose account is MISSING (`copyLinkRepair.ts:70-79`). **Nothing in `copy_platform/`
ever writes `is_active = false` or `dropped_at`** - I grepped; the only matches are column
definitions in `db.py`. So the settings are not lost.

What IS wrong: logging out clears the stored credentials, so `cred_manager._decrypt` returns None
(`cred_manager.py:12-18`) and the copier fails **per trade**, logging a decrypt error, rather than
saying once that the account is signed out. `dispatcher._get_broker_account` (`:482`) fetches the
row without ever asking whether it is switched on.

**So item 3 is mostly already satisfied by the log-out work - the honest remaining job is to make
the copier skip cleanly and say so, and to prove the settings come back.** I will say that plainly
rather than claim to have built a restore that was not needed.

---

## Phase 2 - Tasks, in order

1. **`server/lib/journalDelete.ts`** - the per-entry delete work, lifted out of `routes.ts:1824`
   so there is ONE copy: remove the entry, mark the broker trade deleted on purpose, write the
   audit row. The single route calls it; the new bulk route calls it per id.
2. **`POST /api/journal/entries/bulk-delete`** - takes a list of ids, checks each belongs to the
   caller, deletes each through that one function, clears the caches ONCE, and returns how many
   went and which were refused.
3. **Trade Vault selection** - a checkbox per row and one in the header for "all on this page", a
   bar that appears when anything is selected, and a single confirm naming the count.
4. **Ask cTrader for Demo/Live on sync** - in `syncAccount`, before fetching, refresh the stored
   type from `getCTraderAccounts`, cached per access token for the length of a sweep so four
   accounts cost one call. Log it ONLY when it changes.
5. **Stop the user editing it** - `routes.ts:4616` ignores `accountType` for cTrader accounts; the
   edit form shows it read-only with the reason. EA/manual platforms keep the field: there is no
   API to ask them.
6. **The copier skips a logged-out account cleanly** - one line saying the account is signed out
   and its settings are kept, instead of a decrypt failure per trade.
7. **Health check** - typecheck, the new tests, the existing sync suites.

---

## What will be MEASURED

| claim | measurement |
|---|---|
| bulk delete removes exactly what was ticked | a test over the real route: 3 of 5 ticked -> 3 gone, 2 untouched |
| ...and they STAY deleted | the broker trades for all 3 carry the deleted-on-purpose mark |
| ...and someone else's entry cannot be deleted by id | refused, and the count says so |
| the real Demo/Live arrives from cTrader | the sweep logs the value it read; changed values log a before/after |
| the user can no longer edit it on a cTrader account | the edit route returns the account unchanged |
| the copy setup survives a log out | count `copy_followers` / `copy_masters` for the account before and after - unchanged, `dropped_at` still NULL |

## Assumptions, stated rather than guessed

- **Bulk delete keeps his "stays deleted" rule.** Automatic syncs will not bring the deleted trades
  back; pressing Sync on the account still rebuilds them, exactly as for a single delete.
- **Demo/Live stays editable for EA / manual accounts.** Only cTrader can be asked, so only cTrader
  is locked.
- **Nothing is "restored" on reconnect for the copier, because nothing is removed.** If he means
  something stronger - a snapshot taken at log-out and replayed - that is a different build and I
  will say so rather than pretend this covers it.

## Risks

| risk | handling |
|---|---|
| A bulk delete is irreversible and bigger than a single one | one confirm naming the exact count, and the route refuses anything not his |
| Asking cTrader on every sync costs connections | one call per sign-in token per sweep, through the existing pool lease, not one per account |
| An account whose type we had WRONG suddenly changes | that is the point - but log the before/after loudly, because it changes which server every later call goes to |
