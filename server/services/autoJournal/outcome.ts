/**
 * WIN, LOSS, OR A SCRATCH THAT WENT NOWHERE.
 *
 * Split out of ./fields on 2026-09-05 when that file passed 300 lines. It is a decision of its own,
 * with its own rationale, and two other functions depend on it agreeing with them about which stop
 * is the risk (see the note inside).
 */
import type { SyncedTrade } from '../../../shared/schema';

// A trade can end FLAT, and the journal has always had a word for it — the form offers Win/Loss/BE
// and both analytics engines carry a breakeven class (`metrics_calculator.BE_OUTCOMES`, whose own
// comment says omitting BE "inflates the mean" and leaves "a phantom run" in the streaks).
//
// The sync could never produce one: `netPl >= 0 ? 'WIN' : 'LOSS'` files a dead-flat trade as a WIN
// and, once costs are subtracted, files a stop-moved-to-breakeven exit as a LOSS. That matters more
// now than it used to — VIX.1's ladder moves the stop to breakeven at 0.4R, so this is the ordinary
// outcome of a managed trade, not an edge case.
//
// THE BAND IS THE TRADE'S OWN NUMBERS, NEVER A FIXED SUM. "Within $1" is breakeven on a $5,000 stop
// and a real loss on a $10 one. Two measures, whichever is larger:
//
//   the RISK band  — a twentieth of the money the stop was actually risking. Needs a recorded stop.
//   the COST band  — the round-trip commission and swap. A trade whose entire net result is smaller
//                    than what it cost to place went nowhere; that is a scratch, not a loss.
//
// THE COST BAND IS THE ONE THAT MATTERS FOR THE LADDER. A trade stopped out at its entry price moved
// zero, so the risk band collapses to nothing and commission alone would file it as a LOSS — and
// that is precisely what VIX.1 does at 0.4R, so the commonest managed outcome would have been
// mislabelled. With no stop and no costs recorded, only an exactly-flat result is called breakeven.
const BE_FRACTION_OF_RISK = 0.05;

export function classifyOutcome(netPl: number, trade: SyncedTrade): 'WIN' | 'LOSS' | 'BE' {
  const ep    = parseFloat(String(trade.openPrice  ?? ''));
  const xp    = parseFloat(String(trade.closePrice ?? ''));
  // THE ORIGINAL STOP HERE TOO — the same defect, in a second place I nearly missed. The risk band
  // below is a fraction of THE MONEY THE STOP WAS RISKING, so feeding it the CLOSING stop shrinks the
  // band to almost nothing and files a scratch as a full loss. His GBP/USD trade, driven end to end
  // through this function: with the closing stop (0.2 pips from entry) it came out LOSS at 0.08R;
  // with the original stop, the band is $2.77 against a $1.88 result and it is correctly BE — which
  // his rule then records as 0R. Same root cause as the risk numbers, one function further on.
  const sl    = parseFloat(String(trade.originalStopLoss ?? trade.stopLoss ?? ''));
  const gross = parseFloat(String(trade.profitLoss ?? ''));
  const costs = Math.abs(parseFloat(String(trade.commission ?? '0')) || 0)
              + Math.abs(parseFloat(String(trade.swap       ?? '0')) || 0);

  let band = costs;
  const moved = (Number.isFinite(ep) && Number.isFinite(xp)) ? Math.abs(xp - ep) : 0;
  if (Number.isFinite(ep) && Number.isFinite(sl) && Number.isFinite(gross) && moved > 0 && gross !== 0) {
    // What one unit of price movement was worth on this trade, times the stop distance = money risked.
    const riskMoney = Math.abs(gross / moved) * Math.abs(ep - sl);
    band = Math.max(band, riskMoney * BE_FRACTION_OF_RISK);
  }

  if (Math.abs(netPl) <= band) return 'BE';
  return netPl > 0 ? 'WIN' : 'LOSS';
}

