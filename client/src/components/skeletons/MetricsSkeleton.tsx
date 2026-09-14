/**
 * WHAT THE METRICS PAGE LOOKS LIKE WHILE IT IS STILL ARRIVING.
 *
 * His words, 2026-09-14: *"can you fix those remaining pages too"* — this page showed the generic
 * PanelSkeleton where a strip of seven figures and rows of dense panels were about to appear.
 *
 * IT USES THE PAGE'S OWN LAYOUT CLASSES. MetricsPanel's loader already puts the page's stylesheet in
 * place, so `.mp-kpi`, `.mp-page` and `.mp-g4` below are the page's own grids — seven figure columns,
 * four under 1024px, two under 640px — not copies. The panel styling is copied from `Panel`,
 * `DivLabel`, `Row`, `Chip` and `SectionDivider` in MetricsPanel.tsx. Two sections are drawn, as far as
 * the first screen reaches: Core Quality, then Direction · Setup · Exit · Governance.
 */
import { Fragment } from "react";
import { Skeleton } from "./DashboardSkeletons";
import { TextLine } from "./TextLine";

const BG2 = "var(--mp-bg2, #111318)";
const BG3 = "var(--mp-bg3, #0E1016)";
const BG4 = "var(--mp-bg4, #0C0E14)";
const BD_OUTER = "var(--mp-bdo, #1E2330)";
const BD_INNER = "var(--mp-bdi, #1A1F2E)";
const BD_ROW = "var(--mp-bdr, #12161E)";
const BD_DIV = "var(--mp-bdd, #141820)";

/** [caption, sub-line] widths: Total P&L, Win Rate, R Expectancy, Trades, Profit Factor, Avg R:R, Net Growth. */
const KPIS = [[72, 40], [64, 56], [96, 58], [48, 70], [100, 72], [60, 52], [82, 98]];

/** A panel: its title and badge widths, whether its body scrolls (the page caps those at 400px), and
 *  its rows in groups — each group sits under a small divider label, as the real panels are built. */
type PanelShape = { title: number; badge: number; scroll?: boolean; groups: number[][] };
const SECTIONS: { label: number; panels: PanelShape[] }[] = [
  { label: 150, panels: [                                    // Core Quality Metrics
    { title: 104, badge: 70, groups: [[62, 66, 64], [36, 54, 40]] },
    { title: 150, badge: 90, scroll: true, groups: [[104, 110, 124, 98, 120, 128], [112, 96, 96], [128, 120]] },
    { title: 150, badge: 80, scroll: true, groups: [[96, 128], [104, 112, 150, 132], [80, 96, 70]] },
    { title: 170, badge: 80, scroll: true, groups: [[112, 82, 96, 88, 150], [70, 86, 64]] },
  ] },
  { label: 270, panels: [                                    // Direction · Setup · Exit · Governance
    { title: 124, badge: 70, scroll: true, groups: [[36, 42], [34, 36, 44], [72, 80]] },
    { title: 140, badge: 96, scroll: true, groups: [[110, 96, 120], [12, 12, 12, 12, 12]] },
    { title: 110, badge: 96, scroll: true, groups: [[96, 120, 84, 110], [120, 130, 100]] },
    { title: 120, badge: 82, scroll: true, groups: [[128, 112, 112], [96, 110, 108, 120], [80, 82]] },
  ] },
];

/** A rounded chip (Chip): 11px text on a 16px line inside 1px 6px, so 18px tall. */
const Chip = ({ w }: { w: number }) => (
  <span style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 6px", borderRadius: 20, border: `0.5px solid ${BD_INNER}` }}>
    <Skeleton className="rounded-sm" style={{ width: w, height: 7 }} />
  </span>
);

function Panel({ title, badge, scroll, groups }: PanelShape) {
  const body = groups.map((rows, g) => (
    <div key={g}>
      <div style={{ padding: "7px 0 3px", borderBottom: `0.5px solid ${BD_DIV}`, marginBottom: 1 }}><TextLine w={70} px={10} lh={1.2} /></div>
      {rows.map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0",
                              borderBottom: i < rows.length - 1 ? `0.5px solid ${BD_ROW}` : "none" }}>
          <TextLine w={w} px={12} />
          <div style={{ display: "flex", gap: 4 }}><Chip w={14} /><Chip w={24} /></div>
        </div>
      ))}
    </div>
  ));
  return (
    <div style={{ background: BG3, border: `0.5px solid ${BD_INNER}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px",
                    borderBottom: `0.5px solid ${BD_INNER}`, background: BG4 }}>
        <TextLine w={title} px={11} />
        <Chip w={badge - 12} />
      </div>
      <div style={{ padding: "8px 12px 10px" }}>
        {scroll ? <div style={{ maxHeight: 400, overflow: "hidden" }}>{body}</div> : body}
      </div>
    </div>
  );
}

export function MetricsSkeleton() {
  return (
    <>
      <div className="mp-kpi">
        {KPIS.map(([caption, sub], i) => (
          <div key={i} className="mp-kpi-cell" style={{ background: BG2, border: `0.5px solid ${BD_OUTER}`, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ marginBottom: 5 }}><TextLine w={caption} px={11} /></div>
            <div style={{ marginBottom: 3 }}><TextLine w={56} px={10} lh={1.1} /></div>
            <TextLine w={sub} px={11} />
          </div>
        ))}
      </div>
      <div className="mp-page">
        {SECTIONS.map((s, i) => (
          <Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
              <div style={{ flex: 1, height: "0.5px", background: BD_INNER }} />
              <TextLine w={s.label} px={10} />
              <div style={{ flex: 1, height: "0.5px", background: BD_INNER }} />
            </div>
            <div className="mp-g4">{s.panels.map((p, j) => <Panel key={j} {...p} />)}</div>
          </Fragment>
        ))}
      </div>
    </>
  );
}
