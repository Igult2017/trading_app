import React from 'react';

/**
 * ddBreakdown — "Drawdown Breakdown", the ranked contribution table from his 2026-11-03 mock-up.
 *
 * Rows come from `intelligence` (server/python/drawdown/intelligence.py): `byStrategy`,
 * `byInstrument`, and the same two split by direction under `byDirection.bullish/.bearish`. Each row
 * carries `name`, `trades`, `lossRate` and `totalLossPct` — nothing here is derived beyond the bar
 * width.
 *
 * ⚠ HIS FIVE TABS DESCRIBE TWO DIFFERENT THINGS, so they drive two pieces of state rather than one.
 * BEARISH / BULLISH / ALL choose the DIRECTION slice; STRATEGY / INSTRUMENT choose what the rows are
 * GROUPED BY. The mock-up draws them as one row with a single highlight, which would have made some
 * combinations unreachable — the old panel had both controls and losing one would have been a lost
 * feature. So his exact five tabs stay, and TWO of them read as selected: the live direction and the
 * live grouping. That is the one visible departure in this section, and it is deliberate.
 */
const DIRECTIONS = ['BEARISH', 'BULLISH', 'ALL'] as const;
const GROUPINGS = ['STRATEGY', 'INSTRUMENT'] as const;

export type DirKey = typeof DIRECTIONS[number];
export type GroupKey = typeof GROUPINGS[number];

function fmtDd(v?: number | null): string {
  if (v == null) return '—';
  return v === 0 ? '0.00%' : `${Number(v).toFixed(2)}%`;
}

export function ddBreakdownRows(intel: any, dir: DirKey, group: GroupKey): any[] {
  const viewKey = group === 'INSTRUMENT' ? 'byInstrument' : 'byStrategy';
  if (dir === 'ALL') return intel?.[viewKey] ?? [];
  const slice = intel?.byDirection?.[dir === 'BEARISH' ? 'bearish' : 'bullish'];
  // Falls back to the undirected list when the API has no direction split, rather than showing an
  // empty table and implying there were no trades.
  return slice?.[viewKey] ?? intel?.[viewKey] ?? [];
}

export function DdBreakdown({
  intel, dir, group, onDir, onGroup,
}: {
  intel: any; dir: DirKey; group: GroupKey;
  onDir: (d: DirKey) => void; onGroup: (g: GroupKey) => void;
}) {
  const rows = ddBreakdownRows(intel, dir, group);
  const max = Math.max(0.01, ...rows.map((r: any) => Math.abs(Number(r.totalLossPct) || 0)));
  const totalLoss = rows.reduce((s: number, r: any) => s + Math.abs(Number(r.totalLossPct) || 0), 0);

  return (
    <section className="dd-card dd-stack">
      <div className="dd-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 className="dd-title">Drawdown Breakdown</h3>
          <p className="dd-muted">Categorised contribution to overall equity decline</p>
        </div>
        <div className="dd-tabs" role="tablist" aria-label="Drawdown breakdown view">
          {DIRECTIONS.map((d) => (
            <button key={d} role="tab" className="dd-tab" aria-selected={dir === d}
                    onClick={() => onDir(d)}>{d}</button>
          ))}
          {GROUPINGS.map((g) => (
            <button key={g} role="tab" className="dd-tab" aria-selected={group === g}
                    onClick={() => onGroup(g)}>{g}</button>
          ))}
        </div>
      </div>

      <div className="dd-twrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>{group === 'INSTRUMENT' ? 'Instrument' : 'Strategy Profile'}</th>
              <th>Trade Sample</th>
              <th>Loss Contribution</th>
              <th className="dd-right">Max Drawdown</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="dd-empty">
                No {dir === 'ALL' ? '' : `${dir.toLowerCase()} `}trades grouped by {group.toLowerCase()} yet
              </td></tr>
            ) : rows.map((r: any, i: number) => {
              const loss = Math.abs(Number(r.totalLossPct) || 0);
              const neg = Number(r.totalLossPct) < 0;
              // Share of this view's total loss — the mock-up's "100%" column.
              const share = totalLoss > 0 ? (loss / totalLoss) * 100 : 0;
              return (
                <tr className="dd-rowhover" key={`${r.name}-${i}`}>
                  <td className="fw-bold c-amber">{String(i + 1).padStart(2, '0')}</td>
                  <td className="fw-semi c-strong">{r.name}</td>
                  <td className="c-soft">
                    <span className="dd-tag">{r.trades} trade{r.trades === 1 ? '' : 's'}</span>
                    <span className="c-rose" style={{ marginLeft: 8 }}>· {r.lossRate}% loss rate</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="dd-track dd-track-w">
                        <i style={{ width: `${Math.max((loss / max) * 100, 1)}%` }} />
                      </div>
                      <span className="c-rose fw-bold">{Math.round(share)}%</span>
                    </div>
                  </td>
                  <td className={`dd-right fw-bold fs-sm ${neg ? 'c-rose' : 'c-dim'}`}>
                    {neg ? fmtDd(r.totalLossPct) : '0.00%'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
