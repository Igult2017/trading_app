import React from "react";

/**
 * DiveProfile — the hero "depth gauge".
 * Plots the real per-trade underwater series (intel.series, values ≤ 0): how far
 * below peak equity you are after each trade. Peak = the green water-line (0%);
 * red dips = drawdowns; the green dot rides the surface when at equity highs.
 *
 * An underwater curve has no positive side (you're at the surface when in profit),
 * so depth is red and "healthy / at-peak" is green — there is no green *area* to
 * show (that would be the equity curve, which lives on the Dashboard).
 *
 * Axes: Y = drawdown % (left gridline labels), X = trade number (bottom ticks).
 * A right margin keeps the current-position marker from clipping at the edge.
 */
// Aggregate a long per-trade series into <= maxPoints segments, keeping the DEEPEST
// (most-negative) value in each. Turns sharp single-trade dips into smooth rounded
// ones while preserving trough depth; all-surface segments stay 0.
function downsampleDeepest(s: number[], maxPoints: number): number[] {
  if (s.length <= maxPoints) return s;
  const bucket = Math.ceil(s.length / maxPoints);
  const out: number[] = [];
  for (let i = 0; i < s.length; i += bucket) {
    let m = 0;
    for (let j = i; j < Math.min(i + bucket, s.length); j++) m = Math.min(m, s[j]);
    out.push(m);
  }
  return out;
}

export function DiveProfile({
  series,
  inDrawdown,
}: {
  series: number[];
  inDrawdown: boolean;
  currentDdPct?: number;
}) {
  const W = 1000, H = 340;                          // taller so the profile isn't squeezed
  const PL = 2, PR = 22, PT = 18, PB = 28;          // plot margins (room for axes + end marker)
  const plotL = PL, plotR = W - PR;
  const surfaceY = PT, bottomY = H - PB;
  const span = bottomY - surfaceY;
  const plotW = plotR - plotL;

  // Smooth sharp single-trade dips into rounded ones (depth preserved; true deepest
  // still shown in the "Deepest" stat).
  const data = downsampleDeepest(series && series.length > 1 ? series : [0, 0], 22);
  const n = data.length;
  const maxAbs = Math.max(0.01, ...data.map((v) => Math.abs(v)));

  const P = data.map((v, i) => [
    plotL + (i / (n - 1)) * plotW,
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
  // Fill BELOW the curve down to the floor — the "water". (Closing at surfaceY instead
  // would fill the gap between curve and the 0% line, leaving the bottom empty.)
  const area = `${line} L ${plotR} ${bottomY} L ${plotL} ${bottomY} Z`;

  // Y gridlines: round-number drawdown depths between the surface and the floor.
  const step = maxAbs <= 3 ? 1 : maxAbs <= 6 ? 2 : Math.ceil(maxAbs / 3);
  const ylines: number[] = [];
  for (let v = step; v < maxAbs; v += step) ylines.push(v);

  // X ticks: trade numbers at evenly-spaced positions.
  const xticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    x: plotL + f * plotW,
    label: `${Math.round(f * (n - 1)) + 1}`,
    anchor: f === 0 ? "start" : f === 1 ? "end" : "middle",
  }));

  // Deepest point (most-negative trade).
  let di = 0;
  for (let i = 1; i < data.length; i++) if (data[i] < data[di]) di = i;
  const [deepX, deepY] = P[di];

  // Current position — last point; green at the surface, red when underwater.
  const [curX, curY] = P[n - 1];
  const dotColor = inDrawdown ? "var(--lossdeep)" : "var(--gain)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Underwater drawdown profile by trade">
      <defs>
        <linearGradient id="dpfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(242,89,106,.02)" />
          <stop offset="60%" stopColor="rgba(242,89,106,.16)" />
          <stop offset="100%" stopColor="rgba(255,60,79,.34)" />
        </linearGradient>
      </defs>

      {/* Y gridlines + depth labels (the Y axis) */}
      {ylines.map((v) => {
        const y = surfaceY + (v / maxAbs) * span;
        return (
          <g key={v}>
            <line x1={plotL} y1={y} x2={plotR} y2={y} stroke="rgba(148,163,184,.16)" strokeDasharray="2 5" />
            <text x={plotL + 4} y={y - 4} fill="var(--ink3)" fontSize="9.5">-{v.toFixed(2)}%</text>
          </g>
        );
      })}

      {/* X ticks (trade numbers) + axis caption */}
      {xticks.map((t, i) => (
        <text key={i} x={t.x} y={bottomY + 16} fill="var(--ink3)" fontSize="9.5" textAnchor={t.anchor as any}>{t.label}</text>
      ))}
      <text x={plotR} y={H - 3} fill="var(--ink3)" fontSize="8" textAnchor="end" letterSpacing="1.5">TRADE #</text>

      {/* fill + profile (drawdown depth = red) */}
      <path d={area} fill="url(#dpfill)" />
      <path d={line} fill="none" stroke="var(--loss)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

      {/* deepest marker */}
      {maxAbs > 0.011 && (
        <>
          <line x1={deepX} y1={surfaceY} x2={deepX} y2={deepY} stroke="rgba(255,60,79,.35)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          <circle cx={deepX} cy={deepY} r="3" fill="var(--lossdeep)" />
        </>
      )}

      {/* water-line (peak = at equity highs = green) */}
      <line x1={plotL} y1={surfaceY} x2={plotR} y2={surfaceY} stroke="var(--gain)" strokeWidth="1" strokeOpacity=".6" vectorEffect="non-scaling-stroke" />
      <text x={plotL + 4} y={surfaceY - 6} fill="var(--gain)" fontSize="9.5" letterSpacing="1">0.00% · PEAK</text>

      {/* current position */}
      <circle cx={curX} cy={curY} r="4" fill={dotColor} />
      <circle cx={curX} cy={curY} r="8" fill="none" stroke={dotColor} strokeOpacity=".4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
