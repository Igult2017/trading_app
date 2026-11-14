import React from 'react';
import { StatCard, type Stat } from '@/components/shared/StatCard';

/**
 * ddHeader — the drawdown page's top row, built from the DASHBOARD's own card.
 *
 * His instruction, 2026-11-14, pointing at the old four cards with every chip underlined: *"remove
 * those unnecessary text and make it look simple and appealing like image 4 which is the header for
 * the dashboard page… but displaying issues related with drawdown."*
 *
 * So: the Dashboard's `StatCard`, the Dashboard's grid (6 across, 3 below 900px, 2 on a phone), and
 * NO chips, NO footers, NO second line of text. Every number already came back from the API —
 * nothing here is new arithmetic.
 *
 * WHAT WENT, and why:
 *   * TREND ALIGNMENT — not a drawdown measure, and he underlined its "Unclassified".
 *   * the chips under each figure ("-3.00%", "Mean depth", "Net Profit / Max DD", "Unclassified").
 *   * the separate "Drawdown Profile & Underwater Depth" badges — Below peak, Since peak, Longest
 *     underwater — which are HERE now instead, so the chart below is not crowned by two headers.
 */
const RED = '#fb7185', GREEN = '#34d399', INDIGO = '#818cf8', SLATE = '#94a3b8';

const pct = (v?: number | null) => (v == null ? '—' : v === 0 ? '0.00%' : `${Number(v).toFixed(2)}%`);
const span = (trades?: number | null, days?: number | null) =>
  `${trades ?? 0} trade${(trades ?? 0) === 1 ? '' : 's'} · ${days ?? 0}d`;

export function DdHeader({ ts, intel }: { ts: any; intel: any }) {
  const cur = intel?.current ?? {};
  const uw = intel?.underwater ?? {};
  const inDd = !!cur.inDrawdown;
  const rf = Number(ts?.recoveryFactor ?? 0);

  const stats: Stat[] = [
    { id: 'dd-now', label: 'BELOW PEAK', value: inDd ? pct(cur.ddPct) : '0.00%',
      color: inDd ? RED : GREEN, title: inDd ? 'How far below the account’s highest point it is now'
                                             : 'At the account’s highest point' },
    { id: 'dd-max', label: 'MAX DRAWDOWN', value: pct(ts?.maxDrawdown),
      color: Number(ts?.maxDrawdown ?? 0) < 0 ? RED : SLATE },
    { id: 'dd-avg', label: 'AVG DRAWDOWN', value: pct(ts?.avgDrawdown),
      color: Number(ts?.avgDrawdown ?? 0) < 0 ? RED : SLATE },
    { id: 'dd-since', label: 'SINCE PEAK', value: span(cur.tradesSincePeak, cur.daysSincePeak),
      color: inDd ? INDIGO : SLATE },
    { id: 'dd-longest', label: 'LONGEST UNDERWATER', value: span(uw.longestTrades, uw.longestDays),
      color: INDIGO },
    // Net profit ÷ max drawdown. Below zero means the account is down overall, so it is red.
    { id: 'dd-rf', label: 'RECOVERY FACTOR', value: rf ? String(rf) : '—',
      color: rf > 0 ? GREEN : rf < 0 ? RED : SLATE },
  ];

  return (
    <section className="dd-grid dd-g6">
      {stats.map((s) => <StatCard key={s.id} stat={s} />)}
    </section>
  );
}
