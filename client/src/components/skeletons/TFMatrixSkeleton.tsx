/**
 * WHAT THE TF METRICS MATRIX LOOKS LIKE WHILE IT IS STILL ARRIVING.
 *
 * His words, 2026-09-14: *"can you fix those remaining pages too"*. This page keeps its real header
 * while loading; only the matrix under it was the generic PanelSkeleton. This draws the matrix — the
 * 3px left rule, the header row at the real column widths, and rows of the small cards every cell
 * holds — or, under 1024px, the stacked card list the page switches to.
 *
 * Measurements are copied from TFMetricsPanel.tsx (cellTd, Card, TFCell, IndCell, the context cells,
 * ComboCell, MobileCard). THE BARS ARE A FIXED LIGHT COLOUR: this panel has one palette, dark, in both
 * journal themes, so the journal's own ink would draw dark bars on a dark ground in the light theme.
 */
import { Skeleton } from "./DashboardSkeletons";

const SURFACE = "#0a0d16";
const PANEL = "#0d1020";
const BORDER = "rgba(100,160,255,0.07)";
const SEP = "rgba(100,160,255,0.13)";
const INK = "#e8f3ff";

/** HTF, ATF, ETF, Indicators, Session, Condition, Bias, News, Momentum, Sample, Performance — the widths
 *  in ColHeaders. Indicators and Performance open with a stronger rule on their left. */
const COLS = [205, 205, 205, 180, 138, 160, 100, 185, 155, 108, 140];
const RULED = new Set([3, 10]);

const Bar = ({ w, h }: { w: number | string; h: number }) => (
  <Skeleton className="rounded-sm" style={{ width: w, height: h, color: INK }} />
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div style={{ height: "100%", background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `2px solid ${SEP}`,
                borderRadius: 6, padding: "10px 12px", overflow: "hidden" }}>
    {children}
  </div>
);

/** What one cell's card holds: a pattern cell's label, candle name and paragraph; the four-line
 *  indicator list; or the one-or-two-line readout the context, momentum, sample and performance cells show. */
function CellBody({ col }: { col: number }) {
  if (col < 3) return (
    <>
      <Bar w={56} h={5} />
      <div style={{ margin: "9px 0 8px", paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}><Bar w={128} h={8} /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {["100%", "92%", "96%", "58%"].map((w, i) => <Bar key={i} w={w} h={7} />)}
      </div>
    </>
  );
  if (col === 3) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {[120, 132, 112, 104].map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}><Bar w={i ? 3 : 5} h={i ? 3 : 5} /><Bar w={w} h={7} /></div>
      ))}
    </div>
  );
  return (
    <div style={{ minHeight: 52, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
      <Bar w={COLS[col] - 60} h={8} /><Bar w={Math.round((COLS[col] - 60) * 0.6)} h={6} />
    </div>
  );
}

function DesktopMatrix() {
  const td = (w: number, col?: number): React.CSSProperties => ({
    width: w, minWidth: w, padding: "7px 6px", borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`,
    borderLeft: col != null && RULED.has(col) ? `1px solid ${SEP}` : undefined,
    verticalAlign: col != null && col < 4 ? "top" : "middle",
  });
  return (
    <div style={{ overflowX: "auto", borderLeft: `3px solid ${SEP}` }}>
      <table>
        <thead>
          <tr>
            <th style={{ background: PANEL, width: 148, minWidth: 148, padding: "10px 14px", borderRight: `1px solid ${SEP}`,
                         borderBottom: `1px solid ${SEP}`, textAlign: "left", verticalAlign: "bottom" }}>
              <Bar w={62} h={6} /><div style={{ marginTop: 6 }}><Bar w={84} h={5} /></div>
            </th>
            {COLS.map((w, i) => (
              <th key={i} style={{ width: w, minWidth: w, padding: "10px 16px", textAlign: "left", verticalAlign: "bottom",
                                   borderBottom: `1px solid ${SEP}`, borderRight: `1px solid ${BORDER}`,
                                   borderLeft: RULED.has(i) ? `1px solid ${SEP}` : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><Bar w={4} h={4} /><Bar w={Math.min(72, w - 50)} h={7} /></div>
                <div style={{ paddingLeft: 10 }}><Bar w={Math.min(116, w - 52)} h={6} /></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3].map(r => (
            <tr key={r}>
              <td style={{ ...td(136), borderRight: `1px solid ${SEP}` }}>
                <Card>{[0, 1, 2].map(j => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 9, marginTop: j ? 8 : 0 }}><Bar w={34} h={19} /><Bar w={22} h={7} /></div>
                ))}</Card>
              </td>
              {COLS.map((w, i) => <td key={i} style={td(w, i)}><Card><CellBody col={i} /></Card></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The card list the page shows under 1024px (MobileCard, collapsed). */
function MobileList() {
  return (
    <div style={{ paddingTop: 8 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ margin: "0 10px 6px", background: SURFACE, border: `1px solid ${BORDER}`, borderTop: `2px solid ${SEP}`,
                              borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map(j => <Bar key={j} w={52} h={19} />)}</div>
            <div><Bar w={44} h={16} /><div style={{ marginTop: 4 }}><Bar w={56} h={2} /></div></div>
          </div>
          <div style={{ display: "flex", gap: 20, marginBottom: 9 }}>
            {[44, 56, 70].map((w, j) => <div key={j}><Bar w={36} h={5} /><div style={{ marginTop: 4 }}><Bar w={w} h={8} /></div></div>)}
          </div>
          <div style={{ display: "flex", gap: 5, marginBottom: 9 }}>{[64, 90, 96].map((w, j) => <Bar key={j} w={w} h={17} />)}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><Bar w={150} h={8} /><Bar w={52} h={14} /></div>
        </div>
      ))}
    </div>
  );
}

export function TFMatrixSkeleton({ isMobile }: { isMobile: boolean }) {
  return isMobile ? <MobileList /> : <DesktopMatrix />;
}
