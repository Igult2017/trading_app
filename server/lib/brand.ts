/**
 * The app's name, for anything the SERVER sends out.
 *
 * WHY THIS FILE EXISTS. Renaming Trade&Journal to DailyTradeBook on 2026-10-11 turned up the name
 * written out by hand in two different Telegram disclaimers — `sessionMessages.ts` built it through
 * a local constant, and `newsAlerts.ts` had it inline and PRE-ESCAPED as "Trade&amp;Journal". The
 * second one was missed by the file list I worked from and was only caught by a full-text sweep
 * afterwards. One of them would have shipped under the old name.
 *
 * So the name is defined once, here, and both read it. A third message cannot drift.
 *
 * ⚠ THE CLIENT HAS ITS OWN, AND THAT IS NOT A DUPLICATE TO TIDY AWAY. The browser's copy lives in
 * `client/src/hooks/usePageTitle.ts` (tab titles) and `client/src/components/Brand.tsx` (the name
 * as styled text). Server code is bundled separately from client code and cannot import across
 * that line. Changing the name means changing it in those two places and this one.
 */

/** The name as a person reads it. Plain text — escape it at the point of use, not here. */
export const BRAND_NAME = 'DailyTradeBook';

/**
 * The standing risk line every outgoing Telegram message carries.
 *
 * NOT DECORATION, and do not trim it to shorten a message: on a channel that publishes trade
 * signals it is the part that matters most. HTML, because that is the parse mode these are sent
 * with — `<i>` is deliberate.
 */
export const RISK_DISCLAIMER_HTML =
  `<i>⚠️ ${BRAND_NAME} does not offer financial advice and is not liable for any losses ` +
  `you incur.</i>`;
