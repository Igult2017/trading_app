/**
 * copyFeed.test.ts — run with: npx tsx server/lib/copyFeed.test.ts
 *
 * HIS REPORT, 22 Nov 2026: the Mirror feed showed "SELL GBPUSD 1.20 lot @ 1.30778" eight times. Rebuilt here: one SELL
 * GBPUSD 1.20 copied, its stop moved six times, then closed — EIGHT actions, which must read as ONE trade.
 */
import { foldTrades, activityLines, type CopyAction } from './copyFeed';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const T0 = Date.parse('2026-11-20T10:00:00Z');
const act = (event: string, minute: number, extra: Partial<CopyAction> = {}): CopyAction => ({
  followerId: 'f1', masterKey: '777', event, side: 'SELL', symbol: 'GBPUSD', volume: 1.2, entry: 1.30778,
  closed: null, at: new Date(T0 + minute * 60_000), ms: 3130, account: 'ctrader4', ...extra,
});
const his: CopyAction[] = [
  act('OPEN', 0, { ms: 3130 }),
  ...[1, 2, 3, 4, 5, 6].map((m) => act('MODIFY', m, { ms: 3125 })),
  act('CLOSE', 7, { closed: 1.30755, entry: null }),
];

console.log('\nTHE COPIER FEED — one row per copied trade\n');
const rows = foldTrades(his);
check('his eight actions read as ONE trade', rows.length, 1);
check('...closed, entry 1.30778 -> close 1.30755', [rows[0].status, rows[0].entry, rows[0].close], ['closed', 1.30778, 1.30755]);
check('...its six stop moves counted, not shown as trades', rows[0].stopMoves, 6);
check('...copied at 1.20 lot, in 3.13 s (the OPEN\'s delay, not a stop move\'s)', [rows[0].lot, rows[0].copyMs], [1.2, 3130]);
check('...to the follower account by name', rows[0].account, 'ctrader4');

const two = foldTrades([...his, ...his.map((a) => ({ ...a, followerId: 'f2', account: 'ctp3' }))]);
check('the same master trade copied to TWO followers -> two rows (one each)', two.map((r) => r.account).sort(), ['ctp3', 'ctrader4']);

const mixed = foldTrades([act('OPEN', 0, { masterKey: '1' }), act('OPEN', 10, { masterKey: '2' }), act('CLOSE', 20, { masterKey: '2' })]);
check('an OPEN trade is listed before a closed one', mixed.map((r) => r.status), ['open', 'closed']);
const partial = foldTrades([act('OPEN', 0), act('REDUCE', 5, { volume: 0.6 })]);
check('a partial close reads "partly closed"', partial[0].status, 'partly closed');
const pending = foldTrades([act('PLACED', 0, { masterKey: '9' }), act('CANCELLED', 3, { masterKey: '9' })]);
check('a pending order placed then cancelled -> one row, cancelled', [pending.length, pending[0].status], [1, 'cancelled']);

console.log('\nRECENT ACTIVITY — each action named for what it was\n');
const lines = activityLines(his, 3).map((l) => l.text);
check('newest first, and a close is called a close', lines[0], 'Closed GBPUSD (ctrader4)');
check('a stop move is called a stop move, not "Copied SELL"', lines[1], 'Moved the stop / target on GBPUSD (ctrader4)');
check('the copy itself still reads as a copy', activityLines(his, 8).at(-1)?.text, 'Copied SELL GBPUSD 1.20 lot (ctrader4)');

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
