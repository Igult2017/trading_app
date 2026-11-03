import React from 'react';
import { DdChart } from '@/components/drawdown/ddChart';
import { fmtDd } from '@/components/drawdown/ddBits';

/**
 * ddProfile — "Drawdown Profile & Underwater Depth": the hero card's header strip plus the chart.
 *
 * The five badges along the top all come from `intelligence` (current + underwater) and `topStats`,
 * which the old panel already read. The mock-up hardcodes "0.00% · PEAK" and a green pulsing dot; the
 * dot and the wording follow `inDrawdown` here, so the card cannot claim you are at an equity high
 * while you are underwater.
 *
 * Its own file for the same reason as every other section: the panel is an orchestrator, and this is
 * a section.
 */
export function DdProfile({ intel, topStats, tradeCount }: {
  intel: any; topStats: any; tradeCount: number;
}) {
  const cur = intel?.current ?? {};
  const uw = intel?.underwater ?? {};
  const inDd = !!cur.inDrawdown;

  return (
    <section className="dd-card dd-card-xl dd-stack">
      <div className="dd-sec-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 className="dd-title">Drawdown Profile &amp; Underwater Depth</h2>
            <span className="dd-badge dd-badge-amber c-amber">
              {tradeCount} trade{tradeCount === 1 ? '' : 's'} tracked
            </span>
          </div>
          <p className="dd-muted" style={{ marginTop: 4 }}>
            Equity measured against its own running peak, per trade
          </p>
        </div>
        <div className="dd-badges">
          <div className={`dd-badge ${inDd ? 'dd-badge-rose' : 'dd-badge-emerald'}`}>
            {!inDd && <div className="dd-dot" aria-hidden />}
            <span className="c-dim">{inDd ? 'Below peak:' : 'At equity high:'}</span>
            <span className={`fw-bold ${inDd ? 'c-rose' : 'c-emerald'}`}>
              {inDd ? fmtDd(cur.ddPct) : '0.00% · PEAK'}
            </span>
          </div>
          <div className="dd-badge">
            <span className="c-dim">Since Peak:</span>
            <span className="c-strong fw-bold">
              {cur.tradesSincePeak ?? 0} trades · {cur.daysSincePeak ?? 0}d
            </span>
          </div>
          <div className="dd-badge">
            <span className="c-dim">Longest Underwater:</span>
            <span className="c-amber fw-bold">
              {uw.longestTrades ?? 0} trades · {uw.longestDays ?? 0}d
            </span>
          </div>
          <div className="dd-badge">
            <span className="c-dim">Avg Recovery:</span>
            <span className="c-blue fw-bold">{uw.avgRecoveryTrades ?? 0} trades</span>
          </div>
          <div className="dd-badge dd-badge-rose">
            <span className="c-dim">Deepest:</span>
            <span className="c-rose fw-bold">{fmtDd(topStats?.maxDrawdown)}</span>
          </div>
        </div>
      </div>
      <DdChart series={intel?.series ?? []} />
    </section>
  );
}
