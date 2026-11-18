/**
 * HIS ❌ CANCEL TRADE / ✏️ ADJUST SL buttons on the "order placed" and "trade filled" messages (18 Nov 2026).
 *
 * His ask: "add a button for cancelling a trade and adjusting SL by entering the price level where SL should
 * reach … Make the cancels interactive or communicative so that I can know what is going on when I press it."
 *
 * The signal engine sends the message with `ta:c:<id>` / `ta:s:<id>` buttons
 * (`signal_platform/notifications/trade_buttons.py`) and carries the request out at the broker
 * (`signal_platform/execution/trade_actions.py`), replying with what happened. This server is the one program
 * listening to the bot, so it records the press — and, for Adjust SL, asks for the price and records his typed
 * answer. Same rules as the other two presses: only his account; a strict pattern, looked up and never trusted.
 * EVERY press and every typed answer gets a message back, so he always knows what is going on.
 */
import type TelegramBot from 'node-telegram-bot-api';
import { pool } from '../db';

const PRESS = /^ta:([cs]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const PRICE = /^\s*(\d{1,6}(?:\.\d{1,6})?)\s*$/;
type Q = typeof pool.query;

export type Press = { kind: 'cancel' | 'move_sl'; reply: string; askPrice?: string; id?: string } | null;

function owner(): string { return (process.env.WATCHDOG_CHAT_ID ?? '').trim().replace(/^"|"$/g, ''); }

/** His press → what to tell him (and, for Adjust SL, the question to ask). null = not this feature's button. */
export async function recordActionPress(data: string | undefined, fromId: number | string | undefined,
                                        query: Q = pool.query.bind(pool)): Promise<Press> {
  const m = PRESS.exec(data ?? '');
  if (!m) return null;
  const kind = m[1] === 'c' ? 'cancel' : 'move_sl';
  if (!owner() || String(fromId ?? '') !== owner()) return { kind, reply: '🚫 Only the account owner can use these buttons.' };
  const next = kind === 'cancel' ? 'pending' : 'awaiting_price';
  const res: any = await query(
    `UPDATE trade_actions SET kind = $1, status = $2, price = NULL, updated_at = NOW()
      WHERE id = $3 AND status IN ('offered', 'awaiting_price', 'done', 'failed')
      RETURNING symbol, bullish`, [kind, next, m[2]]);
  const row = res.rows?.[0];
  if (!row) {
    const now: any = await query(`SELECT status FROM trade_actions WHERE id = $1`, [m[2]]);
    const st = now.rows?.[0]?.status;
    if (!st) return { kind, reply: '⚠️ These buttons are no longer on record — use your platform.' };
    return { kind, reply: '⏳ Your last request on this trade is still being carried out — its answer will follow here.' };
  }
  const side = `${row.symbol} ${row.bullish ? 'BUY' : 'SELL'}`;
  if (kind === 'cancel') {
    return { kind, reply: `⏳ <b>CANCELLING</b> ${side} — the waiting order is withdrawn, or the open trade closed at `
      + `market. I will confirm here in a few seconds.` };
  }
  return { kind, id: m[2], reply: `✏️ <b>ADJUST SL</b> — ${side}.`,
           askPrice: `✏️ Send the new stop price for ${side} — just the number (for example 1.31720), as a reply to this message.` };
}

/** His typed answer to the "send the new stop price" question → what to tell him. null = not an answer to ours. */
export async function recordPriceReply(promptId: number | undefined, text: string | undefined,
                                       fromId: number | string | undefined,
                                       query: Q = pool.query.bind(pool)): Promise<string | null> {
  if (!promptId) return null;
  const found: any = await query(
    `SELECT id, symbol, bullish FROM trade_actions WHERE prompt_id = $1 AND status = 'awaiting_price'`, [promptId]);
  const row = found.rows?.[0];
  if (!row) return null;
  if (!owner() || String(fromId ?? '') !== owner()) return '🚫 Only the account owner can set the stop.';
  const p = PRICE.exec(text ?? '');
  if (!p) return `⚠️ "${(text ?? '').slice(0, 30)}" is not a price — reply with just the number, for example 1.31720.`;
  const res: any = await query(
    `UPDATE trade_actions SET price = $1, status = 'pending', updated_at = NOW()
      WHERE id = $2 AND status = 'awaiting_price'`, [Number(p[1]), row.id]);
  if ((res.rowCount ?? 0) !== 1) return '⏳ That stop request is already being carried out.';
  return `⏳ <b>MOVING THE STOP</b> of ${row.symbol} ${row.bullish ? 'BUY' : 'SELL'} to ${p[1]} — I will confirm here `
    + `in a few seconds (it is refused if that price is on the wrong side of the market).`;
}

export function attachTradeActionPress(bot: TelegramBot): void {
  bot.on('callback_query', async (q) => {
    let press: Press = null;
    try {
      press = await recordActionPress(q.data, q.from?.id);
      if (!press) return;                                    // some other button — not this feature's
      await bot.answerCallbackQuery(q.id, { text: press.kind === 'cancel' ? 'Cancelling…' : 'Send the new stop price' });
      console.log(`[TradeAction] ${press.kind} pressed by ${q.from?.id}`);
      if (!q.message) return;
      const chat = q.message.chat.id;
      await bot.sendMessage(chat, press.reply, { parse_mode: 'HTML', reply_to_message_id: q.message.message_id });
      if (press.askPrice && press.id) {
        const ask = await bot.sendMessage(chat, press.askPrice,
          { reply_to_message_id: q.message.message_id, reply_markup: { force_reply: true, selective: true } });
        await pool.query(`UPDATE trade_actions SET prompt_id = $1 WHERE id = $2`, [ask.message_id, press.id]);
      }
    } catch (error: any) {
      console.error('[TradeAction] press failed:', error?.message ?? error);
      if (!press) return;
      try { await bot.answerCallbackQuery(q.id, { text: 'Could not record that — try again.' }); } catch {}
    }
  });
  bot.on('message', async (msg) => {
    try {
      const answer = await recordPriceReply(msg.reply_to_message?.message_id, msg.text, msg.from?.id);
      if (answer) {
        console.log(`[TradeAction] stop price answered by ${msg.from?.id}`);
        await bot.sendMessage(msg.chat.id, answer, { parse_mode: 'HTML', reply_to_message_id: msg.message_id });
      }
    } catch (error: any) {
      console.error('[TradeAction] price reply failed:', error?.message ?? error);
    }
  });
}
