/**
 * textTradeAnalyzer.ts
 * ────────────────────
 * Parses structured trade text pasted by the user and returns the same
 * { success, fields } shape as the OCR screenshot analyzer, so the
 * existing frontend field-mapping code works without modification.
 *
 * No subprocess, no Python, no external deps — pure TypeScript regex.
 * Grouped alongside ocrScreenshotAnalyzer.ts as a companion input method.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  // Strip currency symbols, commas, trailing units (pips, pts, R, x, %)
  const cleaned = raw.replace(/[$€£,]/g, "").replace(/\s*(pips?|pts?|r|x|%)\s*$/i, "").trim();
  // parseFloat naturally stops at the first non-numeric char so parenthetical
  // notes like "(3.1 points)" are safely ignored
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function str(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  return s === "" ? null : s;
}

function direction(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (/^(long|buy|b)$/.test(v)) return "Long";
  if (/^(short|sell|s)$/.test(v)) return "Short";
  return null;
}

function outcome(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (/win|profit|tp.?hit|open.*profit/.test(v)) return "Win";
  if (/loss|sl.?hit|stopped/.test(v)) return "Loss";
  if (/be|break.?even/.test(v)) return "BE";
  return null;
}

function bool(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (/yes|true|open|still.?open/.test(v)) return true;
  if (/no|false|closed/.test(v)) return false;
  return null;
}

/**
 * Normalise a datetime string to datetime-local format (YYYY-MM-DDTHH:mm).
 * Handles "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ss", "N/A" etc.
 */
function normDatetime(raw: string | null): string | null {
  if (!raw) return null;
  if (/n\/?a/i.test(raw.trim())) return null;
  // "2018-02-07 04:10:00" or "2018-02-07T04:10:00"
  const m = raw.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}`;
  return null;
}

// ── Label → field map ──────────────────────────────────────────────────────
// Each entry: [regex that matches the label, field name in the fields dict]
// ORDER MATTERS — more-specific patterns must come before generic ones.

const LABEL_MAP: [RegExp, string][] = [
  // Trade identification
  [/instrument|symbol|pair$/i,                   "instrument"],
  [/pair.?category|category|asset.?class/i,      "pairCategory"],
  [/direction|side|type.*(long|short)/i,         "direction"],
  [/entry.?price/i,                              "entryPrice"],
  [/opening.?price|open.?price/i,                "openingPrice"],
  [/closing.?price|close.?price/i,               "closingPrice"],
  // SL — specific variants before generic
  [/stop.?loss.?price|sl.?price/i,               "stopLoss"],
  [/actual.?sl.?pips?|actual.?stop.?loss.?pips?/i, "actualSLPips"],
  [/planned.?sl.?pips?|planned.?stop.?loss.?pips?/i, "plannedSLPips"],
  [/stop.?loss.?pips?|sl.?pips?|sl.?dist/i,     "stopLossPips"],
  // TP — specific variants before generic
  [/take.?profit.?price|tp.?price/i,             "takeProfit"],
  [/actual.?tp.?pips?|actual.?take.?profit.?pips?/i, "actualTPPips"],
  [/planned.?tp.?pips?|planned.?take.?profit.?pips?/i, "plannedTPPips"],
  [/take.?profit.?pips?|tp.?pips?|tp.?dist/i,   "takeProfitPips"],
  // Position size
  [/lot.?size|lots?$/i,                          "lotSize"],
  [/units?$/i,                                   "units"],
  [/contract.?size/i,                            "contractSize"],
  // P&L — open vs closed kept separate
  [/closed.?p[\s\/]?l|closed.?pnl/i,            "closedPLPips"],
  [/open.?p[\s\/]?l|open.?pnl/i,                "openPLPoints"],
  [/drawdown|mae/i,                              "drawdownPoints"],
  [/run.?up|mfe/i,                               "runUpPoints"],
  // Risk & Reward — specific before generic
  [/price.?excursion|excursion.?r/i,             "priceExcursionR"],
  [/achieved.?rr|actual.?rr/i,                   "achievedRR"],
  [/planned.?rr/i,                               "plannedRR"],
  [/risk.?reward|r[\s:]?r|rr$/i,                "riskReward"],
  // Outcome
  [/outcome|result|trade.?result/i,              "outcome"],
  [/trade.?open|still.?open|open.?trade|whether.*open/i, "tradeIsOpen"],
  // Time & Session
  [/entry.?time|entry.?date/i,                   "entryTime"],
  [/exit.?time|exit.?date|close.?time/i,         "exitTime"],
  [/trade.?duration|duration/i,                  "tradeDuration"],
  [/day.?of.?week|weekday/i,                     "dayOfWeek"],
  [/session.?phase|phase/i,                      "sessionPhase"],
  [/session.?(name)?|trading.?session/i,         "sessionName"],
];

// ── Core parser ────────────────────────────────────────────────────────────

function extractValue(line: string): string | undefined {
  // Matches: "Label: value", "Label = value"
  const stripped = line.replace(/^[\s•\-*▸►·]+/, "").trim();
  const m = stripped.match(/^[^:=]+[:=]\s*(.+)$/);
  if (m) return m[1].trim();
  // No delimiter — last token after the label text
  const parts = stripped.split(/\s{2,}|\t/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : undefined;
}

export function parseTradeText(text: string): {
  success: boolean;
  fields: Record<string, any>;
  method: "text";
  fieldCount: number;
} {
  const fields: Record<string, any> = {
    instrument: null, pairCategory: null, direction: null,
    entryPrice: null, openingPrice: null, closingPrice: null,
    stopLoss: null, stopLossPips: null, plannedSLPips: null, actualSLPips: null,
    takeProfit: null, takeProfitPips: null, plannedTPPips: null, actualTPPips: null,
    lotSize: null, units: null, contractSize: null,
    openPLPoints: null, closedPLPips: null,
    drawdownPoints: null, runUpPoints: null,
    riskReward: null, plannedRR: null, achievedRR: null, priceExcursionR: null,
    outcome: null, tradeIsOpen: null,
    entryTime: null, exitTime: null, tradeDuration: null,
    dayOfWeek: null, sessionName: null, sessionPhase: null,
    // OCR compat fields (kept null — text input doesn't provide these)
    stopLossPoints: null, takeProfitPoints: null,
    plannedSLPoints: null, plannedTPPoints: null,
    actualSLPoints: null, actualTPPoints: null,
    stopLossUSD: null, takeProfitUSD: null,
    openPLUSD: null, runUpUSD: null, drawdownUSD: null,
    tpCalculatedFromRR: false, tradeIsOpenFlag: false,
  };

  for (const line of text.split("\n")) {
    const trimmed = line.replace(/^[\s•\-*▸►·]+/, "").trim();
    if (!trimmed || trimmed.length < 3) continue;

    for (const [pattern, fieldName] of LABEL_MAP) {
      const labelPart = trimmed.split(/[:=]/)[0].trim();
      if (!pattern.test(labelPart)) continue;

      const raw = extractValue(trimmed);
      if (!raw) break;

      switch (fieldName) {
        case "direction":       fields.direction       = direction(raw) ?? str(raw); break;
        case "outcome":         fields.outcome         = outcome(raw);               break;
        case "tradeIsOpen":     fields.tradeIsOpen     = bool(raw);                  break;
        case "closedPLPips":    fields.closedPLPips    = num(raw);                   break;
        case "instrument":
        case "pairCategory":
        case "tradeDuration":
        case "dayOfWeek":
        case "sessionName":
        case "sessionPhase":
        case "entryTime":
        case "exitTime":        fields[fieldName]      = str(raw);                   break;
        default:                fields[fieldName]      = num(raw) ?? str(raw);       break;
      }
      break; // matched — move to next line
    }
  }

  // Normalise datetime strings to datetime-local format
  fields.entryTime = normDatetime(fields.entryTime);
  fields.exitTime  = normDatetime(fields.exitTime);

  // Propagate plannedSLPips → stopLossPips if stopLossPips missing
  if (fields.stopLossPips === null && fields.plannedSLPips !== null)
    fields.stopLossPips = fields.plannedSLPips;
  if (fields.takeProfitPips === null && fields.plannedTPPips !== null)
    fields.takeProfitPips = fields.plannedTPPips;
  // plannedRR fallback
  if (fields.plannedRR === null && fields.riskReward !== null)
    fields.plannedRR = fields.riskReward;
  // tradeIsOpenFlag
  if (fields.tradeIsOpen === true) fields.tradeIsOpenFlag = true;

  const fieldCount = Object.values(fields).filter(v => v !== null && v !== false).length;

  return { success: fieldCount > 0, fields, method: "text", fieldCount };
}
