import React from 'react';

/**
 * ddLossShare — "Loss Contribution Breakdown": how much of all money lost came from each instrument
 * and each market session.
 *
 * Rows come from `lossShare.byPair` / `.bySession` (server/python/drawdown/loss_share.py), each with
 * `name`, `share` (percent of all money lost), `lossPct` (percent of starting balance) and `losses`
 * (how many losing trades).
 *
 * ONE THIN BAR PER ROW (2026-11-15). It was one 20px stacked bar per side with a dot legend and a
 * 0-100% scale; he called those "big ones" ugly and asked for the Dashboard's "PAIR VOLUME /
 * FREQUENCY" bar instead: "give each instrument its own progress bar and put the percentage it
 * contributed in front of it. So the bigger the percentage the longer the bar." The row below is
 * that Dashboard row (pages/Journal.tsx) — same 2px track, 4px corner, divider track, accent fill —
 * with the bar's length = the row's share of all losses.
 *
 * ⚠ NO CASH FIGURES. `loss_share.py` returns percentages and a losing-trade count and no money, so
 * money is omitted rather than reconstructed from a starting balance the panel would have to guess.
 */
function Side({ title, rows }: { title: string; rows: any[] }) {
  const data = (rows ?? []).filter((r) => Number(r?.share) > 0);
  const top = data[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="dd-between fs-xs fw-semi c-soft"
           style={{ textTransform: 'uppercase', letterSpacing: '.05em', gap: 8 }}>
        <span>{title}</span>
        {top
          ? <span className="c-rose dd-mono">{Math.round(Number(top.share))}% in {top.name}</span>
          : <span className="c-dim dd-mono">No losses recorded</span>}
      </div>

      {data.length === 0 ? (
        <p className="dd-muted">Nothing lost in this breakdown yet.</p>
      ) : (
        <div>
          {data.map((r) => {
            const share = Math.max(0, Math.min(100, Number(r.share)));
            return (
              <div className="dd-lsrow" key={r.name}
                   title={`${r.name}: ${share.toFixed(1)}% of total loss`}>
                <span className="dd-lsname">{r.name}</span>
                <div className="dd-lstrack"><i style={{ width: `${share}%` }} /></div>
                <span className="dd-lspct dd-mono">{Math.round(share)}%</span>
                <span className="dd-lsnote dd-mono">
                  {Number(r.lossPct).toFixed(2)}% · {r.losses} loss{r.losses === 1 ? '' : 'es'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DdLossShare({ lossShare }: { lossShare: any }) {
  return (
    <section className="dd-card dd-stack">
      <div>
        <h3 className="dd-title">Loss Contribution Breakdown</h3>
        <p className="dd-muted">Share of total losses by instrument and by market session</p>
      </div>
      <div className="dd-grid dd-g2 dd-lsgrid">
        <Side title="By Instrument" rows={lossShare?.byPair ?? []} />
        <Side title="By Session" rows={lossShare?.bySession ?? []} />
      </div>
    </section>
  );
}
