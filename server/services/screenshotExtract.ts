/**
 * Screenshot extraction — pure Node.js replacement for the Python subprocess.
 *
 * Benefits over the old Python approach:
 *  - No subprocess spawn (saves ~2-3 s of Python import time)
 *  - Thinking disabled on flash models (thinkingBudget:0 → much faster)
 *  - Stronger exit-time prompt (looks at MT4/MT5 trade panels, not just x-axis)
 *  - Same field mapping / session derivation / duration logic as the Python code
 */

import { GoogleGenAI } from "@google/genai";

// ── Singleton AI client ───────────────────────────────────────────────────────
// Created once per process — avoids repeated init overhead on every upload.
let _aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not set");
  if (!_aiClient) _aiClient = new GoogleGenAI({ apiKey });
  return _aiClient;
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are an expert trading chart and platform screenshot analyzer. Your job is to extract EVERY piece of visible trading data from the screenshot with maximum precision.

Return ONLY valid JSON (no markdown fences, no explanation) with ALL of these fields. Use null only when a value is genuinely not visible anywhere in the image — never omit a field, never guess, never leave data on the screen un-extracted.

{
  "instrument": "symbol exactly as shown e.g. EUR/USD, XAU/USD, NAS100, BTCUSD",
  "pairCategory": "Forex or Crypto or Commodity or Index or Stock",
  "timeframe": "e.g. 4H, 1H, 15M, 1D",
  "direction": "Long or Short",
  "orderType": "Market or Limit or Stop",
  "entryPrice": number or null,
  "openingPrice": number or null,
  "closingPrice": number or null,
  "stopLoss": number or null,
  "takeProfit": number or null,
  "plannedSlPips": number or null,
  "plannedTpPips": number or null,
  "actualSlPips": number or null,
  "actualTpPips": number or null,
  "stopLossDistance": number or null,
  "takeProfitDistance": number or null,
  "lotSize": number or null,
  "units": number or null,
  "contractSize": number or null,
  "plannedRR": number or null,
  "riskReward": number or null,
  "achievedRR": number or null,
  "priceExcursionR": number or null,
  "entryTime": "YYYY-MM-DDTHH:mm:ss or null",
  "exitTime": "YYYY-MM-DDTHH:mm:ss or null",
  "brokerTimezone": number or null,
  "dayOfWeek": "Monday/Tuesday/Wednesday/Thursday/Friday/Saturday/Sunday or null",
  "outcome": "Win or Loss or BE or Open",
  "openPLPips": number or null,
  "closedPLPips": number or null,
  "profitLossPoints": number or null,
  "profitLossUSD": number or null,
  "drawdownPoints": number or null,
  "drawdownUSD": number or null,
  "runUpPoints": number or null,
  "runUpUSD": number or null,
  "primaryExitReason": "Target Hit or Partial TP or Trailing Stop or Stop Hit or Break-Even or Time Exit or Manual or null",
  "chartType": "Candles or Bars or Line",
  "spreadInfo": "any spread data visible or null",
  "additionalNotes": "any other relevant data visible on chart or null"
}

═══════════════════════════════════════════
CRITICAL EXTRACTION RULES — READ CAREFULLY
═══════════════════════════════════════════

LOT SIZE (lotSize):
- Look for labels: "Lots", "Volume", "Size", "Lot", "Qty", "Quantity" — often shown in trade panels, order tickets, or history rows
- Common values: 0.01, 0.05, 0.10, 0.25, 0.50, 1.00 — copy the exact decimal number shown
- In MT4/MT5 trade history: the volume column is the lot size — read it carefully
- If you see "0.10" or "0.1" use 0.1 as the number. Never round or alter it.
- NEVER return null if a volume/lot/size number is anywhere on the image

ENTRY PRICE (entryPrice / openingPrice):
- Look for: "Open", "Price", "Entry", "Open Price", "Entry Price", "at price", "@" followed by a number
- In MT4/MT5: the "Price" column in trade history is the entry price
- On order tickets: the price shown when the order was placed
- Copy the exact number — e.g. 1.09250 not 1.09 or 1.093
- NEVER return null if any open/entry price is shown on the image

ENTRY TIME (entryTime):
PRIMARY LOCATIONS — check all of these:
1. X-AXIS (time bar at bottom of chart): The entry time appears as a HIGHLIGHTED timestamp directly on the horizontal time axis — it is usually a different colour (cyan, blue, white, or bold) compared to surrounding regular time labels. The vertical line or bracket marking the trade open intersects the X-axis at exactly this timestamp. Read the full date+time at that intersection point.
2. TradingView trade info panel / tooltip: look for "Open time", "Entry", "Date", "Time" fields inside any floating panel or tooltip attached to the trade bracket.
3. MT4/MT5 history table: "Open Time" or "Time" column for the opening row.
4. Any on-chart label, annotation, or arrow marking the start of the trade.
- Format as YYYY-MM-DDTHH:mm:ss. If only the time is shown on the axis (e.g. "10:39"), use the full date visible elsewhere on the same X-axis (e.g. "Fri 22 May'20") to reconstruct the complete timestamp.
- "Fri 22 May'20 10:39" → "2020-05-22T10:39:00"
- NEVER return null if any open/entry date or time is shown anywhere on the image

EXIT TIME (exitTime):
PRIMARY LOCATIONS — check all of these:
1. X-AXIS (time bar at bottom of chart): The exit time appears as a HIGHLIGHTED or COLOURED timestamp on the horizontal time axis where the trade's closing vertical line or bracket end intersects it. It may be highlighted in a different colour (e.g. blue, white, bold) from surrounding labels. This is the MOST COMMON place TradingView shows the close time.
2. STATUS BAR / REPLAY BAR at the very bottom of the screen: Look for text like "Last processed tick: 2020-05-22 10:58:59" or "Replay mode... tick: YYYY-MM-DD HH:MM:SS" — this timestamp IS the exit time.
3. TradingView trade info panel: look for "Close time", "Exit", "Date closed" in any floating panel or tooltip.
4. MT4/MT5 history table: "Close Time" column.
5. Any annotation, arrow, or label at the trade exit point on the chart.
- Format as YYYY-MM-DDTHH:mm:ss. If only the time is visible on the axis, combine it with the full date shown elsewhere on the same X-axis.
- "10:58" on axis + "Fri 22 May'20" date label = "2020-05-22T10:58:00"
- "Last processed tick: 2020-05-22 10:58:59" → exitTime = "2020-05-22T10:58:59"
- NEVER return null if any close/exit date or time is visible anywhere on the image

TIMESTAMPS general:
- Broker/platform local time (not UTC). Most MT4/MT5 brokers: UTC+2 winter, UTC+3 summer. TradingView uses the timezone set by the user — check for any timezone label.
- Always combine date and time into YYYY-MM-DDTHH:mm:ss format regardless of display format
- If the X-axis shows a full date label (e.g. "Fri 22 May'20") at one point and only times elsewhere, use that date for all time-only labels nearby

OUTCOME — from ANY visible evidence:
- Positive P&L (green number, "profit") = "Win"
- Negative P&L (red number, "loss") = "Loss"
- P&L within ±2 pips / ±$1 of zero, or SL moved to entry and triggered = "BE"
- Trade still open = "Open"

PRIMARY EXIT REASON:
- "Target Hit"    → price reached the exact planned TP level
- "Partial TP"    → closed with profit but TP not fully reached
- "Trailing Stop" → trailing stop triggered
- "Stop Hit"      → original stop loss triggered
- "Break-Even"    → SL moved to entry, closed ~zero
- "Time Exit"     → closed due to time/session
- "Manual"        → manually closed, no clear reason

GENERAL:
- Scan EVERY pixel of text — overlays, labels, indicators, info panels, history tables, column headers
- Be precise: copy numbers exactly as shown, do not round or estimate
- Return ONLY the raw JSON object, absolutely no markdown, no explanation`;

// ── Model fallback chain ──────────────────────────────────────────────────────
//
// Priority order:
//  1. Image-specialised "Nano Banana" models — purpose-built for vision, fastest
//  2. Non-thinking flash models — cheap, fast, no hidden reasoning delay
//  3. Pro models — most capable but slowest (last resort)
//
// thinkingBudget is set per-model: 0 for flash (no reasoning delay),
// left unset for image/pro models (they handle it themselves).

interface ModelConfig {
  model: string;
  thinkingBudget?: number;
}

const MODEL_CHAIN: ModelConfig[] = [
  // ── Image-specialised (purpose-built for vision tasks, very fast)
  { model: "gemini-3.1-flash-image-preview" },
  { model: "gemini-3-pro-image-preview" },
  { model: "gemini-2.5-flash-image" },
  // ── Fast non-thinking flash (thinkingBudget:0 disables internal reasoning)
  { model: "gemini-2.0-flash",      thinkingBudget: 0 },
  { model: "gemini-2.0-flash-lite", thinkingBudget: 0 },
  { model: "gemini-3-flash-preview", thinkingBudget: 0 },
  { model: "gemini-2.5-flash-lite", thinkingBudget: 0 },
  { model: "gemini-2.5-flash",      thinkingBudget: 0 },
  // ── Pro fallback (slow, use only if everything above fails)
  { model: "gemini-2.5-pro" },
  { model: "gemini-3-pro-preview" },
];

function isModelError(msg: string): boolean {
  return (
    msg.includes("not found") ||
    msg.includes("deprecated") ||
    msg.includes("not supported") ||
    msg.includes("404")
  );
}

// ── Datetime helpers ──────────────────────────────────────────────────────────

function parseTimestamp(s: string | null | undefined): Date | null {
  if (!s) return null;
  const str = String(s).trim();

  // Strip timezone suffix
  const cleanIso = str.replace(/[+-]\d{2}:\d{2}$/, "").trim();

  // Try ISO formats directly
  const isoAttempts = [
    cleanIso,
    cleanIso.replace("T", " "),
  ];
  for (const attempt of isoAttempts) {
    const d = new Date(attempt);
    if (!isNaN(d.getTime())) return d;
  }

  // MT4/MT5 dot-separated: 2020.03.19 11:52:00
  const dotDate = str.replace(/(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3");
  if (dotDate !== str) {
    const d = new Date(dotDate);
    if (!isNaN(d.getTime())) return d;
  }

  // Strip leading day-name abbreviation: "Thu 24 Nov'22 00:22" → "24 Nov'22 00:22"
  let broker = str.replace(/^[A-Za-z]{2,}\s+/, "").trim();

  // Two-digit year shorthand: Nov'22 → Nov 2022
  broker = broker.replace(/'(\d{2})\b/g, (_, y) => ` ${parseInt(y) <= 69 ? "20" : "19"}${y}`);

  const brokerAttempt = new Date(broker);
  if (!isNaN(brokerAttempt.getTime())) return brokerAttempt;

  return null;
}

function computeDuration(entryStr: string | null, exitStr: string | null): string | null {
  if (!entryStr || !exitStr) return null;
  const entry = parseTimestamp(entryStr);
  const exit  = parseTimestamp(exitStr);
  if (!entry || !exit) return null;
  const totalSecs = (exit.getTime() - entry.getTime()) / 1000;
  if (totalSecs <= 0) return null;
  const totalMins = Math.floor(totalSecs / 60);
  if (totalMins < 60) return `${totalMins}m`;
  if (totalSecs < 86400) {
    const h = Math.floor(totalMins / 60), m = totalMins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function deriveSession(entryTimeStr: string | null, tzOffset: number | null): { sessionName: string | null; sessionPhase: string | null } {
  if (!entryTimeStr) return { sessionName: null, sessionPhase: null };
  const dt = parseTimestamp(entryTimeStr);
  if (!dt) return { sessionName: null, sessionPhase: null };
  const utc = new Date(dt.getTime() - (tzOffset ?? 0) * 3600000);
  const hour = utc.getUTCHours();
  if (hour >= 21)                            return { sessionName: "Sydney",   sessionPhase: "Open" };
  if (hour < 3)                              return { sessionName: "Tokyo",    sessionPhase: "Open" };
  if (hour < 6)                              return { sessionName: "Tokyo",    sessionPhase: "Mid" };
  if (hour < 7)                              return { sessionName: "Tokyo",    sessionPhase: "Close" };
  if (hour < 10)                             return { sessionName: "London",   sessionPhase: "Open" };
  if (hour < 13)                             return { sessionName: "London",   sessionPhase: "Mid" };
  if (hour < 16)                             return { sessionName: "Overlap",  sessionPhase: "Open" };
  if (hour < 19)                             return { sessionName: "New York", sessionPhase: "Mid" };
  return                                            { sessionName: "New York", sessionPhase: "Close" };
}

function normalizeOutcome(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "win")  return "Win";
  if (s === "loss") return "Loss";
  if (s === "be" || s === "break-even" || s === "breakeven" || s === "break even") return "BE";
  if (s === "open") return "Open";
  return null;
}

function normalizeLotSize(raw: any): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const nums = String(raw).replace(/,/g, "").match(/[\d.]+/);
  return nums ? parseFloat(nums[0]) : null;
}

function parseGeminiJson(text: string): Record<string, any> {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(stripped); } catch {}
  const m = stripped.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error(`Could not parse JSON from Gemini response: ${text.slice(0, 200)}`);
}

function mapToJournalFields(extracted: Record<string, any>): Record<string, any> {
  const tzOffset = typeof extracted.brokerTimezone === "number" ? extracted.brokerTimezone : null;
  const session  = deriveSession(extracted.entryTime ?? null, tzOffset);
  const duration = computeDuration(extracted.entryTime ?? null, extracted.exitTime ?? null);
  const lotSize  = normalizeLotSize(extracted.lotSize);

  return {
    instrument:             extracted.instrument          ?? null,
    pairCategory:           extracted.pairCategory        ?? null,
    direction:              extracted.direction            ?? null,
    orderType:              extracted.orderType            ?? null,
    entryPrice:             extracted.entryPrice           ?? null,
    openingPrice:           extracted.openingPrice         ?? null,
    closingPrice:           extracted.closingPrice         ?? null,
    stopLoss:               extracted.stopLoss             ?? null,
    takeProfit:             extracted.takeProfit           ?? null,
    plannedSlPips:          extracted.plannedSlPips        ?? null,
    plannedTpPips:          extracted.plannedTpPips        ?? null,
    actualSlPips:           extracted.actualSlPips         ?? null,
    actualTpPips:           extracted.actualTpPips         ?? null,
    stopLossDistancePips:   extracted.stopLossDistance     ?? null,
    takeProfitDistancePips: extracted.takeProfitDistance   ?? null,
    lotSize,
    units:                  extracted.units                ?? null,
    contractSize:           extracted.contractSize         ?? null,
    plannedRR:              extracted.plannedRR            ?? null,
    riskReward:             extracted.riskReward           ?? null,
    achievedRR:             extracted.achievedRR           ?? null,
    priceExcursionR:        extracted.priceExcursionR      ?? null,
    entryTime:              extracted.entryTime            ?? null,
    exitTime:               extracted.exitTime             ?? null,
    dayOfWeek:              extracted.dayOfWeek            ?? null,
    tradeDuration:          duration,
    outcome:                normalizeOutcome(extracted.outcome),
    sessionName:            session.sessionName,
    sessionPhase:           session.sessionPhase,
    primaryExitReason:      extracted.primaryExitReason    ?? null,
    openPLPips:             extracted.openPLPips           ?? null,
    closedPLPips:           extracted.closedPLPips         ?? null,
    profitLoss:             extracted.profitLossUSD        ?? null,
    pipsGainedLost:         extracted.profitLossPoints     ?? null,
    mae:                    extracted.drawdownPoints       ?? null,
    mfe:                    extracted.runUpPoints          ?? null,
    entryTF:                extracted.timeframe            ?? null,
    spreadAtEntry:          extracted.spreadInfo           ?? null,
    additionalNotes:        extracted.additionalNotes      ?? null,
    aiExtractedRaw:         extracted,
  };
}

// ── MIME detection ────────────────────────────────────────────────────────────

function detectMime(dataUri: string): string {
  if (dataUri.startsWith("data:")) {
    const header = dataUri.slice(0, 40);
    if (header.includes("image/png"))  return "image/png";
    if (header.includes("image/webp")) return "image/webp";
    if (header.includes("image/gif"))  return "image/gif";
  }
  return "image/jpeg";
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function extractFromScreenshot(
  base64Image: string,
): Promise<{ success: boolean; fields?: Record<string, any>; method?: string; modelUsed?: string; error?: string }> {
  if (!process.env.GOOGLE_API_KEY) {
    return { success: false, method: "gemini", error: "GOOGLE_API_KEY not set" };
  }

  const ai = getAI();
  const mimeType = detectMime(base64Image);
  const imageData = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;

  let lastError: Error | null = null;

  for (const { model, thinkingBudget } of MODEL_CHAIN) {
    try {
      const config: Record<string, any> = { maxOutputTokens: 4096 };

      // Explicitly disable thinking for flash models — this is the single
      // biggest speed win. Without this, 2.5-flash silently thinks for 30-60s.
      if (typeof thinkingBudget === "number") {
        config.thinkingConfig = { thinkingBudget };
      }

      const t0 = Date.now();
      const response = await ai.models.generateContent({
        model,
        config,
        contents: [
          {
            role: "user",
            parts: [
              { text: EXTRACTION_PROMPT },
              { inlineData: { mimeType, data: imageData } },
            ],
          },
        ],
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[GeminiScreenshot] Model "${model}" responded in ${elapsed}s`);

      const text = response.text ?? "";
      const extracted = parseGeminiJson(text);
      const fields = mapToJournalFields(extracted);
      return { success: true, fields, method: "gemini", modelUsed: model };

    } catch (err: any) {
      lastError = err;
      const msg: string = err?.message ?? "";
      if (!isModelError(msg)) {
        // Auth / quota / network error — no point trying other models
        console.error(`[GeminiScreenshot] Non-model error on "${model}": ${msg.slice(0, 120)}`);
        return { success: false, method: "gemini", error: msg || "Gemini API error" };
      }
      console.warn(`[GeminiScreenshot] Model "${model}" unavailable (${msg.slice(0, 80)}), trying next…`);
    }
  }

  return {
    success: false,
    method: "gemini",
    error: lastError?.message ?? "All Gemini models failed",
  };
}
