/**
 * levelWatchPress.test.ts — run with:
 *     npx tsx server/services/levelWatchPress.test.ts
 *
 * HIS /level PRICE WATCHES (19 Nov 2026). Guarded: only his account; the six live markets; a single price or a range
 * (either order); his entry / stop / optional target checked against the side BEFORE anything is written; only a row
 * in the right state moves. The database is a fake that records every query and answers from a tiny in-memory table.
 */
process.env.DATABASE_URL ||= 'postgresql://x/x';
process.env.WATCHDOG_CHAT_ID = '7615035273';
const ME = 7615035273, STRANGER = 111;

let failed = 0, total = 0;
function check(name: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`);
}

const ID = '1a2b3c4d-5e6f-7890-abcd-ef1234567890';
type Row = { id: string; symbol: string; status: string; order_side?: string; prompt_id?: number;
             low?: number; high?: number; entry?: number; sl?: number; tp?: number | null };
const rows: Record<string, Row> = {};
const asked: string[] = [];
const fake: any = async (sql: string, a: any[]) => {
  asked.push(sql.replace(/\s+/g, ' ').trim());
  if (/^INSERT/i.test(sql.trim())) { rows[ID] = { id: ID, symbol: a[1], status: 'awaiting_level', chat: a[0] } as any; return { rows: [{ id: ID }] }; }
  if (/^SELECT/i.test(sql.trim())) {
    const r = Object.values(rows).find(x => x.prompt_id === a[0] && ['awaiting_level', 'awaiting_order'].includes(x.status));
    return { rows: r ? [r] : [] };
  }
  const r = rows[a[a.length - 1]];
  const allowed = (sql.match(/status (?:IN \(([^)]*)\)|= '(\w+)')\s*(?:RETURNING|$)/) ?? []);
  const ok = r && (allowed[1] ? allowed[1].includes(`'${r.status}'`) : allowed[2] === r.status);
  if (!ok) return { rowCount: 0, rows: [] };
  // judged by what the SET clause writes (the WHERE clause may name another status)
  const sets = (sql.match(/SET (.*?) WHERE/s) ?? [])[1] ?? '';
  if (/status = 'cancelled'/.test(sets)) r.status = 'cancelled';
  else if (/status = 'order_pending'/.test(sets)) { r.entry = a[0]; r.sl = a[1]; r.tp = a[2]; r.status = 'order_pending'; }
  else if (/status = 'awaiting_order'/.test(sets)) { r.order_side = a[0]; r.status = 'awaiting_order'; }
  else if (/status = 'new'/.test(sets)) { r.low = a[0]; r.high = a[1]; r.status = 'new'; }
  return { rowCount: 1, rows: [{ symbol: r.symbol }] };
};

(async () => {
  const L = await import('./levelWatchPress');
  console.log('\n/level — the markets\n');
  const menu = L.levelMenu(ME);
  const buttons = menu.keyboard?.inline_keyboard.flat().map((b: any) => b.callback_data);
  check('/level from him → six market buttons', buttons,
        ['lw:p:EURUSD', 'lw:p:GBPUSD', 'lw:p:USDJPY', 'lw:p:GBPJPY', 'lw:p:XAUUSD', 'lw:p:BTCUSD']);
  check('/level from anyone else → refused, no buttons', [L.levelMenu(STRANGER).text, L.levelMenu(STRANGER).keyboard],
        ['🚫 Only the account owner can use this.', undefined]);

  console.log('\nHIS LEVEL\n');
  const p = await L.recordLevelPress('lw:p:XAUUSD', ME, ME, fake);
  check('tapping XAU/USD → a watch row is made and he is asked for the price', [rows[ID]?.symbol, rows[ID]?.status, !!p?.ask],
        ['XAU/USD', 'awaiting_level', true]);
  const GROUP = -100555;
  await L.recordLevelPress('lw:p:XAUUSD', ME, GROUP, fake);
  check('/level used in a GROUP → the watch is written for HIS DM, not the group (his ruling: DM only)',
        (rows[ID] as any).chat, '7615035273');
  check('a market that is not live → refused', (await L.recordLevelPress('lw:p:AUDUSD', ME, ME, fake))?.text,
        '⚠️ That market is not watched — use /level again.');
  check('a stranger tapping a market → refused, nothing written',
        [(await L.recordLevelPress('lw:p:EURUSD', STRANGER, STRANGER, fake))?.text, Object.keys(rows).length],
        ['🚫 Only the account owner can use this.', 1]);
  rows[ID].prompt_id = 500;
  check('a reply that is not a price → told, nothing changes',
        [(await L.recordLevelReply(500, 'soon', ME, fake))?.startsWith('⚠️'), rows[ID].status], [true, 'awaiting_level']);
  await L.recordLevelReply(500, '3730.00 3725.50', ME, fake);
  check('a RANGE typed high-first → stored low→high, ready for the engine', [rows[ID].low, rows[ID].high, rows[ID].status],
        [3725.5, 3730, 'new']);
  rows[ID].status = 'awaiting_level';
  await L.recordLevelReply(500, '3728.25', ME, fake);
  check('a single price → low = high', [rows[ID].low, rows[ID].high], [3728.25, 3728.25]);
  check('a reply to some OTHER message → not ours (null)', await L.recordLevelReply(999, '1.1', ME, fake), null);

  console.log('\nTHE LEVEL WAS REACHED — his order\n');
  rows[ID].status = 'watching';
  check('Buy stop before the level is reached → refused', (await L.recordLevelPress(`lw:b:${ID}`, ME, ME, fake))?.text,
        '⚠️ This level is no longer waiting for an order (already placed, or stopped).');
  rows[ID].status = 'hit';
  const b = await L.recordLevelPress(`lw:b:${ID}`, ME, ME, fake);
  check('Buy stop after the hit → asked for entry, stop and optional target', [rows[ID].status, rows[ID].order_side, !!b?.ask],
        ['awaiting_order', 'buy', true]);
  rows[ID].prompt_id = 600;
  check('BUY with the stop ABOVE the entry → refused before anything is written',
        [(await L.recordLevelReply(600, '3733 3735', ME, fake))?.includes('BELOW'), rows[ID].status], [true, 'awaiting_order']);
  check('BUY with the target BELOW the entry → refused',
        (await L.recordLevelReply(600, '3733 3727.5 3720', ME, fake))?.includes('ABOVE'), true);
  const ok = await L.recordLevelReply(600, '3733.00 3727.50', ME, fake);
  check('entry + stop, NO target → accepted, target left empty (his to set)',
        [rows[ID].entry, rows[ID].sl, rows[ID].tp, rows[ID].status, ok?.includes('no target')],
        [3733, 3727.5, null, 'order_pending', true]);
  check('a stranger answering → refused', (rows[ID].status = 'awaiting_order', await L.recordLevelReply(600, '3733 3727', STRANGER, fake)),
        '🚫 Only the account owner can use this.');
  rows[ID].order_side = 'sell';
  await L.recordLevelReply(600, '3727 3732.5 3716', ME, fake);
  check('a SELL with stop above and target below → accepted with the target', [rows[ID].entry, rows[ID].sl, rows[ID].tp],
        [3727, 3732.5, 3716]);

  console.log('\n❌ STOP WATCHING\n');
  rows[ID].status = 'watching';
  check('stop watching an open watch → cancelled', [(await L.recordLevelPress(`lw:x:${ID}`, ME, ME, fake))?.text, rows[ID].status],
        ['❌ <b>STOPPED WATCHING</b> XAU/USD.', 'cancelled']);
  rows[ID].status = 'placed';
  check('stop watching after the order was placed → changes nothing', [(await L.recordLevelPress(`lw:x:${ID}`, ME, ME, fake))?.text, rows[ID].status],
        ['⚠️ That watch has already ended.', 'placed']);
  check('someone else\'s button data (another feature) → not ours (null)', await L.recordLevelPress(`ta:c:${ID}`, ME, ME, fake), null);

  console.log(`\n${failed ? `${failed} of ${total} FAILED` : 'ALL PASS'} (${total} checks)`);
  process.exit(failed ? 1 : 0);
})();
