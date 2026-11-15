/**
 * THE TRADING MODE — the admin panel's two switches, Autotrade and DM confirmation (16 Nov 2026).
 *
 * His rule: *"Only one switch can work at a time. If I switch DM confirm on, autotrade goes off."* So it
 * is stored as ONE value — off | auto | confirm — in `platform_settings`, and the two switches on the
 * Autotrade page are two views of it. The signal engine reads the same row
 * (`signal_platform/execution/trade_mode.py`) within 5 seconds of a change; no redeploy.
 */
import { pool } from '../db';

export const TRADE_MODES = ['off', 'auto', 'confirm'] as const;
export type TradeMode = typeof TRADE_MODES[number];

export function isTradeMode(v: unknown): v is TradeMode {
  return typeof v === 'string' && (TRADE_MODES as readonly string[]).includes(v);
}

export interface TradeModeState { mode: TradeMode; updatedAt: string | null; updatedBy: string | null }

/** The saved mode. A missing or unknown value reads as OFF — the same as the signal engine does. */
export async function readTradeMode(): Promise<TradeModeState> {
  const { rows } = await pool.query(
    `SELECT value, updated_at, updated_by FROM platform_settings WHERE key = 'trade_mode'`);
  const row = rows[0];
  const mode = isTradeMode(row?.value) ? row.value : 'off';
  return { mode, updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
           updatedBy: row?.updated_by ?? null };
}

export async function writeTradeMode(mode: TradeMode, by: string): Promise<TradeModeState> {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by)
          VALUES ('trade_mode', $1, NOW(), $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(),
                                     updated_by = EXCLUDED.updated_by`, [mode, by.slice(0, 120)]);
  return readTradeMode();
}
