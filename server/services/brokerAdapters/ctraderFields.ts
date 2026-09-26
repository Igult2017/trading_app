/**
 * READING cTRADER'S OWN FIELDS — the four conversions every other cTrader module needs.
 *
 * They lived as private helpers inside `ctrader.ts` until 2026-09-26, when the position aggregation
 * (`ctraderPositions.ts`) needed the same four. Copying them would have been how the two halves
 * start disagreeing about what a volume or a commission means, which is the class of defect this
 * adapter has already shipped twice: a status compared against the integer 2 when the gateway sends
 * the NAME, and a volume divided by 100 and called lots.
 *
 * Nothing here decides anything about a trade. It converts what the broker said.
 */

/** A deal the broker says actually filled. `dealStatus` arrives as the NAME on this gateway. */
export function isFilled(d: any): boolean {
  const s = d?.dealStatus;
  return s === 2 || s === '2' || String(s).toUpperCase() === 'FILLED';
}

/** Deals whose position is USD-quoted, so (close − entry) × units IS the P&L in account currency. */
export function usdQuoted(symbol: string): boolean {
  return /USD$/i.test(symbol.replace(/[^A-Za-z]/g, ''));
}

/** Money fields are integers scaled by `moneyDigits`, which the broker states per record.
 *
 * It defaults to 2 — hundredths, the near-universal case — but it is stated for a reason and an
 * account whose currency scales differently would have every commission and swap out by a factor of
 * ten or a hundred if the divisor were hardcoded. `ProtoOADeal` and `ProtoOAPosition` both carry it.
 */
export function money(raw: unknown, digits: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const d = Number(digits);
  return n / Math.pow(10, Number.isFinite(d) && d >= 0 ? d : 2);
}

/** Units of the base asset in one lot.
 *
 * NOT A GUESS AND NOT UNIVERSAL: a currency lot is 100,000 units, a metals lot is 100 ounces. The
 * broker states this per symbol (`ProtoOASymbol.lotSize`) but the symbol list this adapter fetches
 * (`ProtoOALightSymbol`) does not carry it — the same gap that made autotrade size gold 1,000x too
 * large. Only `lots` on the journal row depends on this; prices, times and P&L do not.
 */
export function lotUnits(symbol: string): number {
  return /^(XAU|XAG|XPT|XPD)/i.test(symbol.replace(/[^A-Za-z]/g, '')) ? 100 : 100_000;
}

/** The volume a deal filled, in the broker's own cents of the base unit. */
export function dealVolume(d: any): number {
  const n = Number(d?.filledVolume ?? d?.volume ?? 0);
  return Number.isFinite(n) ? n : 0;
}
