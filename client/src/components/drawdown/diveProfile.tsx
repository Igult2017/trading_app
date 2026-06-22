import React from "react";

/**
 * DiveProfile — the hero "depth gauge" chart.
 * Peak equity = the waterline (0%); the curve shows how deep below it equity sank
 * after each trade. Driven entirely by the real per-trade underwater series
 * (intel.series, values ≤ 0). Smooth Catmull-Rom path, depth gridlines derived
 * from the actual deepest point, a marker at the trough, and a current-position
 * dot that rides the surface when at equity highs.
 */
export function DiveProfile({
  series,
  inDrawdown,
  currentDdPct,
}: {
  series: number[];
  inDrawdown: boolean;
  currentDdPct: number;
}) {
  const W = 1000, H = 250, surfaceY = 40, bottomY = 214;
  const span = bottomY - surfaceY;

  // Guard: need at least 2 points; otherwise render a flat surface line.
  const data = series && series.length > 1 ? series : [0, 0];
  const n = data.length;
  const maxAbs = Math.max(0.01, ...data.map((v) => Math.abs(v)));

  const P = data.map((v, i) => [
    (i / (n - 1)) * W,
    surfaceY + (Math.abs(v) / maxAbs) * span,
  ]);

  // Smooth path (Catmull-Rom → cubic bézier).
  let line = `M ${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const area = `${line} L ${W} ${bottomY} L 0 ${bottomY} Z`;

  // Depth gridlines: a few round-number percentages between the surface and the floor.
  const step = maxAbs <= 3 ? 1 : maxAbs <= 6 ? 2 : Math.ceil(maxAbs / 3);
  const gridlines: number[] = [];
  for (let v = step; v < maxAbs; v += step) gridlines.push(v);

  // Deepest point (most-negative trade).
  let di = 0;
  for (let i = 1; i < data.length; i++) if (data[i] < data[di]) di = i;
  const [deepX, deepY] = P[di];

  // Current position dot — at the last point; green at the surface, red when underwater.
  const [curX, curY] = P[n - 1];
  const dotColor = inDrawdown ? "var(--lossdeep)" : "var(--gain)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Underwater drawdown profile">
      <defs>
        <linearGradient id="dpfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(242,89,106,.02)" />
          <stop offset="60%" stopColor="rgba(242,89,106,.16)" />
          <stop offset="100%" stopColor="rgba(255,60,79,.34)" />
        </linearGradient>
      </defs>

      {/* depth gridlines */}
      {gridlines.map((v) => {
        const y = surfaceY + (v / maxAbs) * span;
        return (
          <g key={v}>
            <line x1="0" y1={y} x2={W} y2={y} stroke="rgba(148,163,184,.18)" strokeDasharray="2 5" />
            <text x="6" y={y - 5} fill="var(--ink3)" fontSize="10">-{v.toFixed(2)}%</text>
          </g>
        );
      })}

      {/* fill + profile */}
      <path d={area} fill="url(#dpfill)" />
      <path d={line} fill="none" stroke="var(--loss)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

      {/* deepest marker */}
      {maxAbs > 0.011 && (
        <>
          <line x1={deepX} y1={surfaceY} x2={deepX} y2={deepY} stroke="rgba(255,60,79,.35)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          <circle cx={deepX} cy={deepY} r="3" fill="var(--lossdeep)" />
        </>
      )}

      {/* waterline (peak) */}
      <line x1="0" y1={surfaceY} x2={W} y2={surfaceY} stroke="var(--gain)" strokeWidth="1" strokeOpacity=".55" vectorEffect="non-scaling-stroke" />
      <text x="6" y={surfaceY - 9} fill="var(--gain)" fontSize="10" letterSpacing="1.5">0.00% · PEAK</text>

      {/* current position */}
      <circle cx={curX} cy={curY} r="4.5" fill={dotColor} />
      <circle cx={curX} cy={curY} r="9" fill="none" stroke={dotColor} strokeOpacity=".4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
