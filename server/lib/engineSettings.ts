/**
 * THE ENGINE SETTINGS ON THE ADMIN PAGE (19 Nov 2026) — the values he changes from time to time, moved out of
 * Coolify on his ask: *"remove any settings we would need to change any time from coolify and put it in admin
 * where settings are."*
 *
 * ONE LIST, TWO READERS. `signal_platform/config/engine_settings.json` names each setting, its kind and its
 * limits. This file checks a value against it before saving; the signal engine (`config/live_settings.py`)
 * checks the same list again when it reads, and ignores anything that fails. Stored as rows in
 * `platform_settings`, the table the trading switch already uses (`./tradeMode.ts`); the engine picks a change up
 * within 5 seconds, no redeploy. No row = the Coolify value, else the code default — so deleting a row
 * ("Reset") puts things back exactly as they were before this page existed.
 */
import { pool } from '../db';
import spec from '../../signal_platform/config/engine_settings.json';

export type Kind = 'pairs' | 'strategies' | 'sessions' | 'hhmm' | 'overrides' | 'number' | 'int' | 'bool';
export interface SettingSpec {
  name: string; group: string; kind: Kind; label: string; help: string; default: string; min?: number; max?: number;
}
const SETTINGS = spec.settings as SettingSpec[];
const KNOWN: Record<'pairs' | 'strategies' | 'sessions', Set<string>> = {
  pairs: new Set(spec.pairs), strategies: new Set(spec.strategies), sessions: new Set(spec.sessions),
};

export function findSetting(name: unknown): SettingSpec | undefined {
  return typeof name === 'string' ? SETTINGS.find((s) => s.name === name) : undefined;
}

function items(v: string): string[] {
  return Array.from(new Set(v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)));
}

/** The value to store, tidied — or the reason it cannot be saved, in plain words. */
export function checkValue(s: SettingSpec, raw: unknown): { value: string } | { error: string } {
  if (s.kind === 'bool') {
    if (raw === true || raw === 'true') return { value: 'true' };
    if (raw === false || raw === 'false') return { value: 'false' };
    return { error: 'must be on or off' };
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') return { error: 'is missing' };
  const text = String(raw).trim();
  if (s.kind === 'number' || s.kind === 'int') {
    const n = Number(text);
    if (text === '' || !Number.isFinite(n)) return { error: 'must be a number' };
    if (s.kind === 'int' && !Number.isInteger(n)) return { error: 'must be a whole number' };
    if (n < (s.min ?? -Infinity) || n > (s.max ?? Infinity)) return { error: `must be between ${s.min} and ${s.max}` };
    return { value: String(n) };
  }
  if (s.kind === 'hhmm') {
    if (text === '') return { value: '' };
    const m = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { error: 'must be a time like 16:00, or empty' };
    return { value: `${m[1].padStart(2, '0')}:${m[2]}` };
  }
  if (s.kind === 'overrides') {
    const out: string[] = [];
    for (const part of items(text)) {
      const [id, num] = part.split(':');
      const n = Number(num);
      if (!KNOWN.strategies.has((id ?? '').trim()) || num === undefined || !Number.isFinite(n) || n < 0 || n > 1) {
        return { error: `"${part}" must be strategy:number, the number between 0 and 1` };
      }
      out.push(`${id.trim()}:${n}`);
    }
    return { value: out.join(',') };
  }
  const list = items(text);
  const unknown = list.filter((x) => !KNOWN[s.kind as 'pairs' | 'strategies' | 'sessions'].has(x));
  if (unknown.length) {
    const allowed = Array.from(KNOWN[s.kind as 'pairs' | 'strategies' | 'sessions']).join(', ');
    return { error: `${unknown.join(', ')} not recognised — use: ${allowed}` };
  }
  return { value: list.join(',') };
}

export interface SettingState extends SettingSpec {
  value: string;              // what the engine uses now
  source: 'admin' | 'coolify' | 'default';
  updatedAt: string | null; updatedBy: string | null;
}

type Db = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };

export async function readEngineSettings(db: Db = pool) {
  const { rows } = await db.query(
    `SELECT key, value, updated_at, updated_by FROM platform_settings WHERE key = ANY($1)`,
    [SETTINGS.map((s) => s.name)]);
  const byKey = new Map(rows.map((r: any) => [r.key, r]));
  const settings: SettingState[] = SETTINGS.map((s) => {
    const row: any = byKey.get(s.name);
    const env = process.env[s.name.toUpperCase()];
    // A row that fails the check is ignored by the engine too (`live_settings.get`), so it is not shown as in use.
    const ok = row ? 'value' in checkValue(s, row.value) : false;
    const source = row && ok ? 'admin' : env !== undefined ? 'coolify' : 'default';
    const value = source === 'admin' ? row.value : source === 'coolify' ? String(env) : s.default;
    return { ...s, value, source, updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
             updatedBy: row?.updated_by ?? null };
  });
  return { groups: spec.groups, settings, pairs: spec.pairs, strategies: spec.strategies, sessions: spec.sessions };
}

/** Save one setting, or (value null) delete its row so the Coolify / code value applies again. */
export async function writeEngineSetting(s: SettingSpec, value: string | null, by: string,
                                         db: Db = pool): Promise<void> {
  if (value === null) {
    await db.query(`DELETE FROM platform_settings WHERE key = $1`, [s.name]);
    return;
  }
  await db.query(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [s.name, value, by.slice(0, 120)]);
}

/**
 * A SWITCH THE WEBSITE ITSELF READS (21 Nov 2026 — the Barchart options levels): the admin page's row if there is one,
 * else the Coolify variable of the same name in capitals, else OFF. Only names on the list marked `owner: "server"`.
 */
export async function serverSwitch(name: "barchart_enabled" | "barchart_to_dm", db: Db = pool): Promise<boolean> {
  try {
    const { rows } = await db.query(`SELECT value FROM platform_settings WHERE key = $1`, [name]);
    if (rows[0]) return String(rows[0].value).toLowerCase() === "true";
  } catch { /* an unreadable table falls back to the variable below — never to ON */ }
  return (process.env[name.toUpperCase()] ?? "false").toLowerCase() === "true";
}
