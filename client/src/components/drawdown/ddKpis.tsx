import React from 'react';
import { TrendingDown, Activity, Award, BarChart3 } from 'lucide-react';

/**
 * ddKpis — the four headline cards, from his 2026-11-03 mock-up.
 *
 * All four come straight from `topStats` (server/python/drawdown/metrics.py), which is what the old
 * panel already read — so these are the same four numbers in his new frame, not new maths.
 *
 * ⚠ TWO FIGURES IN THE MOCK-UP HAVE NO SOURCE AND ARE NOT INVENTED HERE. Its Max Drawdown card
 * carries a cash chip ("-$478.40") and a "Trade #5" footer; `topStats` returns percentages only, and
 * neither the money value nor the trade index exists in the response. Rather than fabricate them,
 * the chip shows what IS known — the deepest point from the underwater series — and the footer says
 * what the figure measures. Adding the cash value would mean a real change to the Python, which this
 * change is not scoped to.
 */
function fmtDd(v?: number | null): string {
  if (v == null) return '—';
  return v === 0 ? '0.00%' : `${Number(v).toFixed(2)}%`;
}

export function DdKpis({ ts, series }: { ts: any; series?: number[] }) {
  // The deepest point actually recorded, used as the Max Drawdown chip.
  const deepest = Array.isArray(series) && series.length
    ? Math.min(0, ...series.map((n) => Number(n) || 0))
    : Number(ts?.maxDrawdown ?? 0);

  const rf = Number(ts?.recoveryFactor ?? 0);
  const trend = Number(ts?.trendAlignment ?? 0);

  const cards = [
    {
      label: 'Max Drawdown', ico: 'ico-rose', Icon: TrendingDown,
      num: fmtDd(ts?.maxDrawdown), numColor: undefined,
      chip: fmtDd(deepest), chipCls: 'chip-rose',
      footL: 'Peak-to-Trough Drop', footR: 'Deepest recorded', footCls: 'c-ink',
    },
    {
      label: 'Avg. Drawdown', ico: 'ico-amber', Icon: Activity,
      num: fmtDd(ts?.avgDrawdown), numColor: undefined,
      chip: 'Mean depth', chipCls: 'chip-amber',
      footL: 'Mean Depth per Dip',
      footR: Math.abs(Number(ts?.avgDrawdown ?? 0)) < 1 ? 'Controlled' : 'Elevated',
      footCls: Math.abs(Number(ts?.avgDrawdown ?? 0)) < 1 ? 'c-ink' : 'c-amber',
    },
    {
      label: 'Recovery Factor', ico: 'ico-emerald', Icon: Award,
      num: rf ? String(rf) : '—', numColor: 'var(--emerald)',
      chip: 'Net Profit / Max DD', chipCls: 'chip-emerald',
      footL: 'Resilience Index',
      footR: rf >= 3 ? 'Excellent (>3.0)' : rf > 0 ? 'Building' : 'No data',
      footCls: rf >= 3 ? 'c-emerald fw-bold' : 'c-dim',
    },
    {
      label: 'Trend Alignment', ico: 'ico-blue', Icon: BarChart3,
      num: `${trend}%`, numColor: undefined,
      chip: trend > 0 ? 'HTF agreement' : 'Unclassified', chipCls: 'chip-slate',
      footL: 'HTF Bias Sync', footR: trend > 0 ? 'Tagged' : 'Needs Tagging', footCls: 'c-dim',
    },
  ];

  return (
    <section className="dd-grid dd-g4">
      {cards.map((c) => (
        <div className="dd-kpi" key={c.label}>
          <div className="dd-kpi-head">
            <span className="dd-kpi-label">{c.label}</span>
            <div className={`dd-kpi-ico ${c.ico}`} aria-hidden><c.Icon width={16} height={16} /></div>
          </div>
          <div className="dd-kpi-val">
            <span className="dd-kpi-num" style={c.numColor ? { color: c.numColor } : undefined}>{c.num}</span>
            <span className={`dd-kpi-chip ${c.chipCls}`}>{c.chip}</span>
          </div>
          <div className="dd-kpi-foot">
            <span>{c.footL}</span>
            <span className={`${c.footCls} dd-mono fw-med`}>{c.footR}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
