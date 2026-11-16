/**
 * HIS ✅ TRADEABLE / ⛔ UNTRADEABLE PRESS on a momentum-candle announcement (16 Nov 2026).
 *
 * His ask: "Whenever momentum candle closure is sent it should contain a button that asks if a trade
 * should be taken there, then the system starts waiting for entry and once entry is ready it takes a
 * trade there … the button should be tradeable and untradeable."
 *
 * The signal engine sends the card with `mc:t:<id>` / `mc:u:<id>` buttons
 * (`signal_platform/notifications/mark_buttons.py`) and reads his answer from `candle_marks`
 * (`signal_platform/strategies/vix1_marked.py`). This server records the press because it is the one
 * program listening to the bot. Same three rules as the Confirm / Reject press (`tradeConfirmPress.ts`):
 * only his account; a strict pattern, looked up and never trusted; and only a mark still open to change.
 *
 * HE MAY CHANGE HIS MIND until a trade has been taken from the candle, so the buttons stay on the card.
 */
import type TelegramBot from 'node-telegram-bot-api';
import { pool } from '../db';

const PRESS = /^mc:([tu]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export type MarkOutcome = 'not-ours' | 'not-allowed' | 'tradeable' | 'untradeable' | 'used' | 'expired';

export async function recordMarkPress(data: string | undefined, fromId: number | string | undefined,
                                      query: typeof pool.query = pool.query.bind(pool)): Promise<MarkOutcome> {
  const m = PRESS.exec(data ?? '');
  if (!m) return 'not-ours';
  const owner = (process.env.WATCHDOG_CHAT_ID ?? '').trim().replace(/^"|"$/g, '');
  if (!owner || String(fromId ?? '') !== owner) return 'not-allowed';
  const status = m[1] === 't' ? 'tradeable' : 'untradeable';
  const res: any = await query(
    `UPDATE candle_marks SET status = $1, decided_at = NOW()
      WHERE id = $2 AND status IN ('open', 'tradeable', 'untradeable')
        AND created_at > NOW() - INTERVAL '24 hours'`, [status, m[2]]);
  if ((res.rowCount ?? 0) === 1) return status;
  const now: any = await query(`SELECT status FROM candle_marks WHERE id = $1`, [m[2]]);
  return now.rows?.[0]?.status === 'used' ? 'used' : 'expired';
}

const ANSWER: Record<Exclude<MarkOutcome, 'not-ours'>, string> = {
  'not-allowed': 'Only the account owner can answer this.',
  tradeable: 'Marked TRADEABLE — waiting for the entry.',
  untradeable: 'Marked UNTRADEABLE — no trade will be taken from this candle.',
  used: 'A trade has already been taken from this candle.',
  expired: 'Too late — a newer momentum candle replaced this one, or 24 hours passed.',
};

const REPLY: Partial<Record<MarkOutcome, string>> = {
  tradeable: '✅ <b>TRADEABLE</b> — the system is now waiting for the entry on this candle and will '
    + 'take the trade when it comes (your DM only; every safety check still applies, the 7pm cut-off does not).',
  untradeable: '⛔ <b>UNTRADEABLE</b> — no trade will be taken from this candle.',
};

export function attachCandleMarkPress(bot: TelegramBot): void {
  bot.on('callback_query', async (q) => {
    let outcome: MarkOutcome = 'not-ours';
    try {
      outcome = await recordMarkPress(q.data, q.from?.id);
      if (outcome === 'not-ours') return;          // some other button — not this feature's
      await bot.answerCallbackQuery(q.id, { text: ANSWER[outcome] });
      console.log(`[CandleMark] press ${outcome} by ${q.from?.id}`);
      const reply = REPLY[outcome];
      if (reply && q.message) {
        await bot.sendMessage(q.message.chat.id, reply,
          { parse_mode: 'HTML', reply_to_message_id: q.message.message_id });
      }
      if ((outcome === 'used' || outcome === 'expired') && q.message) {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] },
          { chat_id: q.message.chat.id, message_id: q.message.message_id });
      }
    } catch (error: any) {
      console.error('[CandleMark] press failed:', error?.message ?? error);
      if (outcome === 'not-ours') return;
      try { await bot.answerCallbackQuery(q.id, { text: 'Could not record that — try again.' }); } catch {}
    }
  });
}
