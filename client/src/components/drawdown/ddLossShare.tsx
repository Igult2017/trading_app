import React from 'react';

/**
 * ddLossShare — "Loss Contribution Breakdown", from his 2026-11-03 mock-up: one bar for instruments,
 * one for sessions.
 *
 * Rows come from `lossShare.byPair` / `.bySession` (server/python/drawdown/loss_share.py), each with
 * `name`, `share` (percent of all money lost), `lossPct` (percent of starting balance) and `losses`
 * (how many losing trades).
 *
 * ⚠ THE BAR IS STACKED, because the mock-up was drawn against an account whose entire loss sat in
 * ONE instrument and so needed only a single 100% block. With four instruments a single block cannot
 * say anything, and his `.big-bar` is already a flex row — so each row becomes a segment sized by its
 * share. One instrument still renders as the full-width bar he drew.
 *
 * ⚠ NO CASH FIGURES. His legend reads "-0.46% ($478.40)". `loss_share.py` returns percentages and a
 * losing-trade count and no money at all, so the money is omitted rather than reconstructed from a
 * starting balance the panel would have to guess at.
 */
/**
 * ⚠ THESE ARE FILL TOKENS, NOT THE TEXT TOKENS. A colour chosen to read as text on a card is the
 * wrong colour for a solid bar carrying a label — the light theme needs darker fills so the bar is
 * visible on white, and then the label on top has to flip to white. Both live in `ddTokens`.
 */
const RAMP = ['var(--bar-1)', 'var(--bar-2)', 'var(--bar-3)', 'var(--bar-4)', 'var(--bar-5)'];

function Side({ title, rows }: { title: string; rows: any[] }) {
  const data = (rows ?? []).filter((r) => Number(r?.share) > 0);
  const top = data[0];
  const colourOf = (i: number) => RAMP[i % RAMP.length];

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
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="dd-bigbar">
              {data.map((r, i) => (
                <i key={r.name}
                   style={{ width: `${Number(r.share)}%`, background: colourOf(i) }}
                   title={`${r.name}: ${Number(r.share).toFixed(1)}% of total loss`}>
                  {Number(r.share) >= 12 ? `${Math.round(Number(r.share))}%` : ''}
                </i>
              ))}
            </div>
            {data.map((r, i) => (
              <div className="dd-between fs-11 dd-mono c-dim" key={r.name} style={{ paddingTop: 2, gap: 8 }}>
                <span className="c-strong fw-bold" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span aria-hidden style={{
                    width: 8, height: 8, borderRadius: 9999, flexShrink: 0, background: colourOf(i),
                  }} />
                  {r.name}
                </span>
                <span className="c-rose fw-bold">
                  {Number(r.lossPct).toFixed(2)}% · {r.losses} loss{r.losses === 1 ? '' : 'es'}
                </span>
              </div>
            ))}
          </div>
          <div className="dd-scale" aria-hidden>
            {['0%', '20%', '40%', '60%', '80%', '100%'].map((t) => <span key={t}>{t}</span>)}
          </div>
        </>
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
      <div className="dd-grid dd-g2">
        <Side title="By Instrument" rows={lossShare?.byPair ?? []} />
        <Side title="By Session" rows={lossShare?.bySession ?? []} />
      </div>
    </section>
  );
}
