import React from 'react';
import { MP_REF } from '@/components/shared/mpTokens';
import { Panel, DR } from '@/components/shared/mpBits';

/**
 * ddSummary — the Analytics page's "Period Summary" card, with drawdown in it.
 *
 * His instruction, 2026-11-14, circling the card I had left out: *"Add it back but let it have content
 * related to drawdown such as average monthly drawdown, daily drawdown, highest drawdown etc."* The
 * card is built from Analytics' own pieces (shared/mpBits), so it is the same card, not a lookalike.
 *
 * EVERY FIGURE IS EITHER RETURNED BY THE SERVER OR COUNTED FROM REAL TRADES ALREADY ON THE PAGE:
 *   Highest / Current drawdown   topStats.maxDrawdown, intelligence.current.ddPct
 *   Avg monthly / Worst month    monthly[].maxDdPct — each month's own deepest fall (server, <= 0)
 *   Max / Avg daily drawdown     counted here from the equity curve's per-trade P/L and date
 *   Drawdown episodes            intelligence.underwater.episodes
 *
 * ⚠ "A DAY" IS THE CALENDAR DATE A TRADE IS RECORDED ON. A prop firm's daily drawdown usually resets
 * at the broker's midnight, which the trades do not carry — said on the card's tooltip rather than
 * implied. A day's drawdown is that day's P/L over the balance it STARTED with; AVG DAILY counts LOSING
 * days only, because a winning day is not a drawdown. Without a starting balance there is nothing to
 * take a percentage of, so both daily rows show "—" rather than an invented base.
 */
const D = MP_REF;

const pct = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? '—' : v === 0 ? '0.00%' : `${v.toFixed(2)}%`;
const tone = (v: number | null | undefined) => (v != null && v < 0 ? D.red : D.text);

/** Each calendar day's P/L as a % of the balance that day began with, in trade order. */
export function dailyDrawdowns(curve: any[], startBal: number): number[] {
  if (!(startBal > 0) || !Array.isArray(curve)) return [];
  const days: { key: string; pl: number; before: number }[] = [];
  let cum = 0;
  for (const t of curve) {
    const key = typeof t?.date === 'string' ? t.date.slice(0, 10) : '';
    const pnl = Number(t?.pnl) || 0;
    const last = days[days.length - 1];
    if (!key || !last || last.key !== key) days.push({ key, pl: 0, before: cum });
    days[days.length - 1].pl += pnl;
    cum += pnl;
  }
  return days.map((d) => (d.pl / (startBal + d.before)) * 100);
}

export function DdSummary({ ts, intel, monthly, equityCurve, startingBalance }: {
  ts: any; intel: any; monthly: any[]; equityCurve: any[]; startingBalance?: number;
}) {
  const cur = intel?.current ?? {};
  const uw = intel?.underwater ?? {};

  const months = (monthly ?? []).filter((m) => (Number(m?.totalTrades) || 0) > 0);
  const mdd = months.map((m) => Number(m?.maxDdPct) || 0);
  const avgMonthly = mdd.length ? mdd.reduce((a, b) => a + b, 0) / mdd.length : null;
  const worstIdx = mdd.length ? mdd.indexOf(Math.min(...mdd)) : -1;
  const worst = worstIdx >= 0 ? mdd[worstIdx] : null;
  const worstName = worstIdx >= 0
    ? `${String(months[worstIdx]?.month ?? '').slice(0, 3)} ${months[worstIdx]?.year ?? ''}`.trim()
    : '';

  const days = dailyDrawdowns(equityCurve, Number(startingBalance) || 0);
  const losing = days.filter((d) => d < 0);
  const maxDaily = days.length ? Math.min(0, ...days) : null;
  const avgDaily = days.length ? (losing.length ? losing.reduce((a, b) => a + b, 0) / losing.length : 0) : null;

  const current = cur.inDrawdown ? Number(cur.ddPct) || 0 : 0;

  return (
    <div style={{ height: '100%' }} title="A day is the calendar date a trade is recorded on; a daily drawdown is that day's P/L over the balance it started with. Average daily counts losing days only.">
      <Panel title="Drawdown Summary" badge="Risk" badgeColor="red" style={{ height: '100%' }}>
        <DR label="Highest Drawdown"     value={pct(ts?.maxDrawdown)} vc={tone(ts?.maxDrawdown)} />
        <DR label="Current Drawdown"     value={pct(current)} vc={current < 0 ? D.red : D.green} />
        <DR label="Avg Monthly Drawdown" value={pct(avgMonthly)} vc={tone(avgMonthly)} />
        <DR label="Worst Month"          value={worst == null ? '—' : `${pct(worst)}${worstName ? ` · ${worstName}` : ''}`} vc={tone(worst)} />
        <DR label="Max Daily Drawdown"   value={pct(maxDaily)} vc={tone(maxDaily)} />
        <DR label="Avg Daily Drawdown"   value={pct(avgDaily)} vc={tone(avgDaily)} />
        <DR label="Drawdown Episodes"    value={String(Number(uw.episodes) || 0)} />
      </Panel>
    </div>
  );
}
