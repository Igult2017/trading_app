import React from 'react';

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
      label: 'Max Drawdown',
      num: fmtDd(ts?.maxDrawdown), numColor: undefined,
      chip: fmtDd(deepest), chipCls: 'chip-rose',
    },
    {
      label: 'Avg. Drawdown',
      num: fmtDd(ts?.avgDrawdown), numColor: undefined,
      chip: 'Mean depth', chipCls: 'chip-accent',
    },
    {
      label: 'Recovery Factor',
      num: rf ? String(rf) : '—', numColor: 'var(--emerald)',
      chip: 'Net Profit / Max DD', chipCls: 'chip-emerald',
    },
    {
      label: 'Trend Alignment',
      num: `${trend}%`, numColor: undefined,
      chip: trend > 0 ? 'HTF agreement' : 'Unclassified', chipCls: 'chip-slate',
    },
  ];

  return (
    <section className="dd-grid dd-g4">
      {cards.map((c) => (
        <div className="dd-kpi" key={c.label}>
          <div className="dd-kpi-head">
            <span className="dd-kpi-label">{c.label}</span>
          </div>
          <div className="dd-kpi-val">
            <span className="dd-kpi-num" style={c.numColor ? { color: c.numColor } : undefined}>{c.num}</span>
            <span className={`dd-kpi-chip ${c.chipCls}`}>{c.chip}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
