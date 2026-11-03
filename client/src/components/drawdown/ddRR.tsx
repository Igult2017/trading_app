import React from 'react';
import { BarChart3 } from 'lucide-react';

/**
 * ddRR — "RR Distribution", from his 2026-11-03 mock-up.
 *
 * From `rrBuckets` (server/python/drawdown/distribution.py): four reward-to-risk bands, each with a
 * `label`, a plain-words `note`, a trade `count` and a `pct`. The colour per band is the mock-up's:
 * red below 1:1, amber to 1:2, green in the target range, blue for the outliers.
 *
 * The closing line is kept from the old panel — it is the one sentence that turns the four bars into
 * a finding, and the mock-up's static "classifications will update dynamically" text said nothing.
 */
const TONE: Record<string, string> = {
  '< 1:1': 'var(--rose-mid)',
  '1:1 – 1:2': 'var(--amber-mid)',
  '1:2 – 1:3': 'var(--emerald-mid)',
  '> 1:3': 'var(--blue-mid)',
};

export function DdRR({ buckets }: { buckets: any[] }) {
  const rows = buckets ?? [];
  const belowTarget = rows
    .filter((b: any) => b.label === '< 1:1' || b.label === '1:1 – 1:2')
    .reduce((s: number, b: any) => s + (Number(b.pct) || 0), 0);
  const anyTrades = rows.some((b: any) => Number(b.count) > 0);

  return (
    <div className="dd-card dd-colbetween" style={{ gap: 12 }}>
      <div>
        <div className="dd-between" style={{ marginBottom: 12 }}>
          <h3 className="dd-title">RR Distribution</h3>
          <span className="dd-ico-badge ico-blue" aria-hidden><BarChart3 width={16} height={16} /></span>
        </div>

        {rows.length === 0 ? (
          <p className="dd-muted">No reward-to-risk data on these trades yet.</p>
        ) : (
          <div className="dd-mono fs-xs">
            {rows.map((b: any) => (
              <div className="dd-bucket" key={b.label}>
                <div className="dd-between" style={{ gap: 8 }}>
                  <span className="c-soft fw-semi">
                    {b.label}{' '}
                    <span className="c-faint" style={{ fontWeight: 400, fontFamily: 'var(--dd-sans)' }}>
                      ({b.note})
                    </span>
                  </span>
                  <span className="c-dim fw-bold" style={{ whiteSpace: 'nowrap' }}>
                    {b.count} trade{Number(b.count) === 1 ? '' : 's'} · {b.pct}%
                  </span>
                </div>
                <div className="dd-bucket-track">
                  <i style={{ width: `${Math.max(Number(b.pct) || 0, 0)}%`,
                              background: TONE[b.label] ?? 'var(--ink-faint)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="dd-note" style={{ display: 'block' }}>
        {!anyTrades
          ? 'R:R bands fill in as trades are logged with a stop and a target.'
          : belowTarget > 0
            ? `${belowTarget.toFixed(0)}% of trades fall below the target band — `
              + 'the largest single contributor to drawdown depth.'
            : 'Every closed trade sat in or above the target band.'}
      </p>
    </div>
  );
}
