import React from "react";
/**
 * WHAT THE DRAWDOWN PAGE LOOKS LIKE WHILE IT IS STILL ARRIVING.
 *
 * His words, 2026-09-14: *"can you fix those remaining pages too"* — this page showed the generic
 * PanelSkeleton, and not even inside its own `.dp` wrapper, so the background and side margins
 * changed too when the data arrived.
 *
 * IT USES THE PAGE'S OWN STYLESHEET, so card padding, the 16px section rhythm and the 12px grid gaps
 * are the page's own numbers rather than copies that could drift; only the bars inside are new.
 * Sections follow `DrawdownPanel.tsx` top to bottom. The monthly ledger is left out, because the page
 * itself only shows it once there are dated months.
 *
 * ⚠ REDRAWN 2026-11-14 for the Dashboard-card header and the Analytics chart. It had also kept
 * drawing the title / brand mark / pickers removed on 2026-11-09 — a ghost of a deleted header that
 * showed for a second on every load, which is exactly the fault this file exists to prevent.
 *
 * ⚠ REWRITTEN FOR HIS 2026-11-03 LAYOUT. It was built against the old panel's class names
 * (`.shell`, `.kpis`, `.panel`, `.trip`, `.lg-*`), every one of which went with that design. Left
 * alone it would have drawn the previous page for a second and then jumped — the exact fault it was
 * created to fix.
 */
import { ddPanelCss } from "@/components/drawdown/ddStyles2";
import { Skeleton } from "./DashboardSkeletons";
import { TextLine } from "./TextLine";
/** Placeholder bars where the chart is coming — a solid slab reads as a broken image. */
const DEPTHS = [7, 15, 25, 20, 34, 49, 42, 27, 17, 32, 54, 71, 86, 76, 59, 44, 30, 37, 22, 12, 17, 10, 5, 2];
/** The bars the page fills with a tone colour, drawn in its quietest ink instead. */
const QUIET = { background: "var(--ink-faint)", opacity: 0.35 };
/** The Dashboard card's own box (`shared/StatCard`), so the placeholder and the card match. */
const STAT: React.CSSProperties = {
  background: "var(--jr-panel,#0d1117)", border: "1px solid var(--jr-border,rgba(255,255,255,0.05))",
  padding: 12, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: 4,
};
/** A card title plus its one-line caption. */
function CardHead({ t, sub }: { t: number; sub?: number }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <TextLine w={t} px={18} />
      {sub && <TextLine w={sub} px={12} />}
    </div>
  );
}
/** One of the page's `.dd-inner` rows: a label on the left, a figure on the right. */
const InnerRow = ({ k, v }: { k: number; v: number }) => (
  <div className="dd-inner"><TextLine w={k} px={12} /><TextLine w={v} px={16} /></div>
);
export function DrawdownSkeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="dp" style={style}>
      <style>{ddPanelCss()}</style>
      <div className="dd-stack">
        {/* THE SIX DRAWDOWN CARDS — the Dashboard's card (`shared/StatCard`): a caption over one
            figure, nothing else. The 2026-11-09 header (brand mark, title, two pickers) is NOT
            drawn: it was removed from the page that day and kept appearing here for a second. */}
        <section className="dd-grid dd-g6">
          {[78, 96, 96, 72, 124, 104].map((k, i) => (
            <div key={i} style={STAT}>
              <TextLine w={k} px={11} />
              <TextLine w={64} px={20} lh={1.1} />
            </div>
          ))}
        </section>
        {/* THE CHART — the Analytics card (`shared/EquityCurveChart`): a strip with the title, the
            DAILY / WEEKLY / MONTHLY toggle and three figures, then the plot. */}
        <section style={{ border: "0.5px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div className="dd-between" style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--line)", gap: 8 }}>
            <TextLine w={90} px={13} />
            <TextLine w={190} px={13} />
            <TextLine w={170} px={13} />
          </div>
          <div style={{ padding: "10px 14px 8px", height: 194, display: "flex", alignItems: "flex-end", gap: 3 }}>
            {DEPTHS.map((d, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-sm" style={{ height: `${d}%`, opacity: 0.09 }} />
            ))}
          </div>
        </section>
        {/* BREAKDOWN TABLE */}
        <section className="dd-card dd-stack">
          <div className="dd-between" style={{ flexWrap: "wrap", gap: 12 }}>
            <CardHead t={200} sub={260} />
            <div className="dd-tabs" style={{ height: 34, minWidth: 300 }} />
          </div>
          <div className="dd-twrap">
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
              {[64, 44, 30].map((bar, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <TextLine w={20} px={12} /><TextLine w={130} px={12} /><TextLine w={150} px={12} />
                  <div className="dd-track dd-track-w"><i style={{ width: `${bar}%`, ...QUIET }} /></div>
                  <TextLine w={56} px={12} />
                </div>
              ))}
            </div>
          </div>
        </section>
        {/* THE THREE RISK CARDS */}
        <section className="dd-grid dd-g3">
          {[4, 4, 2].map((rows, i) => (
            <div className="dd-card" key={i}>
              <CardHead t={[170, 210, 160][i]} sub={i === 1 ? 180 : undefined} />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: rows }, (_, r) => (
                  <InnerRow key={r} k={[96, 150, 118, 130][r] ?? 120} v={56} />
                ))}
              </div>
              <div className="dd-note" style={{ marginTop: 14 }}><TextLine w="88%" px={11} lh={1.65} /></div>
            </div>
          ))}
        </section>
        {/* LOSS CONTRIBUTION — two stacked bars */}
        <section className="dd-card dd-stack">
          <CardHead t={260} sub={300} />
          <div className="dd-grid dd-g2">
            {[0, 1].map((p) => (
              <div key={p} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="dd-between"><TextLine w={110} px={12} /><TextLine w={140} px={12} /></div>
                <Skeleton className="rounded-lg" style={{ height: 20, opacity: 0.1 }} />
                {[0, 1, 2].map((r) => (
                  <div className="dd-between" key={r}><TextLine w={90} px={11} /><TextLine w={120} px={11} /></div>
                ))}
              </div>
            ))}
          </div>
        </section>
        {/* STREAKS + R:R */}
        <section className="dd-grid dd-g2">
          <div className="dd-card">
            <CardHead t={230} />
            <div className="dd-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
              {[104, 96, 128, 100].map((k, i) => (
                <div className="dd-inner-sm" key={i} style={{ display: "block", padding: 12 }}>
                  <TextLine w={k} px={11} /><TextLine w={30} px={24} lh={1.1} /><TextLine w={72} px={10} />
                </div>
              ))}
            </div>
            <div className="dd-seq" style={{ marginTop: 16 }}>
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="rounded-lg" style={{ width: 62, height: 36, opacity: 0.1 }} />
              ))}
            </div>
          </div>
          <div className="dd-card">
            <CardHead t={170} />
            {[18, 42, 28, 12].map((w, i) => (
              <div className="dd-bucket" key={i}>
                <div className="dd-between"><TextLine w={150} px={12} /><TextLine w={90} px={12} /></div>
                <div className="dd-bucket-track"><i style={{ width: `${w}%`, ...QUIET }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
