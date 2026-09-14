/**
 * LOSS CONTRIBUTION AS A PIE — his request, 2026-09-14: *"use pie chart and let the pie chart show loss
 * percentage contributed by each pair ... the second one can show percentage loss contributed by
 * sessions"*, with a sample: a flat pie in solid teal, grey-green, light grey, blue and orange, thin gaps
 * between the slices, and the percentage written inside each one.
 *
 * A SLICE IS A SHARE OF THE MONEY LOST on losing trades (server/python/drawdown/loss_share.py), so the
 * slices add up to 100. The sample's slices carry no names, so the key under the pie gives each name,
 * its share, and the actual loss as a % of the starting balance.
 *
 * Plain SVG, like the underwater chart above it (diveProfile.tsx): the charting library is not part of
 * the journal's code, and two pies do not justify adding it to every journal visit.
 */

export type LossShareRow = { name: string; lossPct: number; losses: number; share: number };

/** The sample's five colours in its order — the biggest slice takes the teal — then three more. */
const COLOURS = ["#1ED3BC", "#6C7C79", "#E0E0E0", "#0EA6DB", "#FFA400", "#8E7CF0", "#F08CB4", "#B7C4A1"];
/** Past this many, the smallest groups become one "Other" slice rather than slivers nobody can read. */
const MAX_SLICES = 7;
/** Below this share a slice is too thin to hold its number; the key still carries it. */
const LABEL_MIN = 5;
const R = 100;   // radius in the drawing's own units — the SVG scales to its box

function merge(rows: LossShareRow[]): LossShareRow[] {
  if (rows.length <= MAX_SLICES + 1) return rows;   // one extra slice is not worth an "Other"
  const rest = rows.slice(MAX_SLICES);
  return [...rows.slice(0, MAX_SLICES), {
    name: "Other",
    lossPct: +rest.reduce((s, r) => s + r.lossPct, 0).toFixed(2),
    losses: rest.reduce((s, r) => s + r.losses, 0),
    share: +rest.reduce((s, r) => s + r.share, 0).toFixed(1),
  }];
}

/** A point on the circle, angle 0 at twelve o'clock and running clockwise, as the sample does. */
function point(angle: number, radius = R): [number, number] {
  return [Math.sin(angle) * radius, -Math.cos(angle) * radius];
}

function wedge(start: number, end: number): string {
  const [x0, y0] = point(start), [x1, y1] = point(end);
  return `M0 0 L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
}

export function LossPie({ title, rows }: { title: string; rows: LossShareRow[] }) {
  const data = merge(rows);
  const total = data.reduce((s, r) => s + r.share, 0);
  const colour = (i: number) => COLOURS[i % COLOURS.length];
  let at = 0;
  return (
    <div className="pie">
      <div className="subh">{title}</div>
      {data.length === 0 || total <= 0 ? (
        <div className="empty-row">No losses recorded</div>
      ) : (
        <>
          <svg viewBox={`${-R - 4} ${-R - 4} ${2 * R + 8} ${2 * R + 8}`} role="img"
               aria-label={`${title}: ${data.map(r => `${r.name} ${Math.round(r.share)}%`).join(", ")}`}>
            {data.map((r, i) => {
              const start = at;
              const end = (at += (r.share / total) * Math.PI * 2);
              const [lx, ly] = data.length === 1 ? [0, 0] : point((start + end) / 2, R * 0.62);
              return (
                <g key={r.name}>
                  {data.length === 1
                    ? <circle r={R} fill={colour(i)} />
                    : <path d={wedge(start, end)} fill={colour(i)} stroke="var(--bg)" strokeWidth={1.5} strokeLinejoin="round" />}
                  {r.share >= LABEL_MIN && (
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill="#0B1220">
                      {Math.round(r.share)}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="pkey">
            {data.map((r, i) => (
              <div className="pk" key={r.name} title={`${r.losses} losing trade${r.losses === 1 ? "" : "s"}`}>
                <i style={{ background: colour(i) }} />
                <span className="nm">{r.name}</span>
                <span className="sh">{Math.round(r.share)}%</span>
                <span className="lp loss">{r.lossPct.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
