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

// ── SYNC ALL, RUN BY THE SERVER (22 Nov 2026, sync plan step 7) ──────────────────────────────────────
// It used to run here, every account at once, and was lost if the page closed. The server now syncs them
// one after another and pushes each step (`server/services/syncAllQueue.ts`); the page only shows it.

export type SyncAllStatus = "queued" | "syncing" | "done" | "error" | "skipped" | "still-running";
export interface SyncAllItem { accountId: string; label: string; status: SyncAllStatus; message?: string }
export interface SyncAllRun { startedAt: string; finishedAt?: string; items: SyncAllItem[] }

/** Ask the server to start Sync All (or return the run already going). null = it could not be asked. */
export async function startSyncAll(headers: HeadersInit, fetchImpl: FetchLike = (u, i) => fetch(u, i))
    : Promise<{ run: SyncAllRun | null; error?: string }> {
  try {
    const res = await fetchImpl("/api/broker-accounts/sync-all", { method: "POST", headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { run: null, error: body.error ?? `Sync All could not start (error ${res.status}).` };
    return { run: body.run ?? null };
  } catch {
    return { run: null, error: "couldn't reach the server — check your connection and try again." };
  }
}

/** The run in progress or just finished, for a page opened while one runs. null = none or unreachable. */
export async function readSyncAll(headers: HeadersInit, fetchImpl: FetchLike = (u, i) => fetch(u, i))
    : Promise<SyncAllRun | null> {
  try {
    const res = await fetchImpl("/api/broker-accounts/sync-all", { method: "GET", headers });
    return res.ok ? ((await res.json()).run ?? null) : null;
  } catch { return null; }
}

/** The accounts this run has not finished with yet — the ones to show as syncing. */
export function pendingIds(run: SyncAllRun | null): Set<string> {
  if (!run || run.finishedAt) return new Set();
  return new Set(run.items.filter(i => i.status === "queued" || i.status === "syncing").map(i => i.accountId));
}

/** One answer for the whole run: a part per account, and a failure if any of them failed. */
export function summariseRun(run: SyncAllRun): SyncResult {
  const said = run.items.filter(i => i.status !== "queued");
  return {
    ok: said.every(i => i.status !== "error"),
    text: (run.finishedAt ? "" : "Syncing one at a time — ")
      + said.map(i => `${i.label}: ${i.status === "syncing" ? "syncing…" : i.message ?? i.status}`).join("  ·  "),
  };
}
