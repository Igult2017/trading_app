/**
 * candleMarkPress.test.ts — run with:
 *     npx tsx server/services/candleMarkPress.test.ts
 *
 * HIS TRADEABLE / UNTRADEABLE PRESS on a momentum-candle announcement (16 Nov 2026). Guarded: only his
 * account; the exact button pattern; he may change his mind until a trade is taken; a used or expired
 * mark says so. The database is a fake that answers the one UPDATE and the one SELECT.
 */
process.env.DATABASE_URL ||= 'postgresql://x/x';
process.env.WATCHDOG_CHAT_ID = '7615035273';

let failed = 0, total = 0;
function check(name: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`);
}

const ID = '1a2b3c4d-5e6f-7890-abcd-ef1234567890';
const statusOf: Record<string, string> = { [ID]: 'open' };
const asked: string[] = [];
const fakeQuery: any = async (sql: string, args: unknown[]) => {
  asked.push(sql);
  const id = (/^\s*SELECT/i.test(sql) ? args[0] : args[1]) as string;
  if (/^\s*SELECT/i.test(sql)) return { rowCount: 1, rows: [{ status: statusOf[id] }] };
  if (['open', 'tradeable', 'untradeable'].includes(statusOf[id])) {
    statusOf[id] = args[0] as string;
    return { rowCount: 1, rows: [] };
  }
  return { rowCount: 0, rows: [] };
};

(async () => {
  const { recordMarkPress } = await import('./candleMarkPress');
  console.log('\nTRADEABLE / UNTRADEABLE — his press on a momentum candle\n');
  check('his Tradeable → tradeable', await recordMarkPress(`mc:t:${ID}`, 7615035273, fakeQuery), 'tradeable');
  check('...he changes his mind → untradeable', await recordMarkPress(`mc:u:${ID}`, 7615035273, fakeQuery), 'untradeable');
  check('...and back again → tradeable', await recordMarkPress(`mc:t:${ID}`, 7615035273, fakeQuery), 'tradeable');
  statusOf[ID] = 'used';
  check('once a trade was taken from it → "used", nothing changes',
        await recordMarkPress(`mc:u:${ID}`, 7615035273, fakeQuery), 'used');
  check('...the mark is still used', statusOf[ID], 'used');
  statusOf[ID] = 'expired';
  check('a replaced / 24-hour-old mark → "expired"', await recordMarkPress(`mc:t:${ID}`, 7615035273, fakeQuery), 'expired');
  asked.length = 0;
  check('someone else pressing → not allowed', await recordMarkPress(`mc:t:${ID}`, 111, fakeQuery), 'not-allowed');
  check('...and the database is not asked', asked.length, 0);
  check('a Confirm/Reject button is not this handler\'s', await recordMarkPress(`tc:y:${ID}`, 7615035273, fakeQuery), 'not-ours');
  check('button data with anything extra is refused', await recordMarkPress(`mc:t:${ID}x`, 7615035273, fakeQuery), 'not-ours');
  // 18 Nov 2026 — HIS ASK: "When it is expired I should get expired message" — and it says WHY.
  const { expiredReason } = await import('./candleMarkPress');
  const rows: Record<string, any> = {
    me: { rows: [{ symbol: 'EUR/USD', bar_time: 1794985200, created_at: new Date() }] },
    newer: { rows: [{ bar_time: 1794992400, bullish: true }] },
  };
  const q2: any = async (sql: string) => /bar_time > \$2/.test(sql) ? rows.newer : rows.me;
  const why = await expiredReason(`mc:t:${ID}`, q2);
  check('expired names the newer card that replaced it (EUR/USD BUY that closed at 13:00 Kenya)',
        why.includes('EXPIRED') && why.includes('EUR/USD') && why.includes('BUY') && why.includes('13:00'), true);
  rows.newer = { rows: [] };
  check('...with no newer card it says 24 hours passed', (await expiredReason(`mc:t:${ID}`, q2)).includes('24 hours'), true);
  const src = (await import('fs')).readFileSync(new URL('./candleMarkPress.ts', import.meta.url), 'utf8');
  check('every outcome replies in the chat, expired with its reason', /outcome === 'expired' \? await expiredReason/.test(src), true);
  check('a press on a card whose buttons are already gone is not reported as a failure', /not modified/.test(src), true);
  const { readFileSync } = await import('fs');
  const tn = readFileSync(new URL('./telegramNotification.ts', import.meta.url), 'utf8');
  check('TEETH — the handler is attached to the live bot', /attachCandleMarkPress\(this\.bot\)/.test(tn), true);
  console.log(`\n${failed ? `${failed} of ${total} FAILED` : `ALL PASS (${total} checks)`}\n`);
  process.exit(failed ? 1 : 0);
})();
