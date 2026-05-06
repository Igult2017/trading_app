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

// ── Prompt ────────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a trading chart screenshot analyzer. Extract ALL visible trading data from this chart screenshot.

Return ONLY valid JSON with these fields (use null for anything not visible):

{
  "instrument": "e.g. EUR/USD, XAU/USD, NAS100, BTCUSD",
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
  "entryTime": "YYYY-MM-DDTHH:MM:SS or null",
  "exitTime": "YYYY-MM-DDTHH:MM:SS or null",
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
  "primaryExitReason": "Target Hit or Stop Hit or Break-Even or Manual or null",
  "chartType": "Candles or Bars or Line",
  "spreadInfo": "any spread data visible or null",
  "additionalNotes": "any other relevant data visible on chart or null"
}

EXTRACTION RULES:

TIMESTAMPS (entryTime / exitTime):
- entryTime = the exact date and time the trade was opened/entered
- exitTime  = the exact date and time the trade was closed/exited — this may appear anywhere on the screenshot: text panels, info boxes, history rows, x-axis labels, replay bars, column headers, or anywhere else — read every piece of text on the image carefully
- Format MUST be YYYY-MM-DDTHH:MM:SS — combine the full date and time into this format regardless of how it appears on screen (e.g. "2020.03.19 11:52:00" or "Thu 24 Nov'22 00:22" both become "2020-03-19T11:52:00")
- The times shown are broker local time, NOT UTC. Most MT4/MT5 brokers use UTC+2 (winter) or UTC+3 (summer). Detect the timezone from any visible label and set brokerTimezone; default to 2 if unclear
- Return null only if the value genuinely cannot be found anywhere on the image — do not skip it

OTHER RULES:
- Read ALL text overlays, labels, indicators, position info panels
- Check instrument selector (usually top-left) for symbol
- Check timeframe selector for timeframe
- Determine direction from Buy/Sell labels, arrows, or position type
- If trade is closed: Win (profit > 0), Loss (loss < 0), BE (≈0 pips)
- Be precise with numbers — copy exactly what you see
- Return ONLY the JSON object, no markdown fences`;

// ── Model fallback chain ──────────────────────────────────────────────────────

const MODEL_CHAIN = [
  "gemini-2.0-flash",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash",
  "gemini-2.5-pro-preview-05-06",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
];

function isModelError(msg: string): boolean {
  return (
    msg.includes("not found") ||
    msg.includes("deprecated") ||
    msg.includes("not supported") ||
    msg.includes("404")
  );
}

async function discoverModels(ai: GoogleGenAI, seen: Set<string>): Promise<string[]> {
  try {
    const out: string[] = [];
    for await (const m of ai.models.list() as any) {
      const id: string = ((m.name ?? "") as string).replace("models/", "");
      if (!id.startsWith("gemini")) continue;
      if (["embedding", "aqa", "tts"].some(s => id.includes(s))) continue;
      if (!seen.has(id)) out.push(id);
    }
    return [...out.filter(m => m.includes("flash")), ...out.filter(m => m.includes("pro") && !m.includes("flash"))];
  } catch {
    return [];
  }
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
    sessionName:            session.sessionName,
    sessionPhase:           session.sessionPhase,
    outcome:                extracted.outcome              ?? null,
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
): Promise<{ success: boolean; fields?: Record<string, any>; method?: string; error?: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { success: false, method: "gemini", error: "GOOGLE_API_KEY not set" };
  }

  const mimeType = detectMime(base64Image);
  const imageData = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;

  const ai = new GoogleGenAI({ apiKey });

  const seen = new Set<string>();
  let candidates = [...MODEL_CHAIN];
  candidates.forEach(m => seen.add(m));

  let lastError: Error | null = null;
  let triedDiscovery = false;

  while (true) {
    for (const model of candidates) {
      try {
        // Disable thinking on flash models — significantly faster responses
        const isFlash = model.includes("flash");
        const config: Record<string, any> = {
          maxOutputTokens: 2048,
        };
        if (isFlash) {
          config.thinkingConfig = { thinkingBudget: 0 };
        }

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

        const text = response.text ?? "";
        const extracted = parseGeminiJson(text);
        const fields = mapToJournalFields(extracted);
        return { success: true, fields, method: "gemini" };

      } catch (err: any) {
        lastError = err;
        const msg: string = err?.message ?? "";
        if (!isModelError(msg)) {
          return { success: false, method: "gemini", error: msg || "Gemini API error" };
        }
        console.warn(`[GeminiScreenshot] Model "${model}" unavailable (${msg.slice(0, 80)}), trying next…`);
      }
    }

    if (triedDiscovery) break;
    triedDiscovery = true;
    const discovered = await discoverModels(ai, seen);
    if (discovered.length === 0) break;
    console.warn(`[GeminiScreenshot] Trying ${discovered.length} auto-discovered model(s)…`);
    discovered.forEach(m => seen.add(m));
    candidates = discovered;
  }

  return {
    success: false,
    method: "gemini",
    error: lastError?.message ?? "All Gemini models failed",
  };
}
