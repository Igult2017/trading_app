/**
 * Health watchdog — quietly watches the cTrader token, the signal scanner and the copy
 * engine, and pings a PRIVATE admin chat with a CODED line if any goes bad (and again
 * when it recovers). Designed so subscribers in the public signal channel never see a
 * scary error — the message reads like routine telemetry.
 *
 * It also PREVENTS the most common failure: it proactively refreshes the cTrader token
 * before it expires, so the "stale token → 429" never happens; the alert only fires when
 * the refresh genuinely fails (the refresh token itself is dead → you must re-connect).
 *
 * ── YOUR CODE MAPPING (only you know this) ──────────────────────────────────────
 *   🛰️ K7  = cTrader token   (⏬ stale → RE-CONNECT the cTrader account on Accounts page)
 *   🛰️ S3  = signal scanner  (⏬ boot/runtime error)
 *   🛰️ E9  = copy engine     (⏬ not running / heartbeat stale)
 *   ⏬ = down/needs attention   ⏫ = back to normal
 *
 * Destination: WATCHDOG_CHAT_ID (set this to your private DM with the bot) → falls back
 * to TELEGRAM_CHAT_ID only if unset. Sends via TELEGRAM_BOT_TOKEN.
 */
import { readFileSync } from "fs";
import { pool } from "../db";
import { safeDecrypt } from "../lib/crypto";
import { refreshCTraderToken } from "./autoSyncService";
import type { BrokerAccount } from "@shared/schema";

const CODE = { token: "🛰️ K7", scanner: "🛰️ S3", engine: "🛰️ E9" } as const;
const DOWN = " ⏬";
const UP = " ⏫";
const DEBOUNCE_MS = 6 * 60 * 60 * 1000;   // while down, re-remind at most every 6h

const _down: Record<string, boolean> = {};
const _lastSent: Record<string, number> = {};

const botToken = () => process.env.TELEGRAM_BOT_TOKEN || "";
const chatId = () => process.env.WATCHDOG_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";

async function send(text: string): Promise<void> {
  const bot = botToken(), chat = chatId();
  if (!bot || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch { /* never let an alert failure crash the loop */ }
}

/** Mark a subsystem down/up; emits a coded DOWN (debounced) or a one-shot UP on recovery. */
async function flag(key: keyof typeof CODE, bad: boolean): Promise<void> {
  const now = Date.now();
  if (bad) {
    if (!_down[key] || now - (_lastSent[key] ?? 0) > DEBOUNCE_MS) {
      _down[key] = true; _lastSent[key] = now;
      await send(CODE[key] + DOWN);
    }
  } else if (_down[key]) {
    _down[key] = false; _lastSent[key] = 0;
    await send(CODE[key] + UP);
  }
}

async function checkToken(): Promise<void> {
  try {
    const { rows } = await pool.query<any>(
      `SELECT id, platform, password_enc FROM broker_accounts WHERE platform = 'ctrader' ORDER BY updated_at DESC LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return;   // no cTrader account connected → nothing to watch yet
    const creds = JSON.parse(safeDecrypt(row.password_enc) ?? "{}");
    if (!creds.refreshToken) return;
    const exp: number = creds.tokenExpiresAt ?? 0;
    // Proactively refresh within 1h of expiry so the scanner/engine never see a stale token.
    if (!exp || exp < Date.now() + 60 * 60 * 1000) {
      const account = { id: row.id, platform: row.platform, passwordEnc: row.password_enc } as BrokerAccount;
      const fresh = await refreshCTraderToken(account);
      await flag("token", fresh === null);   // null = refresh token dead → needs re-connect
    } else {
      await flag("token", false);
    }
  } catch { /* transient DB/decrypt issue — don't false-alarm */ }
}

async function checkScanner(): Promise<void> {
  try {
    const s = JSON.parse(readFileSync("/app/.signal_platform_status.json", "utf8"));
    await flag("scanner", s.status === "error");
  } catch { /* file absent (dev / not booted yet) — skip silently */ }
}

async function checkEngine(): Promise<void> {
  if (process.env.COPY_ENGINE_ENABLED === "false") return;
  try {
    const { rows } = await pool.query(`SELECT beat_at FROM copy_engine_heartbeat WHERE id = 1`);
    const beat = rows[0]?.beat_at ? new Date(rows[0].beat_at).getTime() : 0;
    if (beat) await flag("engine", Date.now() - beat > 5 * 60 * 1000);   // only after first heartbeat
  } catch { /* ignore */ }
}

export function startHealthWatchdog(): void {
  if (!botToken() || !chatId()) return;   // no Telegram configured — nothing to alert through
  const tick = async () => { await checkToken(); await checkScanner(); await checkEngine(); };
  // First pass 90s after boot (let everything settle), then every 10 min.
  setTimeout(() => { void tick(); setInterval(() => void tick(), 10 * 60 * 1000); }, 90_000);
  console.log("[watchdog] health watchdog armed (coded alerts ->", process.env.WATCHDOG_CHAT_ID ? "admin chat)" : "signal chat)");
}
