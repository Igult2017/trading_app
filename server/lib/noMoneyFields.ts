/**
 * NO MONEY VALUES FROM A SCREENSHOT OR PASTE (his rule, 16 Nov 2026).
 *
 * *"We dont extract money values. The journal requires that one enters amount he risks in every trade then it
 * calculates the rest."* The journal's P&L is the risk he enters x the R achieved (`client/src/components/
 * JournalForm.tsx`). A dollar figure read off a chart used to OVERRIDE that calculation; this removes any such
 * field from a reader's result — for every reader (Gemini, NVIDIA, OCR), in the one route they all pass.
 * Points, pips and R:R are not money and are kept.
 */
const MONEY_KEY = /USD$|^profitLoss$|^pnl$|^netProfit$|^grossProfit$|money|^commission$|^swap$/i;

export function stripMoneyFields(f: Record<string, any> | null | undefined): Record<string, any> | null | undefined {
  if (!f || typeof f !== "object") return f;
  for (const k of Object.keys(f)) if (MONEY_KEY.test(k)) delete f[k];
  const raw = f.aiExtractedRaw;
  if (raw && typeof raw === "object") for (const k of Object.keys(raw)) if (MONEY_KEY.test(k)) delete raw[k];
  return f;
}
