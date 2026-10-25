/**
 * A COPY LINK THAT NAMES AN ACCOUNT THAT NO LONGER EXISTS IS A GHOST — remove it, and say so.
 *
 * ⚠ WHAT THIS IS FOR. On 25 Oct 2026 his copy panel showed a master and a follower set up, and the
 * whole arrangement was unusable: every `copy_masters` and `copy_followers` row named a
 * `broker_account_id` that was no longer in `broker_accounts`. He had deleted his accounts and
 * signed them back in, which gives them NEW ids — the copy rows kept pointing at the old ones.
 *
 * ⚠ AND THIS IS NOT WHY COPYING NEVER WORKED. I said it was, and he corrected me: *"i deleted all
 * accounts today and signed them in again, So what you found happened today not the actual
 * issue."* He was right. Zero copies had EVER executed because the only follower was switched off
 * (`is_active = false`). This sweep fixes a panel that showed an arrangement which could not run —
 * a different fault, worth fixing on its own, and not the headline.
 *
 * ⚠ IT ONLY EVER REMOVES ROWS THAT NAME A MISSING ACCOUNT. A row with no account at all
 * (`broker_account_id IS NULL`) is left alone: that is how a Telegram-sourced master is stored and
 * it is not broken. Deleting on a guess would take away configuration he still wants.
 *
 * WHY A SWEEP AND NOT ONLY A CASCADE. The main delete route already cleans up after itself
 * (`routes.ts`, the copy cascade) — but that cleanup is best-effort and merely logged if it fails,
 * and it is not the only path that removes an account: `routes.ts:4856` sweeps abandoned sign-in
 * placeholders with no copy cleanup at all. One sweep closes both holes, and after the first run
 * it matches nothing.
 */
import { pool } from '../db';

export interface OrphanSweep { masters: number; followers: number; details: string[]; }

export async function removeOrphanedCopyLinks(): Promise<OrphanSweep> {
  const out: OrphanSweep = { masters: 0, followers: 0, details: [] };
  try {
    // NAMED BEFORE THEY GO, so the log says WHAT was removed rather than how many. A bare count
    // would leave him unable to tell a correct sweep from one that ate something it should not.
    const doomed = await pool.query<{ kind: string; label: string; acct: string }>(
      `SELECT 'master' AS kind, COALESCE(NULLIF(m.strategy_name, ''), '(unnamed)') AS label,
              m.broker_account_id AS acct
         FROM copy_masters m
        WHERE m.broker_account_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM broker_accounts b WHERE b.id = m.broker_account_id)
        UNION ALL
       SELECT 'follower' AS kind, f.id AS label, f.broker_account_id AS acct
         FROM copy_followers f
        WHERE f.broker_account_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM broker_accounts b WHERE b.id = f.broker_account_id)`);
    if (!doomed.rowCount) return out;

    // FOLLOWERS FIRST. A follower row points at a master; removing masters first would leave a
    // follower naming something that is gone — one kind of ghost swapped for another.
    const f = await pool.query(
      `DELETE FROM copy_followers f
        WHERE f.broker_account_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM broker_accounts b WHERE b.id = f.broker_account_id)`);
    const m = await pool.query(
      `DELETE FROM copy_masters m
        WHERE m.broker_account_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM broker_accounts b WHERE b.id = m.broker_account_id)`);
    out.followers = f.rowCount ?? 0;
    out.masters   = m.rowCount ?? 0;
    out.details   = doomed.rows.map(r => `${r.kind} "${r.label}" -> account ${String(r.acct).slice(0, 8)}`);

    console.warn(`[copyLinks] removed ${out.masters} master(s) and ${out.followers} follower(s) that `
               + `pointed at broker accounts which no longer exist. This happens when an account is `
               + `deleted and re-added — the new one has a different id, so the copy setup was left `
               + `naming the old. Set the copier up again against the current accounts.`);
    for (const d of out.details) console.warn(`[copyLinks]   ${d}`);

    // Tell the engine, so it reloads instead of holding the removed rows until its next restart.
    await pool.query("SELECT pg_notify('copy_change', '')").catch(() => {});
  } catch (err: any) {
    // NEVER FATAL. This is tidying; it must not be able to stop the server starting.
    console.error('[copyLinks] orphan sweep failed (non-fatal): ' + (err?.message ?? err));
  }
  return out;
}
