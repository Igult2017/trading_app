/**
 * THE SETTINGS VAULT (17 Nov 2026) — an encrypted copy of every setting, kept in his PRIVATE GitHub repo.
 *
 * His words: *"next time when i move it to another hosting i dont lose settings. I just set apis and it starts working
 * immediately"*, and *"keep a copy of those settings table to github in a way that no one can access except me"*.
 * The move to Hostinger (2 Nov 2026) lost every setting: nothing held a copy.
 *
 * WHAT IS SAVED, in ONE file: every server setting the app runs with (its own environment, minus machine variables)
 * AND the database tables that are settings, not history (`VAULT_TABLES`). The cTrader login and broker passwords in
 * those tables are encrypted with `COPY_ENCRYPTION_KEY`, which is in the same file — the two are useless apart.
 *
 * HOW IT IS PROTECTED: encrypted with **age** to HIS public key (`VAULT_AGE_RECIPIENT`). This server holds only the
 * public key — it can lock a vault, never open one. His private key lives on his PC and in his password manager. The
 * file is written to a SEPARATE private repo (`VAULT_GITHUB_REPO`) with a token limited to that one repo. No value is
 * ever logged. Restore: `scripts/vault/restore.mjs`, run by him with his private key (`docs/MOVING.md`).
 *
 * OFF unless all three VAULT_* settings exist. 5 minutes after boot, then every 6 hours; a save is skipped when nothing
 * changed. A failure is logged and DM'd at most once a day — it never stops the app.
 */
import { createHash } from "crypto";
import { pool } from "../db";

/** The settings tables, IN RESTORE ORDER: a table comes after every table it points at (`shared/schema.ts`). */
export const VAULT_TABLES = [
  "users", "user_profiles", "platform_settings", "ctrader_tokens", "broker_accounts",
  "copy_accounts", "copy_masters", "copy_followers", "telegram_subscribers", "telegram_signal_sources",
] as const;

const SYSTEM_ENV = new Set(["PATH", "HOSTNAME", "HOME", "PWD", "SHLVL", "TERM", "OLDPWD", "_", "LANG", "TZ",
                            "SOURCE_COMMIT", "HOST", "PYTHONUNBUFFERED", "VIRTUAL_ENV", "PYTHONDONTWRITEBYTECODE"]);
const SYSTEM_PREFIX = ["NODE_", "npm_", "COOLIFY_", "YARN_", "PYTHON", "GPG_", "VAULT_LAST"];

/** Is this an environment variable of the MACHINE rather than one of his settings? */
export function isSystemEnv(name: string): boolean {
  return SYSTEM_ENV.has(name) || SYSTEM_PREFIX.some(p => name.startsWith(p));
}

export function collectEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(env).sort()) if (!isSystemEnv(k) && env[k] !== undefined) out[k] = env[k] as string;
  return out;
}

async function collectTables(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of VAULT_TABLES) {
    try {
      out[t] = (await pool.query(`SELECT * FROM ${t}`)).rows;   // table names are the fixed list above, never input
    } catch {
      out[t] = [];                                              // a table missing on this server is not a reason to stop
    }
  }
  return out;
}

/** Stable JSON (sorted keys) so the same settings always hash the same. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stable((v as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export async function encryptTo(recipient: string, text: string): Promise<Uint8Array> {
  const age = await import("age-encryption");
  const e = new age.Encrypter();
  e.addRecipient(recipient);
  return e.encrypt(text);
}

async function saveToGitHub(repo: string, token: string, bytes: Uint8Array, summary: string): Promise<void> {
  const url = `https://api.github.com/repos/${repo}/contents/settings.age`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "settings-vault" };
  const cur = await fetch(url, { headers });
  const sha = cur.ok ? ((await cur.json()) as any).sha : undefined;
  const res = await fetch(url, {
    method: "PUT", headers,
    body: JSON.stringify({ message: `settings vault — ${summary}`, content: Buffer.from(bytes).toString("base64"),
                           ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`GitHub refused the save: HTTP ${res.status}`);
}

let lastHash = "";
let lastAlertDay = "";

async function alert(text: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  if (day === lastAlertDay) return;
  lastAlertDay = day;
  const bot = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.WATCHDOG_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch { /* the log line already says it */ }
}

/** One save. Returns what happened, in words (never a value). */
export async function saveVaultOnce(): Promise<string> {
  const recipient = process.env.VAULT_AGE_RECIPIENT, repo = process.env.VAULT_GITHUB_REPO,
        token = process.env.VAULT_GITHUB_TOKEN;
  if (!recipient || !repo || !token) return "off — VAULT_AGE_RECIPIENT / VAULT_GITHUB_REPO / VAULT_GITHUB_TOKEN not all set";
  const env = collectEnv();
  const tables = await collectTables();
  const body = stable({ env, tables });
  const hash = createHash("sha256").update(body).digest("hex");
  const summary = `${Object.keys(env).length} settings, ` +
                  VAULT_TABLES.map(t => `${t} ${tables[t]?.length ?? 0}`).join(", ");
  if (hash === lastHash) return `unchanged (${summary})`;
  const file = JSON.stringify({ version: 1, saved_at: new Date().toISOString(), env, tables });
  await saveToGitHub(repo, token, await encryptTo(recipient, file), summary);
  lastHash = hash;
  return `saved (${summary})`;
}

export function startSettingsVault(): void {
  const run = async () => {
    try {
      console.log(`[settings-vault] ${await saveVaultOnce()}`);
    } catch (err: any) {
      const why = `${err?.name ?? "Error"}: ${String(err?.message ?? err).slice(0, 160)}`;
      console.warn(`[settings-vault] save FAILED — ${why}`);
      await alert(`⚠️ Settings vault: the encrypted copy of your settings could not be saved to GitHub (${why}). ` +
                  `Your settings are fine on the server; this only matters if you move hosting.`);
    }
  };
  setTimeout(run, 5 * 60_000);
  setInterval(run, 6 * 3600_000);
}

/** RESTORE: write the vault's tables back, parents first. Rows are upserted on their primary key (`id`, or `key` for
 *  platform_settings) so a restore onto a database that already has some rows does not fail or duplicate. */
export async function restoreTables(tables: Record<string, unknown[]>): Promise<Record<string, number>> {
  const done: Record<string, number> = {};
  for (const t of VAULT_TABLES) {
    const rows = (tables[t] ?? []) as Record<string, unknown>[];
    const pk = t === "platform_settings" ? "key" : "id";
    let n = 0;
    for (const row of rows) {
      const cols = Object.keys(row).filter(c => /^[a-z_][a-z0-9_]*$/.test(c));
      if (!cols.includes(pk)) continue;
      const set = cols.filter(c => c !== pk).map(c => `"${c}" = EXCLUDED."${c}"`).join(", ");
      await pool.query(
        `INSERT INTO ${t} (${cols.map(c => `"${c}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
         ON CONFLICT ("${pk}") DO ${set ? `UPDATE SET ${set}` : "NOTHING"}`,
        cols.map(c => row[c]));
      n++;
    }
    done[t] = n;
  }
  return done;
}
