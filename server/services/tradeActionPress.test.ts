/**
 * tradeActionPress.test.ts — run with:
 *     npx tsx server/services/tradeActionPress.test.ts
 *
 * HIS ❌ CANCEL TRADE / ✏️ ADJUST SL presses (18 Nov 2026), the website-server half: only his account; the exact
 * button pattern; EVERY press and typed answer gets a message back; a typed price must be a number. The database is
 * a fake answering the few statements the handler sends.
 */
process.env.DATABASE_URL ||= 'postgresql://x/x';
process.env.WATCHDOG_CHAT_ID = '7615035273';
const HIM = 7615035273;

let failed = 0, total = 0;
function check(name: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`);
}

const ID = '1a2b3c4d-5e6f-7890-abcd-ef1234567890';
const row: any = { id: ID, symbol: 'GBP/USD', bullish: false, status: 'offered', prompt_id: 42, price: null };
const asked: string[] = [];
const q: any = async (sql: string, args: any[]) => {
  asked.push(sql);
  if (/^\s*UPDATE trade_actions SET kind/.test(sql)) {
    if (args[2] !== ID || !['offered', 'awaiting_price', 'done', 'failed'].includes(row.status)) return { rowCount: 0, rows: [] };
    row.kind = args[0]; row.status = args[1];
    return { rowCount: 1, rows: [{ symbol: row.symbol, bullish: row.bullish }] };
  }
  if (/^\s*SELECT status/.test(sql)) return { rows: args[0] === ID ? [{ status: row.status }] : [] };
  if (/^\s*SELECT id, symbol/.test(sql)) {
    return { rows: args[0] === row.prompt_id && row.status === 'awaiting_price' ? [row] : [] };
  }
  if (/^\s*UPDATE trade_actions SET price/.test(sql)) {
    if (row.status !== 'awaiting_price') return { rowCount: 0 };
    row.price = args[0]; row.status = 'pending'; return { rowCount: 1 };
  }
  return { rowCount: 0, rows: [] };
};

(async () => {
  const { recordActionPress, recordPriceReply } = await import('./tradeActionPress');
  console.log('\nCANCEL TRADE / ADJUST SL — his press, and his typed stop price\n');
  let p = await recordActionPress(`ta:c:${ID}`, HIM, q);
  check('Cancel → the request is recorded for the engine', [p?.kind, row.status], ['cancel', 'pending']);
  check('...and he is told what is happening', /CANCELLING/.test(p?.reply ?? ''), true);
  p = await recordActionPress(`ta:s:${ID}`, HIM, q);
  check('a second press while the first is being carried out → told to wait, nothing changed',
        [/still being carried out/.test(p?.reply ?? ''), row.status], [true, 'pending']);
  row.status = 'done';
  p = await recordActionPress(`ta:s:${ID}`, HIM, q);
  check('Adjust SL → waits for his price', [p?.kind, row.status], ['move_sl', 'awaiting_price']);
  check('...and asks him for it, naming the trade', /new stop price for GBP\/USD SELL/.test(p?.askPrice ?? ''), true);
  check('a reply that is not a price → told so, still waiting',
        [/is not a price/.test(await recordPriceReply(42, 'abc', HIM, q) ?? ''), row.status], [true, 'awaiting_price']);
  check('someone else answering → refused', /Only the account owner/.test(await recordPriceReply(42, '1.3172', 111, q) ?? ''), true);
  const ans = await recordPriceReply(42, ' 1.31720 ', HIM, q);
  check('his price → recorded for the engine', [row.price, row.status], [1.3172, 'pending']);
  check('...and he is told the stop is being moved', /MOVING THE STOP.*1\.31720/.test(ans ?? ''), true);
  check('a reply to some other message is not ours', await recordPriceReply(7, '1.3', HIM, q), null);
  asked.length = 0;
  p = await recordActionPress(`ta:c:${ID}`, 111, q);
  check('someone else pressing → told only the owner may, database not touched', [/Only the account owner/.test(p?.reply ?? ''), asked.length], [true, 0]);
  check('another feature\'s button is not this handler\'s', await recordActionPress(`mc:t:${ID}`, HIM, q), null);
  check('button data with anything extra is refused', await recordActionPress(`ta:c:${ID}x`, HIM, q), null);
  const { readFileSync } = await import('fs');
  const tn = readFileSync(new URL('./telegramNotification.ts', import.meta.url), 'utf8');
  check('TEETH — the handler is attached to the live bot', /attachTradeActionPress\(this\.bot\)/.test(tn), true);
  console.log(`\n${failed ? `${failed} of ${total} FAILED` : `ALL PASS (${total} checks)`}\n`);
  process.exit(failed ? 1 : 0);
})();
