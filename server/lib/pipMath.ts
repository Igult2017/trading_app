/**
 * How many decimals cTrader quotes an instrument in, and therefore how big a pip is.
 *
 * WHY THIS FILE EXISTS. `brokerSyncService.autoJournalTrade` guessed the pip size from the PRICE:
 *
 *     const pipMultiplier = ep > 100 ? 100 : 10000;
 *
 * That is right for the four currency pairs by luck — EUR/USD 1.16 and GBP/USD 1.36 fall under 100
 * and want 10,000; USD/JPY 157 and GBP/JPY 212 fall over it and want 100 — and WRONG for gold, the
 * one non-currency instrument actually traded. Gold quotes to 2 decimals, so a pip is 0.10 and the
 * multiplier is 10, not 100: every gold trade recorded TEN TIMES the pips it really made.
 *
 * THE CORRECT TABLE ALREADY EXISTED — in `signal_platform/shared/pip.py`, which the signal side has
 * used since 2026-07-25. Node could not import it, so Node kept its guess. This is that table, with
 * the same corrections and the same evidence, and the two must be changed together.
 *
 * cTrader's convention: `pipDigits` is the number of PRICE decimals, and a pip is the LAST-BUT-ONE
 * decimal — so pip = 10^-(pipDigits - 1).
 */

// Sourced from the `ctrader-mcp-servers` skill's `assets/symbol_precision_table.json`, with one
// deliberate override.
//
// GOLD IS 2, NOT THE SKILL'S 3, AND THE BROKER SAID SO ITSELF — refusing a real order on
// 31 Aug 2026: "Order price = 4433.959 has more digits than symbol allows. Allowed 2 digits".
// Confirmed the same day against its live quote (XAU/USD came back as 4436.69, two decimals, while
// EUR/USD came back with five). The skill's own table calls itself a BASELINE and says to verify
// against the live response; this is that verification.
//
// XAGUSD IS LEFT AT 3 AND IS UNVERIFIED — silver is not traded here and nothing has told us its
// precision. Do not "fix" it to match gold on the assumption that metals agree; ask the broker.
const EXACT_PIP_DIGITS: Record<string, number> = {
  XAUUSD: 2, XAGUSD: 3,
  US30: 1, US500: 1, NAS100: 1, GER40: 1, UK100: 1, JP225: 1, AUS200: 1,
  USOIL: 2, UKOIL: 2, BRENT: 2, WTI: 2,
  BTCUSD: 2, ETHUSD: 2,
};

/** 'XAU/USD', 'xau_usd', 'XAUUSD' -> 'XAUUSD'. */
function key(symbol: string): string {
  return (symbol ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Number of PRICE decimals this instrument is quoted in. */
export function pipDigits(symbol: string): number {
  const k = key(symbol);
  if (k in EXACT_PIP_DIGITS) return EXACT_PIP_DIGITS[k];
  if (/^(XAU|XAG)/.test(k)) return 3;      // unverified for anything but XAUUSD, which is 2 above
  if (/^(BTC|ETH|XRP|LTC|SOL)/.test(k)) return 2;
  if (k.includes('JPY')) return 3;
  return 5;                                 // 5-digit FX (EUR/USD, GBP/USD, …)
}

/** One pip in price terms — the last-but-one decimal. */
export function pipSize(symbol: string): number {
  return Math.pow(10, -(pipDigits(symbol) - 1));
}

/**
 * Price movement -> pips, for one instrument.
 *
 * Returns undefined rather than a number when it cannot be computed, so a caller stores nothing
 * instead of storing a zero that reads like a real flat result.
 */
export function toPips(priceMove: number, symbol: string): number | undefined {
  if (!Number.isFinite(priceMove)) return undefined;
  const size = pipSize(symbol);
  if (!size) return undefined;
  return Math.round((priceMove / size) * 100) / 100;
}
