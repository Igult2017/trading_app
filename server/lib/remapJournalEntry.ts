/**
 * server/lib/remapJournalEntry.ts
 * ────────────────────────────────
 * Normalises a raw journal entry row into the canonical field names
 * expected by every Python engine (metrics, drawdown, ai_engine, etc.).
 *
 * Adds aliases without removing originals — Python can find whichever
 * name is present.
 */

export function remapJournalEntry(raw: Record<string, any>): Record<string, any> {
  const out = { ...raw };

  if (out.pnl == null && out.profitLoss != null)           out.pnl              = out.profitLoss;
  if (out.rrRatio == null && out.riskReward != null)        out.rrRatio          = out.riskReward;
  if (out.timeframe == null && out.entryTF != null)         out.timeframe        = out.entryTF;
  if (out.analysisTimeframe == null && out.analysisTF != null) out.analysisTimeframe = out.analysisTF;
  if (out.contextTimeframe == null && out.contextTF != null)   out.contextTimeframe  = out.contextTF;
  if (out.session == null && out.sessionName != null)       out.session          = out.sessionName;
  if (out.exitReason == null && out.primaryExitReason != null) out.exitReason    = out.primaryExitReason;
  if (out.slDistance == null && out.stopLossDistance != null)  out.slDistance    = out.stopLossDistance;
  if (out.tpDistance == null && out.takeProfitDistance != null) out.tpDistance   = out.takeProfitDistance;

  if (out.openedAt == null) {
    out.openedAt = out.entryTime ?? out.entryTimeUTC ?? out.entry_time ?? out.entry_time_utc ?? null;
  }
  if (out.closedAt == null) {
    out.closedAt = out.exitTime ?? out.exit_time ?? null;
  }
  if (out.tradeDate == null) {
    out.tradeDate = out.openedAt ?? out.createdAt ?? null;
  }

  if (!out.tradeDuration) {
    const entry = out.openedAt ?? out.entryTime ?? null;
    const exit  = out.closedAt ?? out.exitTime  ?? null;
    if (entry && exit) {
      try {
        const diffMs = new Date(exit).getTime() - new Date(entry).getTime();
        if (diffMs > 0) out.tradeDuration = String(Math.round(diffMs / 60_000));
      } catch { /* unparseable dates */ }
    }
  }

  return out;
}
