import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/queryClient";
import { Loader2, RefreshCw, WifiOff, Cpu, Layout, Network, Zap, Activity, ShieldCheck, Target, Brain, AlertTriangle, BarChart3, Sparkles } from "lucide-react";

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
  tradeQuality: { aTrades: { count: number; profit: number | null }; bTrades: { count: number; profit: number | null }; cTrades: { count: number; profit: number | null } };
  conditionalEdge: {
    liquidityGap: { label: string; rMultiple: number; samples: number; winRate: number };
    nonQualified: { label: string; rMultiple: number; samples: number; winRate: number };
  };
  edgeTransferability: number;
  coreRobustness: { ruleStability: number; executionAdherence: number; monteCarloStability: number };
  probabilisticEdge: { baseRate: number; kelly: number; avgWin: number; avgLoss: number };
  riskMetrics: { maxLossStreak: number; fiveLossProbability: number; timeInDrawdown: number };
  edgeComponents: { winRateContribution: number; riskRewardContribution: number };
  lossCluster: { avgLength: number; worstDD: number | null; clusterFrequency: number; clusterDates: string[] };
  executionAsymmetry: {
    avgWinRR: number; avgLossRR: number; asymmetryScore: number;
    slippageWins: number | null; slippageLosses: number | null; earlyExitRate: number; lateEntryRate: number;
  };
  regimeTransition: {
    trendingWinRate: number; rangingWinRate: number; breakoutWinRate: number;
    regimeDetectionAccuracy: number; avgTransitionDD: number | null; recoveryTrades: number | null;
  };
  capitalHeat: {
    avgRiskPerTrade: number; maxRiskPerTrade: number; riskConsistencyScore: number;
    correlatedExposure: string[]; peakEquityAtRisk: number | null; timeAtPeak: number | null;
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
  const res = await authFetch(`/api/strategy-audit/compute?${p}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Props { sessionId?: string; userId?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  bg:    "#080a0e",
  bg2:   "#0d1117",
  bg3:   "#0d1117",
  bg4:   "#11161e",
  line:  "rgba(255,255,255,0.04)",
  line2: "rgba(255,255,255,0.08)",
  text:  "#ffffff",
  muted: "#94a3b8",
  dim:   "#475569",
  green: "#10b981",
  green2:"#059669",
  red:   "#f43f5e",
  red2:  "#e11d48",
  amber: "#f59e0b",
  blue:  "#6366f1",
  blue2: "#4f46e5",
};

const FONT = "'Montserrat', sans-serif";
const MONO = "'DM Mono', monospace";
const mono = { fontFamily: MONO, fontWeight: 700 as const };
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

function L({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: FONT, fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: T.dim, fontWeight: 500, ...style }}>{children}</span>;
}

function V({ children, color = T.text, style = {} }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color, ...style }}>{children}</span>;
}

function Sub({ children, color = T.dim, style = {} }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return <span style={{ fontFamily: MONO, fontSize: 9, color, fontWeight: 400, ...style }}>{children}</span>;
}

function CellTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.10)", display: "inline-block" }} />
      {icon && <span style={{ color: T.dim, display: "inline-flex" }}>{icon}</span>}
      <span style={{ fontFamily: FONT, fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: T.text, fontWeight: 700 }}>{children}</span>
    </div>
  );
}

function Cell({ children, style = {}, span }: { children: React.ReactNode; style?: React.CSSProperties; span?: number }) {
  // Card-style cell matching drawdown panel design
  const { borderRight: _br, borderLeft: _bl, ...rest } = style as any;
  const accent = (style as any).borderLeft;
  return (
    <div style={{
      background: T.bg2,
      border: `1px solid ${T.line}`,
      borderRadius: 4,
      padding: "20px 22px",
      gridColumn: span ? `span ${span}` : undefined,
      ...rest,
      ...(accent ? { borderLeft: accent } : {}),
    }}>
      {children}
    </div>
  );
}

function StatRow({ label, value, color = T.text, last = false }: { label: string; value: string | number; color?: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: last ? "none" : `1px solid ${T.line}` }}>
      <span style={{ fontSize: 10, color: T.muted, fontFamily: FONT, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".14em" }}>{label}</span>
      <span style={{ ...num, fontSize: 12, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function Bar({ pct, color = T.blue }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 1, background: "rgba(255,255,255,0.05)", width: "100%" }}>
      <div style={{ height: 1, background: color, width: `${Math.min(100, Math.max(0, pct))}%`, transition: "width 0.7s" }} />
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
  const wrContrib = d.edgeComponents?.winRateContribution ?? 0;
  const rrContrib = d.edgeComponents?.riskRewardContribution ?? 0;
  const last50: number | null = d.edgeDecay?.last50 ?? null;
  const last200: number | null = d.edgeDecay?.last200 ?? null;
  const weakness = d.weaknesses?.[0];
  const weaknessFactor = weakness?.factor ?? "";
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
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
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
                {last50 == null
                  ? <div style={{ ...num, fontSize: 14, color: T.dim }}>—</div>
                  : <div style={{ ...num, fontSize: 14, color: last50 >= 0 ? T.blue : T.red }}>{last50 >= 0 ? "+" : ""}{last50.toFixed(2)}R</div>
                }
              </div>
              <div>
                <div style={{ ...mono, fontSize: 10, color: T.dim }}>Last 200</div>
                {last200 == null
                  ? <div style={{ ...num, fontSize: 12, color: T.dim }}>Need 200+ trades</div>
                  : <div style={{ ...num, fontSize: 14, color: last200 >= 0 ? T.text : T.red }}>{last200 >= 0 ? "+" : ""}{last200.toFixed(2)}R</div>
                }
              </div>
            </div>
          </div>
        </Cell>
      </div>

      {/* Row 3 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Cell>
          <CellTitle>Weaknesses &amp; Failure Conditions</CellTitle>
          {weakness ? (
            <div style={{ padding: 14, borderLeft: `2px solid ${T.red2}`, background: T.bg3 }}>
              <div style={{ ...mono, fontSize: 10, color: T.red, letterSpacing: ".1em", marginBottom: 6 }}>{weaknessFactor.toUpperCase()}</div>
              <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, fontFamily: FONT, fontWeight: 400 }}>
                Win rate drops to {(weakness.winRateWithFactor ?? 0).toFixed(1)}% when {weaknessFactor.toLowerCase()} is present (−{(weakness.impact ?? 0).toFixed(1)}pp impact). Avoid entries under these conditions.
              </p>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.muted, fontFamily: FONT, fontWeight: 400 }}>
              No failure conditions detected yet — add more trades to surface weaknesses.
            </div>
          )}
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
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 4, padding: "20px 22px", marginBottom: 12 }}>
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
  const bars = eq.mcBars ?? [];

  const instruments = d.instruments?.length ? d.instruments : [];
  const winFactors = d.winFactors?.length ? d.winFactors : [];
  const lossFactors = d.lossFactors?.length ? d.lossFactors : [];
  const winCorr = d.winCorrelations ?? {};
  const lossCorr = d.lossCorrelations ?? {};

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
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
            <MiniStatBox label="Recovery Factor" value={`${dd.recovery.toFixed(2)}×`} />
            <MiniStatBox label="Stagnation" value={`${dd.stagnation.toFixed(0)}%`} />
          </MiniGrid>
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Monthly P&amp;L Distribution</CellTitle>
          {bars.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60 }}>
              {bars.map((h, i) => (
                <div key={i} style={{ flex: 1, minHeight: 4, height: `${Math.abs(h)}%`, background: h >= 0 ? `rgba(34,201,122,${0.3 + Math.abs(h) * 0.005})` : `rgba(232,64,64,${0.3 + Math.abs(h) * 0.005})` }} />
              ))}
            </div>
          ) : (
            <div style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.dim, fontFamily: FONT }}>
              Not enough monthly data yet
            </div>
          )}
          <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: ".14em", textAlign: "center", marginTop: 8 }}>
            CONSISTENCY SCORE: <span style={{ fontFamily: MONO }}>{eq.simulationConfidence.toFixed(1)}%</span>
          </div>
          <MiniGrid cols="1fr 1fr">
            <MiniStatBox label="Var Skew" value={eq.varianceSkew.toFixed(1)} color={T.blue} />
            <MiniStatBox label="Max Cluster" value={eq.maxCluster} />
          </MiniGrid>
        </Cell>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Cell>
          <CellTitle>Trade Quality Stratification</CellTitle>
          {[
            { grade: "A", color: T.green, count: tq.aTrades.count, profit: tq.aTrades.profit != null ? `${tq.aTrades.profit.toFixed(0)}% win rate` : "—", badge: "Primary", bc: T.green2 },
            { grade: "B", color: T.blue, count: tq.bTrades.count, profit: tq.bTrades.profit != null ? `${tq.bTrades.profit.toFixed(0)}% win rate` : "—", badge: "Support", bc: T.blue2 },
            { grade: "C", color: T.muted, count: tq.cTrades.count, profit: tq.cTrades.profit != null ? `${tq.cTrades.profit.toFixed(0)}% win rate` : "—", badge: "Low Edge", bc: T.line2 },
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Cell>
          <CellTitle>Correlation Heatmap — Win Factors</CellTitle>
          <Heatmap factors={winFactors} corr={winCorr} instruments={instruments} isWin={true} />
        </Cell>
        <Cell>
          <CellTitle>Correlation Heatmap — Decay Factors</CellTitle>
          <Heatmap factors={lossFactors} corr={lossCorr} instruments={instruments} isWin={false} />
        </Cell>
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
      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 4, padding: "20px 22px", marginBottom: 12 }}>
        <CellTitle>Core Robustness</CellTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${T.line}`, padding: "8px 0" }}>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 9, letterSpacing: ".25em", color: T.dim, textTransform: "uppercase" }}>Status Bar</span>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 9, letterSpacing: ".25em", color: T.dim, textTransform: "uppercase", textAlign: "center" }}>Percentages</span>
        </div>
        {robRows.map((row, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center", padding: "22px 0", borderBottom: i < robRows.length - 1 ? `1px solid ${T.line}` : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingRight: 24 }}>
              <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 10, letterSpacing: ".18em", color: T.muted, textTransform: "uppercase" }}>{row.label}</span>
              <div style={{ width: "100%", height: 3, background: T.line2, borderRadius: 1 }}>
                <div style={{ height: 3, background: row.color, width: `${Math.min(100, row.pct)}%`, borderRadius: 1, boxShadow: `0 0 8px ${row.color}` }} />
              </div>
            </div>
            <div style={{ textAlign: "center", fontFamily: MONO }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: row.color }}>{row.pct.toFixed(1)}</span>
              <span style={{ fontSize: 8, color: row.color, opacity: 0.5 }}>%</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Cell>
          <CellTitle>Loss Cluster Severity</CellTitle>
          <MiniGrid cols="1fr 1fr">
            <div style={{ padding: 12, border: `1px solid ${T.line}`, textAlign: "center" }}>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginBottom: 6 }}>Avg Length</div>
              <div style={{ ...mono, fontSize: 28, color: T.red }}>{lc.avgLength.toFixed(1)}</div>
            </div>
            <div style={{ padding: 12, border: `1px solid ${T.line}`, textAlign: "center" }}>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginBottom: 6 }}>Worst DD</div>
              <div style={{ ...mono, fontSize: 28, color: T.amber }}>{lc.worstDD != null ? `${lc.worstDD.toFixed(1)}%` : "—"}</div>
            </div>
          </MiniGrid>
        </Cell>
        <Cell>
          <CellTitle>Execution Asymmetry</CellTitle>
          <StatRow label="Slippage (Wins)" value={ea.slippageWins != null ? `${ea.slippageWins.toFixed(1)} ticks` : "—"} color={T.green} />
          <StatRow label="Slippage (Losses)" value={ea.slippageLosses != null ? `${ea.slippageLosses.toFixed(1)} ticks` : "—"} color={T.red} last />
          <div style={{ marginTop: 12, padding: 10, border: `1px solid ${T.line}`, background: T.bg3 }}>
            <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: ".1em" }}>ADVERSE FILL RATIO</div>
            <div style={{ ...mono, fontSize: 18, color: T.amber, marginTop: 4 }}>{adverseRatio}×</div>
          </div>
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Regime Transition</CellTitle>
          <StatRow label="Avg Transition DD" value={rt.avgTransitionDD != null ? `${rt.avgTransitionDD.toFixed(1)}%` : "—"} color={T.amber} />
          <StatRow label="Recovery Trades" value={rt.recoveryTrades ?? "—"} color={T.blue} />
          <StatRow label="Capital at Peak" value={ch.peakEquityAtRisk != null ? `${ch.peakEquityAtRisk.toFixed(0)}%` : "—"} />
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
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

      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 4, padding: "20px 22px", marginBottom: 12 }}>
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
// Page5 — AI Analysis
// ─────────────────────────────────────────────────────────────────────────────

interface AIAnalysisData {
  success: boolean;
  trader_archetype?: string;
  health_score?: string;
  headline?: string;
  win_profile?: { label: string; conditions: string[]; probability: string } | null;
  loss_profile?: { label: string; conditions: string[]; probability: string } | null;
  findings?: Array<{ finding: string; sample_size: number; win_rate: number; baseline_wr: number; deviation: number; confidence: string }>;
  pre_trade_checklist?: string[];
  risk_alert?: string | null;
  error?: string;
}

interface AIStrategyData {
  success: boolean;
  name?: string;
  entry_conditions?: Array<{ label: string; win_rate: number; sample_size: number; confidence: string }>;
  avoid_conditions?: Array<{ label: string; win_rate: number; sample_size: number; confidence: string }>;
  risk_rules?: Record<string, string>;
  projected_edge?: { finding: string; win_rate: number; sample_size: number; confidence: string } | null;
  data_warnings?: string[];
  narrative?: string;
  error?: string;
}

const CONF_COLOR: Record<string, string> = {
  HIGH:         T.green,
  MEDIUM:       T.amber,
  LOW:          "#f97316",
  INSUFFICIENT: T.muted,
};

function ConfBadge({ level }: { level: string }) {
  const color = CONF_COLOR[level] ?? T.muted;
  return (
    <span style={{ ...mono, fontSize: 8, letterSpacing: ".12em", padding: "2px 7px", border: `1px solid ${color}`, color, flexShrink: 0 }}>
      {level}
    </span>
  );
}

function AILoadingState({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 14 }}>
      <Loader2 style={{ width: 20, height: 20, color: T.blue, animation: "spin 1s linear infinite" }} />
      <span style={{ ...mono, fontSize: 10, letterSpacing: ".18em", color: T.muted, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function AIErrorState({ msg, retry }: { msg: string; retry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 300, gap: 16 }}>
      <WifiOff style={{ width: 32, height: 32, color: T.red }} />
      <p style={{ fontSize: 12, color: T.muted, maxWidth: 360, textAlign: "center", fontFamily: FONT, fontWeight: 400 }}>{msg}</p>
      <button onClick={retry} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", background: T.blue2, color: T.text, border: "none", cursor: "pointer", ...mono, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase" }}>
        <RefreshCw style={{ width: 12, height: 12 }} /> Retry
      </button>
    </div>
  );
}

function Page5({ sessionId, userId }: { sessionId?: string; userId?: string }) {
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  if (userId)    params.set("userId",    userId);

  const { data, isLoading, isError, refetch } = useQuery<AIAnalysisData>({
    queryKey:  ["aiAnalysis", sessionId, userId],
    queryFn:   () => authFetch(`/api/ai/analysis?${params}`).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) return <AILoadingState label="Running AI analysis…" />;
  if (isError || !data?.success || data?.error) return <AIErrorState msg={data?.error ?? "AI analysis failed"} retry={refetch} />;

  const findings  = data.findings ?? [];
  const checklist = data.pre_trade_checklist ?? [];

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Health strip */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Cell>
          <CellTitle>Trader Archetype</CellTitle>
          <div style={{ ...mono, fontSize: 13, color: T.blue }}>{data.trader_archetype ?? "—"}</div>
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Health Score</CellTitle>
          <div style={{ ...mono, fontSize: 13, color: data.health_score === "Advanced" ? T.green : data.health_score === "Consistent" ? T.amber : T.muted }}>
            {data.health_score ?? "—"}
          </div>
        </Cell>
      </div>

      {/* Headline narrative */}
      {data.headline && (
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.line}`, background: T.bg2 }}>
          <CellTitle>AI Verdict</CellTitle>
          <p style={{ fontFamily: FONT, fontSize: 13, color: T.text, lineHeight: 1.75, fontWeight: 400, whiteSpace: "pre-wrap" }}>
            {data.headline}
          </p>
        </div>
      )}

      {/* Win / Loss profiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {[data.win_profile, data.loss_profile].map((profile, i) => {
          const isWin = i === 0;
          const accent = isWin ? T.green : T.red;
          return (
            <Cell key={i} style={{ borderRight: i === 0 ? `1px solid ${T.line}` : "none", borderLeft: `3px solid ${accent}` }}>
              <CellTitle>{isWin ? "Win Profile" : "Loss Profile"}</CellTitle>
              {profile ? (
                <>
                  {profile.conditions.map((c, ci) => (
                    <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: accent, flexShrink: 0, display: "inline-block" }} />
                      <span style={{ fontFamily: FONT, fontSize: 12, color: T.text, fontWeight: 400 }}>{c}</span>
                    </div>
                  ))}
                  <div style={{ ...mono, fontSize: 10, color: T.muted, marginTop: 8 }}>{profile.probability}</div>
                </>
              ) : (
                <div style={{ fontFamily: FONT, fontSize: 12, color: T.dim }}>Insufficient data</div>
              )}
            </Cell>
          );
        })}
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 4, padding: "20px 22px", marginBottom: 12 }}>
          <CellTitle>Proofed Findings</CellTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {findings.map((f, i) => {
              const isEdge = f.deviation >= 0;
              const accent = isEdge ? T.green : T.red;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: T.bg3, border: `1px solid ${T.line}`, borderLeft: `3px solid ${accent}`, gap: 12 }}>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: T.text, fontWeight: 400, flex: 1 }}>{f.finding}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ ...num, fontSize: 12, color: accent }}>{(f.win_rate * 100).toFixed(0)}%</span>
                    <span style={{ ...mono, fontSize: 10, color: T.dim }}>{f.sample_size}t</span>
                    <ConfBadge level={f.confidence} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Checklist + Risk alert */}
      <div style={{ display: "grid", gridTemplateColumns: checklist.length && data.risk_alert ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 12 }}>
        {checklist.length > 0 && (
          <Cell style={{ borderRight: data.risk_alert ? `1px solid ${T.line}` : "none" }}>
            <CellTitle>Pre-Trade Checklist</CellTitle>
            {checklist.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ color: T.green, fontSize: 12, lineHeight: 1.6 }}>✓</span>
                <span style={{ fontFamily: FONT, fontSize: 12, color: T.text, fontWeight: 400, lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
          </Cell>
        )}
        {data.risk_alert && (
          <Cell style={{ borderRight: "none", background: "rgba(232,64,64,0.04)" }}>
            <CellTitle>Risk Alert</CellTitle>
            <p style={{ fontFamily: FONT, fontSize: 12, color: T.red, lineHeight: 1.7, fontWeight: 400 }}>{data.risk_alert}</p>
          </Cell>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page6 — AI Strategy
// ─────────────────────────────────────────────────────────────────────────────

function Page6({ sessionId, userId }: { sessionId?: string; userId?: string }) {
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  if (userId)    params.set("userId",    userId);

  const { data, isLoading, isError, refetch } = useQuery<AIStrategyData>({
    queryKey:  ["aiStrategy", sessionId, userId],
    queryFn:   () => authFetch(`/api/ai/strategy?${params}`).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) return <AILoadingState label="Building AI strategy…" />;
  if (isError || !data?.success || data?.error) return <AIErrorState msg={data?.error ?? "AI strategy failed"} retry={refetch} />;

  const entries = data.entry_conditions ?? [];
  const avoids  = data.avoid_conditions ?? [];
  const rules   = data.risk_rules ?? {};
  const warns   = data.data_warnings ?? [];

  function ConditionRow({ label, wr, n, conf, isEntry }: { label: string; wr: number; n: number; conf: string; isEntry: boolean }) {
    const pct = (wr * 100).toFixed(0);
    const accent = isEntry ? T.green : T.red;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ flex: 1, fontFamily: FONT, fontSize: 10, color: T.text, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".14em" }}>{label}</div>
        <div style={{ width: 80 }}>
          <Bar pct={wr * 100} color={accent} />
        </div>
        <span style={{ ...num, fontSize: 13, color: accent, width: 36, textAlign: "right" }}>{pct}%</span>
        <span style={{ ...mono, fontSize: 10, color: T.dim, width: 30, textAlign: "right" }}>{n}t</span>
        <ConfBadge level={conf} />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* Entry / Avoid side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Cell>
          <CellTitle>Entry Conditions</CellTitle>
          {entries.length === 0
            ? <div style={{ fontFamily: FONT, fontSize: 12, color: T.dim }}>No qualifying conditions found</div>
            : entries.map((c, i) => <ConditionRow key={i} label={c.label} wr={c.win_rate} n={c.sample_size} conf={c.confidence} isEntry={true} />)
          }
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Avoid</CellTitle>
          {avoids.length === 0
            ? <div style={{ fontFamily: FONT, fontSize: 12, color: T.dim }}>No drain conditions identified</div>
            : avoids.map((c, i) => <ConditionRow key={i} label={c.label} wr={c.win_rate} n={c.sample_size} conf={c.confidence} isEntry={false} />)
          }
        </Cell>
      </div>

      {/* Risk rules + projected edge */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Cell>
          <CellTitle>Risk Rules</CellTitle>
          {Object.entries(rules).map(([k, v], i) => (
            <StatRow key={i} label={k.replace(/_/g, " ")} value={v} last={i === Object.entries(rules).length - 1} />
          ))}
        </Cell>
        <Cell style={{ borderRight: "none" }}>
          <CellTitle>Projected Edge</CellTitle>
          {data.projected_edge ? (
            <>
              <div style={{ fontFamily: FONT, fontSize: 12, color: T.text, fontWeight: 400, marginBottom: 10 }}>{data.projected_edge.finding}</div>
              <div style={{ display: "flex", gap: 12 }}>
                <MiniStatBox label="Win Rate" value={`${(data.projected_edge.win_rate * 100).toFixed(0)}%`} color={T.green} />
                <MiniStatBox label="Trades" value={data.projected_edge.sample_size} />
                <MiniStatBox label="Confidence" value={data.projected_edge.confidence} color={CONF_COLOR[data.projected_edge.confidence]} />
              </div>
            </>
          ) : (
            <div style={{ fontFamily: FONT, fontSize: 12, color: T.dim }}>Insufficient aligned trades</div>
          )}
        </Cell>
      </div>

      {/* AI narrative */}
      {data.narrative && (
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.line}`, background: T.bg2 }}>
          <CellTitle>Strategy Brief</CellTitle>
          <p style={{ fontFamily: FONT, fontSize: 13, color: T.text, lineHeight: 1.75, fontWeight: 400, whiteSpace: "pre-wrap" }}>{data.narrative}</p>
        </div>
      )}

      {/* Data warnings */}
      {warns.length > 0 && (
        <div style={{ padding: "16px 24px" }}>
          <CellTitle>Data Warnings</CellTitle>
          {warns.map((w, i) => (
            <div key={i} style={{ fontFamily: FONT, fontSize: 12, color: T.amber, lineHeight: 1.6, marginBottom: 6 }}>{w}</div>
          ))}
        </div>
      )}
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
    setQueryEnabled(true);
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
    { id: 5, label: "AI Analysis" },
    { id: 6, label: "AI Strategy" },
  ];

  const kpis = [
    { label: "Win Rate", value: `${(d.auditSummary?.winRate ?? 0).toFixed(1)}%`, sub: `+${((d.auditSummary?.winRate ?? 50) - 50).toFixed(1)}pp vs breakeven`, color: T.green },
    { label: "Edge Factor", value: (d.edgeVerdict?.profitFactor ?? 0) >= 999 ? "∞" : (d.edgeVerdict?.profitFactor ?? 0).toFixed(2), sub: "Profit factor", color: T.blue },
    { label: "Risk Entropy", value: `${(d.automationRisk?.score ?? 0).toFixed(2)}%`, sub: `Auto risk: ${(d.automationRisk?.score ?? 0).toFixed(0)}/100`, color: ((d.automationRisk?.score ?? 0) < 30 ? T.green : (d.automationRisk?.score ?? 0) < 60 ? T.amber : T.red) },
    { label: "AI Confidence", value: "0/100", sub: "No AI connected", color: T.dim },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Share+Tech+Mono&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${T.bg2}; }
        ::-webkit-scrollbar-thumb { background: ${T.line2}; }
        .audit-root, .audit-root span, .audit-root div { font-feature-settings: "tnum" 1; }
        .audit-root [style*="monospace"],
        .audit-root [style*="DM Mono"],
        .audit-root [style*="JetBrains Mono"],
        .audit-root [style*="Share Tech Mono"] { font-family: 'DM Mono', monospace !important; font-variant-numeric: tabular-nums !important; }
      `}} />

      <div className="audit-root" style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: FONT, padding: "24px 0" }}>
        <div style={{ width: "100%", margin: "0 auto" }}>

          {/* HEADER — drawdown-style */}
          <div style={{ marginBottom: 24, padding: "0 28px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <p style={{ fontFamily: FONT, fontSize: 9, letterSpacing: ".3em", textTransform: "uppercase", color: T.dim, fontWeight: 500, margin: 0 }}>your strategy breakdown</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, animation: "pulse 2s infinite" }} />
                    <span style={{ fontFamily: FONT, fontSize: 7, fontWeight: 700, letterSpacing: ".2em", color: T.green, opacity: 0.7 }}>LIVE</span>
                  </div>
                </div>
                <h1 style={{ fontFamily: FONT, fontSize: 26, color: T.text, lineHeight: 1, fontWeight: 800, margin: 0 }}>How Sharp Is Your Edge?</h1>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
                {kpis.map((kpi, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <L>{kpi.label}</L>
                    <V color={kpi.color} style={{ fontSize: 14 }}>{kpi.value}</V>
                    <Sub>{kpi.sub}</Sub>
                  </div>
                ))}
              </div>
            </div>

            {/* Tab bar — toggle style */}
            <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.5)", padding: 4, borderRadius: 4, border: `1px solid ${T.line}`, alignSelf: "flex-start" }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActive(tab.id)}
                  style={{
                    fontFamily: FONT, fontSize: 9, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase",
                    padding: "8px 16px", cursor: "pointer", border: "none", borderRadius: 3,
                    background: active === tab.id ? "rgba(255,255,255,0.08)" : "transparent",
                    color: active === tab.id ? T.text : T.dim, transition: "all .15s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Page content */}
          <div>
          {active === 1 && <Page1 d={d} />}
          {active === 2 && <Page2 d={d} />}
          {active === 3 && <Page3 d={d} />}
          {active === 4 && <Page4 d={d} />}
          {active === 5 && <Page5 sessionId={sessionId} userId={userId} />}
          {active === 6 && <Page6 sessionId={sessionId} userId={userId} />}
          </div>

        </div>
      </div>
    </>
  );
}
