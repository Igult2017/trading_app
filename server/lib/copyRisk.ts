/**
 * A copy follower's risk per trade — the most one copied trade may lose, as % of the account.
 *
 * HIS RULES, 15 Nov 2026: *"Every existing follower default risk is 1% but they cant reset it to more
 * than 3% meaning 3% is the highest."* The copy engine enforces the same numbers on every trade
 * (`copy_platform/risk_stop.py`); this keeps what is STORED honest too, so no screen shows a setting
 * the engine will not honour.
 *
 * Applied in `storage.createCopyFollower` / `updateCopyFollower` — the one place every follower
 * write passes through (seven routes write followers; limiting each would leave the next one out).
 */
export const DEFAULT_RISK_PCT = 1;
export const MIN_RISK_PCT = 0.1;
export const MAX_RISK_PCT = 3;

/** Any input -> a stored risk % between 0.1 and 3, defaulting to 1. Returned as the decimal string
 *  the `risk_percent` column takes. */
export function clampRiskPercent(v: unknown): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RISK_PCT.toFixed(2);
  return Math.min(MAX_RISK_PCT, Math.max(MIN_RISK_PCT, n)).toFixed(2);
}
