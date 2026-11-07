/**
 * Who gets to be admin — the decision on its own, with no database and no request.
 *
 * ⚠ THIS LIVES APART FROM `routes.ts` ON PURPOSE. The rule was inline inside a 6,300-line file, so
 * it could not be tested at all, and it had a hole nobody could see: the recovery path the app
 * already believes in — *if nobody is admin, let someone become admin* — ran ONLY for a brand-new
 * profile. Anyone who already had a profile could be promoted by exactly one route, the
 * `ADMIN_EMAIL` setting. With that setting absent in production there was no way back in, and
 * henryantipas@gmail.com sat on `role: 'user'` through every login while /admin answered
 * `403 Forbidden — admins only`.
 *
 * Same reason `releasedMatch.ts` was pulled out of `calendarDb`: *"it is pure string work with no
 * database, so it can be tested without one. It was inside calendarDb first and the test could not
 * even import it."*
 *
 * ⚠ THE SECURITY BOUNDARY, IN ONE SENTENCE: nobody is ever promoted while an admin already exists.
 * `adminCount` is counted by the caller under a row lock (`SELECT ... FOR UPDATE`), and every rule
 * below that promotes is gated on it being zero — except the explicit `ADMIN_EMAIL` match, which is
 * the operator naming a person on purpose. The bootstrap risk ("whoever signs in first on a system
 * with no admin becomes admin") is one this app already accepted for new sign-ups; this module makes
 * it consistent instead of depending on whether a profile row happens to exist. It cannot widen
 * access on a system that has an administrator.
 */

export type Role = 'admin' | 'user';

/** Why a role was chosen — logged, so a promotion is never unexplained. */
export type RoleReason =
  | 'admin-email'        // the email matches the configured ADMIN_EMAIL
  | 'bootstrap'          // nobody is admin yet, so this account becomes one
  | 'existing'           // keep the role already stored
  | 'default';           // an ordinary new account

export interface RoleDecision {
  role: Role;
  reason: RoleReason;
  /**
   * True when this role is NOT already stored, so the caller must write it — an `update` for an
   * existing profile, and part of the `insert` for a new one. It is therefore `true` for a brand-new
   * account that is becoming admin: there is no stored role yet, so the role still has to be
   * recorded. It is only `false` when the account already holds the role being returned.
   */
  promoted: boolean;
}

export interface RoleInput {
  /** The signed-in account's email, as the identity provider gave it. */
  email: string | null | undefined;
  /** `ADMIN_EMAIL` as configured, or empty/undefined when it is not set. */
  adminEmail: string | null | undefined;
  /** The stored role, or null when this account has no profile yet. */
  existingRole: Role | null;
  /** How many admins exist RIGHT NOW, counted under a lock by the caller. */
  adminCount: number;
}

const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

/**
 * Decide the role for an account that has just signed in.
 *
 * Order matters and is the whole point:
 *  1. The configured `ADMIN_EMAIL` wins. Explicit, and the operator's own choice.
 *  2. An account already stored as admin stays admin — logging in again never demotes anyone.
 *  3. **Nobody is admin at all** → this account becomes one. Applies whether or not it already has
 *     a profile, which is the hole this module closes.
 *  4. Otherwise the stored role, or `user` for a new account.
 */
export function decideRole(input: RoleInput): RoleDecision {
  const email = norm(input.email);
  const adminEmail = norm(input.adminEmail);
  const { existingRole, adminCount } = input;

  // 1. Named by the operator. The only promotion NOT gated on there being zero admins, because it
  //    is a deliberate instruction rather than a recovery.
  if (adminEmail && email && email === adminEmail) {
    return { role: 'admin', reason: 'admin-email', promoted: existingRole !== 'admin' };
  }

  // 2. Never demote. An admin that logs in again is still an admin.
  if (existingRole === 'admin') {
    return { role: 'admin', reason: 'existing', promoted: false };
  }

  // 3. ⚠ THE RECOVERY, AND THE ONLY RULE THAT CAN HAND OUT ADMIN TO SOMEONE UNNAMED. It requires
  //    that the system has NO administrator — i.e. it is already unadministerable, and somebody has
  //    to be able to get in. `adminCount` must be counted under a lock, or two simultaneous sign-ins
  //    could both read zero. This used to run for new profiles only, which is why an existing
  //    profile had no way back after the admin row was lost.
  if (adminCount === 0) {
    return { role: 'admin', reason: 'bootstrap', promoted: true };
  }

  // 4. Nothing special.
  if (existingRole) {
    return { role: existingRole, reason: 'existing', promoted: false };
  }
  return { role: 'user', reason: 'default', promoted: false };
}

/** One line for the log, so a promotion always says which rule produced it. */
export function describeDecision(d: RoleDecision): string {
  const why = {
    'admin-email': 'email matches ADMIN_EMAIL',
    'bootstrap':   'no administrator existed — this account became the first',
    'existing':    'keeping the stored role',
    'default':     'ordinary account',
  }[d.reason];
  return `role=${d.role} (${why})${d.promoted ? ' — PROMOTED' : ''}`;
}
