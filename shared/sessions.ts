/**
 * THE TRADING SESSION NAMES — one list, for everything that writes or offers one.
 *
 * ⚠ WHY THIS EXISTS. On 2026-10-26 he asked whether session recording was accurate "in the trade
 * vault and in other datapoints where it is required". It was not: the same session was being
 * stored under three different spellings depending on how the trade got in.
 *
 *   synced cTrader trades   SYDNEY · TOKYO · LONDON · NEW YORK · LONDON/NY OVERLAP
 *   the journal form        London · New York · Tokyo · Sydney · Overlap
 *   the Trade Vault editor  LONDON · NEW YORK · ASIAN · FRANKFURT
 *
 * The per-session win rate groups on the raw stored text with no tidying
 * (`server/python/metrics_calculator.py:836` is `groups[str(val)]`), so a London trade he typed and
 * a London trade from his broker counted as TWO SEPARATE SESSIONS — on the Analytics page, on the
 * Drawdown loss bars, in the timeframe metrics, and in what the Trader AI was told about his
 * performance.
 *
 * ⚠ TITLE CASE WINS, and the reason is not taste. `sessionAt` (`server/lib/forexSession.ts`)
 * returns these exact strings already, the journal form already shows them, and they are what he
 * reads on screen. The uppercase spelling existed only inside the synced-trade journaller, which
 * translated away from the shared labeller's own output and back again.
 *
 * ⚠ IT LIVES IN `shared/` BECAUSE BOTH SIDES NEED IT. The server writes the label and the browser
 * offers it in two dropdowns; a copy on each side is how the three spellings happened in the first
 * place.
 */

/** Every session a trade can be filed under. The order is the trading day's own order. */
export const SESSION_NAMES = ['Sydney', 'Tokyo', 'London', 'New York', 'Overlap'] as const;

export type SessionName = typeof SESSION_NAMES[number];

/** The phases within a session, as the journal form offers them. */
export const SESSION_PHASES = ['Open', 'Mid', 'Close'] as const;

/**
 * Every older spelling, mapped to the one that is kept.
 *
 * ⚠ THE KEYS ARE LOWERCASED ON LOOK-UP, so this holds a row per distinct NAME rather than per
 * capitalisation. `ASIAN` and `FRANKFURT` are here because the Trade Vault's editor offered them
 * and nothing else in the app ever wrote them: Asian is Tokyo's trading day under another name,
 * and Frankfurt opens an hour before London and sits inside it on every view this app has.
 */
const ALIASES: Record<string, SessionName> = {
  'sydney':             'Sydney',
  'tokyo':              'Tokyo',
  'asian':              'Tokyo',
  'asia':               'Tokyo',
  'london':             'London',
  'frankfurt':          'London',
  'new york':           'New York',
  'newyork':            'New York',
  'ny':                 'New York',
  'us':                 'New York',
  'overlap':            'Overlap',
  'london/ny overlap':  'Overlap',
  'london/ny':          'Overlap',
  'london/new york':    'Overlap',
};

/**
 * The kept spelling for whatever is stored, or null when it is not a session this app knows.
 *
 * ⚠ NULL RATHER THAN A GUESS. A value nobody recognises is left for a person to look at; inventing
 * a session for it is the same mistake as the old code filing an unknown time under SYDNEY, which
 * is being removed in the same change.
 */
export function canonicalSession(raw: string | null | undefined): SessionName | null {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[key] ?? null;
}
