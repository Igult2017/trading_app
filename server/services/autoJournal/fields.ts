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
 * and a test pins that. What IS owned here is every per-trade calculation: outcome, pips, session,
 * day, duration, and the risk numbers in ./risk.
 *
 * Both pipelines still write to `journal_entries`. They must — that table is what the journal reads,
 * and a synced trade that does not land in it is invisible, which was the original complaint.
 */
import type { InsertJournalEntry, SyncedTrade } from '../../../shared/schema';
import { sessionAt } from '../../lib/forexSession';
import { toPips } from '../../lib/pipMath';
import { computeRisk } from './risk';
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

function minutesBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 60_000);
}

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

/** Build the journal entry for one synced trade. Pure — it writes nothing. */
export function buildJournalEntry(trade: SyncedTrade, sessionId?: string | null,
                                  context?: { strategy?: string | null; entryTF?: string | null },
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
    riskReward:  risk.riskReward != null ? String(risk.riskReward) : undefined,
    achievedRR:  risk.achievedRR != null ? String(risk.achievedRR) : undefined,
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
    primaryExitReason: exitReasonFor({
      symbol: trade.symbol, entryPrice: trade.openPrice, closePrice: trade.closePrice,
      originalStopLoss: trade.originalStopLoss, originalTakeProfit: trade.originalTakeProfit,
    }),
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
    manualFields: {
      brokerTicket: trade.externalId,
      brokerAccountId: trade.brokerAccountId,
      magic: trade.magic,
      comment: trade.comment,
      autoJournaled: true,
      // Read by the metrics engine's strategyPerformance / strategyMarketMatrix breakdowns — see
      // the note above. Absent for a trade he placed by hand, which has no signal behind it.
      strategy: context?.strategy ?? undefined,
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
