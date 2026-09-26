/**
 * ONE POSITION IS ONE TRADE — however many times it was scaled out of.
 *
 * HIS REPORT, 2026-09-26: *"Auto sync journal has a gap. In one trade, if i took profit at different
 * points, it is recording each profit taken as an individual trade. It should record one order as an
 * order after the whole order has been closed not recording each take profit as a seperate order."*
 *
 * HE IS RIGHT, AND IT WAS TWO DEFECTS WITH ONE SYMPTOM. A cTrader position that is scaled out of
 * produces one opening deal and SEVERAL closing deals — one per partial. Every deal has its own
 * `dealId`, and `dealId` is what both routes into the journal used as the `externalId` that
 * `processIncomingTrades` de-duplicates on. So three take-profits became three externalIds, three
 * `synced_trades` rows and three journal entries for ONE trade:
 *
 *   - the 15-minute sweep: `pairDealsIntoTrades` grouped by position correctly, but took the LAST
 *     deal as "the close" and asked nothing about whether the position was finished. After the first
 *     partial it emitted a trade keyed on that partial's id, sized at that partial's volume; after
 *     the second it emitted ANOTHER, keyed on the second id. And `mergeDealMappings` then ran
 *     `mapClosedDeal` over every deal individually, which on this gateway (its deals DO carry
 *     `closePositionDetail` — measured 02 Sep) minted a standalone trade per partial as well.
 *   - the live feed: `mapClosedFromEvent` treated ANY deal on the opposite side as a close. A
 *     partial take-profit is exactly that, so each one was recorded the instant it filled.
 *
 * WHAT THIS MODULE DOES INSTEAD. It reads a position's deals TOGETHER and emits nothing until the
 * volume closed equals the volume opened. Then one trade comes out, carrying:
 *
 *   entry   the volume-weighted average of the OPENING deals (so a scale-IN is one trade too)
 *   exit    the volume-weighted average of the CLOSING deals — what the money actually came out at
 *   lots    the WHOLE position, not the last slice
 *   opened  the first opening deal's timestamp;  closed  the LAST closing deal's timestamp
 *   profit  summed leg by leg, which is exact — rounding the average exit first would not be
 *   exits   every partial, in order, so the ladder is not lost: price, volume, time and deal id
 *
 * THE externalId IS STILL THE FINAL CLOSING DEAL'S ID. That is deliberate and it is what makes this
 * change safe to deploy on live data: for a position closed in ONE deal it is byte-for-byte the id
 * the old code produced, so nothing already stored is orphaned or duplicated. For a scaled-out
 * position the id is only ever minted once the position is finished, so it cannot change under a
 * later sync the way the old one did.
 *
 * THE WINDOW MATTERS AND IS RESPECTED. A sweep fetches a time window, so it can see a position's
 * closing deals while its OPENING deal sits before the window. That is not a fully-closed position,
 * it is a partial view of one, and emitting it would invent a trade with no entry. The volumes not
 * balancing is exactly what says so, and the hourly deep sweep (a week back) is what eventually
 * brings both ends into one window. This is the same protection the old `group.length < 2` gave.
 */
import type { RawBrokerTrade } from '../brokerSyncService';
import { isFilled, usdQuoted, money, lotUnits, dealVolume as vol } from './ctraderFields';

/** One realised slice of a position — a partial take-profit, or the final exit. */
export interface PositionExit {
  dealId: string;
  price:  number;
  lots?:  number;
  /** The broker's own cents-of-base-unit figure, kept unconverted so nothing is lost. */
  volume: number;
  at?:    number;
  /** The broker's own gross profit for this slice, where it sent one. */
  profit?: number;
}

/**
 * HOW CLOSE THE TWO VOLUMES MUST BE TO CALL THE POSITION FINISHED.
 *
 * cTrader states volume as an INTEGER number of cents of the base unit, so a genuine full close
 * balances exactly and this could be `=== 0`. One cent of tolerance costs nothing and means a broker
 * that reports a fractional volume cannot leave a finished position permanently unrecorded — which
 * is the failure that would be invisible, because its symptom is silence.
 */
const VOLUME_EPSILON = 1;

/** Prices are stored in `decimal(12,5)`, so a weighted average is rounded to what the column holds. */
function price5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/**
 * Every position in this batch of deals, whether finished or not.
 *
 * Exported for the diagnostics the sweep logs — knowing that a position is still 30% open is the
 * difference between "the sync is broken" and "the trade is not over yet", and on 02 Sep not being
 * able to tell those apart cost four deploys.
 */
export interface PositionView {
  positionId:   string;
  long:         boolean;
  symbol:       string;
  opens:        any[];
  closes:       any[];
  openVolume:   number;
  closedVolume: number;
  fullyClosed:  boolean;
}

export function viewPositions(deals: any[], symbolMap: Record<number, string>): PositionView[] {
  const byPosition = new Map<string, any[]>();
  for (const d of deals ?? []) {
    if (!isFilled(d) || d?.positionId == null) continue;
    const k = String(d.positionId);
    const list = byPosition.get(k);
    if (list) list.push(d); else byPosition.set(k, [d]);
  }

  const out: PositionView[] = [];
  for (const [positionId, group] of byPosition) {
    group.sort((a, b) => Number(a.executionTimestamp ?? 0) - Number(b.executionTimestamp ?? 0));
    // THE POSITION'S SIDE IS THE EARLIEST DEAL'S SIDE. Everything on that side added to the
    // position; everything on the other side took money out of it. That is the only distinction the
    // aggregation needs, and it holds for a scale-in as well as a scale-out.
    const first = group[0];
    const openSide = String(first.tradeSide ?? '').toUpperCase();
    const long = openSide === 'BUY' || first.tradeSide === 1;
    const sameSide = (d: any) => {
      const s = String(d.tradeSide ?? '').toUpperCase();
      return s === openSide || (openSide === '' && d.tradeSide === first.tradeSide);
    };
    const opens  = group.filter(sameSide);
    const closes = group.filter(d => !sameSide(d));
    const openVolume   = opens.reduce((a, d) => a + vol(d), 0);
    const closedVolume = closes.reduce((a, d) => a + vol(d), 0);
    out.push({
      positionId, long,
      symbol: symbolMap[first.symbolId] ?? String(first.symbolId),
      opens, closes, openVolume, closedVolume,
      // BOTH ENDS MUST BE IN VIEW. Closing deals with no opening deal is a window that starts after
      // the position was opened, not a trade — see the note at the top of this file.
      fullyClosed: opens.length > 0 && closes.length > 0 && closedVolume > 0
                   && Math.abs(openVolume - closedVolume) < VOLUME_EPSILON,
    });
  }
  return out;
}

/**
 * Every FINISHED position in this batch of deals, as one trade each.
 *
 * A position still holding volume produces nothing — it is not a trade yet, and recording the
 * partial that has filled so far would put a trade in his journal that he has not finished taking.
 */
export function aggregatePositions(deals: any[], symbolMap: Record<number, string>): RawBrokerTrade[] {
  const out: RawBrokerTrade[] = [];
  for (const p of viewPositions(deals, symbolMap)) {
    if (!p.fullyClosed) continue;

    const first = p.opens[0];
    const last  = p.closes[p.closes.length - 1];
    const units = p.closedVolume / 100;

    // VOLUME-WEIGHTED, BOTH ENDS. A plain mean of the exit prices would weight a 0.1-lot scrape the
    // same as the 0.9 lots that carried the trade, and report a P&L the account never saw.
    const entryRaw = p.opens.reduce((a, d) => a + vol(d) * Number(d.executionPrice), 0) / p.openVolume;
    const exitRaw  = p.closes.reduce((a, d) => a + vol(d) * Number(d.executionPrice), 0) / p.closedVolume;

    // THE BROKER'S OWN MONEY WINS WHERE IT SENT ALL OF IT. A partial sum would understate the trade,
    // so the summed figure is used only when EVERY closing deal carried one — otherwise the arithmetic
    // below answers for the whole position or nothing does.
    const grossParts = p.closes.map(d => money(d?.closePositionDetail?.grossProfit, d?.moneyDigits));
    const brokerGross = grossParts.every(v => v !== undefined)
      ? round2(grossParts.reduce((a, v) => a + (v as number), 0)) : undefined;
    const swapParts = p.closes.map(d => money(d?.closePositionDetail?.swap, d?.moneyDigits));
    const brokerSwap = swapParts.every(v => v !== undefined)
      ? round2(swapParts.reduce((a, v) => a + (v as number), 0)) : undefined;

    // SUMMED LEG BY LEG, NOT FROM THE ROUNDED AVERAGE. `closePrice` is rounded to the five decimals
    // its column holds; multiplying that by the whole position's units would push the rounding error
    // into the money. Each leg is exact, so their sum is.
    const entry = Number.isFinite(entryRaw) ? entryRaw : undefined;
    const computed = (entry !== undefined && units > 0 && usdQuoted(p.symbol)
                      && p.closes.every(d => Number.isFinite(Number(d.executionPrice))))
      ? round2(p.closes.reduce((a, d) => {
          const legUnits = vol(d) / 100;
          const px = Number(d.executionPrice);
          return a + (p.long ? px - entry : entry - px) * legUnits;
        }, 0))
      : undefined;

    const commission = round2(
      [...p.opens, ...p.closes].reduce((a, d) => a + (money(d.commission, d.moneyDigits) ?? 0), 0));

    const exits: PositionExit[] = p.closes.map(d => ({
      dealId: String(d.dealId),
      price:  Number(d.executionPrice),
      volume: vol(d),
      lots:   vol(d) > 0 ? (vol(d) / 100) / lotUnits(p.symbol) : undefined,
      at:     d.executionTimestamp ?? undefined,
      profit: money(d?.closePositionDetail?.grossProfit, d?.moneyDigits),
    }));

    out.push({
      // KEYED ON THE FINAL CLOSING DEAL, and only minted once the position is finished — so one
      // closed position produces exactly one externalId, stable across every later sync.
      externalId: String(last.dealId),
      positionId: p.positionId,
      symbol:     p.symbol,
      direction:  p.long ? 'Long' : 'Short',
      lots:       units > 0 ? units / lotUnits(p.symbol) : undefined,
      // The broker's own average entry where it sent one (it is authoritative for a scale-in);
      // otherwise the weighted average of the opening deals, which says the same thing.
      openPrice:  pickEntry(p, entry),
      closePrice: Number.isFinite(exitRaw) ? price5(exitRaw) : undefined,
      openTime:   first.executionTimestamp ?? undefined,
      closeTime:  last.executionTimestamp  ?? undefined,
      // THE ORDER THAT OPENED THE POSITION — the join key to the risk it was placed with. A closing
      // deal's orderId is a different order (the stop or target that fired) and carries no levels.
      entryOrderId: first.orderId != null ? String(first.orderId) : undefined,
      profit:     brokerGross ?? computed,
      commission: commission || undefined,
      swap:       brokerSwap,
      comment:    last.comment,
      // WHAT HE ACTUALLY DID, kept rather than averaged away. The journal shows one trade, and this
      // is how it can still show that the one trade was taken off in three pieces.
      exits,
      closedInParts: p.closes.length,
    });
  }
  return out;
}

/** The broker's own average entry, or the weighted average of the opening deals. */
function pickEntry(p: PositionView, weighted: number | undefined): number | undefined {
  for (let i = p.closes.length - 1; i >= 0; i--) {
    const e = Number(p.closes[i]?.closePositionDetail?.entryPrice);
    if (Number.isFinite(e) && e > 0) return e;
  }
  return weighted !== undefined ? price5(weighted) : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
