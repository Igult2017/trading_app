/**
 * The words that go out to subscribers on a market open. Separated from `marketSessionAlerts`
 * so the COPY can be edited without touching the scheduling logic, and so the scheduler stays
 * under the 150-line limit.
 *
 * Written by the user, 2026-08-03. Corrections made to the original, because this is customer-facing
 * copy sent to every subscriber:
 *   "Hellow"                     -> "Hello"
 *   "lets home"                  -> "let's hope"
 *   "financial advise"           -> "financial advice"
 *   "another dollar another day" -> "another day, another dollar"   (the set phrase, reversed)
 * Nothing else was reworded. The last one was missed on the first pass and the user caught it —
 * proofread the whole line, not the words that look misspelled.
 *
 * HTML, NOT MARKDOWN. The first version was flat prose and the user's verdict was "so plain, you
 * dint even format them to look appealing visually". Telegram's legacy Markdown gives bold and
 * italic and nothing else; HTML adds <blockquote> and <u>, which is what lets the risk rule sit in
 * its own visual block instead of reading as one more sentence. `marketSessionAlerts` sends these
 * with parse_mode 'HTML' — the two must stay in step.
 *
 * THE RISK DISCLAIMER IS NOT DECORATION. Every message carries, in the user's own words, that
 * Trade&Journal does not offer financial advice, is not liable for losses, and that position size
 * stays at 1-2%. Do not trim it to shorten a message: on a channel that publishes trade signals it
 * is the part that matters most.
 */

/** `&`, `<` and `>` are HTML syntax to Telegram. "Trade&Journal" breaks the parse without this. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BRAND = esc('Trade&Journal');
const RULE = '━━━━━━━━━━━━━━━━━━━━━';

/** The risk block and the disclaimer — identical everywhere, so they cannot drift apart. */
const RISK_BLOCK =
  `⚖️ <b>RISK RULE</b>\n` +
  `<blockquote>${BRAND} does not encourage gambling but <b>professional trading with proper ` +
  `risk management</b>.\n\n➤ <b>1–2% of your account per trade.</b> No exceptions.</blockquote>`;

const DISCLAIMER =
  `<i>⚠️ ${BRAND} does not offer financial advice and is not liable for any losses you incur. ` +
  `Trade at your own risk.</i>`;

const AGENTS =
  `🤖 <b>VIX.1</b> <i>— momentum</i>\n` +
  `🤖 <b>BX-S/D</b> <i>— supply &amp; demand</i>`;

/** Monday's welcome. `minutes` comes from the real schedule, never hardcoded. */
export function weekOpenMessage(minutes: number): string {
  return (
    `👋 <b>HELLO FELLOW TRADERS!</b>\n` +
    `${RULE}\n\n` +
    `I hope your weekend was fantastic — welcome back.\n` +
    `<b><i>Another day, another dollar.</i></b>\n\n` +
    `🕐 <b>Markets open in ${minutes} minutes</b>\n\n` +
    `Our agents are warming up:\n${AGENTS}\n\n` +
    `Let's hope they find us great opportunities to grow our portfolios. 🚀\n\n` +
    `${RULE}\n${RISK_BLOCK}\n\n` +
    `${DISCLAIMER}\n\n` +
    `✨ <b>Happy trading week — trade responsibly!</b> 📈`
  );
}

/** London / New York opens — same voice, sized for a message that arrives several times a week. */
export function sessionOpenMessage(session: string, minutes: number, openUTC: number): string {
  const hh = String(openUTC).padStart(2, '0');
  const isLondon = session === 'London';
  const flag = isLondon ? '🇬🇧' : '🇺🇸';
  const flavour = isLondon
    ? `The first real volume of the day — spreads tighten and the moves get honest.`
    : `Overlapping London for the next few hours: the busiest window of the day.`;
  return (
    `${flag} <b>${esc(session.toUpperCase())} SESSION</b>\n` +
    `${RULE}\n\n` +
    `🕐 <b>Opens in ${minutes} minutes</b> <i>(${hh}:00 UTC)</i>\n\n` +
    `${flavour}\n\n` +
    `Scanning now:\n${AGENTS}\n\n` +
    `📋 <b>How the alerts work</b>\n` +
    `<blockquote>1️⃣ <b>Setup building</b> — the higher timeframe is lining up. Watch, don't trade.\n` +
    `2️⃣ <b>Ready entry</b> — entry, stop, target and the order type. This is the one.</blockquote>\n\n` +
    `${RISK_BLOCK}\n\n` +
    `${DISCLAIMER}\n\n` +
    `📈 <b>Trade responsibly.</b>`
  );
}

/** Friday's close — the disclaimer stays, because the channel is still publishing. */
export function weekCloseMessage(closeUTC: number, reopen: string): string {
  return (
    `🔴 <b>MARKETS CLOSED</b>\n` +
    `${RULE}\n\n` +
    `Forex closed at <b>${closeUTC}:00 UTC</b>. No signals will fire until it reopens.\n\n` +
    `🔔 <b>Reopens</b> <i>${esc(reopen)}</i> (Sydney open)\n\n` +
    `📓 <b>Use the break well</b>\n` +
    `<blockquote>Journal the week while it is fresh. The trades you review are the ones you stop ` +
    `repeating.</blockquote>\n\n` +
    `${DISCLAIMER}\n\n` +
    `🌤️ <b>Enjoy the weekend!</b>`
  );
}
