/**
 * EVERY JOURNAL FIELD FOR A TRADE THAT CAME FROM A BROKER — and nothing else touches these.
 *
 * His instruction, 2026-09-02: *"when fixing autojournal sync and entry, please make it to be a
 * separate pipeline from the manual journal entry and calculations because the manual one is working
 * fine so dont tamper with it even a bit. Just create a different pipeline for autojournaling."*
 *
 * THE ISOLATION RULE, and it is why this folder exists:
 *
 *     The automatic pipeline may CALL shared infrastructure. It must NEVER MODIFY it. Where
 *     automatic journaling needs different behaviour, it implements its own version HERE.
 *
 * So the manual endpoint (POST /api/journal/entries), `insertJournalEntrySchema` and
 * `balanceTracker.enrichTradeWithBalance` are never edited on account of anything in this folder —
 * and a test pins that. What IS owned by this folder is every per-trade calculation: the pips, the
 * session, the day and the duration here; the win/loss/scratch call in ./outcome; the R numbers in
 * ./risk; what the strategy and the calendar say in ./context.
 *
 * Both pipelines still write to `journal_entries`. They must — that table is what the journal reads,
 * and a synced trade that does not land in it is invisible, which was the original complaint.
 */
import type { InsertJournalEntry, SyncedTrade } from '../../../shared/schema';
import { sessionAt } from '../../lib/forexSession';
import { toPips } from '../../lib/pipMath';
import { computeRisk } from './risk';
import { classifyOutcome } from './outcome';
// Re-exported so every existing importer of ./fields keeps working after the split.
export { classifyOutcome } from './outcome';
import { marketContextFor, type TradeContext } from './context';
import { exitReasonFor } from './exitReason';

// ── Session detection ─────────────────────────────────────────────────────────
type SessionName = 'SYDNEY' | 'TOKYO' | 'LONDON' | 'NEW YORK' | 'LONDON/NY OVERLAP';

// DST-aware via the shared session source (same logic as the screenshot/manual
// journaller). Keeps the existing uppercase label format so stored data and
// session-grouped views stay consistent.
function detectSession(at: Date | null): { session: SessionName; phase: string } {
  const r = at ? sessionAt(at) : null;
  if (!r) return { session: 'SYDNEY', phase: 'Open' };
  const MAP: Record<string, SessionName> = {
    Sydney: 'SYDNEY', Tokyo: 'TOKYO', London: 'LONDON',
    'New York': 'NEW YORK', Overlap: 'LONDON/NY OVERLAP',
  };
  return { session: MAP[r.sessionName] ?? 'SYDNEY', phase: r.sessionPhase };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * A multiple as his journal writes it: `2` -> `"1:2"`, `-1` -> `"1:-1"`, `4.15` -> `"1:4.15"`.
 *
 * The trailing-zero trim is copied from `JournalForm.tsx:1422` so a synced row and a typed row are
 * character-for-character the same, rather than "1:2" beside "1:2.00".
 */
function asRR(multiple: number): string {
  return `1:${multiple.toFixed(2).replace(/\.?0+$/, '')}`;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 60_000);
}

/**
 * Build the journal entry for one synced trade. Pure — it writes nothing.
 *
 * `news` is passed in rather than looked up here so this stays synchronous and testable; the caller
 * fetches it once (see ./context `newsEnvironmentAt`).
 */
export function buildJournalEntry(trade: SyncedTrade, sessionId?: string | null,
                                  context?: TradeContext,
                                  news?: string,
                                 ): InsertJournalEntry {
  const openTime  = trade.openTime  ? new Date(trade.openTime)  : null;
  const closeTime = trade.closeTime ? new Date(trade.closeTime) : null;

  const pl      = parseFloat(String(trade.profitLoss ?? '0'));
  const comm    = parseFloat(String(trade.commission  ?? '0'));
  const sw      = parseFloat(String(trade.swap        ?? '0'));
  const netPl   = Math.round((pl + comm + sw) * 100) / 100;
  const outcome = classifyOutcome(netPl, trade);

  // WHEN THE OPEN TIME IS MISSING, THE CLOSE TIME IS THE HONEST SUBSTITUTE — not a default.
  // `detectSession(null)` returns SYDNEY, so journaling a trade with no open time would quietly
  // file a London trade under Sydney and corrupt the Sessions page. A trade almost always closes in
  // the same or the neighbouring session it opened in, so the close time is close to the truth
  // where a fixed default is simply wrong. The duration stays blank — that one cannot be known.
  const at = openTime ?? closeTime;
  const { session, phase } = detectSession(at);
  const dayOfWeek   = at ? DAY_NAMES[at.getDay()] : undefined;
  const tradeDuration = openTime && closeTime ? String(minutesBetween(openTime, closeTime)) : undefined;

  // PIPS COME FROM THE INSTRUMENT'S OWN PRECISION, not from how big its price happens to be. The
  // old rule (`price > 100 ? 100 : 10000`) is right for the four currency pairs by luck and wrong
  // for gold, which quotes to 2 decimals: every gold trade was recorded with TEN TIMES its pips.
  const ep = parseFloat(String(trade.openPrice  ?? '0'));
  const xp = parseFloat(String(trade.closePrice ?? '0'));
  const pips = (ep && xp)
    ? toPips(trade.direction === 'Long' ? xp - ep : ep - xp, trade.symbol)
    : undefined;

  // WHY THE TRADE ENDED, computed ONCE and used twice — the risk numbers need it (a stop-out is
  // exactly -1R rather than -1.05R once the spread is taken out of it) and the entry records it for
  // the metrics page's exit breakdown. Two calls would be two chances to drift apart.
  const exitReason = exitReasonFor({
    symbol: trade.symbol, entryPrice: trade.openPrice, closePrice: trade.closePrice,
    originalStopLoss: trade.originalStopLoss, originalTakeProfit: trade.originalTakeProfit,
  });

  // THE RISK COMES FROM THE STOP THE TRADE WAS PLACED WITH, never the one it closed on. `stopLoss`
  // below is the CLOSING stop — after the ladder moved it — so a trade taken to breakeven measured
  // its own risk as zero and recorded no R at all. See ./risk for the full account and the measured
  // example. Both stops are still stored: the original is the risk, the closing one is what the
  // ladder achieved.
  const risk = computeRisk({
    symbol: trade.symbol,
    direction: trade.direction,
    entryPrice: trade.openPrice as any,
    closePrice: trade.closePrice as any,
    originalStopLoss:   trade.originalStopLoss as any,
    originalTakeProfit: trade.originalTakeProfit as any,
    outcome,
    exitReason,
  });

  return {
    userId:      trade.userId,
    sessionId:   sessionId ?? undefined,  // links to the auto-created session for this broker account
    instrument:  trade.symbol,
    direction:   trade.direction,
    lotSize:     trade.lots ?? undefined,
    entryPrice:  trade.openPrice  ?? undefined,
    // The levels the trade was PLACED with, so the journal shows the plan and not the ladder's
    // final position. `manualFields` below keeps the closing stop, which is a different fact.
    stopLoss:    (trade.originalStopLoss   ?? trade.stopLoss)   ?? undefined,
    takeProfit:  (trade.originalTakeProfit ?? trade.takeProfit) ?? undefined,
    stopLossDistance:   risk.stopLossDistance   != null ? String(risk.stopLossDistance)   : undefined,
    takeProfitDistance: risk.takeProfitDistance != null ? String(risk.takeProfitDistance) : undefined,
    // ── THE THREE R:R FIELDS, WRITTEN THE WAY HIS OWN FORM WRITES THEM ──────────────────────
    //
    // His report, 2026-09-05: *"for autosync RR is not computed or entered accurately."* The
    // arithmetic was right; the numbers were in the wrong columns.
    //
    //   `riskReward`  is the ACHIEVED multiple — because that is what the manual form puts there
    //                 (`JournalForm.tsx:1915`, `riskReward: parseRR(f4.achievedRR)`) and what
    //                 `metrics_calculator.py` averages under the label "AVG R:R — Achieved". This
    //                 used to carry the PLANNED ratio, so his EURUSD stop-out and his GBPUSD
    //                 scratch were contributing 4.15 and 3.53 to that average.
    //   `plannedRR`   is the plan, in his `"1:4.15"` format. It was NEVER WRITTEN by this pipeline,
    //                 so every synced trade was missing from the page's Avg Planned R:R and from
    //                 its R:R-slippage figure, both of which read this column.
    //   `achievedRR`  same number as `riskReward`, in the `"1:x"` format the form uses, so the two
    //                 pipelines' rows read identically in the journal.
    //
    // `_coerce_rr` (metrics_calculator.py:322) already accepts both "1:2" and "2", so nothing on
    // the Python side changes.
    riskReward:  risk.achievedRR != null ? String(risk.achievedRR)  : undefined,
    plannedRR:   risk.plannedRR  != null ? asRR(risk.plannedRR)     : undefined,
    achievedRR:  risk.achievedRR != null ? asRR(risk.achievedRR)    : undefined,
    // EVERY TRADE MUST RECORD A RISK — the same rule and the same 1% default the manual endpoint
    // applies, so a broker trade and a typed one are weighted identically by the risk analytics.
    riskPercent: '1',
    entryTime:   openTime  ? openTime.toISOString()  : undefined,
    exitTime:    closeTime ? closeTime.toISOString() : undefined,
    dayOfWeek,
    tradeDuration,
    outcome,
    profitLoss:  String(netPl),
    commission:  trade.commission ?? undefined,
    pipsGainedLost: pips != null ? String(pips) : undefined,
    sessionName: session,
    sessionPhase: phase,
    entryTimeUTC: openTime ? openTime.toISOString() : undefined,
    // ── WHAT THE METRICS PAGE NEEDS, and never had for an automatic trade ────────────────────
    // `metrics_calculator.py` breaks trades down by strategy, exit reason, order type and entry
    // timeframe. A synced trade carried none of them, so every one landed in an "Unknown" bucket
    // beside his typed trades. His report, 2026-09-03: *"some details of trades autosynced are not
    // recorded there."* All four are knowable and none needed a new fetch.
    //
    // A trade he placed BY HAND has no signal behind it, so `strategy` and `entryTF` stay blank —
    // that is correct rather than a gap. The other two work for every synced trade.
    primaryExitReason: exitReason,
    orderType:   trade.orderType ?? undefined,
    // HOW FAR IT RAN EACH WAY while it was open, in pips. Measured live by the monitor and stored on
    // the trade — they cannot be reconstructed from a closed trade, which knows only where it began
    // and where it ended. `metrics_calculator.py` has a mae/mfe breakdown that had nothing to show.
    mae:         trade.mae ?? undefined,
    mfe:         trade.mfe ?? undefined,
    // `entryTF` and `orderType` are real columns; STRATEGY IS NOT — journal_entries has no such
    // column. The metrics engine merges `manualFields` flat into each row before mapping
    // (metrics_calculator.py, "Merge manualFields and aiExtracted JSONB blobs into the flat dict
    // first"), so a key placed in that blob is exactly as visible to it as a column would be. That
    // is also where the manual form's own strategy lands, so both paths group together.
    entryTF:     context?.entryTF ?? undefined,
    // THE OTHER TWO TIMEFRAMES AUTOTRADE ALREADY KNEW AND WAS THROWING AWAY (D24 in docs/OPEN.md).
    // The signal records what it read the setup on and what it confirmed against; the metrics page's
    // Timeframe panel and its "ATF + Session + Instrument" panel both had nothing to show without
    // them. Blank for a trade he placed by hand, which is correct — no signal, no timeframes.
    analysisTF:  context?.analysisTF ?? undefined,
    contextTF:   context?.contextTF  ?? undefined,
    manualFields: {
      brokerTicket: trade.externalId,
      brokerAccountId: trade.brokerAccountId,
      magic: trade.magic,
      comment: trade.comment,
      autoJournaled: true,
      // Read by the metrics engine's strategyPerformance / strategyMarketMatrix breakdowns — see
      // the note above. Absent for a trade he placed by hand, which has no signal behind it.
      strategy: context?.strategy ?? undefined,
      // ── THE MARKET READ, from his own form's rule ──────────────────────────────────────────
      // `JournalForm.tsx:840-847` pre-fills these three from the direction the moment it is set.
      // That is why his typed trades carry a market regime and every synced one was blank, leaving
      // the Market Regime, HTF Bias and Strategy × Regime panels empty. Same rule, same values; see
      // ./context. A correction of his is pinned by the hand-edit lock and never overwritten.
      ...(marketContextFor(trade.direction) ?? {}),
      // WHAT THE CALENDAR WAS DOING AT THE ENTRY — "Major" / "Minor" / "Clear", his form's own three
      // values. Left BLANK when we have no calendar coverage for that day rather than claiming a
      // quiet market we cannot evidence.
      newsEnvironment: news ?? undefined,
      // Rule-based only when the platform placed it. See ./context.
      managementType: context?.managementType ?? undefined,
      // ── HOW CLOSE THE FILL CAME TO THE PLAN ────────────────────────────────────────────────
      // `metrics_calculator.py:574-576` derives the entry/stop/target deviations from these exact
      // pairs, which is how his typed trades feed the Execution Metrics panel. The planned side is
      // what the strategy asked for; the actual side is what the broker gave us. That panel has
      // never had a single automatic trade in it.
      plannedEntry: context?.plannedEntry ?? undefined,
      plannedSL:    context?.plannedSL    ?? undefined,
      plannedTP:    context?.plannedTP    ?? undefined,
      actualEntry:  trade.openPrice          ?? undefined,
      actualSL:     trade.originalStopLoss   ?? undefined,
      actualTP:     trade.originalTakeProfit ?? undefined,
      // WHAT THE LADDER ACTUALLY DID, kept beside the plan rather than replacing it. The stop the
      // position closed on IS worth knowing — it says where the trade was protected to — it just is
      // not the risk that was taken.
      closingStopLoss: trade.stopLoss ?? undefined,
      entryOrderId: trade.entryOrderId ?? undefined,
      // WHICH CLOCK measured the excursions: "fix" is every 0.5s, "poll" every 30s. They are not the
      // same quality and a number whose sampling rate is unknown is worse than one that says it.
      maeMfeSource: trade.maeMfeSource ?? undefined,
    },
  };
}

/** Recompute the timing fields once a real open time is known. */
export function timingFields(trade: SyncedTrade): Partial<InsertJournalEntry> {
  if (!trade.openTime) return {};
  const openTime  = new Date(trade.openTime);
  const closeTime = trade.closeTime ? new Date(trade.closeTime) : null;
  const { session, phase } = detectSession(openTime);
  return {
    entryTime:     openTime.toISOString(),
    entryTimeUTC:  openTime.toISOString(),
    dayOfWeek:     DAY_NAMES[openTime.getDay()],
    tradeDuration: closeTime ? String(minutesBetween(openTime, closeTime)) : undefined,
    sessionName:   session,
    sessionPhase:  phase,
  };
}
