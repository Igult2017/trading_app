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
const TEST_ID = '0f0f0f0f-1111-2222-3333-444455556666';
let pending = new Set([ID]);
const tests = new Set([TEST_ID]);
const statusOf: Record<string, string> = {};
const fakeQuery: any = async (sql: string, args: unknown[]) => {
  asked.push({ sql, args });
  if (/^\s*SELECT/i.test(sql)) return { rowCount: 1, rows: [{ status: statusOf[args[0] as string] ?? 'confirmed' }] };
  const [status, id] = args as [string, string];
  if (pending.has(id)) { pending.delete(id); return { rowCount: 1, rows: [{ is_test: tests.has(id) }] }; }
  return { rowCount: 0, rows: [] };
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

  // AUDIT FIXES (16 Nov 2026): a late press says WHY; a TEST card is recognised.
  pending = new Set();                       // the offer is no longer pending
  statusOf[ID] = 'expired';
  check('a press on an offer that EXPIRED unanswered → "expired", not "already answered"',
        await recordPress(`tc:y:${ID}`, 7615035273, fakeQuery), 'expired');
  statusOf[ID] = 'placed';
  check('...while one already acted on is still "already answered"',
        await recordPress(`tc:y:${ID}`, 7615035273, fakeQuery), 'already-answered');
  pending = new Set([TEST_ID]);
  check('Confirm on a TEST card → test-confirmed', await recordPress(`tc:y:${TEST_ID}`, 7615035273, fakeQuery), 'test-confirmed');
  pending = new Set([TEST_ID]);
  check('Reject on a TEST card → test-rejected', await recordPress(`tc:n:${TEST_ID}`, 7615035273, fakeQuery), 'test-rejected');

  // THE LISTENER NEVER STOPS FOR GOOD AND NEVER DROPS A WAITING PRESS (read from the source).
  const { readFileSync } = await import('fs');
  const tn = readFileSync(new URL('./telegramNotification.ts', import.meta.url), 'utf8');
  check('no "send-only mode" give-up left', /send-only mode/.test(tn), false);
  check('waiting updates are never dropped', /drop_pending_updates:\s*true/.test(tn), false);
  check('a button press counts as "listening" too', /on\('callback_query', listening\)/.test(tn), true);
  check('TEETH — a network failure retries instead of stopping', /EFATAL[\s\S]{0,80}onPollingFailure/.test(tn), true);
  // THE ROOT CAUSE FOUND BY HIS LIVE TEST CARD: a plain array was never read by Telegram, so presses
  // were never delivered. The list must go as a JSON string that includes callback_query.
  check('TEETH — button presses are subscribed as a JSON string Telegram can read',
        /allowed_updates:\s*JSON\.stringify\(\[[^\]]*'callback_query'[^\]]*\]\)/.test(tn), true);

  const saved = process.env.WATCHDOG_CHAT_ID;
  process.env.WATCHDOG_CHAT_ID = '';
  check('TEETH — with no owner configured, NOBODY can answer', await recordPress(`tc:y:${ID}`, 7615035273, fakeQuery), 'not-allowed');
  process.env.WATCHDOG_CHAT_ID = saved;

  console.log(`\n${failed ? `${failed} of ${total} FAILED` : `ALL PASS (${total} checks)`}\n`);
  process.exit(failed ? 1 : 0);
})();
