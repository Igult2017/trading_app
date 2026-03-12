import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

// ── Inline SVG Icons ───────────────────────────────────────────────────────
const Ic = ({ d, size = 16, style, className, strokeWidth = 2 }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
    strokeLinejoin="round" style={style} className={className}>
    {Array.isArray(d) ? d.map((p: string, i: number) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const ICONS: Record<string, string | string[]> = {
  ChevronRight: "M9 18l6-6-6-6",
  ChevronLeft:  "M15 18l-6-6 6-6",
  AlertCircle:  ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z","M12 8v4","M12 16h.01"],
  Zap:          "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  ShieldCheck:  ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z","M9 12l2 2 4-4"],
  Activity:     "M22 12h-4l-3 9L9 3l-3 9H2",
  Globe2:       ["M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z","M2 12h20","M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"],
  CheckCircle2: ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z","M9 12l2 2 4-4"],
  Camera:       ["M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z","M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  Target:       ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z","M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z","M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  Brain:        ["M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.66z","M14.5 2a2.5 2.5 0 0 1 1.44 4.66 2.5 2.5 0 0 1 1.32 4.24 3 3 0 0 1-.34 5.58 2.5 2.5 0 0 1-2.96 3.08A2.5 2.5 0 0 1 12 19.5v-15A2.5 2.5 0 0 1 14.5 2z"],
  Crosshair:    ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z","M22 12h-4","M6 12H2","M12 6V2","M12 22v-4"],
  Microscope:   ["M6 18h8","M3 22h18","M14 22a7 7 0 1 0 0-14h-1","M9 14h2","M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2z","M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"],
  Shield:       "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  Battery:      ["M17 7H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z","M22 11v2"],
  Briefcase:    ["M20 7H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z","M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"],
  Layers:       ["M12 2L2 7l10 5 10-5-10-5z","M2 17l10 5 10-5","M2 12l10 5 10-5"],
  LayoutGrid:   ["M3 3h7v7H3z","M14 3h7v7h-7z","M3 14h7v7H3z","M14 14h7v7h-7z"],
  Award:        ["M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z","M8.21 13.89L7 23l5-3 5 3-1.21-9.12"],
  Flame:        "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  Eye:          ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z","M12 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  Lightbulb:    ["M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5","M9 18h6","M10 22h4"],
  Clock:        ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z","M12 6v6l4 2"],
  Gauge:        ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z","M22 12A10 10 0 1 1 2 12"],
  Boxes:        ["M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42z","M7 16.5l-4.74-2.85","M7 16.5l5-3","M7 16.5V19","M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3z","M17 16.5l-5-3","M17 16.5l4.74-2.85","M17 16.5V19"],
  Layers3:      ["M12 2L2 7l10 5 10-5-10-5z","M2 12l10 5 10-5","M2 17l10 5 10-5"],
  TrendingUp:   "M23 6l-9.5 9.5-5-5L1 18",
  BrainCircuit: ["M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z","M9 13a4.5 4.5 0 0 0 3-4","M6.003 5.125A3 3 0 0 0 6.401 6.5","M3.477 10.896a4 4 0 0 1 .585-.396","M6 18a4 4 0 0 1-1.967-.516","M12 13h4","M12 18h6a2 2 0 0 1 2 2v1","M12 8h8","M16 8V5a2 2 0 0 1 2-2","M16 13v-1a2 2 0 0 1 2-2h2"],
  DoorOpen:     ["M13 4h3a2 2 0 0 1 2 2v14","M2 20h3","M13 20h9","M10 12v.01","M13 4L2 20h11V4z"],
  RefreshCcw:   ["M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8","M3 3v5h5","M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16","M16 16h5v5"],
  Trash2:       ["M3 6h18","M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6","M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2","M10 11v6","M14 11v6"],
  Save:         ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z","M17 21v-8H7v8","M7 3v5h8"],
  ArrowRight:   "M5 12h14M12 5l7 7-7 7",
  BarChart2:    ["M18 20V10","M12 20V4","M6 20v-6"],
  DollarSign:   ["M12 1v22","M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  Focus:        ["M8 3H5a2 2 0 0 0-2 2v3","M21 8V5a2 2 0 0 0-2-2h-3","M3 16v3a2 2 0 0 0 2 2h3","M16 21h3a2 2 0 0 0 2-2v-3"],
  X:            "M18 6L6 18M6 6l12 12",
  Loader:       ["M12 2v4","M12 18v4","M4.93 4.93l2.83 2.83","M16.24 16.24l2.83 2.83","M2 12h4","M18 12h4","M4.93 19.07l2.83-2.83","M16.24 7.76l2.83-2.83"],
};

const Icon = ({ name, size = 16, style, className }: { name: string; size?: number; style?: any; className?: string }) => {
  const d = ICONS[name];
  if (!d) return null;
  return <Ic d={d} size={size} style={style} className={className} />;
};

// ── Constants ─────────────────────────────────────────────────────────────
const INPUT_CLS = "w-full bg-slate-950/40 border border-slate-800/80 rounded-xl px-5 py-4 text-[13px] text-slate-200 placeholder-slate-700 resize-none focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all duration-300 font-mono leading-relaxed";
const LABEL_CLS = "block text-[10px] font-bold tracking-[0.2em] text-slate-500 mb-3 uppercase px-1";

const STEPS = [
  { id: 1, label: "DECISION",  sub: "THESIS & LOGIC",  icon: "Brain" },
  { id: 2, label: "EXECUTION", sub: "CORE DATA",        icon: "Crosshair" },
  { id: 3, label: "CONTEXT",   sub: "MARKET STATE",     icon: "Globe2" },
  { id: 4, label: "REVIEW",    sub: "PERFORMANCE",      icon: "CheckCircle2" },
];

const INIT: Record<string, any> = {
  screenshot: null, screenshotTimestamp: "", instrument: "", direction: "Long",
  lotSize: "", entryPrice: "", stopLoss: "", stopLossDistancePips: "",
  takeProfit: "", takeProfitDistancePips: "", entryTime: "", exitTime: "",
  tradeDuration: "", dayOfWeek: "Monday", outcome: "Win", profitLoss: "",
  accountBalance: "", orderType: "Market", riskPercent: "", entryTF: "5M",
  analysisTF: "1HR", contextTF: "1D", marketRegime: "Trending",
  trendDirection: "Bullish", volatilityState: "Normal", liquidity: "High",
  newsEnvironment: "Clear", entryTimeUTC: "", sessionPhase: "Open",
  sessionName: "London", timingContext: "Impulse", candlePattern: "",
  indicatorState: "", marketAlignment: 3, setupClarity: 3, entryPrecision: 3,
  confluence: 3, timingQuality: 3, primarySignals: "", secondarySignals: "",
  keyLevelRespect: "Yes", keyLevelType: "Support", momentumValidity: "Strong",
  targetLogicClarity: "High", plannedEntry: "", plannedSL: "", plannedTP: "",
  actualEntry: "", actualSL: "", actualTP: "", pipsGainedLost: "", mae: "",
  mfe: "", monetaryRisk: "", potentialReward: "", plannedRR: "", achievedRR: "",
  riskHeat: "Low", entryMethod: "Market", exitStrategy: "", breakEvenApplied: false,
  trailingStopApplied: false, managementType: "Rule-based", confidenceLevel: 3,
  emotionalState: "Calm", focusStressLevel: "Low", rulesFollowed: 100,
  worthRepeating: true, whatWorked: "", whatFailed: "", adjustments: "", notes: "",
  thesis: "", trigger: "", invalidationLogic: "", setupTag: "Breakout",
  expectedBehavior: "", tradeGrade: "A - Textbook", liquidityTargets: "",
  impulseCheckFOMO: false, impulseCheckRevenge: false, impulseCheckBored: false,
  impulseCheckEmotional: false, primaryExitReason: "Target Hit", htfBias: "Bull",
  htfKeyLevelPresent: "Yes", trendAlignment: "Yes", analysisTFContext: "",
  higherTFContext: "", entryTFContext: "", otherConfluences: "",
  multitimeframeAlignment: "Yes", openTradesCount: "", totalRiskOpen: "",
  correlatedExposure: "No", energyLevel: 3, focusLevel: 3,
  externalDistraction: "No", confidenceAtEntry: 3, setupFullyValid: "Yes",
  anyRuleBroken: "No", ruleBroken: "", strategyVersionId: "", spreadAtEntry: "",
  atrAtEntry: "", exitScreenshot: null, pairCategory: "Major",
  consecutiveTradeCount: "", commission: "", postTradeEmotion: "Neutral",
  recencyBiasFlag: false, riskReward: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function normaliseTF(tf: string | null | undefined): string | null {
  if (!tf) return null;
  const map: Record<string, string> = {
    "1M": "1M", "3M": "3M", "5M": "5M", "15M": "15M",
    "20M": "15M",
    "30M": "30MIN",
    "1H": "1HR", "2H": "2HR", "4H": "4HR",
    "6H": "4HR", "8H": "4HR", "12H": "4HR",
    "1D": "1D", "1W": "1W",
  };
  return map[tf.toUpperCase()] ?? tf;
}

function normaliseSession(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.includes("/") ? "Overlap" : s;
}

// ── UI Primitives ─────────────────────────────────────────────────────────
const InfoBox = ({ color, icon, title, text }: { color: string; icon: string; title: string; text: string }) => {
  const themes: Record<string, string> = {
    amber:  "border-amber-500/20  bg-amber-500/5  text-amber-400",
    blue:   "border-blue-500/20   bg-blue-500/5   text-blue-400",
    green:  "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
    rose:   "border-rose-500/20   bg-rose-500/5   text-rose-400",
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-400",
  };
  return (
    <div className={`flex gap-4 p-5 rounded-xl border ${themes[color] || themes.blue}`}>
      <div className="flex-shrink-0 mt-0.5"><Icon name={icon} size={20} /></div>
      <div>
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1.5 opacity-90">{title}</p>
        <p className="text-sm leading-relaxed text-slate-400 font-medium">{text}</p>
      </div>
    </div>
  );
};

const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
  <div className="flex items-center gap-4 mb-6">
    <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 flex-shrink-0">
      <Icon name={icon} size={16} />
    </div>
    <div className="h-px flex-1 bg-gradient-to-r from-slate-700/50 to-transparent" />
    <h2 className="text-[11px] font-black tracking-[0.3em] text-slate-500 uppercase italic whitespace-nowrap">{title}</h2>
  </div>
);

const Field = ({ label, field, value, onChange, placeholder = "", rows, type = "text" }: {
  label?: string; field: string; value: any; onChange: (f: string, v: any) => void;
  placeholder?: string; rows?: number; type?: string;
}) => (
  <div>
    {label && <label className={LABEL_CLS}>{label}</label>}
    {rows
      ? <textarea rows={rows} placeholder={placeholder} value={value ?? ""} onChange={e => onChange(field, e.target.value)} className={INPUT_CLS} />
      : <input type={type} placeholder={placeholder} value={value ?? ""} onChange={e => onChange(field, e.target.value)} className={INPUT_CLS + " block"} />
    }
  </div>
);

const Sel = ({ label, field, value, onChange, options }: {
  label?: string; field: string; value: any; onChange: (f: string, v: any) => void; options: string[];
}) => (
  <div>
    {label && <label className={LABEL_CLS}>{label}</label>}
    <div className="relative">
      <select value={options.includes(value) ? value : options[0]} onChange={e => onChange(field, e.target.value)}
        className={INPUT_CLS + " appearance-none cursor-pointer pr-10 block"}>
        {options.map(o => <option key={o} value={o} className="bg-[#0a0d14]">{o}</option>)}
      </select>
      <Icon name="ChevronRight" size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none rotate-90" />
    </div>
  </div>
);

const Score = ({ label, field, value, onChange }: { label: string; field: string; value: number; onChange: (f: string, v: any) => void }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap py-1">
    <label className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">{label}</label>
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange(field, n)}
          className={`w-8 h-8 rounded-lg text-[11px] font-black font-mono border transition-all
            ${value === n ? "bg-blue-600 border-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]"
            : "bg-slate-950/40 border-slate-800/80 text-slate-600 hover:border-blue-500/40"}`}>
          {n}
        </button>
      ))}
    </div>
  </div>
);

const Check = ({ label, field, value, onChange }: { label: string; field: string; value: boolean; onChange: (f: string, v: any) => void }) => (
  <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-800/80 bg-slate-950/40 cursor-pointer hover:border-blue-500/20 transition-all">
    <input type="checkbox" checked={!!value} onChange={e => onChange(field, e.target.checked)} className="w-4 h-4 mt-0.5 flex-shrink-0 rounded border-2 border-slate-700 bg-slate-900 cursor-pointer" />
    <span className="text-[12px] font-semibold text-slate-400 leading-snug">{label}</span>
  </label>
);

const Upload = ({ field, inputId, value, onChange, label, sublabel, analyzing }: {
  field: string; inputId: string; value: any;
  onChange: (f: string, v: any) => void; label: string; sublabel: string; analyzing?: boolean;
}) => (
  <div className={`relative rounded-2xl border transition-all overflow-hidden ${value ? "border-blue-500/30" : "border-dashed border-slate-800/80 hover:border-blue-500/30"} bg-slate-950/20`}>
    <input type="file" className="hidden" id={inputId} accept="image/*" onChange={e => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) { const r = new FileReader(); r.onloadend = () => onChange(field, r.result); r.readAsDataURL(f); }
    }} />
    {analyzing && (
      <div className="absolute inset-0 z-10 bg-[#05070a]/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
        <Icon name="Loader" size={28} className="text-blue-400 animate-spin" />
        <span className="text-[11px] font-bold tracking-widest text-blue-400 uppercase">Analyzing…</span>
      </div>
    )}
    {value ? (
      <div className="relative group/img">
        <img src={value} alt="chart" className="w-full h-auto max-h-80 object-contain" />
        <div className="absolute inset-0 bg-[#05070a]/80 backdrop-blur-sm opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center gap-3">
          <label htmlFor={inputId} className="p-3 bg-blue-600 rounded-xl cursor-pointer hover:bg-blue-500 transition-all"><Icon name="RefreshCcw" size={20} className="text-white" /></label>
          <button onClick={() => onChange(field, null)} className="p-3 bg-rose-600 rounded-xl hover:bg-rose-500 transition-all"><Icon name="Trash2" size={20} className="text-white" /></button>
        </div>
      </div>
    ) : (
      <label htmlFor={inputId} className="flex flex-col items-center justify-center p-10 cursor-pointer group">
        <div className="w-14 h-14 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-center mb-4 group-hover:border-blue-500/40 transition-all">
          <Icon name="Camera" size={24} className="text-slate-700 group-hover:text-blue-500/60 transition-colors" />
        </div>
        <span className="text-[13px] font-semibold text-slate-500 mb-1 text-center">{label}</span>
        <span className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-700 text-center">{sublabel}</span>
      </label>
    )}
  </div>
);

const NavButtons = ({ step, onPrev, onNext, saving }: { step: number; onPrev: () => void; onNext: () => void; saving?: boolean }) => (
  <div className="flex items-center justify-between mt-12 pt-8 border-t border-slate-900">
    <button onClick={onPrev} disabled={step === 1}
      className="group flex items-center gap-3 px-6 py-3 rounded-xl text-[11px] font-black tracking-widest text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-200 transition-all disabled:opacity-20">
      <Icon name="ChevronLeft" size={16} />PREV
    </button>
    <div className="hidden sm:flex gap-1.5">
      {[1, 2, 3, 4].map(n => (
        <div key={n} className={`h-1.5 rounded-full transition-all duration-500 ${step === n ? "bg-blue-500 w-5" : "bg-slate-800 w-1.5"}`} />
      ))}
    </div>
    <button onClick={onNext} disabled={saving}
      className="group flex items-center gap-3 px-8 py-3 rounded-xl text-[11px] font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60"
      style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}>
      {step === 4
        ? saving
          ? <><Icon name="Loader" size={16} className="animate-spin" />SAVING…</>
          : <><Icon name="Save" size={16} />SAVE</>
        : <>NEXT<Icon name="ChevronRight" size={16} /></>}
    </button>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────
export default function JournalForm({ sessionId }: { sessionId?: string | null }) {
  const [step, setStep]           = useState(1);
  const [form, setForm]           = useState<Record<string, any>>(INIT);
  const [saved, setSaved]         = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const lf  = (label: string, field: string, rows?: number, placeholder?: string, type?: string) =>
    <Field label={label} field={field} value={form[field]} onChange={set} rows={rows} placeholder={placeholder} type={type} />;
  const ls  = (label: string, field: string, options: string[]) =>
    <Sel label={label} field={field} value={form[field]} onChange={set} options={options} />;
  const sc  = (label: string, field: string) =>
    <Score label={label} field={field} value={form[field]} onChange={set} />;
  const ck  = (label: string, field: string) =>
    <Check label={label} field={field} value={form[field]} onChange={set} />;

  const g2 = "grid grid-cols-1 sm:grid-cols-2 gap-4";
  const g3 = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";
  const g4 = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4";

  // ── OCR Screenshot Analysis ──────────────────────────────────────────────
  const analyzeScreenshot = async (base64Image: string) => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await apiRequest("POST", "/api/journal/analyze-screenshot", { image: base64Image });
      const data = await res.json();
      if (data.success && data.fields) {
        const f = data.fields;
        setForm(prev => {
          const u = { ...prev };
          if (f.instrument) u.instrument = f.instrument;
          if (f.pairCategory) {
            u.pairCategory = f.pairCategory;
          } else if (f.instrument) {
            const sym = (f.instrument as string).toUpperCase();
            if      (/BTC|ETH|BNB|XRP|SOL|ADA|DOGE|USDT/.test(sym))                u.pairCategory = "Crypto";
            else if (/XAU|XAG|GOLD|SILVER|OIL|WTI|BRENT/.test(sym))                u.pairCategory = "Commodity";
            else if (/US30|SPX|NAS|DAX|FTSE|CAC|NDX|SP500|DOW|IDX/.test(sym))      u.pairCategory = "Index";
            else if (/EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|NZDUSD|USDCAD/.test(sym)) u.pairCategory = "Major";
            else if (/EURGBP|EURJPY|GBPJPY|AUDJPY|CADJPY|CHFJPY|EURAUD|EURCHF|GBPAUD|GBPCAD/.test(sym)) u.pairCategory = "Minor";
            else if (sym.length >= 6)                                                 u.pairCategory = "Exotic";
          }
          if (f.direction)  u.direction  = f.direction;
          if (f.orderType)  u.orderType  = f.orderType;
          const rawTF = f.timeframe ?? f.entryTF;
          const normTF = normaliseTF(rawTF);
          if (normTF) u.entryTF = normTF;
          if (f.entryPrice != null) u.entryPrice = String(f.entryPrice);
          if (f.stopLoss   != null) u.stopLoss   = String(f.stopLoss);
          if (f.takeProfit != null) u.takeProfit = String(f.takeProfit);
          const slPts = f.stopLossPoints ?? f.stopLossDistancePips ?? f.stopLossPips;
          if (slPts != null) u.stopLossDistancePips = String(slPts);
          const tpPts = f.takeProfitPoints ?? f.takeProfitDistancePips ?? f.takeProfitPips;
          if (tpPts != null) u.takeProfitDistancePips = String(tpPts);
          if (f.lotSize       != null) u.lotSize       = String(f.lotSize);
          if (f.riskReward    != null) u.riskReward    = String(f.riskReward);
          if (f.riskPercent   != null) u.riskPercent   = String(f.riskPercent);
          if (f.spreadAtEntry != null) u.spreadAtEntry = String(f.spreadAtEntry);
          if (f.outcome        != null) u.outcome       = f.outcome;
          if (f.openPLUSD      != null) u.profitLoss    = String(f.openPLUSD);
          else if (f.profitLoss != null) u.profitLoss   = String(f.profitLoss);
          if (f.openPLPoints   != null) u.pipsGainedLost = String(f.openPLPoints);
          else if (f.pipsGainedLost != null) u.pipsGainedLost = String(f.pipsGainedLost);
          if (f.drawdownPoints != null) {
            u.mae = `${f.drawdownPoints} pts${f.drawdownUSD != null ? ` ($${f.drawdownUSD})` : ""}`;
          } else if (f.mae != null) {
            u.mae = String(f.mae);
          }
          if (f.runUpPoints != null) {
            u.mfe = `${f.runUpPoints} pts${f.runUpUSD != null ? ` ($${f.runUpUSD})` : ""}`;
          } else if (f.mfe != null) {
            u.mfe = String(f.mfe);
          }
          if (f.entryTime) {
            try {
              const dt = new Date(f.entryTime.replace(" ", "T"));
              if (!isNaN(dt.getTime())) {
                u.screenshotTimestamp = dt.toTimeString().slice(0, 5);
                u.entryTime           = f.entryTime.replace(" ", "T").slice(0, 16);
              } else {
                u.screenshotTimestamp = f.entryTime;
              }
            } catch {
              u.screenshotTimestamp = f.entryTime;
            }
          }
          if (f.exitTime)      u.exitTime      = f.exitTime;
          if (f.dayOfWeek)     u.dayOfWeek     = f.dayOfWeek;
          if (f.tradeDuration) u.tradeDuration = f.tradeDuration;
          if (f.sessionName)       u.sessionName       = normaliseSession(f.sessionName);
          if (f.sessionPhase)      u.sessionPhase      = f.sessionPhase;
          if (f.primaryExitReason) u.primaryExitReason = f.primaryExitReason;
          return u;
        });
      } else {
        setAnalyzeError(data.error || "Analysis failed");
      }
    } catch (err: any) {
      setAnalyzeError(err.message || "Failed to analyze screenshot");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleScreenshotUpload = (field: string, value: any) => {
    set(field, value);
    if (value && typeof value === "string" && (field === "screenshot" || field === "exitScreenshot")) {
      analyzeScreenshot(value);
    }
  };

  // ── API Save ──────────────────────────────────────────────────────────────
  const saveJournalEntry = async () => {
    if (!sessionId) {
      setAnalyzeError("Please select or create a session before saving a trade.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        instrument:           form.instrument           || null,
        pairCategory:         form.pairCategory         || null,
        direction:            form.direction             || null,
        orderType:            form.orderType             || null,
        entryPrice:           form.entryPrice            || null,
        stopLoss:             form.stopLoss              || null,
        takeProfit:           form.takeProfit            || null,
        stopLossDistance:     form.stopLossDistancePips  || null,
        takeProfitDistance:   form.takeProfitDistancePips|| null,
        lotSize:              form.lotSize               || null,
        riskReward:           form.riskReward            || null,
        riskPercent:          form.riskPercent           || null,
        spreadAtEntry:        form.spreadAtEntry         || null,
        entryTime:            form.entryTime             || null,
        exitTime:             form.exitTime              || null,
        dayOfWeek:            form.dayOfWeek             || null,
        tradeDuration:        form.tradeDuration         || null,
        entryTF:              form.entryTF               || null,
        analysisTF:           form.analysisTF            || null,
        contextTF:            form.contextTF             || null,
        outcome:              form.outcome               || null,
        profitLoss:           form.profitLoss            || null,
        pipsGainedLost:       form.pipsGainedLost        || null,
        accountBalance:       form.accountBalance        || null,
        commission:           form.commission            || null,
        mae:                  form.mae                   || null,
        mfe:                  form.mfe                   || null,
        plannedRR:            form.plannedRR             || null,
        achievedRR:           form.achievedRR            || null,
        monetaryRisk:         form.monetaryRisk          || null,
        potentialReward:      form.potentialReward       || null,
        primaryExitReason:    form.primaryExitReason     || null,
        sessionName:          form.sessionName           || null,
        sessionPhase:         form.sessionPhase          || null,
        entryTimeUTC:         form.entryTimeUTC          || null,
        sessionId:            sessionId                  || null,
        timingContext:        form.timingContext          || null,
        manualFields: {
          thesis:                form.thesis,
          trigger:               form.trigger,
          invalidationLogic:     form.invalidationLogic,
          expectedBehavior:      form.expectedBehavior,
          setupTag:              form.setupTag,
          tradeGrade:            form.tradeGrade,
          marketRegime:          form.marketRegime,
          trendDirection:        form.trendDirection,
          volatilityState:       form.volatilityState,
          liquidity:             form.liquidity,
          newsEnvironment:       form.newsEnvironment,
          htfBias:               form.htfBias,
          emotionalState:        form.emotionalState,
          focusStressLevel:      form.focusStressLevel,
          postTradeEmotion:      form.postTradeEmotion,
          rulesFollowed:         form.rulesFollowed,
          confidenceLevel:       form.confidenceLevel,
          worthRepeating:        form.worthRepeating,
          whatWorked:            form.whatWorked,
          whatFailed:            form.whatFailed,
          adjustments:           form.adjustments,
          notes:                 form.notes,
          energyLevel:           form.energyLevel,
          focusLevel:            form.focusLevel,
          marketAlignment:       form.marketAlignment,
          setupClarity:          form.setupClarity,
          entryPrecision:        form.entryPrecision,
          confluence:            form.confluence,
          timingQuality:         form.timingQuality,
          confidenceAtEntry:     form.confidenceAtEntry,
        },
      };
      await apiRequest("POST", "/api/journal/entries", payload);
      queryClient.invalidateQueries({ queryKey: ['/api/journal/entries', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/compute', sessionId] });
      setSaved(true);
    } catch (err: any) {
      setAnalyzeError(err.message || "Failed to save entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        .jf-scroll::-webkit-scrollbar{display:none}
        .jf-scroll{-ms-overflow-style:none;scrollbar-width:none}
        @media(max-width:479px){.jf-steps-grid{grid-template-columns:1fr 1fr!important}}
      `}</style>

      <div className="jf-scroll" style={{ position: "relative", flex: 1, overflowY: "auto", minWidth: 0, background: "#05070a" }}>
        {/* ambient glow */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
          <div style={{ position: "absolute", top: "-10%", left: "-10%", width: "40%", height: "40%", background: "rgba(30,58,138,0.08)", filter: "blur(120px)", borderRadius: "50%" }} />
          <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: "40%", height: "40%", background: "rgba(120,53,15,0.04)", filter: "blur(120px)", borderRadius: "50%" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: "860px", margin: "0 auto", padding: "12px 20px 48px" }}>

          {/* Error banner */}
          {analyzeError && (
            <div className="flex items-center gap-3 mb-4 p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 text-rose-400">
              <Icon name="AlertCircle" size={16} />
              <span className="text-[12px] font-semibold flex-1">{analyzeError}</span>
              <button onClick={() => setAnalyzeError(null)} className="flex-shrink-0"><Icon name="X" size={14} /></button>
            </div>
          )}

          {/* Step tabs */}
          <div className="jf-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "16px" }}>
            {STEPS.map(s => {
              const isActive = s.id === step, isDone = s.id < step;
              return (
                <button key={s.id} onClick={() => setStep(s.id)}
                  className={`relative flex flex-col p-3 sm:p-4 rounded-2xl border transition-all duration-500 overflow-hidden text-left
                    ${isActive ? "bg-slate-900/40 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "bg-slate-900/10 border-slate-800/50 hover:border-slate-700"}`}>
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className={`p-1.5 sm:p-2 rounded-lg ${isActive ? "text-blue-400" : isDone ? "text-blue-500/40" : "text-slate-600"}`}>
                      <Icon name={s.icon} size={14} />
                    </div>
                    <span className={`text-[9px] sm:text-[10px] font-bold ${isActive ? "text-blue-500" : "text-slate-700"}`}>0{s.id}</span>
                  </div>
                  <p className={`text-[10px] sm:text-[11px] font-black tracking-widest uppercase mb-0.5 ${isActive ? "text-white" : "text-slate-500"}`}>{s.label}</p>
                  <p className={`hidden sm:block text-[9px] font-medium tracking-wider uppercase opacity-60 ${isActive ? "text-blue-300" : "text-slate-700"}`}>{s.sub}</p>
                  {isActive && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />}
                  {isDone && <Icon name="CheckCircle2" size={12} className="absolute top-3 right-3 text-blue-500/40" />}
                </button>
              );
            })}
          </div>

          {/* Card */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-b from-slate-700/20 to-transparent rounded-[2rem] blur opacity-20" />
            <div className="relative bg-[#0a0d14] border border-slate-800/80 rounded-[2rem] p-5 sm:p-8 shadow-2xl">

              {/* ── STEP 1: DECISION ── */}
              {step === 1 && (
                <div className="space-y-10">
                  <InfoBox color="amber" icon="AlertCircle" title="Critical Protocol" text="Most traders fail due to impulsive entry. Use this module to force cognitive friction between the impulse and the execution." />
                  <section className="space-y-6">
                    <SectionHeader icon="Lightbulb" title="Core Thesis" />
                    {lf("Trade Thesis", "thesis", 4, "Example: Price broke key resistance at 1.0850...")}
                    <div className={g2}>
                      <InfoBox color="blue"  icon="Target" title="Objective" text="Clarity of thought. If you can't articulate your edge in 2-3 sentences, you don't have one." />
                      <InfoBox color="green" icon="Zap"    title="Edge"      text="Defines your systematic advantage. Separates disciplined entries from random impulse trades." />
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Zap" title="Execution Trigger" />
                    {lf("Entry Trigger", "trigger", 3, "Example: 15M engulfing candle close above 1.0850...")}
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Shield" title="Defensive Overlay" />
                    {lf("Invalidation Logic", "invalidationLogic", 3, "Example: If price closes below 1.0830...")}
                    {lf("Expected Behavior", "expectedBehavior", 3, "Example: Expect immediate bullish momentum...")}
                    <div className={g2}>
                      <InfoBox color="rose"   icon="AlertCircle" title="Exit Plan"       text="Rule-based exits. Pre-define failure before emotion kicks in." />
                      <InfoBox color="violet" icon="Eye"          title="Early Detection" text="Know within minutes if your trade is working or dying." />
                    </div>
                  </section>
                  <section className="space-y-6">
                    <SectionHeader icon="Battery" title="Pre-Entry State Check" />
                    <div className={g2}>
                      <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                        {sc("Energy Level", "energyLevel")}{sc("Focus Level", "focusLevel")}{sc("Confidence at Entry", "confidenceAtEntry")}
                        {ls("External Distraction", "externalDistraction", ["No", "Yes"])}
                      </div>
                      <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                        {lf("Open Trades Count", "openTradesCount", undefined, "0", "number")}
                        {lf("Total Risk Open (%)", "totalRiskOpen", undefined, "2.5", "number")}
                        {ls("Correlated Exposure", "correlatedExposure", ["No", "Yes"])}
                      </div>
                    </div>
                    <div className={g2}>
                      <InfoBox color="green" icon="Focus"     title="State Matters"       text="Low energy/focus correlates with poor execution." />
                      <InfoBox color="blue"  icon="Briefcase" title="Portfolio Awareness" text="Over-leverage and correlated exposure are silent account killers." />
                    </div>
                  </section>
                  <section className="space-y-6">
                    <SectionHeader icon="Layers" title="Classification & Quality" />
                    <div className={g2}>
                      <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                        {lf("Strategy Version ID", "strategyVersionId", undefined, "e.g., v2.1")}
                        {ls("Setup Tag", "setupTag", ["Breakout", "Reversal", "Continuation", "Range Bound", "Trend Following", "Momentum", "Pullback"])}
                      </div>
                      <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                        {ls("Trade Grade", "tradeGrade", ["A - Textbook", "B - Solid", "C - Acceptable", "D - Marginal", "F - Poor"])}
                        <InfoBox color="amber" icon="Award" title="Selectivity" text="Only take A/B setups." />
                      </div>
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="ShieldCheck" title="Rule Governance" />
                    <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                      <div className={g2}>
                        {ls("Setup Fully Valid", "setupFullyValid", ["Yes", "No"])}
                        {ls("Any Rule Broken?", "anyRuleBroken", ["No", "Yes"])}
                      </div>
                      {form.anyRuleBroken === "Yes" && lf("Rule Broken", "ruleBroken", undefined, "e.g., Risk > 2%")}
                      <InfoBox color="rose" icon="AlertCircle" title="Discipline Audit" text="Makes rule-breaking visible." />
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Brain" title="Impulse Control Check" />
                    <InfoBox color="amber" icon="Flame" title="Red Flags" text="If ANY box below is checked — stop and reconsider before executing." />
                    <div className={g2}>
                      {ck("Entering due to FOMO", "impulseCheckFOMO")}
                      {ck("Revenge trading after a loss", "impulseCheckRevenge")}
                      {ck("Trading out of boredom", "impulseCheckBored")}
                      {ck("Emotionally compromised", "impulseCheckEmotional")}
                    </div>
                  </section>
                  <NavButtons step={step} onPrev={() => setStep(s => s - 1)} onNext={() => setStep(s => s + 1)} />
                </div>
              )}

              {/* ── STEP 2: EXECUTION ── */}
              {step === 2 && (
                <div className="space-y-10">
                  <section className="space-y-4">
                    <SectionHeader icon="Camera" title="Trade Setup Screenshot" />
                    <Upload field="screenshot" inputId="up-entry" value={form.screenshot} onChange={handleScreenshotUpload} label="Upload trade setup screenshot" sublabel="PNG · JPG · up to 10MB" analyzing={analyzing} />
                    {analyzing && (
                      <InfoBox color="blue" icon="Activity" title="AI Analysis Running" text="Extracting instrument, prices, SL/TP, session and timing from your chart…" />
                    )}
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Camera" title="Exit Chart Screenshot" />
                    <InfoBox color="green" icon="Activity" title="Post-Trade Evidence" text="Capture how price behaved after your exit." />
                    <Upload field="exitScreenshot" inputId="up-exit" value={form.exitScreenshot} onChange={handleScreenshotUpload} label="Upload exit chart" sublabel="Compare entry vs exit" />
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Crosshair" title="Position Details" />
                    <div className={g4}>
                      {lf("Instrument", "instrument", undefined, "BTCUSD")}
                      {ls("Pair Category", "pairCategory", ["Major", "Minor", "Exotic", "Index", "Crypto", "Commodity"])}
                      {ls("Direction", "direction", ["Long", "Short"])}
                      {lf("Lot Size", "lotSize", undefined, "0.01")}
                      {lf("Entry Price", "entryPrice", undefined, "0.00", "number")}
                      {lf("Stop Loss", "stopLoss", undefined, "0.00", "number")}
                      {lf("SL Distance (Pips)", "stopLossDistancePips", undefined, "0", "number")}
                      {lf("Take Profit", "takeProfit", undefined, "0.00", "number")}
                      {lf("TP Distance (Pips)", "takeProfitDistancePips", undefined, "0", "number")}
                      {lf("Risk %", "riskPercent", undefined, "1.0", "number")}
                      {ls("Order Type", "orderType", ["Market", "Limit", "Stop", "Stop-Limit"])}
                      {ls("Outcome", "outcome", ["Win", "Loss", "BE"])}
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Clock" title="Timing & Duration" />
                    <div className={g4}>
                      {lf("Entry Time", "entryTime", undefined, "", "datetime-local")}
                      {lf("Exit Time", "exitTime", undefined, "", "datetime-local")}
                      {ls("Day of Week", "dayOfWeek", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])}
                      {lf("Trade Duration", "tradeDuration", undefined, "2h 30m")}
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="LayoutGrid" title="Timeframe Analysis" />
                    <div className={g3}>
                      {ls("Entry TF", "entryTF", ["1M", "3M", "5M", "15M"])}
                      {ls("Analysis TF", "analysisTF", ["15M", "30MIN", "1HR", "2HR", "4HR"])}
                      {ls("Context TF", "contextTF", ["1W", "1D", "4HR"])}
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Zap" title="Entry & Management" />
                    <div className={g3}>
                      {ls("Entry Method", "entryMethod", ["Market", "Limit", "Stop"])}
                      {lf("Exit Strategy", "exitStrategy", undefined, "Describe exit approach")}
                      {ls("Management Type", "managementType", ["Rule-based", "Discretionary", "Hybrid"])}
                      {ls("Risk Heat", "riskHeat", ["Low", "Medium", "High"])}
                      {ck("Break-Even Applied", "breakEvenApplied")}
                      {ck("Trailing Stop Applied", "trailingStopApplied")}
                    </div>
                  </section>
                  <NavButtons step={step} onPrev={() => setStep(s => s - 1)} onNext={() => setStep(s => s + 1)} />
                </div>
              )}

              {/* ── STEP 3: CONTEXT ── */}
              {step === 3 && (
                <div className="space-y-10">
                  <section className="space-y-4">
                    <SectionHeader icon="Boxes" title="Market Environment" />
                    <div className={g4}>
                      {ls("Market Regime", "marketRegime", ["Trending", "Ranging"])}
                      {ls("Trend Direction", "trendDirection", ["Bullish", "Bearish", "Sideways"])}
                      {ls("Volatility", "volatilityState", ["Low", "Normal", "High"])}
                      {ls("Liquidity", "liquidity", ["Low", "Normal", "High"])}
                      {ls("News Environment", "newsEnvironment", ["Clear", "Minor", "Major"])}
                      {ls("Session Phase", "sessionPhase", ["Open", "Mid", "Close"])}
                      {lf("ATR at Entry", "atrAtEntry", undefined, "0.0045", "number")}
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Layers3" title="Timeframe Context" />
                    <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                      <div className={g2}>
                        {ls("HTF Bias", "htfBias", ["Bull", "Bear", "Range"])}
                        {ls("HTF Key Level Present", "htfKeyLevelPresent", ["Yes", "No"])}
                        {ls("Trend Alignment", "trendAlignment", ["Yes", "No"])}
                        {ls("MTF Alignment", "multitimeframeAlignment", ["Yes", "No"])}
                      </div>
                      {lf("Higher TF Context", "higherTFContext", 2, "Higher timeframe analysis...")}
                      {lf("Analysis TF Context", "analysisTFContext", 2, "Analysis timeframe context...")}
                      {lf("Entry TF Context", "entryTFContext", 2, "Entry timeframe context...")}
                      {lf("Other Confluences", "otherConfluences", 2, "Additional confluences...")}
                      <InfoBox color="blue" icon="Layers3" title="Multi-TF Story" text="Full alignment = highest probability." />
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Target" title="Liquidity & Bias" />
                    {lf("Liquidity Targets", "liquidityTargets", 3, "Major liquidity pools, stop hunts...")}
                    <InfoBox color="blue" icon="Target" title="Smart Money Context" text="Identifies institutional positioning." />
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Clock" title="Session Timing" />
                    <div className={g3}>
                      {lf("Entry Time (UTC)", "entryTimeUTC", undefined, "", "time")}
                      {ls("Session", "sessionName", ["London", "New York", "Tokyo", "Sydney", "Overlap"])}
                      {ls("Timing Context", "timingContext", ["Impulse", "Correction", "Consolidation"])}
                    </div>
                  </section>
                  <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <SectionHeader icon="Gauge" title="Setup Quality Scores" />
                      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                        {sc("Market Alignment", "marketAlignment")}{sc("Setup Clarity", "setupClarity")}
                        {sc("Entry Precision", "entryPrecision")}{sc("Confluence", "confluence")}{sc("Timing Quality", "timingQuality")}
                      </div>
                    </div>
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <SectionHeader icon="Activity" title="Technical Signals" />
                        <div className="space-y-4">
                          {lf("Candle Pattern", "candlePattern", undefined, "e.g., Engulfing")}
                          {lf("Indicator State", "indicatorState", undefined, "e.g., RSI 70")}
                          {lf("Primary Signals", "primarySignals", 2, "Main confirmations")}
                          {lf("Secondary Signals", "secondarySignals", 2, "Supporting factors")}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <SectionHeader icon="Target" title="Key Level Analysis" />
                        <div className="space-y-4">
                          {ls("Key Level Respect", "keyLevelRespect", ["Yes", "No", "Partial"])}
                          {ls("Key Level Type", "keyLevelType", ["Support", "Resistance", "Pivot", "Fib Level"])}
                          {ls("Momentum Validity", "momentumValidity", ["Strong", "Moderate", "Weak"])}
                          {ls("Target Logic Clarity", "targetLogicClarity", ["High", "Medium", "Low"])}
                        </div>
                      </div>
                    </div>
                  </section>
                  <NavButtons step={step} onPrev={() => setStep(s => s - 1)} onNext={() => setStep(s => s + 1)} />
                </div>
              )}

              {/* ── STEP 4: REVIEW ── */}
              {step === 4 && (
                <div className="space-y-10">
                  <section className="space-y-4">
                    <SectionHeader icon="DoorOpen" title="Exit Causation" />
                    {ls("Primary Exit Reason", "primaryExitReason", ["Target Hit", "Stop Hit", "Time Exit", "Structure Change", "News", "Emotional Exit"])}
                    <InfoBox color="rose" icon="Target" title="Exit Discipline" text="Tracks whether you hit targets or get stopped out." />
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="TrendingUp" title="Performance Data" />
                    <div className={g4}>
                      {lf("Pips Gained / Lost", "pipsGainedLost", undefined, "0", "number")}
                      {lf("P&L Amount ($)", "profitLoss", undefined, "0.00", "number")}
                      {lf("Account Balance", "accountBalance", undefined, "0.00", "number")}
                      {lf("Commission / Fees", "commission", undefined, "3.50", "number")}
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Target" title="Planning vs Execution" />
                    <div className={g3}>
                      {lf("Planned Entry", "plannedEntry", undefined, "0.00", "number")}
                      {lf("Planned SL", "plannedSL", undefined, "0.00", "number")}
                      {lf("Planned TP", "plannedTP", undefined, "0.00", "number")}
                      {lf("Actual Entry", "actualEntry", undefined, "0.00", "number")}
                      {lf("Actual SL", "actualSL", undefined, "0.00", "number")}
                      {lf("Actual TP", "actualTP", undefined, "0.00", "number")}
                    </div>
                  </section>
                  <section className="space-y-4">
                    <SectionHeader icon="Activity" title="Trade Metrics" />
                    <div className={g3}>
                      {lf("MAE (Max Adverse)", "mae", undefined, "-15 pips")}
                      {lf("MFE (Max Favorable)", "mfe", undefined, "+45 pips")}
                      {lf("Monetary Risk ($)", "monetaryRisk", undefined, "0.00", "number")}
                      {lf("Potential Reward ($)", "potentialReward", undefined, "0.00", "number")}
                      {lf("Planned R:R", "plannedRR", undefined, "1:2")}
                      {lf("Achieved R:R", "achievedRR", undefined, "1:1.5")}
                    </div>
                  </section>
                  <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                      <div className="space-y-4">
                        <SectionHeader icon="BrainCircuit" title="Psychological State" />
                        <div className={g3}>
                          {ls("Emotional State", "emotionalState", ["Calm", "Anxious", "FOMO", "Confident", "Fearful", "Neutral"])}
                          {ls("Focus / Stress", "focusStressLevel", ["Low", "Medium", "High"])}
                          {lf("Rules Followed %", "rulesFollowed", undefined, "100", "number")}
                          {lf("Confidence (1–5)", "confidenceLevel", undefined, "3", "number")}
                          {ls("Post-Trade Emotion", "postTradeEmotion", ["Neutral", "Relieved", "Euphoric", "Frustrated", "Regretful", "Calm", "Anxious"])}
                          {ck("Recency bias (influenced by last trade)", "recencyBiasFlag")}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <SectionHeader icon="CheckCircle2" title="Trade Assessment" />
                        <div className="space-y-4">
                          {ck("Worth Repeating This Setup", "worthRepeating")}
                          {lf("Additional Notes", "notes", 3, "Any other observations...")}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <SectionHeader icon="Microscope" title="Trade Reflections" />
                      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-5">
                        <div>
                          <p className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-500/80 mb-3">What Worked</p>
                          <textarea rows={3} className={INPUT_CLS} placeholder="What did you execute well?" value={form.whatWorked} onChange={e => set("whatWorked", e.target.value)} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black tracking-[0.2em] uppercase text-rose-500/80 mb-3">What Failed</p>
                          <textarea rows={3} className={INPUT_CLS} placeholder="What went wrong?" value={form.whatFailed} onChange={e => set("whatFailed", e.target.value)} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black tracking-[0.2em] uppercase text-blue-500/80 mb-3">Future Adjustments</p>
                          <textarea rows={3} className={INPUT_CLS} placeholder="What will you change next time?" value={form.adjustments} onChange={e => set("adjustments", e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </section>
                  <NavButtons step={step} onPrev={() => setStep(s => s - 1)} onNext={saveJournalEntry} saving={saving} />
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* ── Save success modal ── */}
      {saved && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", background: "rgba(5,7,10,0.92)", backdropFilter: "blur(8px)" }}>
          <div style={{ background: "#0a0d14", border: "1px solid rgba(51,65,85,0.5)", borderRadius: "2rem", padding: "40px", maxWidth: "360px", width: "100%", textAlign: "center", boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "1.5rem", background: "rgba(30,41,59,0.5)", border: "1px solid rgba(51,65,85,0.5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <Icon name="CheckCircle2" size={36} style={{ color: "#34d399", opacity: 0.8 }} />
            </div>
            <h3 style={{ fontSize: "13px", fontWeight: 900, letterSpacing: "0.4em", color: "#cbd5e1", textTransform: "uppercase", marginBottom: "12px" }}>Trade Logged</h3>
            <p style={{ fontSize: "13px", color: "#64748b", fontFamily: "monospace", lineHeight: 1.6, marginBottom: "32px" }}>Decision architecture and trade data recorded. Stats updated.</p>
            <button onClick={() => { setForm(INIT); setStep(1); setSaved(false); }}
              style={{ width: "100%", padding: "12px 32px", borderRadius: "12px", fontSize: "11px", fontWeight: 900, letterSpacing: "0.15em", color: "#fff", border: "none", cursor: "pointer", background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}>
              CONTINUE TRADING
            </button>
          </div>
        </div>
      )}
    </>
  );
}
