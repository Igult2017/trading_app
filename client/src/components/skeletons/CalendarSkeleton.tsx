/**
 * WHAT THE CALENDAR PAGE LOOKS LIKE WHILE IT IS STILL ARRIVING.
 *
 * His words, 2026-09-14: *"can you fix those remaining pages too"* — this page showed the generic
 * PanelSkeleton (a title bar, four tiles, one slab) where a month grid was about to appear.
 *
 * Every measurement is copied from TradingCalendar.tsx. The three that change with screen width — the
 * day-cell height, the compact stat cards and the mobile layout — are passed in from the values the
 * page itself computes, so the placeholder and the page can never disagree about which size applies.
 *
 *   header      title block left; 40px arrows, month / year boxes, search, month tag right   (HEADER)
 *   stat cards  2px border, 4px top edge, padding 20px 24px (12px 14px compact)                (StatCard)
 *   grid        a weekday row, then 7 columns of day cells inside a 2px border                 (CALENDAR GRID)
 *   footer      three legend keys left, the month total right                                  (FOOTER)
 */
import { Skeleton } from "./DashboardSkeletons";
import { TextLine } from "./TextLine";

const BG     = "var(--tc-bg, #0A0D14)";
const CARD   = "var(--tc-card, #0F1520)";
const BORDER = "var(--tc-border, #1C2333)";

/** A 40px control — arrow button, month or year box, search box, month tag — with a bar for its text. */
const Control = ({ w, bar, center = false }: { w: number; bar: number; center?: boolean }) => (
  <div style={{ width: w, height: 40, flexShrink: 0, background: CARD, border: `2px solid ${BORDER}`, padding: "0 14px",
                display: "flex", alignItems: "center", justifyContent: center ? "center" : "flex-start" }}>
    <Skeleton className="rounded-sm" style={{ width: bar, height: 8 }} />
  </div>
);

const Divider = ({ margin }: { margin: string }) => <div style={{ width: 1, height: 24, background: BORDER, margin }} />;

/** A month starts part-way through its first week: two empty days, 31 dated ones, two empty. */
const DATED = Array.from({ length: 35 }, (_, i) => i >= 2 && i < 33);

export function CalendarSkeleton({ cellHeight, compact, isMobile }: { cellHeight: number; compact: boolean; isMobile: boolean }) {
  const small = isMobile ? 7 : 9;
  return (
    <>
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row",
                    justifyContent: "space-between", gap: 16, marginBottom: isMobile ? 12 : 24, flexWrap: "wrap" }}>
        <div style={{ paddingLeft: 8 }}>
          <div style={{ marginBottom: 5 }}><TextLine w={96} px={8} /></div>
          <TextLine w={160} px={13} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <Control w={40} bar={12} center />
          <Control w={isMobile ? 120 : 140} bar={72} />
          <Control w={88} bar={34} />
          <Control w={40} bar={12} center />
          {!isMobile && <><Divider margin="0 6px" /><Control w={170} bar={92} /><Divider margin="0 2px" /></>}
          <Control w={104} bar={62} />
        </div>
      </div>

      {isMobile && <div style={{ marginBottom: 12 }}><Control w={170} bar={92} /></div>}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 2, marginBottom: 2 }}>
        {[[64, 70], [60, 88], [84, 80], [66, 92]].map(([label, sub], i) => (
          <div key={i} style={{ background: CARD, border: `2px solid ${BORDER}`, borderTop: `4px solid ${BORDER}`,
                                padding: compact ? "12px 14px" : "20px 24px", minWidth: 0 }}>
            <div style={{ marginBottom: compact ? 5 : 10 }}><TextLine w={label} px={compact ? 7 : 9} /></div>
            <TextLine w={compact ? 60 : 96} px={compact ? 13 : 18} lh={1} />
            {!compact && <div style={{ marginTop: 6 }}><TextLine w={sub} px={10} /></div>}
          </div>
        ))}
      </div>

      <div style={{ border: `2px solid ${BORDER}` }}>
        {/* The weekday row keeps the page's fixed near-black in both themes, so its bars take a light
            ink of their own — the journal's light-theme ink would vanish on it. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `2px solid ${BORDER}` }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} style={{ padding: isMobile ? "7px 0" : "11px 0", display: "flex", justifyContent: "center",
                                  borderRight: i < 6 ? `1px solid ${BORDER}` : "none", background: "#080B11" }}>
              <TextLine w={isMobile ? 6 : 24} px={isMobile ? 8 : 9} color="#A8AEB8" />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {DATED.map((dated, i) => (
            <div key={i} style={{ borderRight: (i + 1) % 7 ? `1px solid ${BORDER}` : "none",
                                  borderBottom: i < 28 ? `1px solid ${BORDER}` : "none" }}>
              <div style={{ minHeight: cellHeight, background: dated ? CARD : BG, border: dated ? `1px solid ${BORDER}` : "none",
                            padding: isMobile ? 5 : "10px 12px" }}>
                {dated && <TextLine w={isMobile ? 9 : 15} px={isMobile ? 8 : 11} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row",
                    justifyContent: "space-between", gap: 10, marginTop: 12, paddingLeft: 8, paddingRight: 8 }}>
        <div style={{ display: "flex", gap: isMobile ? 10 : 18, flexWrap: "wrap" }}>
          {[40, 34, 60].map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Skeleton style={{ width: 8, height: 8 }} /><TextLine w={w} px={small} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, flexWrap: "wrap" }}>
          <TextLine w={82} px={small} />
          <div style={{ width: 1, height: 14, background: BORDER }} />
          <TextLine w={72} px={isMobile ? 11 : 13} />
          <div style={{ width: 1, height: 14, background: BORDER }} />
          <TextLine w={46} px={isMobile ? 11 : 13} />
        </div>
      </div>

      {!isMobile && (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", paddingRight: 8 }}>
          <TextLine w={320} px={8} />
        </div>
      )}
    </>
  );
}
