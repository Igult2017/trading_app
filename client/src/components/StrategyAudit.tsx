import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, WifiOff, Cpu } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AuditData {
  success: boolean;
  error?: string;
  auditSummary: {
    winRate: number;
    edgePersistence: number;
    riskEntropy: string;
    aiConfidence: number;
    sampleSize: number;
    edgeVerdict: string;
    confidence: number;
    grade: string;
    gradeSummary: string;
  };
  executiveSummary: string;
  edgeVerdict: { verdict: string; confidence: number; sampleSize: number; profitFactor: number; expectancy: number };
  edgeDrivers: Array<{ factor: string; winRateWithFactor: number; winRateWithout: number; lift: number }>;
  monitorItems: Array<{ label: string; status: string; priority: string }>;
  weaknesses: Array<{ factor: string; winRateWithFactor: number; impact: number }>;
  instruments: string[];
  winFactors: string[];
  lossFactors: string[];
  winCorrelations: Record<string, number[]>;
  lossCorrelations: Record<string, number[]>;
  variance: { winRate: number; sampleSize: number; winLossRatio: number; positiveSkew: boolean; stdDev: number; skewness: number };
  drawdown: { maxPeakToValley: number; recovery: number; stagnation: number; calmarRatio: number; ulcerIndex: number };
  equityVariance: { simulationConfidence: number; varianceSkew: number; maxCluster: number; bestMonth: number; worstMonth: number; mcBars: number[] };
  auditScope: { totalTrades: number; statisticalSignificance: number };
  tradeQuality: { aTrades: { count: number; profit: number }; bTrades: { count: number; profit: number }; cTrades: { count: number; profit: number } };
  conditionalEdge: {
    liquidityGap: { label: string; rMultiple: number; samples: number; winRate: number };
    nonQualified: { label: string; rMultiple: number; samples: number; winRate: number };
  };
  edgeTransferability: number;
  coreRobustness: { ruleStability: number; executionAdherence: number; monteCarloStability: number };
  probabilisticEdge: { baseRate: number; kelly: number; avgWin: number; avgLoss: number };
  riskMetrics: { maxLossStreak: number; fiveLossProbability: number; timeInDrawdown: number };
  edgeComponents: { winRateContribution: number; riskRewardContribution: number };
  lossCluster: { avgLength: number; worstDD: number; clusterFrequency: number; clusterDates: string[] };
  executionAsymmetry: {
    avgWinRR: number; avgLossRR: number; asymmetryScore: number;
    slippageWins: number; slippageLosses: number; earlyExitRate: number; lateEntryRate: number;
  };
  regimeTransition: {
    trendingWinRate: number; rangingWinRate: number; breakoutWinRate: number;
    regimeDetectionAccuracy: number; avgTransitionDD: number; recoveryTrades: number;
  };
  capitalHeat: {
    avgRiskPerTrade: number; maxRiskPerTrade: number; riskConsistencyScore: number;
    correlatedExposure: string[]; peakEquityAtRisk: number; timeAtPeak: number;
  };
  automationRisk: { score: number; issues: string[]; label: string };
  psychologyScore: number;
  disciplineScore: number;
  edgeDecay: { last50: number; last200: number; detected: boolean; magnitude: number; recommendation: string; trend: string };
  aiPolicySuggestions: Array<{ rule: string; rationale: string; expectedImpact: string }>;
  guardrails: Array<{ label: string; value: string; action: string; status: string }>;
  finalVerdict: { grade: string; summary: string; strengths: string[]; weaknesses: string[]; nextActions: string[]; authorized: boolean };
  logicalVerification: {
    regime: string; entryLogic: string; exitLogic: string; scalingProperties: string;
    sessionDependency: string; behavioralFit: string; forwardConfirmation: string;
  };
  sessionEdge: Record<string, { trades: number; winRate: number; profitFactor: number }>;
  heatmapProfiles: Array<{ instrument: string; strategy: string; winRate: number; trades: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAudit(sessionId?: string, userId?: string): Promise<AuditData> {
  const p = new URLSearchParams();
  if (sessionId) p.set("sessionId", sessionId);
  if (userId) p.set("userId", userId);
  const res = await fetch(`/api/strategy-audit/compute?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Props { sessionId?: string; userId?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  bg:    "#0a0a0b",
  bg2:   "#111113",
  bg3:   "#18181c",
  bg4:   "#1e1e24",
  line:  "#2a2a32",
  line2: "#3a3a44",
  text:  "#e8e8ec",
  muted: "#7a7a88",
  dim:   "#4a4a58",
  green: "#22c97a",
  green2:"#16a35e",
  red:   "#e84040",
  red2:  "#b52e2e",
  amber: "#e8a020",
  blue:  "#4a8fff",
  blue2: "#2c6fd4",
};

const FONT = "'Montserrat', sans-serif";
const MONO = "'Share Tech Mono', monospace";
const mono = { fontFamily: FONT, fontWeight: 700 as const };
const num  = { fontFamily: MONO, fontWeight: 400 as const };

// ─────────────────────────────────────────────────────────────────────────────
// Primitive helpers
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ children, color = T.muted, border = T.line2 }: { children: React.ReactNode; color?: string; border?: string }) {
  return (
    <span style={{ ...mono, fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", padding: "3px 8px", border: `1px solid ${border}`, color, display: "inline-block" }}>
      {children}
    </span>
  );
}

function CellTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...mono, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: T.dim, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 12, height: 1, background: T.line2, display: "inline-block" }} />
      {children}
    </div>
  );
}

function Cell({ children, style = {}, span }: { children: React.ReactNode; style?: React.CSSProperties; span?: number }) {
  return (
    <div style={{ padding: "18px 20px", borderRight: `1px solid ${T.line}`, gridColumn: span ? `span ${span}` : undefined, ...style }}>
      {children}
    </div>
  );
}

function StatRow({ label, value, color = T.text, last = false }: { label: string; value: string | number; color?: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: last ? "none" : `1px solid ${T.line}` }}>
      <span style={{ fontSize: 12, color: T.muted, fontFamily: FONT }}>{label}</span>
      <span style={{ ...num, fontSize: 13, color }}>{value}</span>
    </div>
  );
}

function Bar({ pct, color = T.blue }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 2, background: T.line2, width: "100%", borderRadius: 1 }}>
      <div style={{ height: 2, background: color, width: `${Math.min(100, Math.max(0, pct))}%`, borderRadius: 1 }} />
    </div>
  );
}

function BigNum({ value, label, color = T.text }: { value: string | number; label: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...num, fontSize: 22, color, lineHeight: 1 }}>{value}</div>
      <div style={{ ...mono, fontSize: 9, letterSpacing: ".16em", color: T.dim, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function MiniGrid({ children, cols }: { children: React.ReactNode; cols: string }) {
  return <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, marginTop: 8 }}>{children}</div>;
}

function InfoBox({ children, borderColor = T.line }: { children: React.ReactNode; borderColor?: string }) {
  return <div style={{ padding: 12, border: `1px solid ${borderColor}`, background: T.bg3, marginBottom: 8 }}>{children}</div>;
}

function MiniStatBox({ label, value, color = T.text }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: 8, border: `1px solid ${T.line}`, textAlign: "center" }}>
      <div style={{ ...mono, fontSize: 10, color: T.dim }}>{label}</div>
      <div style={{ ...num, fontSize: 14, color }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap
// ─────────────────────────────────────────────────────────────────────────────

function Heatmap({ factors, corr, instruments, isWin }: {
  factors: string[]; corr: Record<string, number[]>; instruments: string[]; isWin: boolean;
}) {
  const [hovered, setHovered] = useState<{ ri: number; ci: number; v: number; inst: string; factor: string } | null>(null);
  const base = isWin ? "34,201,122" : "232,64,64";
  if (!instruments.length || !factors.length) {
    return <div style={{ fontSize: 12, color: T.muted, fontFamily: FONT, padding: "12px 0" }}>No correlation data available yet.</div>;
  }
  return (
    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <div style={{ width: "max-content" }}>
        <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
          <div style={{ width: 80 }} />
          {factors.map((f, i) => (
            <div key={i} style={{ width: 68, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 9, color: T.dim, letterSpacing: ".06em", padding: "4px 2px" }}>{f}</div>
          ))}
        </div>
        {instruments.map((inst, ri) => (
          <div key={inst} style={{ display: "flex", gap: 2, marginBottom: 2 }}>
            <div style={{ width: 80, fontFamily: FONT, fontWeight: 700, fontSize: 10, color: T.muted, display: "flex", alignItems: "center", paddingLeft: 4 }}>{inst}</div>
            {(corr[inst] ?? []).map((v, ci) => {
              const alpha = (v / 100) * 0.85 + 0.1;
              const isHov = hovered?.ri === ri && hovered?.ci === ci;
              return (
                <div
                  key={ci}
                  onMouseEnter={() => setHovered({ ri, ci, v, inst, factor: factors[ci] })}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    width: 68, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                    background: `rgba(${base},${alpha})`,
                    fontFamily: MONO, fontWeight: 400, fontSize: 10,
                    color: "rgba(255,255,255,0.9)", cursor: "default",
                    position: "relative", outline: isHov ? `1px solid ${T.line2}` : "none",
                  }}
                >
                  {v}
                  {isHov && (
                    <div style={{ position: "absolute", bottom: "110%", left: "50%", transform: "translateX(-50%)", background: T.bg2, border: `1px solid ${T.line2}`, padding: "6px 10px", whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none" }}>
                      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 10, color: T.text }}>{inst}</div>
                      <div style={{ fontFamily: FONT, fontSize: 9, color: T.dim }}>{factors[ci]}</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: T.text, marginTop: 2 }}>{v}%</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict bar
// ─────────────────────────────────────────────────────────────────────────────

function VerdictBar({ d }: { d: AuditData }) {
  const authorized = d.finalVerdict?.authorized;
  const grade = d.finalVerdict?.grade ?? "—";
  const next = d.finalVerdict?.nextActions?.[0] ?? "Continue monitoring";
  const maxDD = d.drawdown?.maxPeakToValley ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: T.bg2, borderTop: `1px solid ${T.line2}` }}>
      <div style={{ ...mono, fontSize: 11, letterSpacing: ".16em", color: authorized ? T.green : T.amber }}>
        {authorized ? "✓ SYSTEM AUTHORIZED — ALL STRUCTURAL CHECKS PASSED" : "⚠ SYSTEM PENDING — AWAITING CONFIRMATION"}
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim }}>
        Grade {grade} · Max DD {maxDD.toFixed(1)}% · Next: {next.slice(0, 30)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 1 — Strategy Audit
// ─────────────────────────────────────────────────────────────────────────────

function Page1({ d }: { d: AuditData }) {
  const verdict = d.edgeVerdict?.verdict ?? "Unconfirmed";
  const confidence = d.edgeVerdict?.confidence ?? 0;
  const sampleSize = d.edgeVerdict?.sampleSize ?? d.auditSummary?.sampleSize ?? 0;
  const baseRate = d.probabilisticEdge?.baseRate ?? d.auditSummary?.winRate ?? 0;
  const avgWin = d.probabilisticEdge?.avgWin ?? 0;
  const avgLoss = d.probabilisticEdge?.avgLoss ?? 0;
  const wlRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : "—";
  const maxStreak = d.riskMetrics?.maxLossStreak ?? 0;
  const fiveLossProb = d.riskMetrics?.fiveLossProbability ?? 0;
  const timeDD = d.riskMetrics?.timeInDrawdown ?? 0;
  const maxPV = d.drawdown?.maxPeakToValley ?? 0;
  const wrContrib = d.edgeComponents?.winRateContribution ?? 48;
  const rrContrib = d.edgeComponents?.riskRewardContribution ?? 38;
  const last50 = d.edgeDecay?.last50 ?? 0;
  const last200 = d.edgeDecay?.last200 ?? 0;
  const weakness = d.weaknesses?.[0];
  const weaknessFactor = weakness?.factor ?? "Low Liquidity Environments";
  const psychScore = d.psychologyScore ?? 0;
  const disciplineScore = d.disciplineScore ?? 0;
  const lv = d.logicalVerification ?? {};
  const lvRows = [
    { key: "Regime", val: lv.regime ?? "—" },
    { key: "Entry Logic", val: lv.entryLogic ?? "—" },
    { key: "Exit Logic", val: lv.exitLogic ?? "—" },
    { key: "Scaling", val: lv.scalingProperties ?? "—" },
    { key: "Session", val: lv.sessionDependency ?? "—" },
    { key: "Forward Test", val: lv.forwardConfirmation ?? "—" },
  ];
  const monitorItems = d.monitorItems ?? [];

  return (
    <div>
      {/* Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <Cell>
          <CellTitle>Executive Summary</CellTitle>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.75, fontFamily: FONT, fontWeight: 400 }}>
            {d.executiveSummary || "No trades found — add trades to your session to generate an audit."}
          </p>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <Badge color={verdict === "Confirmed" ? T.green : T.amber} border={verdict === "Confirmed" ? T.green2 : "#8a5a00"}>
              {verdict === "Confirmed" ? "Edge Confirmed" : `Edge ${verdict}`}
            </Badge>
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 10, color: T.dim }}>
              {confidence.toFixed(0)}% confidence · {sampleSize} samples
            </span>
          </div>
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Monitor Next</CellTitle>
          {monitorItems.length > 0 ? monitorItems.slice(0, 3).map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 2 ? `1px solid ${T.line}` : "none" }}>
              <span style={{ fontSize: 12, fontFamily: FONT, color: T.text }}>{item.label}</span>
              <Badge color={item.priority === "High" ? T.amber : item.priority === "New" ? T.blue : T.muted} border={item.priority === "High" ? "#8a5a00" : item.priority === "New" ? T.blue2 : T.line2}>
                {item.status}
              </Badge>
            </div>
          )) : (
            <div style={{ fontSize: 12, color: T.muted, fontFamily: FONT }}>Nothing flagged yet.</div>
          )}
        </Cell>
      </div>

      {/* Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <Cell>
          <CellTitle>Probabilistic Edge</CellTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div>
              <div style={{ ...num, fontSize: 22, color: T.green, lineHeight: 1 }}>{baseRate.toFixed(1)}%</div>
              <div style={{ ...mono, fontSize: 9, color: T.dim, marginTop: 4, letterSpacing: ".12em" }}>BASE RATE</div>
            </div>
            <div style={{ flex: 1 }}>
              <StatRow label="Avg Win" value={`${avgWin.toFixed(2)}R`} color={T.green} />
              <StatRow label="Avg Loss" value={`${avgLoss.toFixed(2)}R`} color={T.red} />
              <StatRow label="W/L Ratio" value={wlRatio} color={T.blue} last />
            </div>
          </div>
        </Cell>
        <Cell>
          <CellTitle>Risk &amp; Failure</CellTitle>
          <StatRow label="Max Loss Streak" value={maxStreak} color={T.red} />
          <StatRow label="5-Loss Probability" value={`${fiveLossProb.toFixed(0)}%`} color={T.amber} />
          <StatRow label="Time in Drawdown" value={`${timeDD.toFixed(0)}%`} />
          <StatRow label="Max Peak-to-Valley" value={`${maxPV.toFixed(1)}%`} color={T.red} last />
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Edge Components</CellTitle>
          {[
            { label: "Win Rate", pct: wrContrib, color: T.blue },
            { label: "Risk-Reward", pct: rrContrib, color: T.green },
          ].map((item, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 10, color: T.muted }}>{item.label}</span>
                <span style={{ ...num, fontSize: 10, color: item.color }}>{item.pct}%</span>
              </div>
              <Bar pct={item.pct} color={item.color} />
            </div>
          ))}
          <div style={{ paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
            <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: ".12em" }}>EDGE DECAY — ROLLING</div>
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <div>
                <div style={{ ...mono, fontSize: 10, color: T.dim }}>Last 50</div>
                <div style={{ ...num, fontSize: 14, color: T.blue }}>{last50.toFixed(2)}R</div>
              </div>
              <div>
                <div style={{ ...mono, fontSize: 10, color: T.dim }}>Last 200</div>
                <div style={{ ...num, fontSize: 14, color: T.text }}>{last200.toFixed(2)}R</div>
              </div>
            </div>
          </div>
        </Cell>
      </div>

      {/* Row 3 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <Cell>
          <CellTitle>Weaknesses &amp; Failure Conditions</CellTitle>
          <div style={{ padding: 14, borderLeft: `2px solid ${T.red2}`, background: T.bg3 }}>
            <div style={{ ...mono, fontSize: 10, color: T.red, letterSpacing: ".1em", marginBottom: 6 }}>{weaknessFactor.toUpperCase()}</div>
            <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, fontFamily: FONT, fontWeight: 400 }}>
              {d.weaknesses?.[0]
                ? `Win rate drops significantly when ${weaknessFactor.toLowerCase()} is present (impact: ${(weakness?.impact ?? 0).toFixed(1)}pp). AI recommends avoiding entries under these conditions.`
                : "Fails during bank holidays and pre-FOMC consolidation. AI recommends disabling auto-execution 4 hours prior to red-folder news events."}
            </p>
          </div>
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Psychology Impact</CellTitle>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { value: psychScore.toFixed(1), label: "STRESS SCORE", color: psychScore > 7 ? T.amber : T.green },
              { value: `${disciplineScore.toFixed(0)}%`, label: "RULE ADHERENCE", color: disciplineScore >= 85 ? T.green : T.amber },
            ].map((item, i) => (
              <div key={i} style={{ flex: 1, padding: 12, border: `1px solid ${T.line}`, textAlign: "center", background: T.bg3 }}>
                <div style={{ ...num, fontSize: 16, color: item.color }}>{item.value}</div>
                <div style={{ ...mono, fontSize: 9, letterSpacing: ".14em", color: T.dim, marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </Cell>
      </div>

      {/* Row 4 */}
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${T.line}` }}>
        <CellTitle>Logical Verification</CellTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          {lvRows.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < 4 ? `1px solid ${T.line}` : "none", paddingLeft: i % 2 === 1 ? 20 : 0 }}>
              <span style={{ ...mono, fontSize: 9, color: T.blue, minWidth: 100, letterSpacing: ".1em", textTransform: "uppercase", paddingTop: 2 }}>{item.key}</span>
              <span style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, fontFamily: FONT, fontWeight: 400 }}>{item.val}</span>
            </div>
          ))}
        </div>
      </div>

      <VerdictBar d={d} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 2 — Evidence & Proof
// ─────────────────────────────────────────────────────────────────────────────

function Page2({ d }: { d: AuditData }) {
  const v = d.variance ?? { winRate: 0, sampleSize: 0, winLossRatio: 0, positiveSkew: false, stdDev: 0, skewness: 0 };
  const dd = d.drawdown ?? { maxPeakToValley: 0, recovery: 0, stagnation: 0, calmarRatio: 0, ulcerIndex: 0 };
  const eq = d.equityVariance ?? { simulationConfidence: 0, varianceSkew: 0, maxCluster: 0, bestMonth: 0, worstMonth: 0, mcBars: [] };
  const tq = d.tradeQuality ?? { aTrades: { count: 0, profit: 0 }, bTrades: { count: 0, profit: 0 }, cTrades: { count: 0, profit: 0 } };
  const ce = d.conditionalEdge ?? { liquidityGap: { label: "Liquidity-Gap Entries", rMultiple: 0, samples: 0, winRate: 0 }, nonQualified: { label: "Non-Qualified Entries", rMultiple: 0, samples: 0, winRate: 0 } };
  const bars = eq.mcBars?.length ? eq.mcBars : [40,70,45,90,65,80,50,95,100,75,85,60,40,55,70,30,80,65,90,50];

  const instruments = d.instruments?.length ? d.instruments : [];
  const winFactors = d.winFactors?.length ? d.winFactors : [];
  const lossFactors = d.lossFactors?.length ? d.lossFactors : [];
  const winCorr = d.winCorrelations ?? {};
  const lossCorr = d.lossCorrelations ?? {};

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <Cell>
          <CellTitle>Variance &amp; Distribution</CellTitle>
          <StatRow label="Win Rate" value={`${v.winRate.toFixed(1)}%`} color={T.green} />
          <StatRow label="Sample Size" value={v.sampleSize} color={T.blue} />
          <StatRow label="Win / Loss Ratio" value={v.winLossRatio.toFixed(2)} />
          <div style={{ paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: T.muted, fontFamily: FONT }}>{v.positiveSkew ? "Positive Skew" : "Negative Skew"}</span>
            <Badge color={v.positiveSkew ? T.green : T.amber} border={v.positiveSkew ? T.green2 : "#8a5a00"}>{v.positiveSkew ? "Verified" : "Monitor"}</Badge>
          </div>
        </Cell>
        <Cell>
          <CellTitle>Drawdown Metrics</CellTitle>
          <BigNum value={`${dd.maxPeakToValley.toFixed(1)}%`} label="MAX PEAK-TO-VALLEY" color={T.amber} />
          <MiniGrid cols="1fr 1fr">
            <MiniStatBox label="Recovery" value={`${dd.recovery} days`} />
            <MiniStatBox label="Stagnation" value={`${dd.stagnation.toFixed(0)}%`} />
          </MiniGrid>
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Monte Carlo (N=10K)</CellTitle>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60 }}>
            {bars.slice(0, 20).map((h, i) => (
              <div key={i} style={{ flex: 1, minHeight: 4, height: `${h}%`, background: `rgba(74,143,255,${0.3 + h * 0.005})` }} />
            ))}
          </div>
          <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: ".14em", textAlign: "center", marginTop: 8 }}>
            SIMULATION CONFIDENCE: <span style={{ fontFamily: MONO }}>{eq.simulationConfidence.toFixed(1)}%</span>
          </div>
          <MiniGrid cols="1fr 1fr">
            <MiniStatBox label="Var Skew" value={eq.varianceSkew.toFixed(1)} color={T.blue} />
            <MiniStatBox label="Max Cluster" value={eq.maxCluster} />
          </MiniGrid>
        </Cell>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <Cell>
          <CellTitle>Trade Quality Stratification</CellTitle>
          {[
            { grade: "A", color: T.green, count: tq.aTrades.count, profit: `${tq.aTrades.profit.toFixed(0)}% of profit`, badge: "Primary", bc: T.green2 },
            { grade: "B", color: T.blue, count: tq.bTrades.count, profit: `${tq.bTrades.profit.toFixed(0)}% of profit`, badge: "Support", bc: T.blue2 },
            { grade: "C", color: T.muted, count: tq.cTrades.count, profit: `${tq.cTrades.profit.toFixed(0)}% of profit`, badge: "Low Edge", bc: T.line2 },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, border: `1px solid ${T.line}`, background: T.bg3, marginBottom: 6 }}>
              <div style={{ ...mono, fontSize: 22, color: item.color, width: 28 }}>{item.grade}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: T.dim, fontFamily: MONO }}>{item.count} trades</div>
                <div style={{ fontSize: 13, color: item.color, fontFamily: MONO }}>{item.profit}</div>
              </div>
              <Badge color={item.color} border={item.bc}>{item.badge}</Badge>
            </div>
          ))}
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Conditional Edge Validation</CellTitle>
          <InfoBox borderColor={T.blue2}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ ...mono, fontSize: 10, color: T.blue, letterSpacing: ".1em" }}>{ce.liquidityGap.label?.toUpperCase() ?? "LIQUIDITY-GAP ENTRIES"}</span>
              <span style={{ ...num, fontSize: 14, color: T.green }}>{ce.liquidityGap.rMultiple.toFixed(2)}R</span>
            </div>
            <div style={{ ...mono, fontSize: 10, color: T.dim }}>{ce.liquidityGap.samples} qualifying samples</div>
          </InfoBox>
          <InfoBox>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ ...mono, fontSize: 10, color: T.muted, letterSpacing: ".1em" }}>{ce.nonQualified.label?.toUpperCase() ?? "NON-QUALIFIED ENTRIES"}</span>
              <span style={{ ...num, fontSize: 14, color: T.amber }}>{ce.nonQualified.rMultiple.toFixed(2)}R</span>
            </div>
            <div style={{ ...mono, fontSize: 10, color: T.dim }}>{ce.nonQualified.samples} samples</div>
          </InfoBox>
          <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: ".1em", marginTop: 10 }}>
            EDGE TRANSFERABILITY: <span style={{ color: T.green, fontFamily: MONO }}>{(d.edgeTransferability ?? 0).toFixed(0)}%</span>
          </div>
        </Cell>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ padding: "18px 20px", borderRight: `1px solid ${T.line}` }}>
          <CellTitle>Correlation Heatmap — Win Factors</CellTitle>
          <Heatmap factors={winFactors} corr={winCorr} instruments={instruments} isWin={true} />
        </div>
        <div style={{ padding: "18px 20px" }}>
          <CellTitle>Correlation Heatmap — Decay Factors</CellTitle>
          <Heatmap factors={lossFactors} corr={lossCorr} instruments={instruments} isWin={false} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 3 — Diagnostics
// ─────────────────────────────────────────────────────────────────────────────

function Page3({ d }: { d: AuditData }) {
  const cr = d.coreRobustness ?? { ruleStability: 0, executionAdherence: 0, monteCarloStability: 0 };
  const lc = d.lossCluster ?? { avgLength: 0, worstDD: 0, clusterFrequency: 0, clusterDates: [] };
  const ea = d.executionAsymmetry ?? { avgWinRR: 0, avgLossRR: 0, asymmetryScore: 0, slippageWins: 0, slippageLosses: 0, earlyExitRate: 0, lateEntryRate: 0 };
  const rt = d.regimeTransition ?? { trendingWinRate: 0, rangingWinRate: 0, breakoutWinRate: 0, regimeDetectionAccuracy: 0, avgTransitionDD: 0, recoveryTrades: 0 };
  const ch = d.capitalHeat ?? { avgRiskPerTrade: 0, maxRiskPerTrade: 0, riskConsistencyScore: 0, correlatedExposure: [], peakEquityAtRisk: 0, timeAtPeak: 0 };
  const ar = d.automationRisk ?? { score: 0, issues: [], label: "LOW RISK" };

  const robRows = [
    { label: "Rule Stability", pct: cr.ruleStability, color: T.blue },
    { label: "Execution Adherence", pct: cr.executionAdherence, color: T.green },
    { label: "Monte Carlo Stability", pct: cr.monteCarloStability, color: T.amber },
  ];

  const adverseRatio = ea.slippageWins > 0 ? (ea.slippageLosses / ea.slippageWins).toFixed(1) : "—";

  return (
    <div>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${T.line}` }}>
        <CellTitle>Core Robustness</CellTitle>
        {robRows.map((row, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < robRows.length - 1 ? `1px solid ${T.line}` : "none" }}>
            <span style={{ ...mono, fontSize: 10, letterSpacing: ".1em", color: T.muted, minWidth: 180 }}>{row.label.toUpperCase()}</span>
            <div style={{ flex: 1, height: 1, background: T.line2 }}>
              <div style={{ height: 1, background: row.color, width: `${Math.min(100, row.pct)}%` }} />
            </div>
            <span style={{ ...mono, fontSize: 11, color: row.color, minWidth: 44, textAlign: "right" }}>{row.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <Cell>
          <CellTitle>Loss Cluster Severity</CellTitle>
          <MiniGrid cols="1fr 1fr">
            <div style={{ padding: 12, border: `1px solid ${T.line}`, textAlign: "center" }}>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginBottom: 6 }}>Avg Length</div>
              <div style={{ ...mono, fontSize: 28, color: T.red }}>{lc.avgLength.toFixed(1)}</div>
            </div>
            <div style={{ padding: 12, border: `1px solid ${T.line}`, textAlign: "center" }}>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginBottom: 6 }}>Worst DD</div>
              <div style={{ ...mono, fontSize: 28, color: T.amber }}>{lc.worstDD.toFixed(1)}%</div>
            </div>
          </MiniGrid>
        </Cell>
        <Cell>
          <CellTitle>Execution Asymmetry</CellTitle>
          <StatRow label="Slippage (Wins)" value={`${ea.slippageWins.toFixed(1)} ticks`} color={T.green} />
          <StatRow label="Slippage (Losses)" value={`${ea.slippageLosses.toFixed(1)} ticks`} color={T.red} last />
          <div style={{ marginTop: 12, padding: 10, border: `1px solid ${T.line}`, background: T.bg3 }}>
            <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: ".1em" }}>ADVERSE FILL RATIO</div>
            <div style={{ ...mono, fontSize: 18, color: T.amber, marginTop: 4 }}>{adverseRatio}×</div>
          </div>
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Regime Transition</CellTitle>
          <StatRow label="Avg Transition DD" value={`${rt.avgTransitionDD.toFixed(1)}%`} color={T.amber} />
          <StatRow label="Recovery Trades" value={rt.recoveryTrades} color={T.blue} />
          <StatRow label="Capital at Peak" value={`${ch.peakEquityAtRisk.toFixed(0)}%`} />
          <StatRow label="Automation Risk" value={`${ar.score.toFixed(0)}/100`} color={ar.score < 30 ? T.green : ar.score < 60 ? T.amber : T.red} last />
        </Cell>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 4 — Action & Iteration
// ─────────────────────────────────────────────────────────────────────────────

function Page4({ d }: { d: AuditData }) {
  const suggestions = d.aiPolicySuggestions ?? [];
  const guardrails = d.guardrails ?? [];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${T.line}` }}>
        <Cell>
          <CellTitle>AI Policy Suggestions</CellTitle>
          {suggestions.length > 0 ? suggestions.slice(0, 3).map((item, i) => (
            <div key={i} style={{ padding: 14, border: `1px solid ${T.line}`, background: T.bg3, marginBottom: 10 }}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: ".1em", color: T.blue, marginBottom: 6 }}>{item.rule?.toUpperCase()}</div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, fontFamily: FONT, fontWeight: 400 }}>
                {item.rationale}{" "}
                {item.expectedImpact && <span style={{ color: T.green, fontWeight: 700 }}>{item.expectedImpact}</span>}
              </div>
            </div>
          )) : (
            <div style={{ fontSize: 12, color: T.muted, fontFamily: FONT }}>No AI suggestions yet — run more trades to generate policy recommendations.</div>
          )}
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Audit-Enforced Guardrails</CellTitle>
          {guardrails.length > 0 ? guardrails.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < guardrails.length - 1 ? `1px solid ${T.line}` : "none" }}>
              <div>
                <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: ".1em" }}>{item.label?.toUpperCase()}</div>
                <div style={{ ...mono, fontSize: 14, color: T.text, marginTop: 2 }}>{item.value}</div>
              </div>
              <Badge color={item.status === "Active" ? T.green : T.amber} border={item.status === "Active" ? T.green2 : "#8a5a00"}>{item.status}</Badge>
            </div>
          )) : (
            <div style={{ fontSize: 12, color: T.muted, fontFamily: FONT }}>No guardrails configured yet.</div>
          )}
        </Cell>
      </div>

      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${T.line}` }}>
        <CellTitle>Final Verdict &amp; Next Actions</CellTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 4 }}>
          {(d.finalVerdict?.nextActions ?? []).slice(0, 2).map((action, i) => (
            <div key={i} style={{ padding: "10px 12px", borderLeft: `2px solid ${i === 0 ? T.green : T.line2}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? T.text : T.muted, fontFamily: FONT }}>{action}</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2, fontFamily: FONT }}>Grade {d.finalVerdict?.grade ?? "—"} · {i === 0 ? "Priority action" : "Secondary action"}</div>
            </div>
          ))}
          {!(d.finalVerdict?.nextActions?.length) && (
            <div style={{ padding: "10px 12px", borderLeft: `2px solid ${T.line2}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.muted, fontFamily: FONT }}>Continue adding trades</div>
              <div style={{ fontSize: 11, color: T.dim, marginTop: 2, fontFamily: FONT }}>More data needed to generate action items</div>
            </div>
          )}
        </div>
      </div>

      <VerdictBar d={d} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function StrategyAudit({ sessionId, userId }: Props) {
  const [active, setActive] = useState(1);
  const [queryEnabled, setQueryEnabled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQueryEnabled(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery<AuditData>({
    queryKey: ["strategyAudit", sessionId, userId],
    queryFn: () => fetchAudit(sessionId, userId),
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: queryEnabled,
  });

  const F = { fontFamily: FONT };

  if (!queryEnabled || isLoading) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", ...F }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Loader2 style={{ width: 16, height: 16, color: T.blue, animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 11, color: T.muted, letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 700 }}>Analysing your trades…</span>
      </div>
    </div>
  );

  if (isError || (data && !data.success)) {
    const msg = (error as Error)?.message ?? data?.error ?? "Unknown error";
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, ...F }}>
        <WifiOff style={{ width: 48, height: 48, color: T.red }} />
        <div style={{ textAlign: "center" }}>
          <p style={{ ...mono, fontSize: 12, letterSpacing: ".18em", color: T.red, textTransform: "uppercase" }}>Audit Engine Error</p>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 8, maxWidth: 360, fontWeight: 400 }}>{msg}</p>
        </div>
        <button onClick={() => refetch()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: T.blue2, color: T.text, border: "none", cursor: "pointer", ...mono, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase" }}>
          <RefreshCw style={{ width: 14, height: 14 }} /> Retry
        </button>
      </div>
    );
  }

  const d = data!;

  const TABS = [
    { id: 1, label: "Strategy" },
    { id: 2, label: "Evidence" },
    { id: 3, label: "Diagnostics" },
    { id: 4, label: "Action" },
  ];

  const kpis = [
    { label: "Win Rate", value: `${(d.auditSummary?.winRate ?? 0).toFixed(1)}%`, sub: `+${((d.auditSummary?.winRate ?? 50) - 50).toFixed(1)}pp vs breakeven`, color: T.green },
    { label: "Edge Factor", value: (d.edgeVerdict?.profitFactor ?? 0).toFixed(2), sub: "Profit factor", color: T.blue },
    { label: "Risk Entropy", value: d.auditSummary?.riskEntropy ?? "—", sub: `Auto risk: ${(d.automationRisk?.score ?? 0).toFixed(0)}/100`, color: T.text },
    { label: "AI Confidence", value: `${(d.auditSummary?.aiConfidence ?? 0).toFixed(0)}/100`, sub: `Grade ${d.auditSummary?.grade ?? "—"}`, color: T.amber },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=Share+Tech+Mono&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${T.bg2}; }
        ::-webkit-scrollbar-thumb { background: ${T.line2}; }
      `}} />

      <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: FONT }}>

        {/* Topbar */}
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: T.bg2, borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, zIndex: 100, height: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: T.blue2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Cpu size={14} color="#fff" />
            </div>
            <div style={{ ...mono, fontSize: 11, letterSpacing: ".2em" }}>
              AUDIT<span style={{ color: T.green }}>.</span>AI
              <span style={{ color: T.dim, fontWeight: 400, marginLeft: 8 }}>— Strategy Engine</span>
            </div>
          </div>

          <div style={{ display: "flex" }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                style={{ ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", padding: "0 18px", height: 52, cursor: "pointer", background: "none", border: "none", borderBottom: `2px solid ${active === tab.id ? T.green : "transparent"}`, color: active === tab.id ? T.text : T.dim, transition: "all .15s" }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, animation: "pulse 2s infinite" }} />
            <span style={{ ...mono, fontSize: 9, letterSpacing: ".12em", color: T.green }}>LIVE</span>
          </div>
        </nav>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: `1px solid ${T.line}` }}>
          {kpis.map((kpi, i) => (
            <div key={i} style={{ padding: "14px 20px", borderRight: i < 3 ? `1px solid ${T.line}` : "none" }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: ".18em", color: T.dim, marginBottom: 6 }}>{kpi.label.toUpperCase()}</div>
              <div style={{ ...num, fontSize: 16, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ ...mono, fontSize: 10, color: T.muted, marginTop: 4 }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Page content */}
        <div>
          {active === 1 && <Page1 d={d} />}
          {active === 2 && <Page2 d={d} />}
          {active === 3 && <Page3 d={d} />}
          {active === 4 && <Page4 d={d} />}
        </div>

      </div>
    </>
  );
}
