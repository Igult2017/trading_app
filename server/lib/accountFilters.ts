/**
 * WHICH BROKER ACCOUNTS ARE STILL RUNNING — written once, used by everything that runs them.
 *
 * ⚠ WHY IT IS A SHARED DEFINITION AND NOT THREE COPIES. Three separate places decide which
 * accounts keep working, and every one of them tested only `connection_type = 'api'`:
 *
 *   `services/autoSyncService.ts`   the 15-minute sync sweep
 *   `services/ctraderRealtime.ts`   the live feed's subscriber list, re-checked on a timer
 *   `services/missedCloseWatch.ts`  the missed-close watcher
 *
 * Logging an account out keeps its row on purpose, so the row is what has to be filtered — and a
 * log-out that only reached two of the three would look like it worked while the third quietly
 * carried on recording. One definition is what stops the next runner being written without it.
 *
 * ⚠ `coalesce`, NOT `is_active = true`. The column has a default, but rows created before it
 * existed can hold NULL, and comparing NULL to anything yields NULL — which Postgres treats as
 * "no", silently dropping real, working accounts out of the sweep. A missing value here means
 * "nobody ever switched this off", so it counts as on.
 */
import { and, eq, sql } from 'drizzle-orm';
import { brokerAccounts } from '../../shared/schema';

/** True for an account that has not been logged out. */
export const SWITCHED_ON = sql`coalesce(${brokerAccounts.isActive}, true) = true`;

/** An API-connected account that is still switched on — the set every runner wants. */
export const RUNNING_API_ACCOUNT = and(eq(brokerAccounts.connectionType, 'api'), SWITCHED_ON);

/** The status an account carries while it is logged out. Read by the client, and by everything
 *  that has to leave such an account alone. */
export const DISCONNECTED = 'disconnected';

/**
 * EXACTLY WHAT A LOG-OUT CHANGES — and nothing else.
 *
 * ⚠ IT IS ITS OWN FUNCTION SO THAT THE TEST CAN READ IT. The one way to break this feature without
 * breaking anything visible is to add `lastSyncAt: null` here later, as housekeeping: the account
 * would still log out, still keep its trades, still look right — and the next reconnect would
 * quietly re-import and re-journal the whole history. `accountFilters.test.ts` asserts on these
 * keys, so that edit fails a test instead of reaching production.
 *
 * ⚠ NOT CLEARED, ON PURPOSE: `lastSyncAt` (the mark the sweep resumes from), `defaultSessionId`
 * (its performance dashboard), `tradeCount`, and every row in `synced_trades` and
 * `journal_entries` that points at this account.
 */
export function loggedOutFields() {
  return {
    // The credentials go — he asked to be signed out.
    passwordEnc:    null,
    // And it stops being covered by the shared sign-in record, so a sibling's renewal does not
    // quietly put it back in business (`shared/schema.ts:764` explains why that record is shared).
    ctraderTokenId: null,
    isActive:       false,
    syncStatus:     DISCONNECTED,
    lastSyncError:  null as string | null,
    updatedAt:      new Date(),
  };
}

/** The fields a log-out must NEVER touch. Named here so the rule is testable rather than a habit. */
export const KEPT_BY_LOGOUT = ['lastSyncAt', 'defaultSessionId', 'tradeCount'] as const;
