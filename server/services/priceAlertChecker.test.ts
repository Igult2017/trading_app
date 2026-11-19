/**
 * priceAlertChecker.test.ts — run with:
 *     npx tsx server/services/priceAlertChecker.test.ts
 *
 * WHERE A TRIGGERED WEBSITE PRICE ALERT GOES (his ruling, 19 Nov 2026): "The one in the website should send alerts of
 * price levels to the channel." One post to the public channel — never the subscriber fan-out it used to be (OPEN C16).
 */
process.env.DATABASE_URL ||= 'postgresql://x/x';
delete process.env.TELEGRAM_BOT_TOKEN;          // the real bot must never start in a test

let failed = 0, total = 0;
function check(name: string, got: unknown, want: unknown) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`);
}

(async () => {
  const { deliverAlert } = await import('./priceAlertChecker');
  const calls: string[] = [];
  const svc = {
    async sendToChannel(m: string) { calls.push('channel'); return true; },
    async broadcastMessage(m: string) { calls.push('broadcast'); return { sent: 9, failed: 0 }; },
    async sendMessage(chat: string, m: string) { calls.push(`dm:${chat}`); return true; },
  };
  console.log('\nWEBSITE PRICE ALERT — where it goes\n');
  check('a triggered alert → ONE post to the channel, never the subscriber broadcast, never a DM',
        [await deliverAlert('🔔 XAU/USD rose above 3730', svc), calls], [true, ['channel']]);
  const failing = { async sendToChannel() { return false; } };
  check('the channel post fails → reported as not delivered (logged by the checker)', await deliverAlert('x', failing), false);
  check('no Telegram service at all → not delivered, nothing thrown', await deliverAlert('x', null), false);
  console.log(`\n${failed ? `${failed} of ${total} FAILED` : 'ALL PASS'} (${total} checks)`);
  process.exit(failed ? 1 : 0);
})();
