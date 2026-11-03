import React, { useState } from 'react';

/**
 * ddChart — the underwater depth chart, from his 2026-11-03 mock-up.
 *
 * Plots `intelligence.series`: how far below the peak equity you were after each trade. Every value
 * is <= 0, so there is no positive side — at the surface you are at an all-time high. The green line
 * is that surface; red depth is drawdown.
 *
 * ⚠ TWO HELPERS ARE CARRIED OVER FROM `diveProfile.tsx`, which this replaces. They are not rewritten
 * because both solve a real problem that the mock-up (drawn against 7 trades) never had to face:
 *   * `downsampleDeepest` — a year of trades is hundreds of points on a 1000px wide chart. It keeps
 *     the DEEPEST value in each bucket, so a one-trade plunge still shows its true depth instead of
 *     being averaged away. Averaging would under-report drawdown, which is the one direction this
 *     chart must never be wrong in.
 *   * `niceStep` — gives gridlines at 1/2/2.5/5/10 x a power of ten, so a deep drawdown is labelled
 *     -20/-40/-60 rather than -21/-42/-63.
 *
 * ⚠ THE MOCK-UP'S TOOLTIP SHOWS "Equity Value" AND "Peak Baseline" PER POINT. The API does not carry
 * per-trade equity — `intelligence.series` is percentages, and `current.peakEquity` is a single
 * present-day figure. So the tooltip reports the drawdown depth, which is real, and omits the two
 * money rows rather than inventing them.
 */
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

function niceStep(maxAbs: number): number {
  const rough = maxAbs / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  return [1, 2, 2.5, 5, 10].map((c) => c * pow).find((c) => c >= rough) ?? 10 * pow;
}

const W = 1000, H = 300;
const PAD_L = 46, PAD_R = 15, PAD_T = 18, PAD_B = 40;

export function DdChart({ series, deepestLabel }: { series: number[]; deepestLabel?: string }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const raw = Array.isArray(series) && series.length > 1 ? series.map((n) => Number(n) || 0) : [0, 0];
  const data = downsampleDeepest(raw, 24);
  const wasDownsampled = raw.length > data.length;
  const bucket = Math.ceil(raw.length / data.length);

  const minVal = Math.min(0, ...data);
  const step = niceStep(Math.max(0.2, Math.abs(minVal)));
  const lines = 4;
  const floor = -step * lines;                       // the bottom gridline
  const plotL = PAD_L, plotR = W - PAD_R;
  const top = PAD_T, bottom = H - PAD_B;

  const xAt = (i: number) => data.length === 1
    ? plotL
    : plotL + (i * (plotR - plotL)) / (data.length - 1);
  const yAt = (v: number) => top + ((0 - v) / Math.abs(floor)) * (bottom - top);

  const pts = data.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
  const linePath = `M${pts.join(' L')}`;
  const areaPath = `${linePath} L${xAt(data.length - 1).toFixed(1)},${yAt(0).toFixed(1)} L${plotL},${yAt(0).toFixed(1)} Z`;

  const deepIdx = data.reduce((best, v, i) => (v < data[best] ? i : best), 0);

  // X labels only where they fit — at most 8, so a year of trades does not turn the axis to mush.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const tradeNo = (i: number) => (wasDownsampled ? Math.min(raw.length, (i + 1) * bucket) : i);

  return (
    <>
      <div className="dd-chart">
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
             role="img"
             aria-label={`Underwater drawdown chart. Deepest point ${minVal.toFixed(2)} percent below peak across ${raw.length} trades.`}>
          <defs>
            <linearGradient id="ddgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--rose-mid)" stopOpacity="0.4" />
              <stop offset="95%" stopColor="var(--rose-mid)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {Array.from({ length: lines }, (_, k) => {
            const v = -step * (k + 1);
            const y = yAt(v);
            return (
              <g key={k}>
                <line x1={plotL} y1={y} x2={plotR} y2={y} stroke="var(--line)" strokeDasharray="3 3" />
                <text x={plotL - 6} y={y + 3} textAnchor="end" fill="var(--ink-faint)" fontSize="11">
                  {v.toFixed(2)}%
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="url(#ddgrad)" />
          <path d={linePath} fill="none" stroke="var(--rose-mid)" strokeWidth="2" />

          {/* The surface — peak equity. */}
          <line x1={plotL} y1={yAt(0)} x2={plotR} y2={yAt(0)} stroke="var(--emerald-mid)" strokeDasharray="3 3" />
          <text x={plotR - 4} y={yAt(0) - 5} textAnchor="end" fill="var(--emerald)" fontSize="10">
            0.00% · PEAK HIGH
          </text>
          <text x={plotL - 6} y={yAt(0) + 3} textAnchor="end" fill="var(--ink-faint)" fontSize="11">0.00%</text>

          {data.map((v, i) => (
            <circle key={i} cx={xAt(i)} cy={yAt(v)} r={i === deepIdx && v < 0 ? 6 : 3}
                    fill="var(--rose-mid)"
                    stroke={i === deepIdx && v < 0 ? 'var(--ink-strong)' : undefined}
                    strokeWidth={i === deepIdx && v < 0 ? 2 : undefined} />
          ))}

          {data.map((_, i) => (i % labelEvery === 0 || i === data.length - 1) && (
            <text key={i} x={xAt(i)} y={H - 14} textAnchor="middle" fill="var(--ink-faint)" fontSize="11">
              {tradeNo(i) === 0 ? 'Start' : `#${tradeNo(i)}`}
            </text>
          ))}

          {/* Invisible, generous hover targets — the mock-up's `.hit` circles. */}
          {data.map((v, i) => (
            <circle key={`h${i}`} className="dd-hit" cx={xAt(i)} cy={yAt(v)} r={16}
                    onMouseEnter={() => setHover({ i, x: xAt(i), y: yAt(v) })}
                    onMouseLeave={() => setHover(null)} />
          ))}
        </svg>

        {hover && (
          <div className="dd-tt" style={{
            left: `${Math.min((hover.x / W) * 100, 72)}%`,
            top: `${Math.min((hover.y / H) * 100 + 6, 70)}%`,
          }}>
            <div className="tt-h">
              <span>{tradeNo(hover.i) === 0 ? 'Start' : `Trade #${tradeNo(hover.i)}`}</span>
              <span style={{ color: data[hover.i] === 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                {data[hover.i] === 0 ? 'AT PEAK' : `${data[hover.i].toFixed(2)}%`}
              </span>
            </div>
            <div className="tt-r">
              <span>Below peak equity:</span>
              <span style={{ color: 'var(--ink-strong)' }}>{Math.abs(data[hover.i]).toFixed(2)}%</span>
            </div>
            {wasDownsampled && (
              <div className="tt-r"><span>Deepest of</span><span>{bucket} trades</span></div>
            )}
          </div>
        )}
      </div>

      <div className="dd-chart-foot">
        <span>Scale: percentage relative to peak equity{wasDownsampled ? ` · grouped ${bucket} trades per point` : ''}</span>
        <span className="dd-mono c-amber">Deepest Point: {minVal.toFixed(2)}%{deepestLabel ? ` (${deepestLabel})` : ''}</span>
      </div>
    </>
  );
}
