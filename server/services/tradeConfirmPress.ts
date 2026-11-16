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

export type PressOutcome = 'not-ours' | 'not-allowed' | 'already-answered' | 'expired' | 'confirmed'
  | 'rejected' | 'test-confirmed' | 'test-rejected';

/** Decide and record one press. Exported for the test; the bot handler below only adds the replies. */
export async function recordPress(data: string | undefined, fromId: number | string | undefined,
                                  query: typeof pool.query = pool.query.bind(pool)): Promise<PressOutcome> {
  const m = PRESS.exec(data ?? '');
  if (!m) return 'not-ours';
  const owner = (process.env.WATCHDOG_CHAT_ID ?? '').trim().replace(/^"|"$/g, '');
  if (!owner || String(fromId ?? '') !== owner) return 'not-allowed';
  const status = m[1] === 'y' ? 'confirmed' : 'rejected';
  const res: any = await query(
    `UPDATE trade_confirmations SET status = $1, decided_at = NOW()
      WHERE id = $2 AND status = 'pending' RETURNING is_test`, [status, m[2]]);
  if ((res.rowCount ?? 0) === 1) return res.rows?.[0]?.is_test ? (`test-${status}` as PressOutcome) : status;
  // NOT OPEN ANY MORE — say WHY (audit, 16 Nov 2026). His rule: a late Confirm is refused WITH the
  // reason. An offer never answered for 24 h is closed as expired; that used to read "already answered".
  const now: any = await query(`SELECT status FROM trade_confirmations WHERE id = $1`, [m[2]]);
  const st = now.rows?.[0]?.status;
  return st === 'expired' || st === 'unsent' ? 'expired' : 'already-answered';
}

const ANSWER: Record<Exclude<PressOutcome, 'not-ours'>, string> = {
  'not-allowed': 'Only the account owner can answer this.',
  'already-answered': 'This one has already been answered.',
  expired: 'Too late — this offer expired unanswered and is no longer open. Nothing was placed.',
  confirmed: 'Confirmed — placing it now, after the final checks.',
  rejected: 'Rejected — nothing will be placed.',
  'test-confirmed': 'Test Confirm received — checking the chain…',
  'test-rejected': 'Test Reject received — nothing will be placed.',
};

export function attachTradeConfirmPress(bot: TelegramBot): void {
  bot.on('callback_query', async (q) => {
    let outcome: PressOutcome = 'not-ours';
    try {
      outcome = await recordPress(q.data, q.from?.id);
      if (outcome === 'not-ours') return;          // some other button — not this feature's
      await bot.answerCallbackQuery(q.id, { text: ANSWER[outcome] });
      console.log(`[TradeConfirm] press ${outcome} by ${q.from?.id}`);
      const answered = ['confirmed', 'rejected', 'test-confirmed', 'test-rejected'].includes(outcome);
      if ((answered || outcome === 'expired') && q.message) {
        // The buttons go, so the card cannot be pressed again; the engine replies to a Confirm.
        await bot.editMessageReplyMarkup({ inline_keyboard: [] },
          { chat_id: q.message.chat.id, message_id: q.message.message_id });
        const reply = outcome === 'rejected' ? '❌ <b>REJECTED</b> — not placed.'
          : outcome === 'test-rejected' ? '🧪 <b>TEST — your Reject arrived.</b> Nothing was placed.'
          : outcome === 'expired' ? '⏱ <b>NOT PLACED — too late.</b> This offer expired unanswered.'
          : null;
        if (reply) {
          await bot.sendMessage(q.message.chat.id, reply,
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
