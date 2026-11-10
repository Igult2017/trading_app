import React from 'react';
import { NeonLineChart } from '@/components/shared/NeonLineChart';

/**
 * ddChart — how far below peak equity you were after each trade.
 *
 * ⚠ THE LOOK IS HIS, 2026-11-10: *"Image three is the type of graph i want you to use in drawdown
 * page to replace the under the water graph. It should show drawdown."* Image three was his own
 * Journal page's EQUITY CURVE, so the chart is not re-drawn here — `NeonLineChart` moved out of
 * `pages/Journal.tsx` into `components/shared/` and both pages render the same one.
 *
 * WHAT CHANGED IS THE PICTURE, NOT THE NUMBER. It still plots `intelligence.series`: every value is
 * <= 0, because at the surface you are at an all-time high and anything below it is drawdown.
 *
 * ⚠ `downsampleDeepest` IS KEPT, and it is not cosmetic. A year of trades is hundreds of points on a
 * chart a few hundred pixels wide. It keeps the DEEPEST value in each bucket, so a one-trade plunge
 * still shows its true depth instead of being averaged away. Averaging would UNDER-report drawdown,
 * which is the one direction this chart must never be wrong in.
 *
 * ⚠ TWO THINGS WENT WITH THE OLD CHART, both deliberately and both flagged to him:
 *   * `niceStep` — it chose gridlines at 1/2/2.5/5/10 x a power of ten. The new chart sets its own
 *     scale from the data, so that function had no caller left and a function nobody calls is dead
 *     code, not a spare part.
 *   * the hover tooltip (trade number, depth, how many trades a point grouped). The chart he pointed
 *     at has none. The depth is still on the axis and in the footer line below.
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

/**
 * The axis is a PERCENTAGE, so it cannot use the chart's default money formatting — that rounds to
 * whole numbers, and a 0.4% drawdown would label itself 0, 0, 0, 0. Two decimals until the drawdown
 * is big enough not to need them.
 */
const fmtPct = (v: number) => `${Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}%`;

export function DdChart({ series, deepestLabel }: { series: number[]; deepestLabel?: string }) {
  const raw = Array.isArray(series) && series.length > 1 ? series.map((n) => Number(n) || 0) : [0, 0];
  const data = downsampleDeepest(raw, 24);
  const wasDownsampled = raw.length > data.length;
  const bucket = Math.ceil(raw.length / data.length);
  const minVal = Math.min(0, ...data);

  // Trade numbers along the bottom, exactly as his Journal curve labels them: Start, #1, #2 …
  const tradeNo = (i: number) => (wasDownsampled ? Math.min(raw.length, (i + 1) * bucket) : i);
  const points = data.map((v, i) => ({ label: tradeNo(i) === 0 ? 'Start' : `#${tradeNo(i)}`, pnl: v }));

  return (
    <>
      <div className="dd-chart">
        <NeonLineChart
          data={points}
          fmtY={fmtPct}
          padLeft={64}
          labelFont="var(--dd-mono)"
          ariaLabel={`Drawdown chart. Deepest point ${minVal.toFixed(2)} percent below peak across ${raw.length} trades.`}
        />
      </div>

      <div className="dd-chart-foot">
        <span>Scale: percentage relative to peak equity{wasDownsampled ? ` · grouped ${bucket} trades per point` : ''}</span>
        <span className="dd-mono c-accent">Deepest Point: {minVal.toFixed(2)}%{deepestLabel ? ` (${deepestLabel})` : ''}</span>
      </div>
    </>
  );
}
