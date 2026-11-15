/**
 * tradeConfirmPress.test.ts — run with:
 *     npx tsx server/services/tradeConfirmPress.test.ts
 *
 * HIS CONFIRM / REJECT PRESS on a DM-confirmation card (16 Nov 2026). The rules guarded: only his
 * account can answer; only a PENDING offer moves; the button data must match exactly; and a second
 * press changes nothing. The database is a fake that records the one UPDATE it is asked.
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
const asked: { sql: string; args: unknown[] }[] = [];
let pending = new Set([ID]);
const fakeQuery: any = async (sql: string, args: unknown[]) => {
  asked.push({ sql, args });
  const [status, id] = args as [string, string];
  if (pending.has(id)) { pending.delete(id); return { rowCount: 1, status }; }
  return { rowCount: 0 };
};

(async () => {
  const { recordPress } = await import('./tradeConfirmPress');
  console.log('\nDM CONFIRMATION — his Confirm / Reject press\n');

  check('his Confirm on a pending offer → confirmed', await recordPress(`tc:y:${ID}`, 7615035273, fakeQuery), 'confirmed');
  check('...written as status confirmed, for that offer, only while pending',
        [asked[0]?.args, /status = 'pending'/.test(asked[0]?.sql ?? '')], [['confirmed', ID], true]);
  check('a SECOND press on the same offer changes nothing', await recordPress(`tc:n:${ID}`, 7615035273, fakeQuery), 'already-answered');

  pending = new Set([ID]); asked.length = 0;
  check('someone else pressing → not allowed', await recordPress(`tc:y:${ID}`, 111, fakeQuery), 'not-allowed');
  check('...and the database is not even asked', asked.length, 0);
  check('his Reject → rejected', await recordPress(`tc:n:${ID}`, '7615035273', fakeQuery), 'rejected');

  pending = new Set([ID]); asked.length = 0;
  check('another feature\'s button is left alone', await recordPress('subscribe:yes', 7615035273, fakeQuery), 'not-ours');
  check('button data with anything extra is refused', await recordPress(`tc:y:${ID};DROP`, 7615035273, fakeQuery), 'not-ours');
  check('...and nothing was written for either', asked.length, 0);

  const saved = process.env.WATCHDOG_CHAT_ID;
  process.env.WATCHDOG_CHAT_ID = '';
  check('TEETH — with no owner configured, NOBODY can answer', await recordPress(`tc:y:${ID}`, 7615035273, fakeQuery), 'not-allowed');
  process.env.WATCHDOG_CHAT_ID = saved;

  console.log(`\n${failed ? `${failed} of ${total} FAILED` : `ALL PASS (${total} checks)`}\n`);
  process.exit(failed ? 1 : 0);
})();
