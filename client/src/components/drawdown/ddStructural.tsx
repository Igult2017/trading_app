import React from 'react';
import { fmtDd, WLB } from '@/components/drawdown/ddBits';

/**
 * ddStructural — "Structural Diagnostics" plus the per-session cards, from his 2026-11-03 mock-up.
 *
 * Two data sources, both already in the response:
 *   * `structural.context` / `structural.entry` — the market-context and entry-condition diagnostics
 *     (server/python/drawdown/structural.py), each a list of sections of labelled rows.
 *   * `sessions` — the five session cards (sessions.py): name, average drawdown, sample size, the
 *     win/loss split and the worst pair.
 *
 * ⚠ IN THE MOCK-UP THE CONTEXT / ENTRY TABS DO NOTHING. The five cards below them are session cards
 * and do not change when you switch tab, so as drawn the control is decorative. The old panel used
 * those same two tabs to switch the structural diagnostics, which is real data that would otherwise
 * have no home on the new page — so here the tabs drive the structural rows and the session cards sit
 * underneath them, unaffected. That is the one behavioural difference from the mock-up in this
 * section.
 *
 * ⚠ THE WIN/LOSS SPLIT GOES THROUGH `WLB`, not the mock-up's "1 Win / 1 Loss" wording — see the note
 * on that component for the instruction it carries.
 */
export type DiagKey = 'CONTEXT' | 'ENTRY';

function tone(avgDdPct: number): string {
  const abs = Math.abs(Number(avgDdPct) || 0);
  if (abs < 1.0) return 'c-emerald';
  if (abs < 2.5) return 'c-accent';
  return 'c-rose';
}

export function DdStructural({
  structural, sessions, diag, onDiag,
}: {
  structural: any; sessions: any[]; diag: DiagKey; onDiag: (d: DiagKey) => void;
}) {
  const sections: any[] = structural?.[diag === 'ENTRY' ? 'entry' : 'context'] ?? [];
  const list = sessions ?? [];
  // The hottest session gets the mock-up's red treatment, rather than New York being hardcoded as it
  // is in the HTML.
  const worstDd = Math.min(0, ...list.map((s: any) => Number(s.avgDdPct) || 0));

  return (
    <section className="dd-card dd-stack">
      <div className="dd-sec-head" style={{ paddingBottom: 12 }}>
        <div>
          <h3 className="dd-title">Structural Diagnostics</h3>
          <p className="dd-muted">Context and entry-condition analysis, then per-session drawdown</p>
        </div>
        <div className="dd-tabs" role="tablist" aria-label="Structural diagnostics view">
          {(['CONTEXT', 'ENTRY'] as DiagKey[]).map((d) => (
            <button key={d} role="tab" className="dd-tab" aria-selected={diag === d}
                    onClick={() => onDiag(d)}>{d}</button>
          ))}
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="dd-muted">No {diag.toLowerCase()} data tagged on these trades yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map((sec: any, si: number) => (
            <div key={si}>
              <div className="fs-11 fw-bold c-rose dd-mono"
                   style={{ textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
                {sec.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(sec.items ?? []).map((it: any, ii: number) => (
                  <div className="dd-inner-sm dd-between dd-mono fs-xs" key={ii}>
                    <span className="c-soft">{it.label}</span>
                    <span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                      <span className={`fw-bold ${tone(it.avgDdPct)}`}>{fmtDd(it.avgDdPct)}</span>
                      <WLB wins={it.wins} losses={it.losses} breakevens={it.breakevens} size={11} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="dd-muted">No session data on these trades yet.</p>
      ) : (
        <div className="dd-grid dd-g5 dd-mono">
          {list.map((s: any) => {
            const dd = Number(s.avgDdPct) || 0;
            const hot = dd < 0 && dd === worstDd;
            return (
              <div className={`dd-sess ${hot ? 'dd-sess-hot' : ''}`} key={s.session}>
                {hot && <div className="dd-sess-glow" aria-hidden />}
                <div className="dd-between" style={{ alignItems: 'baseline', position: 'relative', gap: 8 }}>
                  <span className={`fs-sm fw-bold ${hot ? 'c-strong' : 'c-soft'}`}>{s.session}</span>
                  <span className={`fw-bold fs-sm ${dd < 0 ? 'c-rose' : 'c-emerald'}`}>{fmtDd(dd)}</span>
                </div>
                <div className="dd-sess-sub">
                  <div>Sample: <span className="c-ink">N={s.total}</span>{' · '}
                    <WLB wins={s.wins} losses={s.losses} breakevens={s.breakevens} size={11} />
                  </div>
                  <div className="dd-sess-rule">
                    <span className="c-faint fs-10" style={{ display: 'block' }}>Worst Pair</span>
                    <span className={`fw-bold ${Number(s.worstDdPct) < 0 ? 'c-rose' : 'c-dim'}`}>
                      {s.worstPair || 'N/A'} {fmtDd(s.worstDdPct)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
