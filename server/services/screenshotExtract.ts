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
import { geminiRateLimiter } from "../lib/geminiRateLimiter";
import sharp from "sharp";

// ── Image compression ─────────────────────────────────────────────────────────
// Scales any image wider than MAX_WIDTH down to MAX_WIDTH (preserving aspect
// ratio) and re-encodes as JPEG at QUALITY%. This slashes the pixel→token count
// by up to 75% on 4K screenshots with zero impact on text legibility.
// MT4/MT5/TradingView text is large enough to remain perfectly readable at
// 1920 px wide — the only risk would be sub-80% JPEG quality, which we avoid.

const MAX_WIDTH  = 1920;
const MAX_HEIGHT = 1200;
const JPEG_QUALITY = 92;

async function compressForGemini(
  base64: string,
): Promise<{ data: string; mimeType: string }> {
  try {
    const raw = base64.includes(",") ? base64.split(",")[1] : base64;
    const buf = Buffer.from(raw, "base64");

    const img = sharp(buf);
    const meta = await img.metadata();
    const w = meta.width  ?? 0;
    const h = meta.height ?? 0;

    const needsResize = w > MAX_WIDTH || h > MAX_HEIGHT;

    const compressed = await img
      .resize(
        needsResize ? { width: MAX_WIDTH, height: MAX_HEIGHT, fit: "inside", withoutEnlargement: true } : undefined
      )
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: false })
      .toBuffer();

    const before = buf.length;
    const after  = compressed.length;
    if (needsResize) {
      console.log(
        `[GeminiScreenshot] Compressed ${w}×${h} → ≤${MAX_WIDTH}×${MAX_HEIGHT} | ` +
        `${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB ` +
        `(${Math.round((1 - after / before) * 100)}% smaller)`
      );
    }

    return { data: compressed.toString("base64"), mimeType: "image/jpeg" };
  } catch (err) {
    // If compression fails for any reason, fall back to the original image
    console.warn("[GeminiScreenshot] Compression failed, using original:", (err as Error).message);
    const raw = base64.includes(",") ? base64.split(",")[1] : base64;
    return { data: raw, mimeType: detectMime(base64) };
  }
}

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

const TZ_LABELS: Record<number, string> = {
  0: "UTC+0 (London winter / GMT)",
  1: "UTC+1 (London summer / BST)",
  2: "UTC+2 (Broker EET winter)",
  3: "UTC+3 (Broker EEST summer)",
};

function buildExtractionPrompt(brokerTimezone?: number | null): string {
  // Build the timezone + session derivation block when we know the offset
  const tzBlock = brokerTimezone != null ? `
═══════════════════════════════════════════
BROKER CHART TIMEZONE — AUTHORITATIVE (do not guess or override)
═══════════════════════════════════════════
The trader's broker charts are set to UTC+${brokerTimezone} (${TZ_LABELS[brokerTimezone] ?? `UTC+${brokerTimezone}`}).
Every timestamp shown on this chart is in UTC+${brokerTimezone} — NOT UTC.

SESSION AND SESSION PHASE — derive directly from the entry time you read off the chart:
  Step 1: Convert the chart time to UTC:  UTC hour = (chart hour) − ${brokerTimezone}
  Step 2: Map the UTC hour to the correct session + phase using these exact rules:
    UTC 21:00–23:59 or 00:00–00:59  →  sessionName: "Sydney",   sessionPhase: "Open"
    UTC 01:00–02:59                 →  sessionName: "Tokyo",    sessionPhase: "Open"
    UTC 03:00–05:59                 →  sessionName: "Tokyo",    sessionPhase: "Mid"
    UTC 06:00–06:59                 →  sessionName: "Tokyo",    sessionPhase: "Close"
    UTC 07:00–09:59                 →  sessionName: "London",   sessionPhase: "Open"
    UTC 10:00–12:59                 →  sessionName: "London",   sessionPhase: "Mid"
    UTC 13:00–15:59                 →  sessionName: "Overlap",  sessionPhase: "Open"
    UTC 16:00–18:59                 →  sessionName: "New York", sessionPhase: "Mid"
    UTC 19:00–20:59                 →  sessionName: "New York", sessionPhase: "Close"
  Example: chart shows 10:30 and timezone is UTC+2 → UTC = 08:30 → London Open.
  Set brokerTimezone to ${brokerTimezone} (the value you have been told — do not change it).
` : `
SESSION AND SESSION PHASE — if you can read the entry time and identify the broker timezone from
the chart (e.g. MT4/MT5 servers default to UTC+2 winter / UTC+3 summer; TradingView shows the
timezone in the chart footer), derive sessionName and sessionPhase using the same UTC-conversion
rules above. If you cannot determine the timezone with confidence, return null for both.
Set brokerTimezone to the UTC offset integer you identified (e.g. 2 for UTC+2), or null if unknown.
`;

  return `You are an expert trading chart and platform screenshot analyzer. Your job is to extract EVERY piece of visible trading data from the screenshot with maximum precision.

Return ONLY valid JSON (no markdown fences, no explanation) with ALL of these fields. Use null only when a value is genuinely not visible anywhere in the image — never omit a field, never guess, never leave data on the screen un-extracted.

{
  "instrument": "symbol exactly as shown e.g. EUR/USD, XAU/USD, NAS100, BTCUSD",
  "pairCategory": "Major or Minor or Exotic or Index or Crypto or Commodity or Stock",
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
  "sessionName": "Sydney or Tokyo or London or Overlap or New York or null",
  "sessionPhase": "Open or Mid or Close or null",
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
${tzBlock}

═══════════════════════════════════════════
CRITICAL EXTRACTION RULES — READ CAREFULLY
═══════════════════════════════════════════

DIRECTION — applies to ALL platforms (TradingView, MT4, MT5, cTrader, NinjaTrader, Quantower, etc.):
Use ALL of the following signals and pick the one with the most evidence:

  EXPLICIT TEXT (highest priority — always wins):
  • Any visible text "Buy", "BUY", "Long", "LONG" → LONG
  • Any visible text "Sell", "SELL", "Short", "SHORT" → SHORT
  • MT4/MT5 "Type" or "Direction" column showing "buy" → LONG; "sell" → SHORT
  • cTrader / NinjaTrader position type label "Buy" / "Long" → LONG; "Sell" / "Short" → SHORT
  • Order ticket or trade panel label "Buy Stop", "Buy Limit", "Buy Market" → LONG
  • Order ticket or trade panel label "Sell Stop", "Sell Limit", "Sell Market" → SHORT

  ARROW / ICON MARKERS on chart:
  • Blue or green upward-pointing arrow at entry → LONG
  • Red or orange downward-pointing arrow at entry → SHORT
  • "▲" marker at open or entry → LONG; "▼" marker → SHORT

  SL / TP BRACKET GEOMETRY (TradingView, cTrader brackets, any platform with visual levels):
  • SL level is ABOVE the entry line AND TP level is BELOW the entry line → SHORT
  • SL level is BELOW the entry line AND TP level is ABOVE the entry line → LONG
  • Red/pink shaded zone ABOVE entry + green shaded zone BELOW entry → SHORT
  • Red/pink shaded zone BELOW entry + green shaded zone ABOVE entry → LONG

  PRICE LOGIC (use only when no other signal available):
  • For a completed trade: if closing price < opening price and the P&L is positive → SHORT (profited from falling price)
  • For a completed trade: if closing price > opening price and the P&L is positive → LONG (profited from rising price)

  • NEVER guess direction from candle colours alone, chart slope, or background colour — always use the signals above in priority order.

OUTCOME — applies to ALL platforms:
Use ALL of the following signals and pick the one with the most evidence:

  EXPLICIT P&L NUMBER (highest priority):
  • Any numeric P&L value that is clearly positive (green, "+", no minus sign) → Win
  • Any numeric P&L value that is clearly negative (red, "−", with minus sign) → Loss
  • P&L within ±2 pips or ±$1 of zero → BE
  • Labels: "Profit", "Gain", "Credit" next to a number → Win; "Loss", "Debit" → Loss
  • MT4/MT5 "Profit" column: positive number → Win; negative → Loss
  • cTrader "Net Profit" / "Gross Profit": positive → Win; negative → Loss

  PRICE REACHING SL OR TP:
  • Price marker, close flag, or exit arrow sits visually AT the TP price level → Win (Target Hit)
  • Price marker, close flag, or exit arrow sits visually AT the SL price level → Loss (Stop Hit)
  • TradingView: trade bracket's closing end-point at TP → Win; at SL → Loss

  PLATFORM-SPECIFIC LABELS:
  • "TP" label with a price marker at that level reached → Win
  • "SL" label with a price marker at that level reached → Loss
  • "Take Profit hit", "Target reached", "TP filled" → Win
  • "Stop Loss hit", "Stopped out", "SL triggered" → Loss
  • TradingView "Open P/L" is ONLY a UI widget label — it does NOT mean the trade is open. Read the NUMBER next to it: positive = Win, negative = Loss.
  • TradingView Replay bar "Last processed tick: YYYY-MM-DD HH:MM:SS" = trade closed; compare last-tick price to TP/SL to determine Win or Loss.

  STILL OPEN:
  • "Open", "Active", "Running", "In progress", or no exit time visible → Open

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
- TradingView: a horizontal dashed line at the entry level often has the price printed on the right-side axis — that is the entryPrice
- Copy the exact number — e.g. 1.09250 not 1.09 or 1.093
- NEVER return null if any open/entry price is shown on the image

CLOSING PRICE (closingPrice):
- TradingView: an orange, yellow, or white horizontal price arrow "1.22021 →" near the last visible candle or at the right edge of a trade bracket = closingPrice
- MT4/MT5: "Close" column price in trade history = closingPrice
- Any price level labelled "Close", "Exit Price", "Closed at", or shown at the end of a trade bracket
- Copy the exact number shown — do NOT use the entry price as closing price

ENTRY TIME (entryTime):
PRIMARY LOCATIONS — check all of these in order:

★ TRADINGVIEW REPLAY MODE (most important special case):
  When the status bar shows "Replay mode has been activated" or "Last processed tick:":
  - The X-axis will have TWO highlighted (blue/cyan background) timestamps
  - The LEFTMOST highlighted timestamp = entryTime (this is where the replay / trade started)
  - The RIGHTMOST highlighted timestamp OR "Last processed tick: YYYY-MM-DD HH:MM:SS" = exitTime
  - Example: leftmost shows "Tue 08 Oct'19 18:13" → entryTime = "2019-10-08T18:13:00"
  - Example: rightmost shows "Tue 08 Oct'19 19:12" AND status bar says "Last processed tick: 2019-10-08 19:12:59" → exitTime = "2019-10-08T19:12:59"
  - DO NOT confuse these two — the leftmost highlight is ALWAYS entry, rightmost is ALWAYS exit

1. X-AXIS (time bar at bottom of chart): A HIGHLIGHTED timestamp directly on the horizontal time axis — usually a different colour (cyan, blue, white, or bold) from surrounding labels. The vertical line or bracket marking the trade open intersects the X-axis at exactly this timestamp.
2. TradingView trade info panel / tooltip: look for "Open time", "Entry", "Date", "Time" fields inside any floating panel or tooltip attached to the trade bracket.
3. MT4/MT5 history table: "Open Time" or "Time" column for the opening row.
4. Any on-chart label, annotation, or arrow marking the start of the trade.

- Format as YYYY-MM-DDTHH:mm:ss
- If only the time is shown on the axis (e.g. "18:13"), use the full date visible elsewhere on the same X-axis to reconstruct the complete timestamp
- Format examples:
  · "Fri 22 May'20 10:39"    → "2020-05-22T10:39:00"
  · "Tue 08 Oct'19 18:13"    → "2019-10-08T18:13:00"
  · "18:13" + date "Tue 08 Oct'19" visible → "2019-10-08T18:13:00"
- NEVER return null if any open/entry date or time is shown anywhere on the image

EXIT TIME (exitTime):
PRIMARY LOCATIONS — check all of these:
1. STATUS BAR / REPLAY BAR (highest priority in Replay mode): Text like "Last processed tick: 2020-05-22 10:58:59" or "Replay mode... tick: YYYY-MM-DD HH:MM:SS" — this timestamp IS the exit time. "Last processed tick: 2019-10-08 19:12:59" → exitTime = "2019-10-08T19:12:59"
2. X-AXIS: The RIGHTMOST highlighted/coloured timestamp (blue/cyan background) on the horizontal time axis where the trade closes.
3. TradingView trade info panel: look for "Close time", "Exit", "Date closed" in any floating panel or tooltip.
4. MT4/MT5 history table: "Close Time" column.
5. Any annotation, arrow, or label at the trade exit point on the chart.
- Format as YYYY-MM-DDTHH:mm:ss. If only the time is visible on the axis, combine it with the full date shown elsewhere on the same X-axis.
- "10:58" on axis + "Fri 22 May'20" date label = "2020-05-22T10:58:00"
- NEVER return null if any close/exit date or time is visible anywhere on the image

TIMESTAMPS general:
- Broker/platform local time (not UTC). Most MT4/MT5 brokers: UTC+2 winter, UTC+3 summer. TradingView uses the timezone set by the user — check for any timezone label.
- Always combine date and time into YYYY-MM-DDTHH:mm:ss format regardless of display format
- If the X-axis shows a full date label (e.g. "Tue 08 Oct'19") at one point and only times elsewhere, use that date for all nearby time-only labels
- Apostrophe year shorthand: Oct'19 = 2019, May'20 = 2020, Nov'22 = 2022

PRIMARY EXIT REASON:
- "Target Hit"    → price reached the exact planned TP level
- "Partial TP"    → closed with profit but TP not fully reached
- "Trailing Stop" → trailing stop triggered
- "Stop Hit"      → original stop loss triggered
- "Break-Even"    → SL moved to entry, closed ~zero
- "Time Exit"     → closed due to time/session
- "Manual"        → manually closed, no clear reason

PAIR CATEGORY — pick the most specific match from these exact values:
- "Major"     → forex pair where one side is USD and the other is EUR, GBP, JPY, CHF, AUD, CAD, or NZD (e.g. EUR/USD, USD/JPY, GBP/USD, AUD/USD, USD/CAD, USD/CHF, NZD/USD)
- "Minor"     → forex cross with NO USD involved (e.g. EUR/GBP, GBP/JPY, EUR/JPY, EUR/AUD, AUD/JPY, GBP/CHF)
- "Exotic"    → forex pair with an emerging-market currency (e.g. USD/TRY, USD/ZAR, USD/MXN, USD/SGD, GBP/ZAR, EUR/TRY)
- "Index"     → stock market index (e.g. NAS100, US100, SPX500, SP500, US30, DJ30, FTSE100, DAX, GER40, Nikkei, ASX200, any national market index)
- "Crypto"    → cryptocurrency (e.g. BTCUSD, BTC/USD, ETHUSD, ETH/BTC, any coin or token pair)
- "Commodity" → physical commodity (e.g. XAU/USD Gold, XAUUSD, XAG Silver, USOIL, WTI, UKOIL, Brent, Natural Gas, Copper, any metal or energy product)
- "Stock"     → individual company share (e.g. AAPL, TSLA, AMZN, any single-company equity)
- Do NOT return "Forex" — that is not a valid value

GENERAL:
- Scan EVERY pixel of text — overlays, labels, indicators, info panels, history tables, column headers
- Be precise: copy numbers exactly as shown, do not round or estimate
- Return ONLY the raw JSON object, absolutely no markdown, no explanation`;
}

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

// Live-tested model chain (May 2025):
//   gemini-2.5-flash  budget=0  → 1.07s  ✅ perfect accuracy  ← PRIMARY
//   gemini-3.5-flash  budget=0  → 1.73s  ✅ perfect accuracy  ← FALLBACK
//   gemini-2.5-flash-lite       → ~1s    untested             ← LAST RESORT
//
// Deprecated / unavailable on this key:
//   gemini-2.5-flash-preview-05-20  (404 — use gemini-2.5-flash)
//   gemini-2.0-flash                (404 — no longer available to new users)
//   gemini-2.0-flash-lite           (404 — no longer available to new users)
//
// thinkingBudget=512 was tested vs 0 — adds 2.4s with zero accuracy gain.
// Keep it at 0 for all models in this chain.
const MODEL_CHAIN: ModelConfig[] = [
  { model: "gemini-2.5-flash",      thinkingBudget: 0 },  // primary    · ~1.1s
  { model: "gemini-3.5-flash",      thinkingBudget: 0 },  // fallback   · ~1.7s
  { model: "gemini-2.5-flash-lite", thinkingBudget: 0 },  // last-resort · ~1s
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

// Major forex pairs — one side must be USD
const MAJOR_CURRENCIES = ["EUR","GBP","JPY","CHF","AUD","CAD","NZD"];
// Emerging / exotic currencies
const EXOTIC_CURRENCIES = ["TRY","ZAR","MXN","SGD","HKD","THB","PLN","HUF","CZK","DKK","NOK","SEK","ILS","SAR","AED","QAR","KWD","BHD"];
// Crypto tickers
const CRYPTO_PREFIXES = ["BTC","ETH","XRP","LTC","ADA","DOT","SOL","BNB","DOGE","SHIB","AVAX","MATIC","LINK","UNI","ATOM","XLM","ALGO","XMR","EOS","TRX"];
// Index keywords
const INDEX_KEYWORDS = ["NAS","US100","SPX","SP500","US30","DJ","DOW","FTSE","DAX","GER","NIK","ASX","CAC","HSI","IBEX","SMI","AEX","OMX"];
// Commodity tickers
const COMMODITY_KEYWORDS = ["XAU","GOLD","XAG","SILVER","OIL","WTI","BRENT","USOIL","UKOIL","GAS","NATGAS","COPPER","COCOA","COFFEE","SUGAR","WHEAT","CORN","COTTON","PLATINUM","PALLADIUM"];

function normalizePairCategory(raw: any, instrument?: string | null): string | null {
  const valid = ["Major","Minor","Exotic","Index","Crypto","Commodity","Stock"];

  // If Gemini already gave us a valid exact value, keep it
  if (raw) {
    const trimmed = String(raw).trim();
    if (valid.includes(trimmed)) return trimmed;
  }

  // Infer from instrument name as fallback
  const sym = String(instrument ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return raw ? String(raw) : null;

  // Crypto
  if (CRYPTO_PREFIXES.some(c => sym.startsWith(c) || sym.endsWith(c))) return "Crypto";

  // Commodity
  if (COMMODITY_KEYWORDS.some(k => sym.includes(k))) return "Commodity";

  // Index
  if (INDEX_KEYWORDS.some(k => sym.includes(k))) return "Index";

  // Forex: need at least 6 chars (EURUSD) or a slash pair
  if (sym.length >= 6) {
    const base = sym.slice(0, 3);
    const quote = sym.slice(3, 6);
    const hasUSD = base === "USD" || quote === "USD";
    const otherCcy = hasUSD ? (base === "USD" ? quote : base) : null;

    if (hasUSD && otherCcy) {
      if (EXOTIC_CURRENCIES.includes(otherCcy)) return "Exotic";
      if (MAJOR_CURRENCIES.includes(otherCcy))  return "Major";
      return "Exotic"; // USD pair with unknown currency = exotic
    }
    // No USD → minor cross if both are known currencies
    return "Minor";
  }

  return raw ? String(raw) : null;
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

function mapToJournalFields(extracted: Record<string, any>, knownTz?: number | null): Record<string, any> {
  // Session resolution priority:
  //   1. Gemini's own sessionName/sessionPhase when it was told the authoritative timezone (knownTz)
  //   2. Server-side derivation from entryTime + timezone (either knownTz or what Gemini guessed)
  //   3. null
  let sessionName:  string | null = null;
  let sessionPhase: string | null = null;

  const tzOffset = knownTz != null ? knownTz
    : (typeof extracted.brokerTimezone === "number" ? extracted.brokerTimezone : null);

  if (knownTz != null && extracted.sessionName && extracted.sessionPhase) {
    // Gemini was given the authoritative timezone and returned a session — trust it
    sessionName  = extracted.sessionName  ?? null;
    sessionPhase = extracted.sessionPhase ?? null;
  }

  // Always run the deterministic server-side derivation as a fallback / sanity check
  const serverSession = deriveSession(extracted.entryTime ?? null, tzOffset);
  if (!sessionName && serverSession.sessionName) {
    sessionName  = serverSession.sessionName;
    sessionPhase = serverSession.sessionPhase;
  }

  const duration = computeDuration(extracted.entryTime ?? null, extracted.exitTime ?? null);
  const lotSize  = normalizeLotSize(extracted.lotSize);

  return {
    instrument:             extracted.instrument          ?? null,
    pairCategory:           normalizePairCategory(extracted.pairCategory, extracted.instrument),
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
    sessionName,
    sessionPhase,
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
  brokerTimezone?: number | null,
): Promise<{ success: boolean; fields?: Record<string, any>; method?: string; modelUsed?: string; error?: string }> {
  if (!process.env.GOOGLE_API_KEY) {
    return { success: false, method: "gemini", error: "GOOGLE_API_KEY not set" };
  }

  const ai = getAI();
  const prompt = buildExtractionPrompt(brokerTimezone);

  if (brokerTimezone != null) {
    console.log(`[GeminiScreenshot] Injecting broker timezone UTC+${brokerTimezone} into prompt`);
  }

  // Compress image to ≤1920×1080 JPEG 85% before sending.
  // Cuts token usage by up to 75% on 4K screenshots; no accuracy impact.
  const { data: imageData, mimeType } = await compressForGemini(base64Image);

  // Acquire one free-tier slot (15 RPM / 1,500 RPD).
  // Queues automatically when the minute window is full; throws after 60 s.
  await geminiRateLimiter.acquire();

  let lastError: Error | null = null;

  for (const { model, thinkingBudget } of MODEL_CHAIN) {
    try {
      const config: Record<string, any> = {
        maxOutputTokens: 2048,
        // Force raw JSON output — no markdown fences, no explanation preamble.
        // This is the single cleanest speed win: the model skips all text
        // formatting overhead and goes straight to structured data.
        responseMimeType: "application/json",
      };

      // Explicitly disable thinking for flash models — without this,
      // 2.5-flash silently reasons for 30-60s before answering.
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
              { text: prompt },
              { inlineData: { mimeType, data: imageData } },
            ],
          },
        ],
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[GeminiScreenshot] Model "${model}" responded in ${elapsed}s`);

      const text = response.text ?? "";
      const extracted = parseGeminiJson(text);

      // ── Focused timestamp retry ─────────────────────────────────────────
      // If the main pass missed entryTime (the most critical missing field),
      // fire a small focused call asking ONLY about timestamps. This adds
      // ~2-4s but prevents the user from having to re-upload.
      if (!extracted.entryTime) {
        console.log(`[GeminiScreenshot] entryTime missing — running focused timestamp pass`);
        try {
          const tsPrompt = `Look at this trading chart screenshot very carefully.

Your ONLY job is to find timestamps. Return ONLY valid JSON with these fields:
{
  "entryTime": "YYYY-MM-DDTHH:mm:ss or null",
  "exitTime": "YYYY-MM-DDTHH:mm:ss or null"
}

RULES:
- Look at the horizontal X-axis at the bottom. Find timestamps with a highlighted/coloured background (blue, cyan, white) — those mark the trade open (leftmost) and close (rightmost).
- If you see "Replay mode" or "Last processed tick: YYYY-MM-DD HH:MM:SS" in a status bar at the bottom, that date+time is the exitTime.
- Combine a date label (e.g. "Mon 14 Oct'19") with a nearby time (e.g. "09:54") to build a full timestamp.
- Apostrophe year: Oct'19 = 2019, May'20 = 2020.
- Format: YYYY-MM-DDTHH:mm:ss. Return null only if truly invisible.`;

          await geminiRateLimiter.acquire();
          const tsResponse = await ai.models.generateContent({
            model,
            config: { maxOutputTokens: 256, responseMimeType: "application/json",
              ...(typeof thinkingBudget === "number" ? { thinkingConfig: { thinkingBudget: 256 } } : {}) },
            contents: [{ role: "user", parts: [{ text: tsPrompt }, { inlineData: { mimeType, data: imageData } }] }],
          });
          const tsParsed = parseGeminiJson(tsResponse.text ?? "{}");
          if (tsParsed.entryTime) extracted.entryTime = tsParsed.entryTime;
          if (tsParsed.exitTime && !extracted.exitTime) extracted.exitTime = tsParsed.exitTime;
          console.log(`[GeminiScreenshot] Timestamp retry: entryTime=${tsParsed.entryTime}, exitTime=${tsParsed.exitTime}`);
        } catch (tsErr: any) {
          console.warn(`[GeminiScreenshot] Timestamp retry failed: ${tsErr?.message}`);
        }
      }

      const fields = mapToJournalFields(extracted, brokerTimezone);
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
