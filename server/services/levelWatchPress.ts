/**
 * HIS /level PRICE WATCHES in the Telegram DM (19 Nov 2026).
 *
 * His ask: "I just type /level. Then it sends the pairs to me then i click the pair and then it send me a box to enter
 * value or values if it is a range then it watches. When the price hits those levels, it sends me a notification with
 * an option to enter entry values like SL and entry level using stop order."
 *
 * This server is the one program listening to the bot, so it holds the CONVERSATION: /level → the markets → his level
 * → (the engine watches and tells him when it is reached, with 📈 Buy stop / 📉 Sell stop) → his entry, stop and
 * optional target. The signal engine does the watching and the placing (`signal_platform/execution/level_watch.py`);
 * the two meet in the `level_watches` table. Same rules as the other presses: only his account; strict patterns; every
 * press and every typed answer gets a message back.
 */
import type TelegramBot from 'node-telegram-bot-api';
import { pool } from '../db';

// The markets the engine has the broker's LIVE price for (`signal_platform/config/instruments.py` INSTRUMENTS).
export const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'XAU/USD', 'BTC/USD'];
const NUM = String.raw`(\d{1,7}(?:\.\d{1,6})?)`;
const LEVEL = new RegExp(String.raw`^\s*${NUM}(?:\s*(?:-|–|to|,|\s)\s*${NUM})?\s*$`, 'i');
const ORDER = new RegExp(String.raw`^\s*${NUM}[\s,]+${NUM}(?:[\s,]+${NUM})?\s*$`);
const PRESS = /^lw:([pxbs]):([A-Z]{6}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const OPEN = `('awaiting_level','new','watching','hit','awaiting_order','refused')`;
type Q = typeof pool.query;
export type Reply = { text: string; ask?: string; id?: string } | null;

function owner(): string { return (process.env.WATCHDOG_CHAT_ID ?? '').trim().replace(/^"|"$/g, ''); }
const NOT_YOURS = '🚫 Only the account owner can use this.';

/** /level → the market buttons (or the refusal). */
export function levelMenu(fromId: number | string | undefined): { text: string; keyboard?: any } {
  if (!owner() || String(fromId ?? '') !== owner()) return { text: NOT_YOURS };
  const row = (a: string[]) => a.map(p => ({ text: p, callback_data: `lw:p:${p.replace('/', '')}` }));
  return { text: '📍 <b>WATCH A LEVEL</b> — which market?',
           keyboard: { inline_keyboard: [row(PAIRS.slice(0, 3)), row(PAIRS.slice(3))] } };
}

/** A press on one of this feature's buttons → what to tell him (and, for a market or Buy / Sell, the question). */
export async function recordLevelPress(data: string | undefined, fromId: number | string | undefined,
                                       _chatId: number | string | undefined,   // not used: always his DM
                                       query: Q = pool.query.bind(pool)): Promise<Reply> {
  const m = PRESS.exec(data ?? '');
  if (!m) return null;
  if (!owner() || String(fromId ?? '') !== owner()) return { text: NOT_YOURS };
  const [, kind, arg] = m;
  if (kind === 'p') {
    const symbol = PAIRS.find(p => p.replace('/', '') === arg);
    if (!symbol) return { text: '⚠️ That market is not watched — use /level again.' };
    const res: any = await query(
      `INSERT INTO level_watches (chat_id, symbol, status) VALUES ($1, $2, 'awaiting_level') RETURNING id`,
      [owner(), symbol]);                     // HIS DM ONLY, wherever /level was used (his ruling, 19 Nov 2026)
    return { text: `📍 <b>${symbol}</b>`, id: res.rows?.[0]?.id,
             ask: `📍 ${symbol}: send the price — or a range as two numbers (for example 3725.50 3730.00) — as a reply to this message.` };
  }
  if (kind === 'x') {
    const res: any = await query(
      `UPDATE level_watches SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status IN ${OPEN}
       RETURNING symbol`, [arg]);
    const sym = res.rows?.[0]?.symbol;
    return { text: sym ? `❌ <b>STOPPED WATCHING</b> ${sym}.` : '⚠️ That watch has already ended.' };
  }
  const side = kind === 'b' ? 'buy' : 'sell';
  const res: any = await query(
    `UPDATE level_watches SET order_side = $1, status = 'awaiting_order', updated_at = NOW()
      WHERE id = $2 AND status IN ('hit','awaiting_order','refused') RETURNING symbol`, [side, arg]);
  const sym = res.rows?.[0]?.symbol;
  if (!sym) return { text: '⚠️ This level is no longer waiting for an order (already placed, or stopped).' };
  const S = side.toUpperCase();
  return { text: `${side === 'buy' ? '📈' : '📉'} <b>${S} STOP</b> — ${sym}.`, id: arg,
           ask: `${S} STOP ${sym}: send the entry and the stop loss, and a target if you want one — for example `
              + `${side === 'buy' ? '3733.00 3727.50 3744.00' : '3727.00 3732.50 3716.00'} — as a reply to this message.` };
}

/** His typed answer to one of our two questions → what to tell him. null = not an answer to ours. */
export async function recordLevelReply(promptId: number | undefined, text: string | undefined,
                                       fromId: number | string | undefined,
                                       query: Q = pool.query.bind(pool)): Promise<string | null> {
  if (!promptId) return null;
  const found: any = await query(
    `SELECT id, symbol, status, order_side FROM level_watches
      WHERE prompt_id = $1 AND status IN ('awaiting_level','awaiting_order')`, [promptId]);
  const row = found.rows?.[0];
  if (!row) return null;
  if (!owner() || String(fromId ?? '') !== owner()) return NOT_YOURS;
  if (row.status === 'awaiting_level') {
    const m = LEVEL.exec(text ?? '');
    if (!m) return `⚠️ "${(text ?? '').slice(0, 30)}" is not a price — reply with one number, or two for a range.`;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    const [low, high] = a <= b ? [a, b] : [b, a];
    const res: any = await query(
      `UPDATE level_watches SET low = $1, high = $2, status = 'new', updated_at = NOW()
        WHERE id = $3 AND status = 'awaiting_level'`, [low, high, row.id]);
    if ((res.rowCount ?? 0) !== 1) return '⏳ That level was already set.';
    return `⏳ ${row.symbol} ${low === high ? low : `${low}–${high}`} received — the watch is confirmed in a moment.`;
  }
  const m = ORDER.exec(text ?? '');
  if (!m) return '⚠️ Send the entry and the stop loss (and a target if you want one), as numbers separated by spaces.';
  const [entry, sl] = [Number(m[1]), Number(m[2])];
  const tp = m[3] ? Number(m[3]) : null;
  const buy = row.order_side === 'buy';
  if (buy ? !(sl < entry) : !(sl > entry))
    return `⚠️ For a ${buy ? 'BUY' : 'SELL'} the stop loss must be ${buy ? 'BELOW' : 'ABOVE'} the entry — nothing placed. Reply again.`;
  if (tp !== null && (buy ? !(tp > entry) : !(tp < entry)))
    return `⚠️ For a ${buy ? 'BUY' : 'SELL'} the target must be ${buy ? 'ABOVE' : 'BELOW'} the entry — nothing placed. Reply again.`;
  const res: any = await query(
    `UPDATE level_watches SET entry = $1, sl = $2, tp = $3, status = 'order_pending', updated_at = NOW()
      WHERE id = $4 AND status = 'awaiting_order'`, [entry, sl, tp, row.id]);
  if ((res.rowCount ?? 0) !== 1) return '⏳ That order is already being placed.';
  return `⏳ <b>PLACING</b> ${row.symbol} ${buy ? 'BUY' : 'SELL'} STOP at ${entry}, stop ${sl}`
    + `${tp !== null ? `, target ${tp}` : ', no target'} — I will confirm here in a few seconds.`;
}

export function attachLevelWatchPress(bot: TelegramBot): void {
  bot.onText(/^\/level(?:@\w+)?\s*$/, async (msg) => {
    try {
      const menu = levelMenu(msg.from?.id);
      await bot.sendMessage(msg.chat.id, menu.text, { parse_mode: 'HTML', reply_markup: menu.keyboard });
      console.log(`[LevelWatch] /level from ${msg.from?.id}`);
    } catch (error: any) {
      console.error('[LevelWatch] /level failed:', error?.message ?? error);
    }
  });
  bot.on('callback_query', async (q) => {
    let r: Reply = null;
    try {
      r = await recordLevelPress(q.data, q.from?.id, q.message?.chat.id);
      if (!r) return;                                        // some other button — not this feature's
      await bot.answerCallbackQuery(q.id);
      if (!q.message) return;
      const chat = q.message.chat.id;
      await bot.sendMessage(chat, r.text, { parse_mode: 'HTML' });
      if (r.ask && r.id) {
        const ask = await bot.sendMessage(chat, r.ask, { reply_markup: { force_reply: true, selective: true } });
        await pool.query(`UPDATE level_watches SET prompt_id = $1 WHERE id = $2`, [ask.message_id, r.id]);
      }
    } catch (error: any) {
      console.error('[LevelWatch] press failed:', error?.message ?? error);
      if (!r) return;
      try { await bot.answerCallbackQuery(q.id, { text: 'Could not record that — try again.' }); } catch {}
    }
  });
  bot.on('message', async (msg) => {
    try {
      const answer = await recordLevelReply(msg.reply_to_message?.message_id, msg.text, msg.from?.id);
      if (answer) await bot.sendMessage(msg.chat.id, answer, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
    } catch (error: any) {
      console.error('[LevelWatch] reply failed:', error?.message ?? error);
    }
  });
}
