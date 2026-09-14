/**
 * LOSS SHARE AS A BAR GRAPH — his request, 2026-09-15: *"Can you use nicely done bar graphs instead. I dont
 * like those pie charts. two seperate bar graphs. One for sessions and one for instruments and their loss
 * shares"*, after a sample graph: a title, a left axis with numbered gridlines, one solid bar per group, the
 * group names under the bars. It replaced two pie charts (lossPie.tsx, deleted) that shipped the day before.
 *
 * A BAR IS A SHARE OF THE MONEY LOST on losing trades (server/python/drawdown/loss_share.py), so the bars
 * add up to 100%. Each bar carries its share above it; under its name sits the actual loss as a % of the
 * starting balance — the figure the pie's key used to carry.
 *
 * BUILT FROM PAGE ELEMENTS, NOT AN SVG DRAWING, so a long name ("London/NY Overlap") wraps under its own bar
 * instead of running into the next one, and every piece of text follows the page's fonts. One solid colour
 * per graph (`tone`), from the journal's own colours in dpStyles.ts.
 *
 * CROWDED GRAPHS SCROLL SIDEWAYS INSIDE THEMSELVES, THEY DO NOT SQUEEZE. Playwright showed the squeezed
 * version splitting "EURUSD" into "EURUS / D" and, on a phone, running the loss figures into each other. So
 * every bar keeps a column of at least MIN_COLUMN, and a graph with more bars than its width holds scrolls.
 */
import { Fragment } from "react";

export type LossShareRow = { name: string; lossPct: number; losses: number; share: number };

/** Past this many groups the smallest merge into one "Other" bar. Six bars at MIN_COLUMN is what a
 *  half-width graph holds on a 1366px screen, so a desktop graph never has to scroll. */
const MAX_BARS = 6;
/** The narrowest a bar's column may get before the graph scrolls instead — wide enough for "EURUSD" and
 *  "-11.00%" whole. */
const MIN_COLUMN = 62;
/** Must match dpStyles.ts: the 46px axis column plus the area's 1px border, 10px padding each side, 12px gaps. */
const AXIS = 47, PAD = 20, GAP = 12;

function merge(rows: LossShareRow[]): LossShareRow[] {
  if (rows.length <= MAX_BARS) return rows;
  const rest = rows.slice(MAX_BARS - 1);
  return [...rows.slice(0, MAX_BARS - 1), {
    name: "Other",
    lossPct: +rest.reduce((s, r) => s + r.lossPct, 0).toFixed(2),
    losses: rest.reduce((s, r) => s + r.losses, 0),
    share: +rest.reduce((s, r) => s + r.share, 0).toFixed(1),
  }];
}

/** The left axis: a round step (5, 10, 20 or 25%) giving at most five gaps, topped just above the biggest
 *  bar (10% headroom, never past 100%) so the tallest bar does not press against the top line. */
function axisFor(maxShare: number): { top: number; ticks: number[] } {
  const want = Math.min(100, maxShare * 1.1);
  const step = [5, 10, 20, 25].find(s => Math.ceil(want / s) <= 5) ?? 25;
  const top = Math.max(step, Math.ceil(want / step) * step);
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, i) => i * step) };
}

/** Lets a name like "London/NY Overlap" break after its slash as well as at spaces — never inside a word. */
const breakable = (name: string) =>
  name.split("/").map((part, i, all) => <Fragment key={i}>{part}{i < all.length - 1 && <>/<wbr /></>}</Fragment>);

export function LossBars({ title, rows, tone }: { title: string; rows: LossShareRow[]; tone: "instr" | "sess" }) {
  const data = merge(rows);
  const max = Math.max(0, ...data.map(r => r.share));
  if (data.length === 0 || max <= 0) {
    return <div className="lgraph"><div className="subh">{title}</div><div className="empty-row">No losses recorded</div></div>;
  }
  const { top, ticks } = axisFor(max);
  const columns = { gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` };
  const minWidth = AXIS + PAD + data.length * MIN_COLUMN + (data.length - 1) * GAP;
  return (
    <div className={`lgraph lg-${tone}`}>
      <div className="subh">{title}</div>
      <div className="lg-scroll">
        <div className="lg-inner" style={{ minWidth }}>
          <div className="lg-plot" role="img"
               aria-label={`${title}: ${data.map(r => `${r.name} ${Math.round(r.share)}% of total loss`).join(", ")}`}>
            <div className="lg-axis" aria-hidden="true">
              {ticks.map(t => <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>{t}%</span>)}
            </div>
            <div className="lg-area" aria-hidden="true">
              {ticks.slice(1).map(t => <i key={t} className="lg-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
              <div className="lg-bars" style={columns}>
                {data.map(r => (
                  <div className="lg-col" key={r.name}
                       title={`${r.name}: ${r.share}% of total loss · ${r.lossPct.toFixed(2)}% of balance · ${r.losses} losing trade${r.losses === 1 ? "" : "s"}`}>
                    <div className="lg-bar" style={{ height: `${(r.share / top) * 100}%` }}>
                      <span className="lg-val">{Math.round(r.share)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lg-names" style={columns}>
            {data.map(r => (
              <div className="lg-name" key={r.name}>
                <span className="nm">{breakable(r.name)}</span>
                <span className="lp loss">{r.lossPct.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
