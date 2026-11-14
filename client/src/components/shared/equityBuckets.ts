/**
 * equityBuckets — groups the equity curve's trades into days, weeks or months for the shared
 * equity / drawdown chart (shared/EquityCurveChart). Moved out of that file on 2026-11-15 when it
 * passed 200 lines; unchanged. Each bucket keeps its LAST trade, so the line shows where the
 * account stood at the end of that day / week / month.
 */
export type View = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export function group(equityCurve: any[], view: View): any[] {
  if (!equityCurve || equityCurve.length === 0) return [];
  if (view === 'DAILY') return equityCurve.map((e: any) => {
    const d = e.date ? new Date(e.date) : null;
    const label = (d && !isNaN(d.getTime()))
      ? d.toLocaleString('default', { month: 'short', day: 'numeric' })
      : `#${e.tradeNumber}`;
    return { ...e, _label: label };
  });
  const buckets = new Map<string, any>();
  for (const e of equityCurve) {
    const d = e.date ? new Date(e.date) : null;
    let key: string; let label: string;
    if (!d || isNaN(d.getTime())) { key = `t${e.tradeNumber}`; label = `#${e.tradeNumber}`; }
    else if (view === 'WEEKLY') {
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      key = `${d.getFullYear()}-W${week}`; label = `W${week}`;
    } else {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      label = d.toLocaleString('default', { month: 'short' });
    }
    buckets.set(key, { ...e, _label: label });
  }
  return Array.from(buckets.values());
}
