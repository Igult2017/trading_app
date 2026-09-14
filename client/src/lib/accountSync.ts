/**
 * MANUAL SYNC OF A BROKER ACCOUNT — send the request AND read the answer.
 *
 * WHY THIS EXISTS (2026-09-14). The Accounts page fired `POST /api/broker-accounts/:id/sync` and threw
 * the reply away: "Sync All" did not even wait for it and swallowed every error with `.catch(() => {})`,
 * and the row button waited but never read what came back. The server already answers in plain words
 * ("1 closed trade(s) found — 0 newly recorded, 1 already had", server/routes.ts), so he pressed the
 * buttons a dozen times, every request succeeded, and he saw nothing. A manual sync is a question —
 * these return the answer, and say plainly when there is none.
 */

export interface SyncTarget { id: string; name: string; loginId: string }
export interface SyncResult { ok: boolean; text: string }

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Sync one account and return the server's own answer, or why there is none. Never throws. */
export async function syncOne(account: SyncTarget, headers: HeadersInit,
                              fetchImpl: FetchLike = (url, init) => fetch(url, init)): Promise<SyncResult> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/broker-accounts/${account.id}/sync`, { method: "POST", headers });
  } catch {
    return { ok: false, text: "couldn't reach the server — check your connection and try again." };
  }
  const body: { message?: string; error?: string } = await res.json().catch(() => ({}));
  if (res.status === 401) return { ok: false, text: "your session has expired — refresh the page or sign in again." };
  if (res.status === 404) return { ok: false, text: "this account was not found on the server." };
  if (!res.ok) return { ok: false, text: body.error ?? `sync failed (error ${res.status}).` };
  return { ok: true, text: body.message ?? "synced." };
}

/** How an account is named in a sync answer — his name for it, then its number. */
export function label(account: SyncTarget): string {
  return account.loginId ? `${account.name} (${account.loginId})` : account.name;
}

/** One answer for several accounts: a part per account, and a failure if any of them failed. */
export function summarise(results: { account: SyncTarget; result: SyncResult }[]): SyncResult {
  return {
    ok: results.every(r => r.result.ok),
    text: results.map(r => `${label(r.account)}: ${r.result.text}`).join("  ·  "),
  };
}
