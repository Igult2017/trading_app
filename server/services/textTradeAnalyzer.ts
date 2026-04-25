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

function formatDt(dt: Date): string {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

// Strip noise that confuses parsers: leading weekday + trailing timezone
function stripNoise(s: string): string {
  // Remove leading weekday names (full or abbreviated, with optional comma)
  let cleaned = s.replace(
    /^\s*(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?)[,\s]+/i,
    ""
  );
  // Remove trailing timezone abbreviations / offsets / "Z"
  cleaned = cleaned.replace(
    /\s*(?:Z|UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|JST|BST|CET|CEST|EET|EEST|AEST|AEDT|IST|HKT|SGT|KST|NZST|NZDT|MSK|GMT[+-]\d{1,4}|UTC[+-]\d{1,4}|[+-]\d{2}:?\d{2})\s*$/i,
    ""
  );
  return cleaned.trim();
}

function isDateOnly(raw: string): boolean {
  return /^\s*\d{1,4}[.\-\/]\d{1,2}[.\-\/]\d{1,4}\s*$/.test(raw);
}

function isTimeOnly(raw: string): boolean {
  // 14:30, 14:30:00, 2:30 PM, 14h30, 14.30
  return /^\s*\d{1,2}[:.h]\d{2}(?:[:.]\d{2})?\s*(AM|PM)?\s*$/i.test(raw);
}

function normTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})[:.h](\d{2})(?:[:.]\d{2})?\s*(AM|PM)?\s*$/i);
  if (!m) return null;
  return `${pad2(to24h(parseInt(m[1], 10), m[3]))}:${m[2]}`;
}

// Convert 2-digit year to 4-digit (assume 21st century if <70, else 20th)
function expandYear(yy: string): string {
  if (yy.length === 4) return yy;
  const n = parseInt(yy, 10);
  return n < 70 ? `20${pad2(n)}` : `19${pad2(n)}`;
}

function normDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = stripNoise(raw.trim());
  // YYYY[.\-\/]MM[.\-\/]DD
  let m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  // YYYYMMDD compact
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD[.\-\/ ]MM[.\-\/ ]YY(YY)  or MM[.\-\/]DD[.\-\/]YY(YY) (heuristic)
  m = s.match(/^(\d{1,2})[.\-\/\s](\d{1,2})[.\-\/\s](\d{2,4})$/);
  if (m) {
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10);
    const yy = expandYear(m[3]);
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd];     // clearly US-style mm/dd
    if (dd > 12 && mm > 12) return null;              // invalid
    return `${yy}-${pad2(mm)}-${pad2(dd)}`;
  }
  return null;
}

function normDatetime(raw: string | null): string | null {
  if (!raw) return null;
  const original = raw.trim();
  if (!original || /^n\/?a$/i.test(original)) return null;

  // ── Unix timestamp (10 sec / 13 ms digits) ────────────────────────────
  if (/^\d{10}$/.test(original)) {
    const dt = new Date(parseInt(original, 10) * 1000);
    if (!isNaN(dt.getTime())) return formatDt(dt);
  }
  if (/^\d{13}$/.test(original)) {
    const dt = new Date(parseInt(original, 10));
    if (!isNaN(dt.getTime())) return formatDt(dt);
  }

  let s = stripNoise(original);
  // Normalize natural-language connectors so "DATE at TIME" / "TIME on DATE" work
  s = s.replace(/\s+(?:at|on|@)\s+/gi, " ").replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim();

  // ── PRE — TIME first, then DATE  ("19:51 11 March 2020" / "19:51 11/03/2020")
  // Split off a leading time, parse the rest as a date, then combine.
  let timeFirst = s.match(/^(\d{1,2})[:.h](\d{2})(?:[:.](\d{1,2}))?\s*(AM|PM)?\s+(.+)$/i);
  if (timeFirst) {
    const hh = pad2(to24h(parseInt(timeFirst[1], 10), timeFirst[4]));
    const mm = timeFirst[2];
    const datePart = timeFirst[5].trim();
    // Try numeric forms first, then native Date.parse for month names
    const ymd = normDate(datePart) ?? (() => {
      const dt = new Date(datePart);
      if (!isNaN(dt.getTime()) && dt.getFullYear() > 1970) {
        return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
      }
      return null;
    })();
    if (ymd) return `${ymd}T${hh}:${mm}`;
  }

  // ── A — YYYY[.\-\/]MM[.\-\/]DD[ T,]+HH[:.h]MM[:.SS] ─────────────────
  let m = s.match(
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})[T\s,]+(\d{1,2})[:.h](\d{2})(?:[:.]\d{1,2})?(?:\.\d+)?\s*(AM|PM)?/i
  );
  if (m) {
    const hh = to24h(parseInt(m[4], 10), m[6]);
    return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}T${pad2(hh)}:${m[5]}`;
  }

  // ── B — DD/MM/YYYY (or MM/DD/YYYY) + time + optional AM/PM ───────────
  m = s.match(
    /(\d{1,2})[.\-\/\s](\d{1,2})[.\-\/\s](\d{2,4})[T\s,]+(\d{1,2})[:.h](\d{2})(?:[:.]\d{1,2})?\s*(AM|PM)?/i
  );
  if (m) {
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10);
    const yy = expandYear(m[3]);
    const hh = to24h(parseInt(m[4], 10), m[6]);
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd];     // clearly US-style mm/dd
    if (dd > 12 && mm > 12) return null;              // invalid
    return `${yy}-${pad2(mm)}-${pad2(dd)}T${pad2(hh)}:${m[5]}`;
  }

  // ── C — Compact YYYYMMDD[T]HHMM[SS] ──────────────────────────────────
  m = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;

  // ── D — Date only (no time) ──────────────────────────────────────────
  const dOnly = normDate(s);
  if (dOnly) return `${dOnly}T00:00`;

  // ── E — Native Date.parse fallback (month-name etc.) ─────────────────
  for (const candidate of [s, original]) {
    const dt = new Date(candidate);
    if (!isNaN(dt.getTime()) && dt.getFullYear() > 1970) return formatDt(dt);
  }

  // ── F — Last resort: split into date-like and time-like halves & combine
  const tMatch = s.match(/(\d{1,2})[:.h](\d{2})(?:[:.](\d{1,2}))?\s*(AM|PM)?/i);
  if (tMatch) {
    const hh = pad2(to24h(parseInt(tMatch[1], 10), tMatch[4]));
    const mm = tMatch[2];
    const dateRest = (s.slice(0, tMatch.index!) + " " + s.slice(tMatch.index! + tMatch[0].length)).trim();
    const ymd = normDate(dateRest) ?? (() => {
      const dt = new Date(dateRest);
      if (!isNaN(dt.getTime()) && dt.getFullYear() > 1970) {
        return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
      }
      return null;
    })();
    if (ymd) return `${ymd}T${hh}:${mm}`;
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
  [/^(instrument|symbol|pair|asset|ticker|currency|market)\b/i, "instrument"],
  [/pair.?category|category|asset.?class/i,      "pairCategory"],
  [/^(direction|side|action|position(.?type)?|order.?type|trade.?type|type)\b/i, "direction"],
  // entryPrice — bare "entry"/"open"/"opened" allowed ONLY when not followed by time/date/datetime/etc
  [/^(entry.?price|opening.?price|open.?price|fill(ed)?.?price|in.?price|buy.?(price|@)|sell.?(price|@)|entry(?!\s*(time|date|datetime|timestamp|dt|on|day))\b|opened(?!\s*(time|date|datetime|timestamp|dt|on|at|day))\b|open(?!\s*(time|date|datetime|timestamp|dt|on|at|p[\/\s]?l|pnl|day))\b)/i, "entryPrice"],
  [/^(closing.?price|close.?price|out.?price|exit.?price|exit(?!\s*(time|date|datetime|timestamp|dt|on|day))\b|closed(?!\s*(time|date|datetime|timestamp|dt|on|at|day))\b|close(?!\s*(time|date|datetime|timestamp|dt|on|at|p[\/\s]?l|pnl|day))\b)/i, "closingPrice"],
  // SL — specific variants before generic
  [/actual.?sl.?pips?|actual.?stop.?loss.?pips?/i, "actualSLPips"],
  [/planned.?sl.?pips?|planned.?stop.?loss.?pips?/i, "plannedSLPips"],
  [/stop.?loss.?pips?|sl.?pips?|sl.?dist/i,     "stopLossPips"],
  [/^(stop.?loss(.?price)?|stoploss|sl(.?price)?|stop|s\/l)\b/i, "stopLoss"],
  // TP — specific variants before generic
  [/actual.?tp.?pips?|actual.?take.?profit.?pips?/i, "actualTPPips"],
  [/planned.?tp.?pips?|planned.?take.?profit.?pips?/i, "plannedTPPips"],
  [/take.?profit.?pips?|tp.?pips?|tp.?dist/i,   "takeProfitPips"],
  [/^(take.?profit(.?price)?|takeprofit|tp(.?price)?|target|t\/p)\b/i, "takeProfit"],
  // Position size
  [/^(lot.?size|lots?|size|volume|qty|quantity|amount)\b/i, "lotSize"],
  [/^units?\b/i,                                 "units"],
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
  [/risk.?reward|r[\s:\/]?r|rr$|reward.?ratio/i, "riskReward"],
  // Outcome
  [/^(outcome|result|trade.?result|status|win\/loss|w\/l)\b/i, "outcome"],
  [/trade.?open|still.?open|open.?trade|whether.*open|is.?open/i, "tradeIsOpen"],
  // Time & Session — wide alias coverage
  [/^(entry.?(time|date|datetime|timestamp|dt)?|open(ed)?(.?(time|date|at|datetime|timestamp|on))?|date.?opened|time.?opened|fill(ed)?.?time|in.?time|from|start(.?time)?)\b/i, "entryTime"],
  [/^(exit.?(time|date|datetime|timestamp|dt)?|close(d)?(.?(time|date|at|datetime|timestamp|on))?|date.?closed|time.?closed|out.?time|to|end(.?time)?|finish(.?time)?)\b/i, "exitTime"],
  [/trade.?duration|duration|holding.?time|time.?in.?trade/i, "tradeDuration"],
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

  // ── Free-form fallback ──────────────────────────────────────────────
  // For unlabeled inline pastes (e.g. "EUR/USD BUY @ 1.0850 SL 1.0820 TP 1.0900 0.5 lot")
  // scan the entire text for inline patterns to fill in missing fields.
  // We only fill nulls — never overwrite values found by the labeled pass.
  const flat = text.replace(/\s+/g, " ");

  if (!fields.instrument) {
    // Forex pair (with or without slash) or 3-5 letter ticker
    const sym = flat.match(/\b([A-Z]{3}[\/\.\-]?[A-Z]{3})\b/) // forex
             ?? flat.match(/\b(XAU|XAG|BTC|ETH|SOL|US30|US100|US500|NAS100|SPX500|GER30|GER40|UK100|JPN225)[\/\-]?[A-Z]{0,3}\b/i)
             ?? flat.match(/\$([A-Z]{1,5})\b/); // $TSLA style
    if (sym) fields.instrument = sym[1].toUpperCase();
  }

  if (!fields.direction) {
    if (/\b(buy|long|bullish)\b/i.test(flat))       fields.direction = "Long";
    else if (/\b(sell|short|bearish)\b/i.test(flat)) fields.direction = "Short";
  }

  if (!fields.outcome) {
    if (/\b(break\s?even|b\/?e)\b/i.test(flat))       fields.outcome = "Break Even";
    else if (/\b(win|won|profit(?:able)?|tp\s*hit)\b/i.test(flat))   fields.outcome = "Win";
    else if (/\b(loss|lost|losing|sl\s*hit)\b/i.test(flat))          fields.outcome = "Loss";
  }

  if (fields.entryPrice == null) {
    const m = flat.match(/(?:@|at|entry|fill(?:ed)?|opened?\s*(?:at|@)?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (m) fields.entryPrice = parseFloat(m[1]);
  }

  if (fields.stopLoss == null && fields.stopLossPips == null) {
    const m = flat.match(/\b(?:sl|s\/l|stop(?:\s?loss)?)\b\s*[:=@]?\s*(\d+(?:\.\d+)?)/i);
    if (m) {
      const v = parseFloat(m[1]);
      // Heuristic: large numbers w/ decimals are price, small ints are pips
      if (v >= 1 && Number.isInteger(v) && v <= 999) fields.stopLossPips = v;
      else fields.stopLoss = v;
    }
  }

  if (fields.takeProfit == null && fields.takeProfitPips == null) {
    const m = flat.match(/\b(?:tp|t\/p|take(?:\s?profit)?|target)\b\s*[:=@]?\s*(\d+(?:\.\d+)?)/i);
    if (m) {
      const v = parseFloat(m[1]);
      if (v >= 1 && Number.isInteger(v) && v <= 9999) fields.takeProfitPips = v;
      else fields.takeProfit = v;
    }
  }

  if (fields.lotSize == null) {
    const m = flat.match(/(\d+(?:\.\d+)?)\s*lots?\b/i)
           ?? flat.match(/\blots?\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
           ?? flat.match(/\b(?:size|volume|qty|quantity)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (m) fields.lotSize = parseFloat(m[1]);
  }

  if (fields.riskReward == null) {
    const m = flat.match(/\b(?:rr|r\s*[:\/]\s*r|risk[\s\/-]?reward)\s*[:=]?\s*1?\s*[:\/]?\s*(\d+(?:\.\d+)?)/i);
    if (m) fields.riskReward = parseFloat(m[1]);
  }

  // Free-form datetime extraction — try to find any date+time pattern in the
  // text if no entry/exit times were captured. Look for two distinct
  // datetimes (first = entry, second = exit).
  if (!parts.entry.full && !parts.entry.date && !parts.entry.time) {
    const dtRegex = /\b(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}(?:[T\s,]+\d{1,2}[:.h]\d{2}(?:[:.]\d{2})?)?|\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}(?:[T\s,]+\d{1,2}[:.h]\d{2}(?:[:.]\d{2})?)?)\b/g;
    const found: string[] = [];
    let mm: RegExpExecArray | null;
    while ((mm = dtRegex.exec(flat)) !== null) found.push(mm[1]);
    if (found.length >= 1) {
      const e = normDatetime(found[0]);
      if (e) parts.entry.full = e;
    }
    if (found.length >= 2 && !parts.exit.full && !parts.exit.date && !parts.exit.time) {
      const x = normDatetime(found[1]);
      if (x) parts.exit.full = x;
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
