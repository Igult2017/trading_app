import React from 'react';

/**
 * NeonLineChart — the glowing violet line chart.
 *
 * ⚠ IT LIVED INSIDE `pages/Journal.tsx` UNTIL 2026-11-10 and was moved here, not copied, when he
 * asked for the drawdown page's underwater chart to look the same: *"Image three is the type of
 * graph i want you to use in drawdown page to replace the under the water graph."* Two copies of a
 * chart is how two charts drift apart — one gets a fix and the other keeps the bug.
 *
 * Two users, and they plot different things:
 *   * the Journal's EQUITY CURVE — running profit in money, which crosses zero both ways;
 *   * the drawdown page's chart — how far below peak equity you were, a percentage that is never
 *     above zero.
 *
 * ⚠ WHICH IS WHY `fmtY` EXISTS. The axis used to print `Math.round(v)`, which is right for money
 * and wrong for a percentage: a 3% drawdown would be labelled -3, -2, -1, 0 and a 0.4% one would
 * be four zeros. The caller decides how its own numbers read; the default is the money formatting
 * the Journal has always had, so that page is untouched.
 */
export function catmullRomPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const fmtMoney = (v: number) => (v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);

export const NeonLineChart = ({
  data,
  fmtY = fmtMoney,
  padLeft = 36,
  ariaLabel,
}: {
  data: { label: string; pnl: number }[];
  /** How the vertical axis labels itself. Money by default; the drawdown page passes a percentage. */
  fmtY?: (v: number) => string;
  /** Room for the vertical labels, in viewBox units. A percentage like "-12.34%" needs more
   *  than a bare number, and a label wider than this gutter is CLIPPED - the minus sign goes
   *  first, which turns a loss into what reads as a gain. */
  padLeft?: number;
  ariaLabel?: string;
}) => {
  const W = 600, H = 240, PL = padLeft, PR = 16, PT = 18, PB = 30;
  const vals = data.map((d) => d.pnl);
  const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1;
  const toX = (i: number) => PL + (i / (data.length - 1)) * (W - PL - PR);
  const toY = (v: number) => PT + (1 - (v - minV) / range) * (H - PT - PB);
  const pts = data.map((d, i) => ({ x: toX(i), y: toY(d.pnl) }));
  const linePath = catmullRomPath(pts);
  const areaPath = linePath + ` L ${pts[pts.length - 1].x} ${H - PB} L ${pts[0].x} ${H - PB} Z`;
  const last = pts[pts.length - 1];
  const labelIdxs = data.length <= 7
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length * .2), Math.floor(data.length * .4), Math.floor(data.length * .6), Math.floor(data.length * .8), data.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block' }}
         preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="4" result="b1" /><feGaussianBlur stdDeviation="8" result="b2" /><feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <linearGradient id="neonFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="var(--jr-chart,#080d18)" />
      {[0.25, 0.5, 0.75, 1].map((t, i) => <line key={i} x1={PL} y1={PT + (1 - t) * (H - PT - PB)} x2={W - PR} y2={PT + (1 - t) * (H - PT - PB)} stroke="rgba(99,120,180,0.15)" strokeWidth="1" strokeDasharray="4 4" />)}
      {[0, 1, 2, 3].map((i) => { const v = minV + (i / 3) * range; return <text key={i} x={PL - 5} y={toY(v) + 4} textAnchor="end" fontSize="12" fill="var(--jr-cap,#A8AEB8)" fontFamily="Montserrat,sans-serif" fontWeight="700">{fmtY(v)}</text>; })}
      {labelIdxs.map((i) => <text key={i} x={toX(i)} y={H - PB + 16} textAnchor="middle" fontSize="12" fill="var(--jr-cap,#A8AEB8)" fontFamily="Montserrat,sans-serif" fontWeight="700">{data[i].label}</text>)}
      <path d={areaPath} fill="url(#neonFill)" />
      <path d={linePath} fill="none" stroke="#7c6fff" strokeWidth="6" strokeOpacity="0.2" filter="url(#glow)" strokeLinecap="round" />
      <path d={linePath} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={linePath} fill="none" stroke="#c4b5fd" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
      <circle cx={last.x} cy={last.y} r="8" fill="#a78bfa" opacity="0.2" />
      <circle cx={last.x} cy={last.y} r="5" fill="var(--jr-chart,#080d18)" stroke="#a78bfa" strokeWidth="2" />
      <circle cx={last.x} cy={last.y} r="2" fill="#c4b5fd" />
    </svg>
  );
};
