import React from 'react';

/**
 * NeonLineChart — the glowing violet line chart.
 *
 * THE JOURNAL'S EQUITY CURVE, and its only user. It lived inside `pages/Journal.tsx` until
 * 2026-11-10, when it moved here so the drawdown page could share it; on 2026-11-14 he moved the
 * drawdown page to the ANALYTICS chart instead (`shared/EquityCurveChart.tsx`), so the options that
 * existed only for that second user — a percentage axis, a wider gutter, another font, an accessible
 * label — were removed rather than left as settings nothing sets.
 *
 * ⚠ THE AXIS LABELS ARE HTML, NOT SVG TEXT, AND THAT IS THE WHOLE POINT OF THIS LAYOUT.
 * He sent a screenshot with the numbers circled: *"The numbers look zoomed and chaotically
 * placed."* He was right, and there were three separate faults behind it:
 *
 *   1. STRETCHED GLYPHS. The drawing is a fixed 600x240 box squashed to fit its container with
 *      `preserveAspectRatio="none"`. On a wide panel that container is about 1180x288, so
 *      everything was stretched ~1.97x across and only ~1.20x down — text included, which is why
 *      the digits looked fat and zoomed. Shapes SHOULD stretch; letters must never. So the shapes
 *      stay in the SVG and every label moved out into ordinary HTML, which cannot be distorted.
 *   2. GRIDLINES THAT DID NOT MATCH THEIR LABELS. The lines were drawn at 25/50/75/100% of the
 *      plot while the four numbers were placed at 0/33/67/100% — so no number sat on its own line.
 *      Both now come from the same list.
 *   3. LABELS FALLING OFF THE EDGES. The lowest number sat exactly on the floor of the plot, on
 *      top of the "Start" underneath it, and the last x label was centred on the right-hand edge
 *      so half of it hung outside. The labels now live in their own gutter and strip, and the
 *      first and last are anchored inwards instead of centred.
 */
function catmullRomPath(pts: { x: number; y: number }[]) {
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

/** Where the four numbers sit, top to bottom, as a share of the plot's height. */
const TICKS = [1, 2 / 3, 1 / 3, 0];

const LABEL: React.CSSProperties = {
  position: 'absolute', fontSize: 12, fontWeight: 700, lineHeight: 1,
  color: 'var(--jr-cap,#A8AEB8)', whiteSpace: 'nowrap', pointerEvents: 'none',
};

/** Room for the numbers down the left, in REAL pixels. A label wider than its gutter is CLIPPED —
 *  the minus sign goes first, which turns a loss into what reads as a gain. */
const PAD_L = 44;
const LABEL_FONT = 'Montserrat,sans-serif';

export const NeonLineChart = ({ data }: { data: { label: string; pnl: number }[] }) => {
  const PAD_B = 22;                       // the strip along the bottom that holds the trade numbers
  const W = 600, H = 240;                 // the drawing's own units; it stretches to fill the plot
  const vals = data.map((d) => d.pnl);
  const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1;
  const toX = (i: number) => (data.length === 1 ? 0 : (i / (data.length - 1)) * W);
  const toY = (v: number) => (1 - (v - minV) / range) * H;
  const pts = data.map((d, i) => ({ x: toX(i), y: toY(d.pnl) }));
  const linePath = catmullRomPath(pts);
  const areaPath = linePath + ` L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;
  const last = pts[pts.length - 1];
  const labelIdxs = data.length <= 7
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length * .2), Math.floor(data.length * .4), Math.floor(data.length * .6), Math.floor(data.length * .8), data.length - 1];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', fontFamily: LABEL_FONT }}
         role="img" aria-label="Equity curve">

      {/* The numbers down the left, in their own gutter so they can never sit on the drawing.
          The top and bottom ones are anchored INWARDS: centring them would push half of each
          outside the box, which is how the lowest number ended up printed over "Start". */}
      {TICKS.map((t, i) => (
        <span key={i} style={{ ...LABEL, left: 0, width: PAD_L - 8, textAlign: 'right',
                               top: `calc((100% - ${PAD_B}px) * ${(1 - t).toFixed(4)})`,
                               transform: i === 0 ? 'none'
                                 : i === TICKS.length - 1 ? 'translateY(-100%)'
                                 : 'translateY(-50%)' }}>
          {fmtMoney(minV + t * range)}
        </span>
      ))}

      {/* the drawing itself — shapes only, and these are MEANT to stretch */}
      <div style={{ position: 'absolute', left: PAD_L, right: 0, top: 0, bottom: PAD_B }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none"
             style={{ display: 'block' }} aria-hidden="true" focusable="false">
          <defs>
            <filter id="glow"><feGaussianBlur stdDeviation="4" result="b1" /><feGaussianBlur stdDeviation="8" result="b2" /><feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <linearGradient id="neonFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width={W} height={H} fill="var(--jr-chart,#080d18)" />
          {/* one line per number, at exactly the same heights */}
          {TICKS.map((t, i) => (
            <line key={i} x1="0" y1={(1 - t) * H} x2={W} y2={(1 - t) * H}
                  stroke="rgba(99,120,180,0.15)" strokeWidth="1" strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke" />
          ))}
          <path d={areaPath} fill="url(#neonFill)" />
          <path d={linePath} fill="none" stroke="#7c6fff" strokeWidth="6" strokeOpacity="0.2" filter="url(#glow)" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={linePath} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={linePath} fill="none" stroke="#c4b5fd" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* the marker on the newest point — HTML, so stretching cannot turn the circle into an egg */}
        <span style={{ position: 'absolute',
                       left: (last.x / W) >= 0.999 ? 'calc(100% - 10px)' : `${(last.x / W) * 100}%`,
                       top: (last.y / H) >= 0.999 ? 'calc(100% - 10px)'
                         : (last.y / H) <= 0.001 ? '10px'
                         : `${(last.y / H) * 100}%`,
                       transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%',
                       background: 'var(--jr-chart,#080d18)', border: '2px solid #a78bfa',
                       boxShadow: '0 0 0 4px rgba(167,139,250,0.18)', pointerEvents: 'none' }} />
      </div>

      {/* the trade numbers along the bottom; the two on the ends turn inwards so they stay on the page */}
      <div style={{ position: 'absolute', left: PAD_L, right: 0, bottom: 0, height: PAD_B }}>
        {labelIdxs.map((i) => {
          const pct = data.length === 1 ? 0 : (i / (data.length - 1)) * 100;
          const first = i === 0, lastOne = i === data.length - 1;
          return (
            <span key={i} style={{ ...LABEL, top: 4,
                                   left: lastOne ? 'auto' : `${pct}%`,
                                   right: lastOne ? 0 : 'auto',
                                   transform: first || lastOne ? 'none' : 'translateX(-50%)' }}>
              {data[i].label}
            </span>
          );
        })}
      </div>
    </div>
  );
};
