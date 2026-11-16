/**
 * Screenshot labels — COPY what the chart prints, then CALCULATE in code (17 Nov 2026).
 *
 * Why: on his GBP/JPY screenshot (Wed 01 Dec'21) the NVIDIA model's full-form reading was wrong and different
 * every time — entry 150.866 / 151.123 / 151.123 (truth ≈150.933), year 2020, "Tuesday". Asked only to copy the
 * printed labels, the same model was right 5 of 5 on the symbol, dates, lot, "Closed P/L 18.5 points",
 * "Drawdown 3.0 points", "TP/SL Ratio 2.76", "SL 6.7 points". So the model copies; this file does the maths.
 *
 * Prices: the model cannot read the small price-scale boxes (SL price 1 of 5; it invented "151.127" 3 of 5).
 * A price is kept only when two independent readings agree (see `checkPrices`), else it is left BLANK —
 * a wrong entry price in his journal is worse than an empty box he types into.
 */

export const LABELS_PROMPT = `You are copying text from a trading chart screenshot. Do NOT calculate or infer anything. Copy labels EXACTLY as printed, character for character. Return ONLY JSON:
{
 "symbol": "instrument name printed top-left, or null",
 "positionArrow": "up or down — the arrow on the position/entry label, or null",
 "entryLabelRow": "full text of the label row that sits on the entry line (e.g. lot size, Closed P/L, Drawdown, ratio), or null",
 "slLabel": "text of the label marked SL, or null",
 "tpLabel": "text of the label marked TP, or null",
 "timeAxisHighlighted": ["every highlighted date/time label on the BOTTOM time axis, left to right, exactly as printed"]
}`;

/** Asked SEPARATELY: folded into the request above, the model mislabelled the orange high marker as the entry.
 *  Alone it copied these 10 of 10 the same way (one empty answer → prices blank, never wrong). */
export const PRICES_PROMPT = `You are copying numbers from a trading chart screenshot. Do NOT calculate anything. The trade has an entry point, a stop-loss line (label "SL") and a take-profit line (label "TP"). Return ONLY JSON:
{
 "slLineAxisPrice": "the price printed in the small box on the RIGHT-hand price scale, level with the SL line, exactly as printed, or null",
 "tpLineAxisPrice": "the price printed in the small box on the RIGHT-hand price scale, level with the TP line, exactly as printed, or null",
 "entryPricePrinted": "a price printed in text right beside the ENTRY point at the LEFT edge of the trade box (not at the top, not on the price scale), exactly as printed, or null if there is none"
}`;

const MONTHS =["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const num = (s: string | undefined) => (s == null ? null : Number(s));

/** "Wed 01 Dec'21 05:44", "Wed 01 Dec 21 07:12:20", "01 December 2021 05:44" → "2021-12-01T05:44:00". */
export function parsePrintedDateTime(text: string): string | null {
  const m = /(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*['’]?\s*(\d{4}|\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
  if (mon < 0) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const p = (n: number | string) => String(n).padStart(2, "0");
  const d = new Date(Date.UTC(year, mon, Number(m[1])));
  if (d.getUTCMonth() !== mon) return null;                   // "31 Feb" — not a real date
  return `${year}-${p(mon + 1)}-${p(m[1])}T${p(m[4])}:${m[5]}:${m[6] ?? "00"}`;
}

/** Day of week from the DATE itself — never the model's guess (it said "Tuesday" for Wed 01 Dec 2021). */
export function dayOfWeekOf(iso: string | null): string | null {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? DAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] : null;
}

/** Turn the copied labels into the raw fields the journal mapping reads. Only what is printed is set. */
export function parseLabels(l: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  const row = String(l?.entryLabelRow ?? "");
  const pts = (re: RegExp, s: string) => num(re.exec(s)?.[1]);

  if (typeof l?.symbol === "string" && l.symbol.trim()) out.instrument = l.symbol.trim();
  const arrow = String(l?.positionArrow ?? "").toLowerCase();
  if (arrow === "up") out.direction = "Long";
  if (arrow === "down") out.direction = "Short";

  const lot = pts(/(\d+(?:\.\d+)?)\s*lots?\b/i, row);
  if (lot != null) out.lotSize = lot;
  const closed = pts(/Closed\s*P\/?L\s*([-+]?\d+(?:\.\d+)?)\s*(?:points|pips)/i, row);
  if (closed != null) {
    out.closedPLPips = closed; out.profitLossPoints = closed;
    out.outcome = closed > 0 ? "Win" : closed < 0 ? "Loss" : "Breakeven";
  }
  const dd = pts(/Drawdown\s*[-+]?(\d+(?:\.\d+)?)\s*(?:points|pips)/i, row);
  if (dd != null) out.drawdownPoints = dd;
  const ratio = pts(/TP\s*\/\s*SL\s*Ratio\s*(\d+(?:\.\d+)?)/i, row);
  if (ratio != null) out.riskReward = ratio;

  // "SL 6.7 points" and "SL -7.9 points" both occur — the distance is the size, the sign is the platform's
  const sl = pts(/SL\s*[-+]?\s*(\d+(?:\.\d+)?)\s*(?:points|pips)/i, String(l?.slLabel ?? ""));
  if (sl != null) out.stopLossDistance = sl;
  const tp = pts(/TP\s*[-+]?\s*(\d+(?:\.\d+)?)\s*(?:points|pips)/i, String(l?.tpLabel ?? ""));
  if (tp != null) out.takeProfitDistance = tp;
  if (closed != null && sl) out.achievedRR = Math.round((closed / sl) * 100) / 100;

  const times = (Array.isArray(l?.timeAxisHighlighted) ? l.timeAxisHighlighted : [])
    .map((t: any) => parsePrintedDateTime(String(t))).filter(Boolean) as string[];
  if (times.length >= 2) {                                    // one label alone could be either end — leave it
    out.entryTime = times[0];
    out.exitTime = times[times.length - 1];
  }
  const day = dayOfWeekOf(out.entryTime ?? null);
  if (day) out.dayOfWeek = day;
  return out;
}

/** The prices PRINTED on the chart (answer to PRICES_PROMPT) — the only prices `checkPrices` trusts. */
export function parsePrintedPrices(l: Record<string, any>): Record<string, any> {
  const price = (v: any) => { const m = /\d+\.\d+/.exec(String(v ?? "")); return m ? Number(m[0]) : null; };
  return { printedEntryPrice: price(l?.entryPricePrinted), printedSlPrice: price(l?.slLineAxisPrice),
           printedTpPrice: price(l?.tpLineAxisPrice) };
}

/** The size of one pip for a currency pair; null for anything else (no guessing on metals/indices). */
export function pipSizeOf(instrument: unknown): number | null {
  const s = String(instrument ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!/^[A-Z]{6}$/.test(s) || /XAU|XAG|BTC|ETH/.test(s)) return null;
  return s.endsWith("JPY") ? 0.01 : 0.0001;
}

const PRICE_KEYS = ["entryPrice", "openingPrice", "closingPrice", "stopLoss", "takeProfit"] as const;

/**
 * Prices come ONLY from numbers printed on the chart — never from the model's own working, which on his GBP/JPY
 * chart took the stop price as the entry and invented a stop 6.7 pips below it (self-consistent, and wrong).
 *
 *   stop   = the price box level with the SL line (copied 6 of 6 correctly on his chart)
 *   entry  = the price printed at the entry if there is one, else stop ± the printed SL distance
 *   check  = the price box level with the TP line must agree with entry ± (ratio × SL distance), within 1 pip,
 *            and entry/stop must agree with the printed SL distance within 1 pip
 *   target = only the printed TP box, and only when it agrees within 0.3 pip; else blank
 *   exit   = blank (no printed exit price is read)
 * Any check fails → every price blank, and the form asks him to type them.
 */
export function checkPrices(f: Record<string, any>): { fields: Record<string, any>; blanked: boolean } {
  const out = { ...f };
  for (const k of PRICE_KEYS) out[k] = null;
  const pip = pipSizeOf(out.instrument);
  const sign = out.direction === "Long" ? 1 : out.direction === "Short" ? -1 : 0;
  const S = out.printedSlPrice, T = out.printedTpPrice, slPts = out.stopLossDistance, ratio = out.riskReward;
  if (!pip || !sign || typeof S !== "number" || typeof slPts !== "number" || slPts <= 0) {
    return { fields: out, blanked: true };
  }
  const dp = pip === 0.01 ? 3 : 5;
  const E = typeof out.printedEntryPrice === "number" ? out.printedEntryPrice : Number((S + sign * slPts * pip).toFixed(dp));
  const stopAgrees = sign * (E - S) > 0 && Math.abs(Math.abs(E - S) / pip - slPts) <= 1;
  const tpPips = typeof out.takeProfitDistance === "number" ? out.takeProfitDistance
    : typeof ratio === "number" ? ratio * slPts : null;
  const tpGap = typeof T === "number" && tpPips != null && sign * (T - E) > 0
    ? Math.abs(Math.abs(T - E) / pip - tpPips) : null;
  if (!stopAgrees || tpGap == null || tpGap > 1) return { fields: out, blanked: true };
  out.entryPrice = E;
  out.openingPrice = E;
  out.stopLoss = S;
  if (tpGap <= 0.3) out.takeProfit = T;
  return { fields: out, blanked: false };
}
