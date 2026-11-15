/**
 * HIS CONFIRM / REJECT PRESS on a DM-confirmation card (16 Nov 2026).
 *
 * The signal engine sends the card with two buttons (`signal_platform/execution/confirmations.py`).
 * Telegram delivers a press only to the program listening to the bot, which is this server
 * (`telegramNotification.ts`), so the press is recorded HERE and the engine acts on it from the
 * database within a couple of seconds.
 *
 * THREE RULES, each one a reason this file is small:
 *   1. ONLY HIS ACCOUNT. The presser must be WATCHDOG_CHAT_ID — the private DM the card was sent to,
 *      whose chat number IS his Telegram account. Anyone else is told no and nothing changes.
 *   2. ONLY A PENDING OFFER. `pending -> confirmed | rejected` in one UPDATE guarded on the status, so
 *      a double press, or a press on an offer already settled, changes nothing.
 *   3. THE BUTTON CARRIES ONLY THE OFFER ID, and it is matched against a strict pattern and looked up.
 *      Nothing in it is trusted or executed.
 */
import type TelegramBot from 'node-telegram-bot-api';
import { pool } from '../db';

const PRESS = /^tc:([yn]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export type PressOutcome = 'not-ours' | 'not-allowed' | 'already-answered' | 'confirmed' | 'rejected';

/** Decide and record one press. Exported for the test; the bot handler below only adds the replies. */
export async function recordPress(data: string | undefined, fromId: number | string | undefined,
                                  query: typeof pool.query = pool.query.bind(pool)): Promise<PressOutcome> {
  const m = PRESS.exec(data ?? '');
  if (!m) return 'not-ours';
  const owner = (process.env.WATCHDOG_CHAT_ID ?? '').trim().replace(/^"|"$/g, '');
  if (!owner || String(fromId ?? '') !== owner) return 'not-allowed';
  const status = m[1] === 'y' ? 'confirmed' : 'rejected';
  const res = await query(
    `UPDATE trade_confirmations SET status = $1, decided_at = NOW()
      WHERE id = $2 AND status = 'pending'`, [status, m[2]]);
  return (res.rowCount ?? 0) === 1 ? status : 'already-answered';
}

const ANSWER: Record<Exclude<PressOutcome, 'not-ours'>, string> = {
  'not-allowed': 'Only the account owner can answer this.',
  'already-answered': 'This one has already been answered.',
  confirmed: 'Confirmed — placing it now, after the final checks.',
  rejected: 'Rejected — nothing will be placed.',
};

export function attachTradeConfirmPress(bot: TelegramBot): void {
  bot.on('callback_query', async (q) => {
    let outcome: PressOutcome = 'not-ours';
    try {
      outcome = await recordPress(q.data, q.from?.id);
      if (outcome === 'not-ours') return;          // some other button — not this feature's
      await bot.answerCallbackQuery(q.id, { text: ANSWER[outcome] });
      console.log(`[TradeConfirm] press ${outcome} by ${q.from?.id}`);
      if ((outcome === 'confirmed' || outcome === 'rejected') && q.message) {
        // The buttons go, so the card cannot be pressed again; the engine replies with the result.
        await bot.editMessageReplyMarkup({ inline_keyboard: [] },
          { chat_id: q.message.chat.id, message_id: q.message.message_id });
        if (outcome === 'rejected') {
          await bot.sendMessage(q.message.chat.id, '❌ <b>REJECTED</b> — not placed.',
            { parse_mode: 'HTML', reply_to_message_id: q.message.message_id });
        }
      }
    } catch (error: any) {
      console.error('[TradeConfirm] press failed:', error?.message ?? error);
      if (outcome === 'not-ours') return;
      try { await bot.answerCallbackQuery(q.id, { text: 'Could not record that — try again.' }); } catch {}
    }
  });
}
