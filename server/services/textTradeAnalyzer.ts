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
 *
 * Supports many real-world formats users paste from MT4/MT5, cTrader,
 * TradingView, NinjaTrader, brokers and spreadsheets:
 *   ISO       — 2018-02-07 04:10[:ss]   /   2018-02-07T04:10[:ss]
 *   MT4 / MT5 — 2018.02.07 04:10[:ss]
 *   US slash  — 02/07/2018 04:10[:ss] [AM|PM]
 *   EU slash  — 07/02/2018 04:10[:ss]
 *   EU dot    — 07.02.2018 04:10[:ss]
 *   Month name— Feb 07, 2018 04:10[:ss] / 7 February 2018 ...
 *   Date only — 2018-02-07  / 2018.02.07  / 02/07/2018  (returns YYYY-MM-DDT00:00)
 *   Time only — handled separately by normTime() and combined with a sibling date.
 */
function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

function to24h(h: number, ampm?: string | null): number {
  if (!ampm) return h;
  const u = ampm.toUpperCase();
  if (u === "PM" && h < 12) return h + 12;
  if (u === "AM" && h === 12) return 0;
  return h;
}

function isDateOnly(raw: string): boolean {
  return /^\s*\d{1,4}[.\-\/]\d{1,2}[.\-\/]\d{1,4}\s*$/.test(raw);
}

function isTimeOnly(raw: string): boolean {
  return /^\s*\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\s*$/i.test(raw);
}

function normTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\s*$/i);
  if (!m) return null;
  return `${pad2(to24h(parseInt(m[1], 10), m[3]))}:${m[2]}`;
}

function normDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // YYYY[.\-\/]MM[.\-\/]DD
  let m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  // DD[.\-\/]MM[.\-\/]YYYY  or  MM[.\-\/]DD[.\-\/]YYYY  (heuristic)
  m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (m) {
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10);
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd];     // clearly US-style mm/dd
    if (dd > 12 && mm <= 12) { /* clearly EU-style */ }
    if (dd > 12 && mm > 12) return null;              // invalid
    return `${m[3]}-${pad2(mm)}-${pad2(dd)}`;
  }
  return null;
}

function normDatetime(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /n\/?a/i.test(s)) return null;

  // ── Pattern A — YYYY[.\-\/]MM[.\-\/]DD[ T]HH:MM[:SS]  (ISO, MT4, MT5) ────
  let m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (m) {
    return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}T${pad2(m[4])}:${m[5]}`;
  }

  // ── Pattern B — DD[.\-\/]MM[.\-\/]YYYY  /  MM[.\-\/]DD[.\-\/]YYYY  + time + AM/PM ──
  m = s.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})[T\s,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (m) {
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10);
    const yy = m[3];
    const hh = to24h(parseInt(m[4], 10), m[6]);
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd];     // clearly US-style mm/dd
    if (dd > 12 && mm > 12) return null;              // invalid pair
    return `${yy}-${pad2(mm)}-${pad2(dd)}T${pad2(hh)}:${m[5]}`;
  }

  // ── Pattern C — Date only (no time) ─────────────────────────────────────
  const dOnly = normDate(s);
  if (dOnly) return `${dOnly}T00:00`;

  // ── Pattern D — Native Date.parse fallback (covers month-name formats) ──
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }
  return null;
}

/** Combine a date-only part with a time-only part into datetime-local. */
function combineDateTime(date: string | null, time: string | null): string | null {
  if (!date || !time) return null;
  return `${date}T${time}`;
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
  [/entry.?(time|date|datetime|timestamp)|open(ed)?.?(time|date|at|datetime|timestamp)|date.?opened|time.?opened/i, "entryTime"],
  [/exit.?(time|date|datetime|timestamp)|close(d)?.?(time|date|at|datetime|timestamp)|date.?closed|time.?closed/i,  "exitTime"],
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

  // Track date-only and time-only fragments separately so we can combine
  // "Entry Date: 2024-04-25" + "Entry Time: 14:30:00" into one datetime.
  const parts: Record<"entry" | "exit", { date: string | null; time: string | null; full: string | null }> = {
    entry: { date: null, time: null, full: null },
    exit:  { date: null, time: null, full: null },
  };

  const captureTimePart = (which: "entry" | "exit", raw: string) => {
    if (isTimeOnly(raw)) {
      parts[which].time = normTime(raw);
    } else if (isDateOnly(raw)) {
      parts[which].date = normDate(raw);
    } else {
      const full = normDatetime(raw);
      if (full) parts[which].full = full;
    }
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
        case "entryTime":       captureTimePart("entry", raw); break;
        case "exitTime":        captureTimePart("exit",  raw); break;
        case "instrument":
        case "pairCategory":
        case "tradeDuration":
        case "dayOfWeek":
        case "sessionName":
        case "sessionPhase":    fields[fieldName]      = str(raw);                   break;
        default:                fields[fieldName]      = num(raw) ?? str(raw);       break;
      }
      break; // matched — move to next line
    }
  }

  // Reconcile date/time parts → datetime-local strings
  fields.entryTime = parts.entry.full
    ?? combineDateTime(parts.entry.date, parts.entry.time)
    ?? (parts.entry.date ? `${parts.entry.date}T00:00` : null);
  fields.exitTime = parts.exit.full
    ?? combineDateTime(parts.exit.date, parts.exit.time)
    ?? (parts.exit.date ? `${parts.exit.date}T00:00` : null);

  // Derive day-of-week from entryTime if not explicitly provided
  if (!fields.dayOfWeek && fields.entryTime) {
    const dt = new Date(fields.entryTime);
    if (!isNaN(dt.getTime())) {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      fields.dayOfWeek = days[dt.getDay()];
    }
  }

  // Derive trade duration if both times are present and duration not given
  if (!fields.tradeDuration && fields.entryTime && fields.exitTime) {
    const a = new Date(fields.entryTime).getTime();
    const b = new Date(fields.exitTime).getTime();
    if (!isNaN(a) && !isNaN(b) && b > a) {
      const mins = Math.round((b - a) / 60000);
      if (mins < 60)        fields.tradeDuration = `${mins} minutes`;
      else if (mins < 1440) fields.tradeDuration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      else                  fields.tradeDuration = `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
    }
  }

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
