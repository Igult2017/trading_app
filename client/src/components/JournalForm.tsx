import { useState } from "react";
import {
  ChevronRight, ChevronLeft, AlertCircle, Zap, ShieldCheck,
  Activity, Globe2, CheckCircle2, Compass, Camera, Target,
  Brain, Crosshair, Microscope, Shield, Battery, Briefcase,
  Focus, Layers, LayoutGrid, Award, Flame, Eye, Lightbulb,
  Clock, Gauge, Boxes, Layers3, TrendingUp, BrainCircuit,
  DoorOpen, AlertTriangle, RefreshCcw, Trash2, Save, Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

/* ─── EXACT SAMPLE-1 DESIGN TOKENS ──────────────────────────────────── */
const PAGE_BG   = "bg-[#05070a]";
const CARD_BG   = "bg-[#0a0d14]";
const INPUT_CLS = "w-full bg-slate-950/40 border border-slate-800/80 rounded-xl px-5 py-4 text-[13px] text-slate-200 placeholder-slate-700 resize-none focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all duration-300 font-mono leading-relaxed";
const LABEL_CLS = "block text-[10px] font-bold tracking-[0.2em] text-slate-500 mb-3 uppercase px-1";

/* ─── STEPS ──────────────────────────────────────────────────────────── */
const STEPS = [
  { id: 1, label: "DECISION",  sub: "THESIS & LOGIC",  icon: Brain },
  { id: 2, label: "EXECUTION", sub: "CORE DATA",       icon: Crosshair },
  { id: 3, label: "CONTEXT",   sub: "MARKET STATE",    icon: Globe2 },
  { id: 4, label: "REVIEW",    sub: "PERFORMANCE",     icon: CheckCircle2 },
];

/* ─── INITIAL STATE ──────────────────────────────────────────────────── */
const INIT: Record<string, any> = {
  screenshot:null, screenshotTimestamp:"", instrument:"", direction:"Long",
  lotSize:"", entryPrice:"", stopLoss:"", stopLossDistancePips:"",
  takeProfit:"", takeProfitDistancePips:"", entryTime:"", exitTime:"",
  tradeDuration:"", dayOfWeek:"Monday", outcome:"Win", profitLoss:"",
  accountBalance:"", orderType:"Market", riskPercent:"", entryTF:"5M",
  analysisTF:"1HR", contextTF:"1D", marketRegime:"Trending",
  trendDirection:"Bullish", volatilityState:"Normal", liquidity:"High",
  newsEnvironment:"Clear", entryTimeUTC:"", sessionPhase:"Open",
  sessionName:"London", timingContext:"Impulse", candlePattern:"",
  indicatorState:"", marketAlignment:3, setupClarity:3, entryPrecision:3,
  confluence:3, timingQuality:3, primarySignals:"", secondarySignals:"",
  keyLevelRespect:"Yes", keyLevelType:"Support", momentumValidity:"Strong",
  targetLogicClarity:"High", plannedEntry:"", plannedSL:"", plannedTP:"",
  actualEntry:"", actualSL:"", actualTP:"", pipsGainedLost:"", mae:"",
  mfe:"", monetaryRisk:"", potentialReward:"", plannedRR:"", achievedRR:"",
  riskHeat:"Low", entryMethod:"Market", exitStrategy:"", breakEvenApplied:false,
  trailingStopApplied:false, managementType:"Rule-based", confidenceLevel:3,
  emotionalState:"Calm", focusStressLevel:"Low", rulesFollowed:100,
  worthRepeating:true, whatWorked:"", whatFailed:"", adjustments:"", notes:"",
  thesis:"", trigger:"", invalidationLogic:"", setupTag:"Breakout",
  expectedBehavior:"", tradeGrade:"A - Textbook", liquidityTargets:"",
  impulseCheckFOMO:false, impulseCheckRevenge:false, impulseCheckBored:false,
  impulseCheckEmotional:false, primaryExitReason:"Target Hit", htfBias:"Bull",
  htfKeyLevelPresent:"Yes", trendAlignment:"Yes", analysisTFContext:"",
  higherTFContext:"", entryTFContext:"", otherConfluences:"",
  multitimeframeAlignment:"Yes", openTradesCount:"", totalRiskOpen:"",
  correlatedExposure:"No", energyLevel:3, focusLevel:3,
  externalDistraction:"No", confidenceAtEntry:3, setupFullyValid:"Yes",
  anyRuleBroken:"No", ruleBroken:"", strategyVersionId:"", spreadAtEntry:"",
  atrAtEntry:"", exitScreenshot:null, pairCategory:"Major",
  consecutiveTradeCount:"", commission:"", postTradeEmotion:"Neutral",
  recencyBiasFlag:false,
};

/* ─── SHARED ATOMS ───────────────────────────────────────────────────── */

const InfoBox = ({ color, icon: Icon, title, text }: { color: string; icon: any; title: string; text: string }) => {
  const themes: Record<string, string> = {
    amber:  "border-amber-500/20  bg-amber-500/5  text-amber-400  hover:border-amber-500/40",
    blue:   "border-blue-500/20   bg-blue-500/5   text-blue-400   hover:border-blue-500/40",
    green:  "border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:border-emerald-500/40",
    rose:   "border-rose-500/20   bg-rose-500/5   text-rose-400   hover:border-rose-500/40",
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-400 hover:border-violet-500/40",
  };
  return (
    <div className={`group flex gap-4 p-5 rounded-xl border transition-all duration-300 ${themes[color] || themes.blue}`}>
      <div className="flex-shrink-0 mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1.5 opacity-90">{title}</p>
        <p className="text-sm leading-relaxed text-slate-400 font-medium">{text}</p>
      </div>
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title }: { icon: any; title: string }) => (
  <div className="flex items-center gap-4 mb-6">
    <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 shadow-inner flex-shrink-0">
      <Icon className="w-4 h-4" />
    </div>
    <div className="h-px flex-1 bg-gradient-to-r from-slate-700/50 to-transparent" />
    <h2 className="text-[11px] font-black tracking-[0.3em] text-slate-500 uppercase italic whitespace-nowrap">{title}</h2>
  </div>
);

const Field = ({ label, field, value, onChange, placeholder = "", rows, type = "text" }: { label?: string; field: string; value: any; onChange: (f: string, v: any) => void; placeholder?: string; rows?: number; type?: string }) => (
  <div className="mb-0">
    {label && <label className={LABEL_CLS}>{label}</label>}
    <div className="relative group">
      {rows
        ? <textarea rows={rows} placeholder={placeholder} value={value ?? ""} onChange={e => onChange(field, e.target.value)}
            className={INPUT_CLS} />
        : <input type={type} placeholder={placeholder} value={value ?? ""} onChange={e => onChange(field, e.target.value)}
            className={INPUT_CLS + " block"} />
      }
      <div className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="w-1 h-1 bg-blue-500 rounded-full" />
      </div>
    </div>
  </div>
);

const Sel = ({ label, field, value, onChange, options }: { label?: string; field: string; value: any; onChange: (f: string, v: any) => void; options: string[] }) => {
  const all = options.includes("Other") ? options : [...options, "Other"];
  const isOther = value !== "" && !options.includes(value);
  const [customVal, setCustomVal] = useState(isOther && value !== "Other" ? value : "");
  return (
    <div className="mb-0">
      {label && <label className={LABEL_CLS}>{label}</label>}
      <div className="relative">
        <select value={isOther ? "Other" : value} onChange={e => {
            if (e.target.value === "Other") {
              setCustomVal("");
              onChange(field, "Other");
            } else {
              setCustomVal("");
              onChange(field, e.target.value);
            }
          }}
          className={INPUT_CLS + " appearance-none cursor-pointer pr-10 block"}>
          {all.map(o => <option key={o} value={o} className="bg-[#0a0d14]">{o}</option>)}
        </select>
        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none rotate-90" />
      </div>
      {isOther && (
        <input type="text" placeholder={`Specify ${label?.toLowerCase()}...`}
          value={customVal} onChange={e => { setCustomVal(e.target.value); onChange(field, e.target.value || "Other"); }}
          className={INPUT_CLS + " block mt-2"} autoFocus />
      )}
    </div>
  );
};

const Score = ({ label, field, value, onChange }: { label: string; field: string; value: number; onChange: (f: string, v: any) => void }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap py-1">
    <label className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">{label}</label>
    <div className="flex gap-1.5">
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onChange(field, n)}
          className={`w-8 h-8 rounded-lg text-[11px] font-black font-mono border transition-all duration-200 focus:outline-none
            ${value === n
              ? "bg-blue-600 border-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]"
              : "bg-slate-950/40 border-slate-800/80 text-slate-600 hover:border-blue-500/40 hover:text-slate-300"}`}>
          {n}
        </button>
      ))}
    </div>
  </div>
);

const Check = ({ label, field, value, onChange }: { label: string; field: string; value: boolean; onChange: (f: string, v: any) => void }) => (
  <label className={`flex items-start gap-3 p-4 rounded-xl border border-slate-800/80 bg-slate-950/40 cursor-pointer
    transition-all duration-300 hover:border-blue-500/20 hover:bg-blue-500/5`}>
    <input type="checkbox" checked={!!value} onChange={e => onChange(field, e.target.checked)}
      className="w-4 h-4 mt-0.5 flex-shrink-0 rounded border-2 border-slate-700 bg-slate-900 checked:bg-blue-600 checked:border-blue-500 cursor-pointer transition-all" />
    <span className="text-[12px] font-semibold text-slate-400 leading-snug">{label}</span>
  </label>
);

const Upload = ({ field, inputId, value, onChange, label, sublabel }: { field: string; inputId: string; value: any; onChange: (f: string, v: any) => void; label: string; sublabel: string }) => (
  <div className={`relative rounded-2xl border transition-all duration-300 overflow-hidden
    ${value ? "border-blue-500/30 bg-slate-950/20" : "border-dashed border-slate-800/80 hover:border-blue-500/30 bg-slate-950/20"}`}>
    <input type="file" className="hidden" id={inputId} accept="image/*" onChange={e => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) { const r = new FileReader(); r.onloadend = () => onChange(field, r.result); r.readAsDataURL(f); }
    }} />
    {value ? (
      <div className="relative group/img">
        <img src={value} alt="chart" className="w-full h-auto max-h-80 object-contain" />
        <div className="absolute inset-0 bg-[#05070a]/80 backdrop-blur-sm opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center gap-3">
          <label htmlFor={inputId} className="p-3 bg-blue-600 rounded-xl cursor-pointer hover:bg-blue-500 transition-all shadow-lg">
            <RefreshCcw className="w-5 h-5 text-white" />
          </label>
          <button onClick={() => onChange(field, null)} className="p-3 bg-rose-600 rounded-xl hover:bg-rose-500 transition-all shadow-lg">
            <Trash2 className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    ) : (
      <label htmlFor={inputId} className="flex flex-col items-center justify-center p-10 sm:p-14 cursor-pointer group">
        <div className="w-14 h-14 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-center mb-4
          group-hover:border-blue-500/40 group-hover:bg-blue-500/5 transition-all duration-300">
          <Camera className="w-6 h-6 text-slate-700 group-hover:text-blue-500/60 transition-colors" />
        </div>
        <span className="text-[13px] font-semibold text-slate-500 mb-1 text-center">{label}</span>
        <span className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-700 text-center">{sublabel}</span>
      </label>
    )}
  </div>
);

const NavButtons = ({ step, onPrev, onNext }: { step: number; onPrev: () => void; onNext: () => void }) => (
  <div className="flex items-center justify-between mt-12 pt-8 border-t border-slate-900">
    <button onClick={onPrev} disabled={step === 1}
      className="group flex items-center gap-3 px-6 py-3 rounded-xl text-[11px] font-black tracking-widest text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-200 transition-all disabled:opacity-20">
      <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
      PREV
    </button>
    <div className="hidden sm:flex gap-1.5">
      {[1,2,3,4].map(n => (
        <div key={n} className={`h-1.5 rounded-full transition-all duration-500 ${step === n ? "bg-blue-500 w-5" : "bg-slate-800 w-1.5"}`} />
      ))}
    </div>
    <button onClick={onNext}
      className="group flex items-center gap-3 px-8 py-3 rounded-xl text-[11px] font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)]"
      style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}>
      {step === 4 ? <><Save className="w-4 h-4" /> SAVE</> : <>NEXT <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></>}
    </button>
  </div>
);

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────── */
export default function JournalForm({ sessionId }: { sessionId?: string | null }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Record<string, any>>(INIT);
  const [saved, setSaved] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const analyzeScreenshot = async (base64Image: string) => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await apiRequest("POST", "/api/journal/analyze-screenshot", { image: base64Image });
      const data = await res.json();
      if (data.success && data.fields) {
        const f = data.fields;
        setForm(prev => {
          const updated = { ...prev };
          if (f.instrument) updated.instrument = f.instrument;
          if (f.direction) updated.direction = f.direction;
          if (f.orderType) updated.orderType = f.orderType;
          if (f.entryPrice) updated.entryPrice = String(f.entryPrice);
          if (f.stopLoss) updated.stopLoss = String(f.stopLoss);
          if (f.takeProfit) updated.takeProfit = String(f.takeProfit);
          if (f.stopLossDistancePips) updated.stopLossDistancePips = String(f.stopLossDistancePips);
          if (f.takeProfitDistancePips) updated.takeProfitDistancePips = String(f.takeProfitDistancePips);
          if (f.lotSize) updated.lotSize = String(f.lotSize);
          if (f.riskReward) updated.riskReward = String(f.riskReward);
          if (f.entryTime) updated.entryTime = f.entryTime;
          if (f.exitTime) updated.exitTime = f.exitTime;
          if (f.dayOfWeek) updated.dayOfWeek = f.dayOfWeek;
          if (f.tradeDuration) updated.tradeDuration = f.tradeDuration;
          if (f.outcome) updated.outcome = f.outcome;
          if (f.profitLoss) updated.profitLoss = String(f.profitLoss);
          if (f.pipsGainedLost) updated.pipsGainedLost = String(f.pipsGainedLost);
          if (f.mae) updated.mae = String(f.mae);
          if (f.mfe) updated.mfe = String(f.mfe);
          if (f.primaryExitReason) updated.primaryExitReason = f.primaryExitReason;
          if (f.sessionName) updated.sessionName = f.sessionName;
          if (f.sessionPhase) updated.sessionPhase = f.sessionPhase;
          if (f.entryTF) updated.entryTF = f.entryTF;
          if (f.spreadAtEntry) updated.spreadAtEntry = String(f.spreadAtEntry);
          return updated;
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

  const saveJournalEntry = async () => {
    if (!sessionId) {
      setAnalyzeError("Please select or create a session before saving a trade.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        instrument: form.instrument || null,
        pairCategory: form.pairCategory || null,
        direction: form.direction || null,
        orderType: form.orderType || null,
        entryPrice: form.entryPrice || null,
        stopLoss: form.stopLoss || null,
        takeProfit: form.takeProfit || null,
        stopLossDistance: form.stopLossDistancePips || null,
        takeProfitDistance: form.takeProfitDistancePips || null,
        lotSize: form.lotSize || null,
        riskReward: form.riskReward || null,
        riskPercent: form.riskPercent || null,
        spreadAtEntry: form.spreadAtEntry || null,
        entryTime: form.entryTime || null,
        exitTime: form.exitTime || null,
        dayOfWeek: form.dayOfWeek || null,
        tradeDuration: form.tradeDuration || null,
        entryTF: form.entryTF || null,
        analysisTF: form.analysisTF || null,
        contextTF: form.contextTF || null,
        outcome: form.outcome || null,
        profitLoss: form.profitLoss || null,
        pipsGainedLost: form.pipsGainedLost || null,
        accountBalance: form.accountBalance || null,
        commission: form.commission || null,
        mae: form.mae || null,
        mfe: form.mfe || null,
        plannedRR: form.plannedRR || null,
        achievedRR: form.achievedRR || null,
        monetaryRisk: form.monetaryRisk || null,
        potentialReward: form.potentialReward || null,
        primaryExitReason: form.primaryExitReason || null,
        sessionName: form.sessionName || null,
        sessionPhase: form.sessionPhase || null,
        entryTimeUTC: form.entryTimeUTC || null,
        sessionId: sessionId || null,
        timingContext: form.timingContext || null,
        manualFields: {
          thesis: form.thesis, trigger: form.trigger, invalidationLogic: form.invalidationLogic,
          expectedBehavior: form.expectedBehavior, setupTag: form.setupTag, tradeGrade: form.tradeGrade,
          marketRegime: form.marketRegime, trendDirection: form.trendDirection,
          volatilityState: form.volatilityState, liquidity: form.liquidity,
          newsEnvironment: form.newsEnvironment, htfBias: form.htfBias,
          emotionalState: form.emotionalState, focusStressLevel: form.focusStressLevel,
          postTradeEmotion: form.postTradeEmotion, rulesFollowed: form.rulesFollowed,
          confidenceLevel: form.confidenceLevel, worthRepeating: form.worthRepeating,
          whatWorked: form.whatWorked, whatFailed: form.whatFailed,
          adjustments: form.adjustments, notes: form.notes,
          energyLevel: form.energyLevel, focusLevel: form.focusLevel,
          marketAlignment: form.marketAlignment, setupClarity: form.setupClarity,
          entryPrecision: form.entryPrecision, confluence: form.confluence,
          timingQuality: form.timingQuality, confidenceAtEntry: form.confidenceAtEntry,
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
  const f   = (field: string, rows?: number, placeholder?: string, type?: string) =>
    <Field field={field} value={form[field]} onChange={set} rows={rows} placeholder={placeholder} type={type} />;
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

  return (
    <div className={`${PAGE_BG} text-slate-300 selection:bg-blue-500/30 font-sans`} data-testid="journal-form">

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-900/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 md:px-8 py-2">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {STEPS.map((s) => {
            const isActive = s.id === step;
            const isDone   = s.id < step;
            const Icon     = s.icon;
            return (
              <button key={s.id} onClick={() => setStep(s.id)}
                className={`group relative flex flex-col p-4 rounded-2xl border transition-all duration-500 overflow-hidden text-left
                  ${isActive
                    ? "bg-slate-900/40 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                    : "bg-slate-900/10 border-slate-800/50 hover:border-slate-700"}`}
                data-testid={`step-${s.id}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg transition-colors duration-300 ${isActive ? "text-blue-400" : isDone ? "text-blue-500/40" : "text-slate-600"}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] font-bold ${isActive ? "text-blue-500" : "text-slate-700"}`}>0{s.id}</span>
                </div>
                <p className={`text-[11px] font-black tracking-widest uppercase mb-0.5 ${isActive ? "text-white" : "text-slate-500"}`}>{s.label}</p>
                <p className={`text-[9px] font-medium tracking-wider uppercase opacity-60 ${isActive ? "text-blue-300" : "text-slate-700"}`}>{s.sub}</p>
                {isActive && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />}
                {isDone   && <CheckCircle2 className="absolute top-3 right-3 w-3 h-3 text-blue-500/40" />}
              </button>
            );
          })}
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-b from-slate-700/20 to-transparent rounded-[2rem] blur opacity-20" />
          <div className={`relative ${CARD_BG} border border-slate-800/80 rounded-[2rem] p-5 sm:p-8 md:p-10 shadow-2xl backdrop-blur-xl`}>

            {step === 1 && (
              <div className="space-y-10">

                <InfoBox color="amber" icon={AlertCircle} title="Critical Protocol"
                  text="Most traders fail due to impulsive entry. Use this module to force cognitive friction between the impulse and the execution." />

                <section className="space-y-6">
                  <SectionHeader icon={Lightbulb} title="Core Thesis" />
                  {lf("Trade Thesis", "thesis", 4, "Example: Price broke key resistance at 1.0850 with strong volume, expecting continuation to 1.0920 liquidity zone...")}
                  <div className={g2}>
                    <InfoBox color="blue"  icon={Target}     title="Objective" text="Clarity of thought. If you can't articulate your edge in 2-3 sentences, you don't have one." />
                    <InfoBox color="green" icon={Zap}         title="Edge"      text="Defines your systematic advantage. Separates disciplined entries from random impulse trades." />
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Zap} title="Execution Trigger" />
                  {lf("Entry Trigger", "trigger", 3, "Example: 15M engulfing candle close above 1.0850 with RSI break above 60...")}
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Shield} title="Defensive Overlay" />
                  {lf("Invalidation Logic", "invalidationLogic", 3, "Example: If price closes below 1.0830 on 15M, thesis invalid. Also invalid if no follow-through within 2 hours...")}
                  {lf("Expected Behavior", "expectedBehavior", 3, "Example: Expect immediate bullish momentum, hold above 1.0850, reach 1.0880 within 30 min...")}
                  <div className={g2}>
                    <InfoBox color="rose"   icon={AlertCircle} title="Exit Plan"        text="Rule-based exits. Pre-define failure before emotion kicks in." />
                    <InfoBox color="violet" icon={Eye}          title="Early Detection"  text="Know within minutes if your trade is working or dying." />
                  </div>
                </section>

                <section className="space-y-6">
                  <SectionHeader icon={Battery} title="Pre-Entry State Check" />
                  <div className={g2}>
                    <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                      {sc("Energy Level",        "energyLevel")}
                      {sc("Focus Level",         "focusLevel")}
                      {sc("Confidence at Entry", "confidenceAtEntry")}
                      {ls("External Distraction", "externalDistraction", ["No","Yes"])}
                    </div>
                    <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                      {lf("Open Trades Count",   "openTradesCount",   undefined, "0",   "number")}
                      {lf("Total Risk Open (%)", "totalRiskOpen",     undefined, "2.5", "number")}
                      {ls("Correlated Exposure", "correlatedExposure", ["No","Yes"])}
                    </div>
                  </div>
                  <div className={g2}>
                    <InfoBox color="green" icon={Focus}    title="State Matters"       text="Low energy/focus correlates with poor execution. Track this every single trade." />
                    <InfoBox color="blue"  icon={Briefcase} title="Portfolio Awareness" text="Over-leverage and correlated exposure are silent account killers." />
                  </div>
                </section>

                <section className="space-y-6">
                  <SectionHeader icon={Layers} title="Classification & Quality" />
                  <div className={g2}>
                    <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                      {lf("Strategy Version ID", "strategyVersionId", undefined, "e.g., v2.1, SMC-A, Breakout-R3")}
                      {ls("Setup Tag",   "setupTag",   ["Breakout","Reversal","Continuation","Range Bound","Trend Following","Mean Reversion","Momentum","Pullback"])}
                    </div>
                    <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                      {ls("Trade Grade", "tradeGrade", ["A - Textbook","B - Solid","C - Acceptable","D - Marginal","F - Poor"])}
                      <InfoBox color="amber" icon={Award} title="Selectivity" text="Only take A/B setups. Track if you're consistently picking the best opportunities." />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={ShieldCheck} title="Rule Governance" />
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                    <div className={g2}>
                      {ls("Setup Fully Valid",  "setupFullyValid", ["Yes","No"])}
                      {ls("Any Rule Broken?",   "anyRuleBroken",   ["No","Yes"])}
                    </div>
                    {form.anyRuleBroken === "Yes" && lf("Rule Broken (ID / Name)", "ruleBroken", undefined, "e.g., Risk > 2%, Entered during news, No confluence")}
                    <InfoBox color="rose" icon={AlertCircle} title="Discipline Audit" text="Makes rule-breaking visible. Identify patterns in poor execution over time." />
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Brain} title="Impulse Control Check" />
                  <InfoBox color="amber" icon={Flame} title="Red Flags" text="If ANY box below is checked — stop and reconsider the trade before executing." />
                  <div className={g2}>
                    {ck("Entering due to FOMO (fear of missing out)", "impulseCheckFOMO")}
                    {ck("Revenge trading after a loss",               "impulseCheckRevenge")}
                    {ck("Trading out of boredom / need for action",   "impulseCheckBored")}
                    {ck("Emotionally compromised (angry, euphoric)",  "impulseCheckEmotional")}
                  </div>
                </section>

                <NavButtons step={step} onPrev={() => setStep(s => s - 1)} onNext={() => setStep(s => s + 1)} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-10">

                <section className="space-y-4">
                  <SectionHeader icon={Camera} title="Trade Setup Screenshot" />
                  <Upload field="screenshot" inputId="up-entry" value={form.screenshot} onChange={handleScreenshotUpload}
                    label="Upload trade setup screenshot" sublabel="PNG · JPG · up to 10MB" />
                  {analyzing && (
                    <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mt-2" data-testid="status-analyzing">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      <span className="text-[11px] font-bold tracking-wider text-blue-400 uppercase">AI analyzing screenshot...</span>
                    </div>
                  )}
                  {analyzeError && (
                    <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 mt-2" data-testid="status-analyze-error">
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                      <span className="text-[11px] font-bold tracking-wider text-rose-400">{analyzeError}</span>
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Camera} title="Exit Chart Screenshot" />
                  <InfoBox color="green" icon={Activity} title="Post-Trade Evidence"
                    text="Capture how price behaved after your exit — essential for honest review and learning." />
                  <Upload field="exitScreenshot" inputId="up-exit" value={form.exitScreenshot} onChange={handleScreenshotUpload}
                    label="Upload exit / post-trade chart" sublabel="Compare entry vs exit for deep review" />
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Crosshair} title="Position Details" />
                  <div className={g4}>
                    {lf("Screenshot Time",    "screenshotTimestamp",   undefined, "",       "time")}
                    {lf("Instrument",          "instrument",            undefined, "BTCUSD")}
                    {ls("Pair Category",       "pairCategory",          ["Major","Minor","Exotic","Index","Crypto","Commodity"])}
                    {ls("Direction",           "direction",             ["Long","Short"])}
                    {lf("Lot Size",            "lotSize",               undefined, "0.01")}
                    {lf("Trade # Today",       "consecutiveTradeCount", undefined, "1",      "number")}
                    {lf("Entry Price",         "entryPrice",            undefined, "0.00",   "number")}
                    {lf("Stop Loss",           "stopLoss",              undefined, "0.00",   "number")}
                    {lf("SL Distance (Pips)",  "stopLossDistancePips",  undefined, "0",      "number")}
                    {lf("Take Profit",         "takeProfit",            undefined, "0.00",   "number")}
                    {lf("TP Distance (Pips)",  "takeProfitDistancePips",undefined, "0",      "number")}
                    {lf("Risk %",              "riskPercent",           undefined, "1.0",    "number")}
                    {ls("Order Type",          "orderType",             ["Market","Limit","Stop","Stop-Limit"])}
                    {ls("Outcome",             "outcome",               ["Win","Loss","BE"])}
                    {lf("Spread at Entry",     "spreadAtEntry",         undefined, "e.g. 1.2","number")}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Clock} title="Timing & Duration" />
                  <div className={g4}>
                    {lf("Entry Date / Time", "entryTime",     undefined, "", "datetime-local")}
                    {lf("Exit Date / Time",  "exitTime",      undefined, "", "datetime-local")}
                    {ls("Day of Week",        "dayOfWeek",     ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"])}
                    {lf("Trade Duration",     "tradeDuration", undefined, "2h 30m")}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={LayoutGrid} title="Timeframe Analysis" />
                  <div className={g3}>
                    {ls("Entry TF",    "entryTF",    ["1M","3M","5M","15M"])}
                    {ls("Analysis TF", "analysisTF", ["15M","30MIN","1HR","2HR","4HR"])}
                    {ls("Context TF",  "contextTF",  ["1W","1D","4HR"])}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Zap} title="Entry & Management" />
                  <div className={g3}>
                    {ls("Entry Method",    "entryMethod",    ["Market","Limit","Stop"])}
                    {lf("Exit Strategy",   "exitStrategy",   undefined, "Describe exit approach")}
                    {ls("Management Type", "managementType", ["Rule-based","Discretionary","Hybrid"])}
                    {ls("Risk Heat",       "riskHeat",       ["Low","Medium","High"])}
                    {ck("Break-Even Applied",    "breakEvenApplied")}
                    {ck("Trailing Stop Applied", "trailingStopApplied")}
                  </div>
                </section>

                <NavButtons step={step} onPrev={() => setStep(s => s - 1)} onNext={() => setStep(s => s + 1)} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-10">

                <section className="space-y-4">
                  <SectionHeader icon={Boxes} title="Market Environment" />
                  <div className={g4}>
                    {ls("Market Regime",    "marketRegime",    ["Trending","Ranging"])}
                    {ls("Trend Direction",  "trendDirection",  ["Bullish","Bearish","Sideways"])}
                    {ls("Volatility",       "volatilityState", ["Low","Normal","High"])}
                    {ls("Liquidity",        "liquidity",       ["Low","Normal","High"])}
                    {ls("News Environment", "newsEnvironment", ["Clear","Minor","Major"])}
                    {ls("Session Phase",    "sessionPhase",    ["Open","Mid","Close"])}
                    {lf("ATR at Entry",     "atrAtEntry",      undefined, "e.g. 0.0045", "number")}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Layers3} title="Timeframe Context" />
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                    <div className={g2}>
                      {ls("HTF Bias",              "htfBias",                ["Bull","Bear","Range"])}
                      {ls("HTF Key Level Present", "htfKeyLevelPresent",     ["Yes","No"])}
                      {ls("Trend Alignment",        "trendAlignment",         ["Yes","No"])}
                      {ls("MTF Alignment",          "multitimeframeAlignment",["Yes","No"])}
                    </div>
                    {lf("Higher TF Context",   "higherTFContext",   2, "What's happening on the higher timeframe?")}
                    {lf("Analysis TF Context", "analysisTFContext", 2, "What's happening on analysis timeframe?")}
                    {lf("Entry TF Context",    "entryTFContext",    2, "What's happening on entry timeframe?")}
                    {lf("Other Confluences",   "otherConfluences",  2, "e.g., Interest rate differentials, USD strength")}
                    <InfoBox color="blue" icon={Layers3} title="Multi-TF Story"
                      text="Captures whether all timeframes are aligned or conflicting. Full alignment = highest probability." />
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Target} title="Liquidity & Bias" />
                  {lf("Liquidity Targets & Bias", "liquidityTargets", 3, "Where are major liquidity pools? Stop hunts? Key psychological levels?")}
                  <InfoBox color="blue" icon={Target} title="Smart Money Context"
                    text="Identifies where institutional players are positioned and where price is most likely to react." />
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Clock} title="Session Timing" />
                  <div className={g3}>
                    {lf("Entry Time (UTC)", "entryTimeUTC",  undefined, "", "time")}
                    {ls("Session",          "sessionName",   ["London","New York","Tokyo","Sydney","Overlap"])}
                    {ls("Timing Context",   "timingContext", ["Impulse","Correction","Consolidation"])}
                  </div>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <SectionHeader icon={Gauge} title="Setup Quality Scores" />
                    <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                      {sc("Market Alignment", "marketAlignment")}
                      {sc("Setup Clarity",    "setupClarity")}
                      {sc("Entry Precision",  "entryPrecision")}
                      {sc("Confluence",       "confluence")}
                      {sc("Timing Quality",   "timingQuality")}
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <SectionHeader icon={Activity} title="Technical Signals" />
                      <div className="space-y-4">
                        {lf("Candle Pattern",    "candlePattern",    undefined, "e.g., Engulfing, Doji")}
                        {lf("Indicator State",   "indicatorState",   undefined, "e.g., RSI 70, MACD cross")}
                        {lf("Primary Signals",   "primarySignals",   2,         "Main technical confirmations")}
                        {lf("Secondary Signals", "secondarySignals", 2,         "Supporting technical factors")}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <SectionHeader icon={Target} title="Key Level Analysis" />
                      <div className="space-y-4">
                        {ls("Key Level Respect",    "keyLevelRespect",    ["Yes","No","Partial"])}
                        {ls("Key Level Type",       "keyLevelType",       ["Support","Resistance","Pivot","Fib Level"])}
                        {ls("Momentum Validity",    "momentumValidity",   ["Strong","Moderate","Weak"])}
                        {ls("Target Logic Clarity", "targetLogicClarity", ["High","Medium","Low"])}
                      </div>
                    </div>
                  </div>
                </section>

                <NavButtons step={step} onPrev={() => setStep(s => s - 1)} onNext={() => setStep(s => s + 1)} />
              </div>
            )}

            {step === 4 && (
              <div className="space-y-10">

                <section className="space-y-4">
                  <SectionHeader icon={DoorOpen} title="Exit Causation" />
                  {ls("Primary Exit Reason", "primaryExitReason", ["Target Hit","Stop Hit","Time Exit","Structure Change","News","Emotional Exit"])}
                  <InfoBox color="rose" icon={Target} title="Exit Discipline"
                    text="Tracks whether you hit targets or get stopped out. Patterns over time reveal your true discipline level." />
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={TrendingUp} title="Performance Data" />
                  <div className={g4}>
                    {lf("Pips Gained / Lost", "pipsGainedLost", undefined, "0",    "number")}
                    {lf("P&L Amount ($)",      "profitLoss",     undefined, "0.00", "number")}
                    {lf("Account Balance",     "accountBalance", undefined, "0.00", "number")}
                    {lf("Commission / Fees",   "commission",     undefined, "e.g. 3.50", "number")}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Target} title="Planning vs Execution" />
                  <div className={g3}>
                    {lf("Planned Entry", "plannedEntry", undefined, "0.00", "number")}
                    {lf("Planned SL",    "plannedSL",    undefined, "0.00", "number")}
                    {lf("Planned TP",    "plannedTP",    undefined, "0.00", "number")}
                    {lf("Actual Entry",  "actualEntry",  undefined, "0.00", "number")}
                    {lf("Actual SL",     "actualSL",     undefined, "0.00", "number")}
                    {lf("Actual TP",     "actualTP",     undefined, "0.00", "number")}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader icon={Activity} title="Trade Metrics" />
                  <div className={g3}>
                    {lf("MAE (Max Adverse)",    "mae",            undefined, "-15 pips")}
                    {lf("MFE (Max Favorable)",  "mfe",            undefined, "+45 pips")}
                    {lf("Monetary Risk ($)",    "monetaryRisk",   undefined, "0.00",  "number")}
                    {lf("Potential Reward ($)", "potentialReward",undefined, "0.00",  "number")}
                    {lf("Planned R:R",          "plannedRR",      undefined, "1:2")}
                    {lf("Achieved R:R",         "achievedRR",     undefined, "1:1.5")}
                  </div>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                  <div className="lg:col-span-2 space-y-8">
                    <div className="space-y-4">
                      <SectionHeader icon={BrainCircuit} title="Psychological State" />
                      <div className={g3}>
                        {ls("Emotional State",    "emotionalState",    ["Calm","Anxious","FOMO","Confident","Fearful","Neutral"])}
                        {ls("Focus / Stress",     "focusStressLevel",  ["Low","Medium","High"])}
                        {lf("Rules Followed %",   "rulesFollowed",     undefined, "100", "number")}
                        {lf("Confidence (1–5)",   "confidenceLevel",   undefined, "3",   "number")}
                        {ls("Post-Trade Emotion", "postTradeEmotion",  ["Neutral","Relieved","Euphoric","Frustrated","Regretful","Calm","Anxious"])}
                        {ck("Influenced by last trade result (recency bias)", "recencyBiasFlag")}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <SectionHeader icon={CheckCircle2} title="Trade Assessment" />
                      <div className="space-y-4">
                        {ck("Worth Repeating This Setup", "worthRepeating")}
                        {lf("Additional Notes", "notes", 3, "Any other observations or comments...")}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <SectionHeader icon={Microscope} title="Trade Reflections" />
                    <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-5">
                      <div>
                        <p className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-500/80 mb-3">What Worked</p>
                        <textarea rows={3} className={INPUT_CLS} placeholder="What did you execute well?"
                          value={form.whatWorked} onChange={e => set("whatWorked", e.target.value)} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black tracking-[0.2em] uppercase text-rose-500/80 mb-3">What Failed</p>
                        <textarea rows={3} className={INPUT_CLS} placeholder="What went wrong?"
                          value={form.whatFailed} onChange={e => set("whatFailed", e.target.value)} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black tracking-[0.2em] uppercase text-blue-500/80 mb-3">Future Adjustments</p>
                        <textarea rows={3} className={INPUT_CLS} placeholder="What will you change next time?"
                          value={form.adjustments} onChange={e => set("adjustments", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </section>

                <NavButtons step={step} onPrev={() => setStep(s => s - 1)}
                  onNext={() => saveJournalEntry()} />
              </div>
            )}

          </div>
        </div>
      </div>

      {saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05070a]/90 backdrop-blur-sm">
          <div className={`${CARD_BG} border border-slate-800/80 rounded-[2rem] p-8 sm:p-10 max-w-sm w-full text-center shadow-2xl`}>
            <div className="w-20 h-20 rounded-3xl bg-slate-900/50 border border-slate-800 flex items-center justify-center mx-auto mb-6 shadow-inner">
              <CheckCircle2 className="w-9 h-9 text-emerald-400 opacity-80" />
            </div>
            <h3 className="text-sm font-black tracking-[0.4em] text-slate-300 uppercase mb-3">Trade Logged</h3>
            <p className="text-[13px] text-slate-500 font-medium leading-relaxed mb-8 font-mono">
              Decision architecture and trade data recorded successfully.
            </p>
            <button onClick={() => { setForm(INIT); setStep(1); setSaved(false); }}
              className="w-full px-8 py-3 rounded-xl text-[11px] font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95 shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)]"
              style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}
              data-testid="button-continue-trading">
              CONTINUE TRADING
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
