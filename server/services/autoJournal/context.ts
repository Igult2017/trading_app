/**
 * WHAT ELSE THE BROKER'S OWN DATA ALREADY TELLS US ABOUT A TRADE.
 *
 * His instruction, 2026-09-05: *"Borrow whatever you can borrow from manual journal entry logic so
 * long as it does not break the manual journal entry... Build the remaining parts of metrics data
 * points."*
 *
 * NOTHING HERE IS INVENTED. Every value is either read from a table we already fill, or produced by
 * the SAME rule his own journal form uses, quoted at the point of use. Where neither applies the
 * field is left blank — a blank is honest and a guess is not, and the metrics page already knows how
 * to show a blank.
 *
 * The isolation rule of this folder still holds: `JournalForm.tsx` and the manual endpoint are READ
 * and copied, never edited.
 */
import { db } from '../../db';
import { autotradeOrders, tradingSignals, economicEvents } from '../../../shared/schema';
import type { SyncedTrade } from '../../../shared/schema';
import { and, eq, desc, gte, lte } from 'drizzle-orm';

export interface TradeContext {
  /** What placed it, and on which timeframes. Blank for a trade he opened at the broker himself. */
  strategy?: string;
  entryTF?: string;
  analysisTF?: string;
  contextTF?: string;
  /** "Rule-based" only when the platform placed and managed it. */
  managementType?: string;
  /** The levels the STRATEGY asked for, against which the fill is measured. */
  plannedEntry?: string;
  plannedSL?: string;
  plannedTP?: string;
}

/**
 * WHAT PLACED THIS TRADE, for a trade autotrade opened. Empty for one he placed by hand.
 *
 * His report, 2026-09-03: *"some details of trades autosynced are not recorded there."* The metrics
 * page groups by strategy and by entry timeframe, and a synced trade had neither, so every one sat
 * in an "Unknown" bucket beside his typed trades.
 *
 * THE JOIN IS EXACT, not a guess: the position's OPENING deal carries the id of the order that
 * opened it, autotrade recorded that same id when it placed, and the order row carries the signal.
 *
 *     synced_trades.entry_order_id -> autotrade_orders.order_id -> .strategy
 *                                                              -> .signal_id -> trading_signals
 *
 * NEVER RAISES and never blocks the journal entry. A trade with no strategy is still a trade; the
 * fields are simply left blank, which is what a hand-placed trade correctly looks like.
 */
export async function contextFor(trade: SyncedTrade): Promise<TradeContext> {
  if (!trade.entryOrderId) return {};
  try {
    const [order] = await db.select().from(autotradeOrders)
      .where(eq(autotradeOrders.orderId, String(trade.entryOrderId)))
      .orderBy(desc(autotradeOrders.placedAt)).limit(1);
    if (!order) return {};

    const out: TradeContext = {};
    if (order.strategy) out.strategy = order.strategy;
    // THE PLATFORM PLACED IT AND THE LADDER MANAGED IT, so it was rule-based by construction. His
    // form offers Rule-based / Discretionary / Hybrid (`JournalForm.tsx:817`); only the first can be
    // known from here, and a trade he opened himself gets no value at all rather than a guess.
    out.managementType = 'Rule-based';
    // THE LEVELS THE STRATEGY ASKED FOR. `metrics_calculator.py:574-576` derives the entry, stop and
    // target deviations from `plannedX` vs `actualX` in `manualFields` — the same pair of fields his
    // form fills by hand — so writing these fills the Execution Metrics panel with no new column
    // and no new Python.
    if (order.entryPrice != null) out.plannedEntry = String(order.entryPrice);
    if (order.stopLoss   != null) out.plannedSL    = String(order.stopLoss);
    if (order.takeProfit != null) out.plannedTP    = String(order.takeProfit);

    if (order.signalId) {
      const [sig] = await db.select().from(tradingSignals)
        .where(eq(tradingSignals.id, order.signalId)).limit(1);
      // THE TIMEFRAME THE ENTRY WAS TAKEN ON — `executionTimeframe` is that by definition; the
      // primary one is the timeframe the setup was READ on, which is a different question and
      // belongs in `analysisTF`.
      if (sig?.executionTimeframe)    out.entryTF    = sig.executionTimeframe;
      // THE OTHER TWO WERE BEING THROWN AWAY (logged as D24 in docs/OPEN.md). The signal knows
      // exactly what it read; the timeframe panel had nothing to show for any automatic trade.
      if (sig?.primaryTimeframe)      out.analysisTF = sig.primaryTimeframe;
      if (sig?.confirmationTimeframe) out.contextTF  = sig.confirmationTimeframe;
    }
    return out;
  } catch (err: any) {
    console.warn(`[autoJournal] could not look up what placed ${trade.externalId}: `
                 + `${err?.message ?? err}`);
    return {};
  }
}

/**
 * THE MARKET READ, taken from the direction — which is exactly what his own form does.
 *
 * `JournalForm.tsx:840-847` pre-fills all three of these from the trade's direction the moment it is
 * set: a Long becomes "Bullish"/"Bullish"/"Bull", and he overrides it if the market said otherwise.
 * That pre-fill is why his typed trades carry a market regime and every synced one was blank, which
 * is what made the metrics page's Market Regime, HTF Bias and Strategy × Regime panels empty.
 *
 * It is a STARTING POSITION, not a verdict, in both pipelines. Any correction he makes in the Trade
 * Vault is pinned by the hand-edit lock and the sync will never put this back over it.
 */
export function marketContextFor(direction: string | null | undefined):
    { marketRegime: string; trendDirection: string; htfBias: string } | undefined {
  const d = String(direction ?? '').toLowerCase();
  if (d !== 'long' && d !== 'short') return undefined;   // nothing to read it from
  const bull = d === 'long';
  return {
    marketRegime:   bull ? 'Bullish' : 'Bearish',
    trendDirection: bull ? 'Bullish' : 'Bearish',
    htfBias:        bull ? 'Bull'    : 'Bear',
  };
}

/** The two currencies a pair is quoted in. Empty for anything that is not a clean six-letter pair. */
function currenciesOf(symbol: string): string[] {
  const s = String(symbol ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return s.length === 6 ? [s.slice(0, 3), s.slice(3)] : [];
}

const NEWS_WINDOW_MIN = 60;

export interface NewsRow { currency: string | null; impact: string | null; when: Date | string }

/**
 * The verdict, separated from the query so the rule can be driven directly by a test.
 *
 * `rows` is EVERY event the calendar holds for that DAY, not just the matching ones — because the
 * empty case is the one that matters. See the coverage note on `newsEnvironmentAt`.
 */
export function classifyNews(rows: NewsRow[], at: Date, currencies: string[]):
    'Major' | 'Minor' | 'Clear' | undefined {
  if (!rows.length) return undefined;          // no coverage — a blank, not a claim

  const from = at.getTime() - NEWS_WINDOW_MIN * 60_000;
  const to   = at.getTime() + NEWS_WINDOW_MIN * 60_000;
  const near = rows.filter(r => {
    const t = new Date(r.when as any).getTime();
    return t >= from && t <= to && currencies.includes(String(r.currency ?? '').toUpperCase());
  });

  // The scrapers disagree about case — `['High','Medium']` in cacheService, `'high'` in scheduler —
  // so the match folds it rather than trusting either.
  if (near.some(r => /high/i.test(String(r.impact ?? '')))) return 'Major';
  return near.length ? 'Minor' : 'Clear';
}

/**
 * WHAT THE CALENDAR WAS DOING WHEN HE ENTERED — "Major", "Minor" or "Clear".
 *
 * The three values are his form's own (`JournalForm.tsx:879`, News Environment), and the metrics
 * engine reads that field under either name (`metrics_calculator.py:133-134`), so no mapping is
 * needed. We already scrape the calendar into `economic_events`, and the scraper only deletes
 * FUTURE rows before re-inserting (`cacheService.ts:78`), so past events survive.
 *
 * THE COVERAGE GUARD IS THE WHOLE POINT. If the calendar holds nothing at all for that day we
 * cannot tell "no events" from "we never scraped that day", and writing "Clear" would turn a gap in
 * our data into a claim about his trade. It returns undefined instead, and the field stays blank.
 *
 * NEVER RAISES — a calendar lookup must not be able to stop a trade being journaled.
 */
export async function newsEnvironmentAt(symbol: string, at: Date | null | undefined):
    Promise<'Major' | 'Minor' | 'Clear' | undefined> {
  if (!at) return undefined;
  const ccy = currenciesOf(symbol);
  if (!ccy.length) return undefined;

  try {
    const dayFrom = new Date(at); dayFrom.setUTCHours(0, 0, 0, 0);
    const dayTo   = new Date(at); dayTo.setUTCHours(23, 59, 59, 999);
    const rows = await db.select({
        currency: economicEvents.currency,
        impact:   economicEvents.impactLevel,
        when:     economicEvents.eventTime,
      }).from(economicEvents)
      .where(and(gte(economicEvents.eventTime, dayFrom), lte(economicEvents.eventTime, dayTo)));

    return classifyNews(rows as NewsRow[], at, ccy);
  } catch (err: any) {
    console.warn(`[autoJournal] news lookup failed for ${symbol}: ${err?.message ?? err}`);
    return undefined;
  }
}
