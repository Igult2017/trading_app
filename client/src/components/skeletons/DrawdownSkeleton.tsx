/**
 * WHAT THE DRAWDOWN PAGE LOOKS LIKE WHILE IT IS STILL ARRIVING.
 *
 * His words, 2026-09-14: *"can you fix those remaining pages too"* — this page showed the generic
 * PanelSkeleton, and not even inside its own `.dp` wrapper, so the background and side margins changed
 * too when the data arrived.
 *
 * IT USES THE PAGE'S OWN STYLESHEET. Every box carries the class the loaded page uses
 * (drawdown/dpStyles.ts), so sizes, gaps and the 920px / 560px stacking rules are the page's own rather
 * than copied numbers that could drift; only the bars inside are new. Sections follow DrawdownPanel.tsx
 * top to bottom. The monthly table is left out: the page itself only shows it once there are dated months.
 */
import { DP_CSS } from "@/components/drawdown/dpStyles";
import { Skeleton } from "./DashboardSkeletons";
import { TextLine } from "./TextLine";

/** The underwater profile hangs DOWN from the zero line, deepest at 86% of the height (diveProfile.tsx),
 *  so its placeholder bars hang down too — a slab where a chart is coming reads as a broken image. */
const DEPTHS = [7, 15, 25, 20, 34, 49, 42, 27, 17, 32, 54, 71, 86, 76, 59, 44, 30, 37, 22, 12, 17, 10, 5, 2];
/** The bars the page fills with a tone colour, drawn in its quietest ink instead. */
const QUIET = { background: "var(--ink3)", opacity: 0.35 };

/** A section heading (Rule): the diamond, the title, an optional sub-title, and the toggles on the right. */
function Rule({ title, sub, right }: { title: number; sub?: number; right?: number[] }) {
  return (
    <div className="rule">
      {/* minWidth 0 so the title group can give way at phone width, as the real heading's words wrap. */}
      <div className="lab" style={{ minWidth: 0 }}>
        <span className="pin" style={{ background: "var(--line2)", flexShrink: 0 }} />
        <TextLine w={title} px={12.5} />
        {sub && <TextLine w={sub} px={11} />}
      </div>
      {right && <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>{right.map((w, i) => <TextLine key={i} w={w} px={11.5} />)}</div>}
    </div>
  );
}

/** A caption over a figure — the KPI cells and the readouts under the chart. */
const Readout = ({ className, k, v, px, style }: { className: string; k: number; v: number; px: number; style?: React.CSSProperties }) => (
  <div className={className} style={style}><div className="k"><TextLine w={k} px={11} /></div><div className="v"><TextLine w={v} px={px} /></div></div>
);

const Right = ({ children }: { children: React.ReactNode }) => <div style={{ display: "flex", justifyContent: "flex-end" }}>{children}</div>;

export function DrawdownSkeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="dp" style={style}>
      <style>{DP_CSS}</style>
      <div className="shell">

        <section>
          <div className="kpis">{[96, 104, 122, 124].map((k, i) => <Readout key={i} className="kpi" k={k} v={72} px={17} />)}</div>
          <div className="chart-wrap">
            <div style={{ width: "100%", aspectRatio: "1000 / 360", borderTop: "1px solid var(--line)", display: "flex", alignItems: "flex-start", gap: 3 }}>
              {DEPTHS.map((d, i) => <Skeleton key={i} className="flex-1 rounded-b-sm" style={{ height: `${d}%`, opacity: 0.09 }} />)}
            </div>
          </div>
          <div className="chart-foot">
            {[[76, 96], [128, 96], [92, 70]].map(([k, v], i) => <Readout key={i} className="foot" k={k} v={v} px={16} />)}
            <Readout className="foot" k={58} v={62} px={16} style={{ marginLeft: "auto" }} />
          </div>
        </section>

        <section>
          <Rule title={176} right={[58, 58, 70, 86]} />
          <div className="colh"><span /><span /><span><TextLine w={120} px={11} /></span><span><Right><TextLine w={66} px={11} /></Right></span></div>
          <div className="lead">
            {[[92, 64], [74, 44], [110, 30], [66, 18]].map(([name, bar], i) => (
              <div className="lrow" key={i}>
                <TextLine w={18} px={13} />
                <div className="lname"><TextLine w={name} px={14} /><TextLine w={118} px={12.5} /></div>
                <div className="lbar"><i style={{ width: `${bar}%`, ...QUIET }} /></div>
                <Right><TextLine w={56} px={15} /></Right>
              </div>
            ))}
          </div>
        </section>

        <section>
          <Rule title={150} sub={200} />
          <div className="trip">
            {([[4, 130, false], [4, 170, true], [1, 130, true]] as const).map(([rows, subh, note], i) => (
              <div key={i}>
                <div className="subh"><TextLine w={subh} px={11} /></div>
                <div className="dl">
                  {Array.from({ length: rows }, (_, r) => (
                    <div className="r" key={r}><TextLine w={[96, 150, 118, 190][r]} px={11} /><TextLine w={52} px={15} /></div>
                  ))}
                </div>
                {note && <div className="note"><TextLine w="92%" px={11.5} lh={1.65} /><TextLine w="60%" px={11.5} lh={1.65} /></div>}
              </div>
            ))}
          </div>
        </section>

        <section>
          <Rule title={230} sub={150} />
          <div className="rs">
            <div className="heat" style={{ ["--cols" as any]: 3, ["--rows" as any]: 3 }}>
              <div className="hrow">
                <div className="hp"><TextLine w={32} px={11} /></div>
                {[0, 1, 2].map(c => <div className="hh" key={c} style={{ display: "flex", justifyContent: "center" }}><TextLine w={60} px={11} /></div>)}
              </div>
              {[0, 1, 2].map(r => (
                <div className="hrow" key={r}>
                  <div className="hp"><TextLine w={52} px={11} /></div>
                  {[0, 1, 2].map(c => <div className="hc" key={c} style={{ background: "var(--raise)" }}><TextLine w={38} px={17} lh={1} /><TextLine w={28} px={12} /></div>)}
                </div>
              ))}
              <div className="hleg"><TextLine w={20} px={11} /><TextLine w={128} px={8} lh={1} /><TextLine w={130} px={11} /></div>
            </div>
            <div className="freq">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                <TextLine w={100} px={11} /><div style={{ display: "flex", gap: 22 }}><TextLine w={52} px={11.5} /><TextLine w={40} px={11.5} /></div>
              </div>
              {[64, 48, 80, 58].map((w, i) => (
                <div key={i}>
                  <div className="frow"><TextLine w={w} px={11.5} /><TextLine w={36} px={13} /></div>
                  <div className="bar"><i style={{ width: `${[62, 48, 36, 24][i]}%`, ...QUIET }} /></div>
                  <div className="fsub"><Right><TextLine w={78} px={12} /></Right></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <Rule title={180} right={[58, 44]} />
          <div className="struct-top">
            <div className="subh"><TextLine w={140} px={11} /></div>
            {[150, 120, 170].map((w, i) => (
              <div className="rp" key={i}><TextLine w={w} px={11} /><div style={{ display: "flex", gap: 12 }}><TextLine w={54} px={16} /><TextLine w={30} px={11} /></div></div>
            ))}
          </div>
          <div className="sg">
            <div>
              <div className="subh"><TextLine w={56} px={11} /></div>
              {[64, 70, 52].map((w, i) => (
                <div className="sess" key={i}>
                  <div className="top"><TextLine w={w} px={12} /><TextLine w={50} px={16} /></div>
                  <div className="sb"><TextLine w={70} px={13} /></div>
                  <div className="sbar"><i style={{ width: `${[70, 46, 30][i]}%`, ...QUIET }} /></div>
                  <div className="wp"><TextLine w={70} px={11} /><TextLine w={84} px={11} /></div>
                </div>
              ))}
            </div>
            <div>
              <div className="subh"><TextLine w={90} px={11} /></div>
              <div className="ls">
                {[104, 96, 128, 100].map((k, i) => (
                  <div key={i}><div className="k"><TextLine w={k} px={11} /></div><TextLine w={30} px={24} lh={1} /><div className="s"><TextLine w={72} px={11} /></div></div>
                ))}
              </div>
              <div style={{ marginTop: 20 }}><TextLine w={96} px={9} /></div>
              <div className="tl">{Array.from({ length: 16 }, (_, i) => <Skeleton key={i} className="rounded-none" style={{ width: 18, height: 18 }} />)}</div>
            </div>
            <div>
              <div className="subh"><TextLine w={104} px={11} /></div>
              {[70, 60, 76, 64].map((w, i) => (
                <div className="rr" key={i}>
                  <div className="top">
                    <div style={{ display: "flex", gap: 10 }}><TextLine w={46} px={14} /><TextLine w={w} px={11} /></div>
                    <div style={{ display: "flex", gap: 9 }}><TextLine w={20} px={12} /><TextLine w={34} px={15} /></div>
                  </div>
                  <div className="rrbar"><i style={{ width: `${[18, 42, 28, 12][i]}%`, ...QUIET }} /></div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
