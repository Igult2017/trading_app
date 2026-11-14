import React, { useState } from 'react';
import { MP_REF } from '@/components/shared/mpTokens';

/**
 * EquityCurveChart — the Analytics page's EQUITY CURVE, shared.
 *
 * ⚠ IT LIVED INSIDE `MetricsPanel.tsx` UNTIL 2026-11-14 and was MOVED here, not copied, when he
 * asked for it on the drawdown page: *"a graph you can duplicate wholly from analytics page but make
 * it for tracking drawdown and when we are not on a drawdown it should show we are in equity which
 * is positive."* Two copies of one chart is how one gets a fix and the other keeps the bug.
 *
 * TWO MODES, one drawing:
 *   * `pnl` (the default) — exactly what Analytics has always shown: running profit in money.
 *   * `drawdown` — the same card, but the line is % FROM THE STARTING BALANCE with a ZERO LINE at
 *     the start. Below zero is drawn RED (drawdown); above zero TEAL (in profit). His words: when we
 *     are not in drawdown "it should show we are in equity which is positive".
 *
 * ⚠ WHY THE START AND NOT THE RUNNING PEAK. The rest of the drawdown page measures from the PEAK,
 * and from the peak a line can never go above zero — so it could not show "positive" at all. The
 * cost, told to him before building: after a profitable run, a dip still above the start reads as
 * positive here while the header above calls it a drawdown.
 *
 * THEME: every colour is an `--mp-*` variable with the dark value as its fallback. Analytics sets
 * the light values on its own root; the drawdown page sets them in its stylesheet
 * (`.journal-light .dp`), so this file never needs to know which theme it is in.
 */
// Every token used below must also be listed in EQUITY_CHART_TOKENS (shared/mpTokens.ts).
const D = MP_REF;
const MONO: React.CSSProperties = {
  fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
};
const H = 160;
const W = 600;
type View = 'DAILY' | 'WEEKLY' | 'MONTHLY';

function group(equityCurve: any[], view: View): any[] {
  if (!equityCurve || equityCurve.length === 0) return [];
  if (view === 'DAILY') return equityCurve.map((e: any) => {
    const d = e.date ? new Date(e.date) : null;
    const label = (d && !isNaN(d.getTime()))
      ? d.toLocaleString('default', { month: 'short', day: 'numeric' })
      : `#${e.tradeNumber}`;
    return { ...e, _label: label };
  });
  const buckets = new Map<string, any>();
  for (const e of equityCurve) {
    const d = e.date ? new Date(e.date) : null;
    let key: string; let label: string;
    if (!d || isNaN(d.getTime())) { key = `t${e.tradeNumber}`; label = `#${e.tradeNumber}`; }
    else if (view === 'WEEKLY') {
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      key = `${d.getFullYear()}-W${week}`; label = `W${week}`;
    } else {
      key = `${d.getFullYear()}-${d.getMonth()}`;
      label = d.toLocaleString('default', { month: 'short' });
    }
    buckets.set(key, { ...e, _label: label });
  }
  return Array.from(buckets.values());
}

export function EquityCurveChart({ equityCurve, equityGrowth, mode = 'pnl' }: {
  equityCurve: any[]; equityGrowth?: any; mode?: 'pnl' | 'drawdown';
}) {
  const [view, setView] = useState<View>('WEEKLY');
  const pts0 = group(equityCurve, view);

  const startBal = equityGrowth?.startingBalance ?? 0;
  // In drawdown mode the line is % from the start. With no starting balance there is nothing to
  // take a percentage OF, so it shows money with the same zero line rather than inventing a base.
  const asPct = mode === 'drawdown' && startBal > 0;
  const valOf = (e: any) => (asPct ? (e.cumulativePL / startBal) * 100 : e.cumulativePL);
  const vals = pts0.map(valOf);
  // Drawdown mode always keeps ZERO in view, so the start line is on the chart even when the
  // account has only ever been on one side of it.
  const minV = vals.length ? Math.min(...vals, ...(mode === 'drawdown' ? [0] : [])) : 0;
  const maxV = vals.length ? Math.max(...vals, ...(mode === 'drawdown' ? [0] : [])) : 0;
  const range = maxV - minV || 1;
  const yOf = (v: number) => Math.max(0, Math.min(H, H - ((v - minV) / range) * H * 0.85 - H * 0.075));

  const pts: [number, number][] = pts0.length === 0
    ? [[0, H / 2], [W, H / 2]]
    : pts0.map((e: any, i: number) => [pts0.length > 1 ? (i / (pts0.length - 1)) * W : W / 2, yOf(valOf(e))]);
  const path = pts.reduce((a: string, [x, y]: [number, number], i: number) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1]; const cx = px + (x - px) / 2;
    return `${a} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, '');
  const last = pts[pts.length - 1];
  const y0 = yOf(0);
  // pnl fills down to the floor, as Analytics always has; drawdown fills to the START line, so the
  // shaded area IS the drawdown (below) or the profit (above).
  const fill = `${path} L${last[0]},${mode === 'drawdown' ? y0 : H} L0,${mode === 'drawdown' ? y0 : H} Z`;

  const labs = pts0.length === 0 ? ['--'] : (() => {
    const step = Math.max(1, Math.floor(pts0.length / 5));
    return pts0.filter((_: any, i: number) => i % step === 0 || i === pts0.length - 1)
      .map((e: any) => e._label ?? `#${e.tradeNumber}`);
  })();
  const fmtY = (v: number) => (asPct
    ? `${v > 0 ? '+' : ''}${v.toFixed(Math.abs(range) < 3 ? 2 : 1)}%`
    : v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
  const yLabels = pts0.length === 0 ? ['--', '--', '--', '--']
    : [maxV, maxV - range * 0.33, maxV - range * 0.66, minV].map(fmtY);

  const balance = equityGrowth?.currentBalance ?? 0;
  const retPct = equityGrowth?.totalReturnPct ?? 0;
  const isPos = (equityGrowth?.totalPL ?? 0) >= 0;
  const fmtBal = (v: number) => (v ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '--');
  const up = D.cyan, down = D.red;
  const lastUp = mode === 'drawdown' ? (pts0.length ? valOf(pts0[pts0.length - 1]) >= 0 : true) : true;
  const dot = lastUp ? up : down;
  const id = mode === 'drawdown' ? 'dd-eq' : 'mp-eq';

  return (
    <div style={{ background: D.bg3, border: `0.5px solid ${D.bdInner}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '9px 12px', borderBottom: `0.5px solid ${D.bdInner}`, background: D.bg4 }}>
        <span style={{ ...MONO, fontSize: 13.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: D.label }}>
          {mode === 'drawdown' ? 'Drawdown' : 'Equity Curve'}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                    style={{ ...MONO, fontSize: 12.5, letterSpacing: '0.1em', textTransform: 'uppercase' as const, padding: '2px 8px', border: `0.5px solid ${view === v ? D.cyan : D.bdInner}`, background: view === v ? D.cyanBg : 'transparent', color: view === v ? D.cyan : D.label, cursor: 'pointer', outline: 'none', borderRadius: 4 }}>
              {v}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {([['Balance', fmtBal(balance), isPos ? D.green : D.red], ['Return', retPct ? `${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%` : '--', isPos ? D.green : D.red], ['Start', fmtBal(startBal), D.text]] as [string, string, string][]).map(([l, v, c], i) => (
            <div key={i} style={{ textAlign: 'right' as const }}>
              <div style={{ ...MONO, fontSize: 12, color: D.dim, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 1 }}>{l}</div>
              <span style={{ ...MONO, fontSize: 13.5, fontWeight: 600, color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 14px 8px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: 6, paddingBottom: 18 }}>
            {yLabels.map((l, i) => <span key={i} style={{ ...MONO, fontSize: 12, color: D.dim }}>{l}</span>)}
          </div>
          <div style={{ flex: 1 }}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                 role="img" aria-label={mode === 'drawdown'
                   ? 'Account against its starting balance: red below the start is drawdown, teal above it is profit'
                   : 'Equity curve'}>
              <defs>
                <linearGradient id={`${id}-up`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={up} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={up} stopOpacity="0.01" />
                </linearGradient>
                <linearGradient id={`${id}-dn`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={down} stopOpacity="0.01" />
                  <stop offset="100%" stopColor={down} stopOpacity="0.18" />
                </linearGradient>
                {/* Two halves of one drawing: everything above the start line, and everything below. */}
                <clipPath id={`${id}-above`}><rect x="0" y="0" width={W} height={y0} /></clipPath>
                <clipPath id={`${id}-below`}><rect x="0" y={y0} width={W} height={H - y0} /></clipPath>
              </defs>
              {[0, 0.33, 0.66, 1].map((p, i) => <line key={i} x1="0" y1={p * H} x2={W} y2={p * H} stroke={D.bdRow} strokeWidth="0.5" />)}
              {mode === 'drawdown' ? (
                <>
                  <path d={fill} fill={`url(#${id}-up)`} clipPath={`url(#${id}-above)`} />
                  <path d={fill} fill={`url(#${id}-dn)`} clipPath={`url(#${id}-below)`} />
                  {/* THE START — the line the account is measured against. */}
                  <line x1="0" y1={y0} x2={W} y2={y0} stroke={D.label} strokeWidth="1" strokeDasharray="4 4"
                        vectorEffect="non-scaling-stroke" />
                  <path d={path} fill="none" stroke={up} strokeWidth="1.5" clipPath={`url(#${id}-above)`} />
                  <path d={path} fill="none" stroke={down} strokeWidth="1.5" clipPath={`url(#${id}-below)`} />
                </>
              ) : (
                <>
                  <path d={fill} fill={`url(#${id}-up)`} />
                  <path d={path} fill="none" stroke={up} strokeWidth="1.5" />
                </>
              )}
              <circle cx={last[0]} cy={last[1]} r="4" fill={D.bg3} stroke={dot} strokeWidth="1.5" />
              <circle cx={last[0]} cy={last[1]} r="1.5" fill={dot} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {labs.map((l: string, i: number) => <span key={i} style={{ ...MONO, fontSize: 12, color: D.dim }}>{l}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
