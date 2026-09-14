/**
 * WHAT THE AUDIT PAGE LOOKS LIKE WHILE IT IS STILL ARRIVING.
 *
 * His words, 2026-09-14: *"Can you fix audit page skeleton too. It is displaying like this which does
 * not really look anything like audit page"*. It was the generic `PanelSkeleton` — a title bar, four
 * tiles, one grey slab — and seven other panels share that one, so this page gets its own instead.
 *
 * Every measurement is copied from StrategyAudit.tsx, so the content lands where its placeholder was:
 *
 *   header      bottom rule, 24 below / 20 inside, KPI blocks 28 apart          (the HEADER block)
 *   tab strip   padding 4, radius 4, 1px line; each tab 8px 16px                 (TABS)
 *   card        --sa-bg2, 1px --sa-line, radius 4, padding 20px 22px             (Cell)
 *   card title  a 2x15 bar, gap 12, 18 below                                     (CellTitle)
 *   rows        2fr 1fr / 1fr 1fr 1fr / 1fr 1fr / full width, gap 3             (Page1)
 *
 * Colours are the page's own --sa-* variables, so the light theme follows without a second palette.
 * The grids stack to one column under 900px, as the page's own collapse rule does.
 */
import { Skeleton } from "./DashboardSkeletons";
import { TextLine } from "./TextLine";

const BG2 = "var(--sa-bg2, #0d1117)";
const BG3 = "var(--sa-bg3, #0d1117)";
const LINE = "var(--sa-line, rgba(255,255,255,0.04))";
const LINE2 = "var(--sa-line2, rgba(255,255,255,0.08))";
const ROW = "grid grid-cols-1 gap-[3px] mb-[3px]";

/** Sized to each tab's label: Strategy, Evidence, Diagnostics, Action, AI Analysis, AI Strategy. */
const TAB_WIDTHS = [82, 82, 112, 62, 106, 110];
/** [caption, sub-line] widths: Win Rate, Edge Factor, Risk Entropy, AI Confidence. */
const KPIS = [[80, 128], [112, 76], [122, 104], [132, 84]];

/** An outlined badge (Badge): 3px 8px inside a 1px border. */
const Badge = ({ w }: { w: number }) => (
  <div style={{ padding: "3px 8px", border: `1px solid ${LINE2}` }}><TextLine w={w} /></div>
);

function Card({ title, className = "", children }: { title: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={className} style={{ background: BG2, border: `1px solid ${LINE}`, borderRadius: 4, padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ width: 2, height: 15, background: LINE2, borderRadius: 1 }} />
        <TextLine w={title} px={16.5} lh={1.2} />
      </div>
      {children}
    </div>
  );
}

/** The label / value rows most cards are built from (StatRow): 8px above and below, a rule between. */
function Rows({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < n - 1 ? `1px solid ${LINE}` : "none" }}>
          <TextLine w={[92, 124, 108, 136][i % 4]} />
          <TextLine w={40} px={13} />
        </div>
      ))}
    </>
  );
}

function Header({ darkMode }: { darkMode: boolean }) {
  return (
    <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TextLine w="min(440px, 64vw)" />
            <Skeleton className="rounded-full" style={{ width: 4, height: 4 }} />
            <TextLine w={30} />
          </div>
          <div style={{ display: "inline-flex", flexWrap: "wrap", alignSelf: "flex-start", padding: 4, borderRadius: 4, border: `1px solid ${LINE}`, background: darkMode ? "rgba(0,0,0,0.5)" : "#FFFFFF" }}>
            {TAB_WIDTHS.map((w, i) => (
              <div key={i} style={{ padding: "8px 16px", borderRadius: 3, background: i === 0 ? (darkMode ? "rgba(255,255,255,0.08)" : "#E2E8F0") : "transparent" }}>
                <TextLine w={w} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
          {KPIS.map(([caption, sub], i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <TextLine w={caption} /><TextLine w={52} px={15} /><TextLine w={sub} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuditSkeleton({ darkMode = true }: { darkMode?: boolean }) {
  return (
    <div style={{ width: "100%" }}>
      <Header darkMode={darkMode} />

      {/* Executive Summary · Monitor Next */}
      <div className={`${ROW} min-[900px]:grid-cols-[2fr_1fr]`}>
        <Card title={150}>
          {["100%", "100%", "96%", "58%"].map((w, i) => <TextLine key={i} w={w} px={14} lh={1.75} />)}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <Badge w={130} /><TextLine w={170} />
          </div>
        </Card>
        <Card title={104}>
          {[130, 104, 118].map((w, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 2 ? `1px solid ${LINE}` : "none" }}>
              <TextLine w={w} px={13} /><Badge w={56} />
            </div>
          ))}
        </Card>
      </div>

      {/* Probabilistic Edge · Risk & Failure · Edge Components */}
      <div className={`${ROW} min-[900px]:grid-cols-3`}>
        <Card title={132}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div><TextLine w={72} px={22} lh={1} /><div style={{ marginTop: 4 }}><TextLine w={78} /></div></div>
            <div style={{ flex: 1 }}><Rows n={3} /></div>
          </div>
        </Card>
        <Card title={104}><Rows n={4} /></Card>
        <Card title={128}>
          {[70, 88].map((w, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><TextLine w={w} /><TextLine w={30} /></div>
              <div style={{ height: 1, background: LINE2 }} />
            </div>
          ))}
          <div style={{ paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
            <TextLine w={170} />
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              {[0, 1].map(i => <div key={i}><TextLine w={56} /><TextLine w={52} px={15} /></div>)}
            </div>
          </div>
        </Card>
      </div>

      {/* Weaknesses · Psychology Impact */}
      <div className={`${ROW} min-[900px]:grid-cols-2`}>
        <Card title={100}>
          <div style={{ padding: 14, borderLeft: `2px solid ${LINE2}`, background: BG3 }}>
            <div style={{ marginBottom: 6 }}><TextLine w={180} px={14} /></div>
            <TextLine w="94%" px={13} lh={1.7} /><TextLine w="62%" px={13} lh={1.7} />
          </div>
        </Card>
        <Card title={128}>
          <div style={{ display: "flex", gap: 12 }}>
            {[104, 124].map((w, i) => (
              <div key={i} style={{ flex: 1, padding: 12, border: `1px solid ${LINE}`, background: BG3, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <TextLine w={44} px={17} /><TextLine w={w} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Logical Verification — six key / value rows in two columns */}
      <Card title={140} className="mb-[3px]">
        <div className="grid grid-cols-1 min-[900px]:grid-cols-2">
          {[[62, "70%"], [88, "84%"], [78, "76%"], [64, "58%"], [60, "66%"], [100, "48%"]].map(([k, v], i) => (
            <div key={i} className="min-[900px]:even:pl-5" style={{ display: "flex", gap: 10, paddingTop: 8, paddingBottom: 8, borderBottom: i < 4 ? `1px solid ${LINE}` : "none" }}>
              <div style={{ minWidth: 100 }}><TextLine w={k} /></div>
              <div style={{ flex: 1 }}><TextLine w={v} px={13} lh={1.5} /></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
