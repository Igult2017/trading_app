/**
 * The words that go out to subscribers on a market open. Separated from `marketSessionAlerts`
 * so the COPY can be edited without touching the scheduling logic, and so the scheduler stays
 * under the 150-line limit.
 *
 * Written by the user, 2026-08-03. Three obvious typos in the original were corrected — "Hellow"
 * -> "Hello", "lets home" -> "let's hope", "financial advise" -> "financial advice" — because this
 * is customer-facing copy sent to every subscriber. Nothing else was reworded.
 *
 * THE RISK DISCLAIMER IS NOT DECORATION. Every one of these messages carries, in the user's own
 * words, that Trade&Journal does not offer financial advice, is not liable for losses, and that
 * position size stays at 1-2% of the account. Do not trim it to shorten a message: it is the part
 * that matters most on a channel that publishes trade signals.
 */

/** Markdown-escape the few characters Telegram's legacy parser treats as syntax. */
const esc = (s: string) => s.replace(/([_*\[\]`])/g, '\\$1');

const RISK_LINE =
  `Even as we wait, Trade&Journal does not encourage gambling but professional trading with ` +
  `proper risk management. *1 to 2% of your account is the rule.*`;

const DISCLAIMER =
  `Otherwise we wish you happy trading, and remember: Trade&Journal does not offer financial ` +
  `advice and is not liable for losses you incur.`;

/**
 * Monday's welcome — the week is about to open.
 * `minutes` is computed from the real schedule, never hardcoded, so the text stays true if
 * PREOPEN_ALERT_MINS changes.
 */
export function weekOpenMessage(minutes: number): string {
  return (
    `👋 *Hello fellow traders!*\n\n` +
    `I hope your weekend was fantastic, and welcome back for another dollar another day. ` +
    `The market will open in *${minutes} minutes*, and so let's hope our agents *VIX.1* and ` +
    `*BX-S/D* will find us great opportunities to grow our portfolios.\n\n` +
    `${RISK_LINE}\n\n` +
    `${DISCLAIMER}\n\n` +
    `Happy trading week, and trade responsibly! 📈`
  );
}

/**
 * London / New York session opens — the same voice and the same risk rule, sized for a message
 * that arrives several times a week rather than once.
 */
export function sessionOpenMessage(session: string, minutes: number, openUTC: number): string {
  const hh = String(openUTC).padStart(2, '0');
  const flavour =
    session === 'London'
      ? `London brings the first real volume of the day — spreads tighten and the moves get honest.`
      : `New York overlaps London for the next few hours, which is the busiest window of the day.`;
  return (
    `🔔 *${esc(session)} session opens in ${minutes} minutes*\n\n` +
    `${flavour} It opens at ${hh}:00 UTC.\n\n` +
    `*VIX.1* and *BX-S/D* are scanning. If a setup qualifies you will get the building alert ` +
    `first, then the ready entry — never trade the first card.\n\n` +
    `${RISK_LINE}\n\n` +
    `${DISCLAIMER}\n\n` +
    `Trade responsibly. 📈`
  );
}

/** Friday's close — the same disclaimer, because the channel is still publishing. */
export function weekCloseMessage(closeUTC: number, reopen: string): string {
  return (
    `🔴 *Markets closed for the weekend*\n\n` +
    `Forex closed at ${closeUTC}:00 UTC. No signals will fire until it reopens.\n\n` +
    `🔔 Reopens ${esc(reopen)} (Sydney open).\n\n` +
    `Use the break to journal the week — the trades you review are the ones you stop repeating.\n\n` +
    `${DISCLAIMER}\n\n` +
    `Enjoy the weekend! 🌤️`
  );
}
