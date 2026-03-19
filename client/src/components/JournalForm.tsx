import { useState, useMemo, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSessionBalance } from "@/hooks/useSessionBalance";
import { calcAllTradeValues } from "@/lib/tradeCalculations";

// ── Inline SVG Icons ───────────────────────────────────────────────────────
const Ic = ({ d, size=16, style, className, strokeWidth=2 }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
    strokeLinejoin="round" style={style} className={className}>
    {Array.isArray(d) ? d.map((p: string,i: number)=><path key={i} d={p}/>) : <path d={d}/>}
  </svg>
);

const ICONS: Record<string, any> = {
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
  Sparkles:     ["M12 3l1.88 5.76L19.5 9l-4.94 3.8L16.31 18 12 14.9 7.69 18l1.75-5.2L4.5 9l5.62-.24z"],
};

const Icon = ({ name, size=16, style, className }: any) => {
  const d = ICONS[name];
  if (!d) return null;
  return <Ic d={d} size={size} style={style} className={className}/>;
};

// ── Constants ─────────────────────────────────────────────────────────────
const INPUT_CLS = "w-full bg-slate-950/40 border border-slate-800/80 rounded-xl px-5 py-4 text-[13px] text-slate-200 placeholder-slate-700 resize-none focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all duration-300 font-mono leading-relaxed";
const INPUT_OCR_CLS = "w-full bg-slate-950/40 border border-emerald-700/50 rounded-xl px-5 py-4 text-[13px] text-emerald-300 placeholder-slate-700 resize-none focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all duration-300 font-mono leading-relaxed italic";
const LABEL_CLS = "block text-[10px] font-bold tracking-[0.2em] text-slate-500 mb-3 uppercase px-1";

const STEPS = [
  { id:1, label:"DECISION",  sub:"THESIS & LOGIC",  icon:"Brain" },
  { id:2, label:"EXECUTION", sub:"CORE DATA",        icon:"Crosshair" },
  { id:3, label:"CONTEXT",   sub:"MARKET STATE",     icon:"Globe2" },
  { id:4, label:"REVIEW",    sub:"PERFORMANCE",      icon:"CheckCircle2" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function normaliseTF(tf: string | null | undefined): string | null {
  if (!tf) return null;
  const map: Record<string, string> = {
    "1M":"1M","3M":"3M","5M":"5M","15M":"15M",
    "20M":"15M",
    "30M":"30MIN",
    "1H":"1HR","2H":"2HR","4H":"4HR",
    "6H":"4HR","8H":"4HR","12H":"4HR",
    "1D":"1D","1W":"1W",
  };
  return map[tf.toUpperCase()] ?? tf;
}

function normaliseSession(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.includes("/") ? "Overlap" : s;
}

const INIT: Record<string, any> = {
  screenshot:null, screenshotTimestamp:"", instrument:"", direction:"Long",
  lotSize:"", entryPrice:"", stopLoss:"", stopLossDistancePips:"",
  takeProfit:"", takeProfitDistancePips:"", entryTime:"", exitTime:"",
  tradeDuration:"", dayOfWeek:"Monday", outcome:"Win", profitLoss:"",
  accountBalance:"", orderType:"Market", riskPercent:"", riskReward:"", entryTF:"5M",
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
  openingPrice:"", closingPrice:"",
  stopLossUSD:"", takeProfitUSD:"",
  runUpPoints:"", runUpUSD:"",
  drawdownPoints:"", drawdownUSD:"",
  contractSize:"", units:"",
  ocrConfidence:"", ocrValidation:"",
};

type OcrFilledSet = Set<string>;

// ── UI Primitives ─────────────────────────────────────────────────────────
const InfoBox = ({ color, icon, title, text }: any) => {
  const themes: Record<string, string> = {
    amber:  "border-amber-500/20  bg-amber-500/5  text-amber-400",
    blue:   "border-blue-500/20   bg-blue-500/5   text-blue-400",
    green:  "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
    rose:   "border-rose-500/20   bg-rose-500/5   text-rose-400",
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-400",
  };
  return (
    <div className={`flex gap-4 p-5 rounded-xl border ${themes[color]||themes.blue}`}>
      <div className="flex-shrink-0 mt-0.5"><Icon name={icon} size={20}/></div>
      <div>
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-1.5 opacity-90">{title}</p>
        <p className="text-xs leading-relaxed text-slate-400 font-medium italic">{text}</p>
      </div>
    </div>
  );
};

const SectionHeader = ({ icon, title }: any) => (
  <div className="flex items-center gap-4 mb-6">
    <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 flex-shrink-0">
      <Icon name={icon} size={16}/>
    </div>
    <div className="h-px flex-1 bg-gradient-to-r from-slate-700/50 to-transparent"/>
    <h2 className="text-[11px] font-black tracking-[0.3em] text-slate-500 uppercase italic whitespace-nowrap">{title}</h2>
  </div>
);

const Field = ({ label, field, value, onChange, placeholder="", rows, type="text", ocrFilled=false }: any) => {
  const cls = ocrFilled ? INPUT_OCR_CLS : INPUT_CLS;
  return (
    <div>
      {label && (
        <label className={LABEL_CLS}>
          {label}
          {ocrFilled && (
            <span title="Auto-filled by OCR" style={{ marginLeft:6, fontSize:9, color:"#34d399", letterSpacing:"0.15em", fontStyle:"normal" }}>✦ OCR</span>
          )}
        </label>
      )}
      {rows
        ? <textarea rows={rows} placeholder={placeholder} value={value??""} onChange={(e: any)=>onChange(field,e.target.value)} className={cls}/>
        : <input type={type} placeholder={placeholder} value={value??""} onChange={(e: any)=>onChange(field,e.target.value)} className={cls+" block"}/>
      }
    </div>
  );
};

const Sel = ({ label, field, value, onChange, options, ocrFilled=false }: any) => (
  <div>
    {label && (
      <label className={LABEL_CLS}>
        {label}
        {ocrFilled && (
          <span title="Auto-filled by OCR" style={{ marginLeft:6, fontSize:9, color:"#34d399", letterSpacing:"0.15em", fontStyle:"normal" }}>✦ OCR</span>
        )}
      </label>
    )}
    <div className="relative">
      <select value={options.includes(value)?value:options[0]} onChange={(e: any)=>onChange(field,e.target.value)}
        className={(ocrFilled
          ? "w-full bg-slate-950/40 border border-emerald-700/50 rounded-xl px-5 py-4 text-[13px] text-emerald-300 italic"
          : INPUT_CLS)+" appearance-none cursor-pointer pr-10 block"}>
        {options.map((o: string)=><option key={o} value={o} className="bg-[#0a0d14]">{o}</option>)}
      </select>
      <Icon name="ChevronRight" size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none rotate-90"/>
    </div>
  </div>
);

const Score = ({ label, field, value, onChange }: any) => (
  <div className="flex items-center justify-between gap-3 flex-wrap py-1">
    <label className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase">{label}</label>
    <div className="flex gap-1.5">
      {[1,2,3,4,5].map(n=>(
        <button key={n} onClick={()=>onChange(field,n)}
          className={`w-8 h-8 rounded-lg text-[11px] font-black font-mono border transition-all
            ${value===n?"bg-blue-600 border-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.5)]"
            :"bg-slate-950/40 border-slate-800/80 text-slate-600 hover:border-blue-500/40"}`}>
          {n}
        </button>
      ))}
    </div>
  </div>
);

const Check = ({ label, field, value, onChange }: any) => (
  <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-800/80 bg-slate-950/40 cursor-pointer hover:border-blue-500/20 transition-all">
    <input type="checkbox" checked={!!value} onChange={(e: any)=>onChange(field,e.target.checked)} className="w-4 h-4 mt-0.5 flex-shrink-0 rounded border-2 border-slate-700 bg-slate-900 cursor-pointer"/>
    <span className="text-[12px] font-semibold text-slate-400 leading-snug">{label}</span>
  </label>
);

const Upload = ({ field, inputId, value, onChange, label, sublabel }: any) => (
  <div className={`relative rounded-2xl border transition-all overflow-hidden ${value?"border-blue-500/30":"border-dashed border-slate-800/80 hover:border-blue-500/30"} bg-slate-950/20`}>
    <input type="file" className="hidden" id={inputId} accept="image/*" onChange={(e: any)=>{
      const f=e.target.files[0];
      if(f){const r=new FileReader();r.onloadend=()=>onChange(field,r.result);r.readAsDataURL(f);}
    }}/>
    {value?(
      <div className="relative group/img">
        <img src={value} alt="chart" className="w-full h-auto max-h-80 object-contain"/>
        <div className="absolute inset-0 bg-[#05070a]/80 backdrop-blur-sm opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center gap-3">
          <label htmlFor={inputId} className="p-3 bg-blue-600 rounded-xl cursor-pointer hover:bg-blue-500 transition-all"><Icon name="RefreshCcw" size={20} className="text-white"/></label>
          <button onClick={()=>onChange(field,null)} className="p-3 bg-rose-600 rounded-xl hover:bg-rose-500 transition-all"><Icon name="Trash2" size={20} className="text-white"/></button>
        </div>
      </div>
    ):(
      <label htmlFor={inputId} className="flex flex-col items-center justify-center p-10 cursor-pointer group">
        <div className="w-14 h-14 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-center mb-4 group-hover:border-blue-500/40 transition-all">
          <Icon name="Camera" size={24} className="text-slate-700 group-hover:text-blue-500/60 transition-colors"/>
        </div>
        <span className="text-[13px] font-semibold text-slate-500 mb-1 text-center">{label}</span>
        <span className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-700 text-center">{sublabel}</span>
      </label>
    )}
  </div>
);

const NavButtons = ({ step, onPrev, onNext }: any) => (
  <div className="flex items-center justify-between mt-12 pt-8 border-t border-slate-900">
    <button onClick={onPrev} disabled={step===1}
      className="group flex items-center gap-3 px-6 py-3 rounded-xl text-[11px] font-black tracking-widest text-slate-500 border border-slate-800 hover:border-slate-600 hover:text-slate-200 transition-all disabled:opacity-20">
      <Icon name="ChevronLeft" size={16}/>PREV
    </button>
    <div className="hidden sm:flex gap-1.5">
      {[1,2,3,4].map(n=>(
        <div key={n} className={`h-1.5 rounded-full transition-all duration-500 ${step===n?"bg-blue-500 w-5":"bg-slate-800 w-1.5"}`}/>
      ))}
    </div>
    <button onClick={onNext} className="group flex items-center gap-3 px-8 py-3 rounded-xl text-[11px] font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-95" style={{background:"linear-gradient(135deg,#3b82f6,#1d4ed8)"}}>
      {step===4?<><Icon name="Save" size={16}/>SAVE</>:<>NEXT<Icon name="ChevronRight" size={16}/></>}
    </button>
  </div>
);

const StatRow = ({ label, value, valueColor }: any) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid rgba(51,65,85,0.3)"}}>
    <span style={{fontSize:"11px",color:"#64748b"}}>{label}</span>
    <span style={{fontSize:"11px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color:valueColor||"#e2e8f0"}}>{value}</span>
  </div>
);

const OcrSummaryBadge = ({ form, ocrFields }: { form: Record<string,any>; ocrFields: OcrFilledSet }) => {
  if (!ocrFields.size) return null;
  const conf = form.ocrConfidence;
  const confColor = conf === "high" ? "#34d399" : conf === "medium" ? "#fbbf24" : "#f87171";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, padding:"10px 16px", borderRadius:12, border:"1px solid rgba(52,211,153,0.25)", background:"rgba(52,211,153,0.05)" }}>
      <Icon name="Sparkles" size={14} style={{color:"#34d399"}}/>
      <span style={{fontSize:11, fontWeight:700, color:"#34d399", flex:1}}>
        OCR extracted <strong>{ocrFields.size}</strong> fields automatically
        {conf && <span style={{marginLeft:8, fontSize:10, color:confColor, fontStyle:"italic"}}>{conf} confidence</span>}
      </span>
      <span style={{fontSize:9, color:"#475569", fontStyle:"italic"}}>Italic fields = OCR-filled</span>
    </div>
  );
};

function SidebarContent({ trades }: any) {
  const stats = useMemo(() => {
    if (!trades.length) return null;
    const wins   = trades.filter((t: any)=>t.outcome==="Win");
    const losses = trades.filter((t: any)=>t.outcome==="Loss");
    const netPnL = trades.map((t: any)=>parseFloat(t.profitLoss)||0).reduce((a: number,b: number)=>a+b,0);
    const winAmts  = wins.map((t: any)=>parseFloat(t.profitLoss)||0).filter((v: number)=>v>0);
    const lossAmts = losses.map((t: any)=>parseFloat(t.profitLoss)||0).filter((v: number)=>v<0);
    const bestTrade  = winAmts.length  ? Math.max(...winAmts)  : 0;
    const worstTrade = lossAmts.length ? Math.min(...lossAmts) : 0;
    const totalWins = winAmts.reduce((a: number,b: number)=>a+b,0);
    const totalLoss = Math.abs(lossAmts.reduce((a: number,b: number)=>a+b,0));
    const profitFactor = totalLoss>0?(totalWins/totalLoss).toFixed(2):totalWins>0?"∞":"0";
    const winrate = ((wins.length/trades.length)*100).toFixed(1);
    const commissions = trades.reduce((a: number,t: any)=>a+(parseFloat(t.commission)||0),0);
    const startBal = parseFloat(trades[0]?.accountBalance)||0;
    const endBal   = parseFloat(trades[trades.length-1]?.accountBalance)||0;
    let peak=startBal,maxDD=0,runBal=startBal;
    for(const t of trades){runBal+=parseFloat(t.profitLoss)||0;if(runBal>peak)peak=runBal;const dd=peak-runBal;if(dd>maxDD)maxDD=dd;}
    const buys  = trades.filter((t: any)=>t.direction==="Long").length;
    const sells = trades.filter((t: any)=>t.direction==="Short").length;
    const exp = ((wins.length/trades.length)*(totalWins/(wins.length||1))-(losses.length/trades.length)*(totalLoss/(losses.length||1))).toFixed(2);
    return {netPnL,winrate,profitFactor,bestTrade,worstTrade,commissions,startBal,endBal,maxDD,buys,sells,total:trades.length,wins:wins.length,losses:losses.length,exp};
  },[trades]);

  const fmt = (n: number) => { const abs=Math.abs(n||0); return (n<0?"-$":"$")+abs.toFixed(2); };
  const pnlColor = !stats?"#e2e8f0":stats.netPnL>0?"#34d399":stats.netPnL<0?"#f87171":"#e2e8f0";
  const pnlPct = stats&&stats.startBal>0?((stats.netPnL/stats.startBal)*100).toFixed(2):"0.00";

  return (
    <div style={{padding:"12px 16px 24px",display:"flex",flexDirection:"column",gap:"8px",width:"100%",boxSizing:"border-box"}}>
      <div style={{background:"rgba(10,13,20,0.8)",border:"1px solid rgba(51,65,85,0.5)",borderRadius:"12px",padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"6px"}}>
          <span style={{fontSize:"9px",fontWeight:900,letterSpacing:"0.25em",textTransform:"uppercase",color:"#475569"}}>NET P&L</span>
          <Icon name="ArrowRight" size={12} style={{color:"#334155"}}/>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
          <span style={{fontSize:"15px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color:pnlColor}}>{stats?fmt(stats.netPnL):"0"}</span>
          <span style={{fontSize:"11px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color:pnlColor}}>{stats?(stats.netPnL>=0?"+":"")+pnlPct+"%":"0%"}</span>
        </div>
      </div>
      <div style={{background:"rgba(10,13,20,0.6)",border:"1px solid rgba(51,65,85,0.4)",borderRadius:"12px",padding:"10px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
          <span style={{fontSize:"10px",color:"#475569"}}>Start Balance</span>
          <span style={{fontSize:"10px",color:"#475569"}}>End Balance</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:"12px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color:"#cbd5e1"}}>{stats?fmt(stats.startBal):"$0.00"}</span>
          <span style={{fontSize:"12px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color:"#cbd5e1"}}>{stats?fmt(stats.endBal):"$0.00"}</span>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(10,13,20,0.6)",border:"1px solid rgba(51,65,85,0.4)",borderRadius:"12px",padding:"9px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <Icon name="DollarSign" size={12} style={{color:"#475569"}}/>
          <span style={{fontSize:"11px",color:"#475569"}}>Commissions & Fees</span>
        </div>
        <span style={{fontSize:"11px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color:"#94a3b8"}}>{stats?fmt(stats.commissions):"$0.00"}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"2px 0"}}>
        <div style={{flex:1,height:"1px",background:"rgba(51,65,85,0.5)"}}/>
        <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
          <Icon name="BarChart2" size={10} style={{color:"#334155"}}/>
          <span style={{fontSize:"8px",fontWeight:900,letterSpacing:"0.2em",textTransform:"uppercase",color:"#334155"}}>Trading Stats</span>
        </div>
        <div style={{flex:1,height:"1px",background:"rgba(51,65,85,0.5)"}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"5px"}}>
        {[
          {label:"Buys",  val:stats?stats.buys:0,  color:"#60a5fa"},
          {label:"Sells", val:stats?stats.sells:0, color:"#a78bfa"},
          {label:"Total", val:stats?stats.total:0, color:"#e2e8f0"},
        ].map(({label,val,color})=>(
          <div key={label} style={{background:"rgba(10,13,20,0.6)",border:"1px solid rgba(51,65,85,0.4)",borderRadius:"10px",padding:"9px 4px",textAlign:"center"}}>
            <p style={{fontSize:"9px",color:"#475569",marginBottom:"3px"}}>{label}</p>
            <p style={{fontSize:"14px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color}}>{val}</p>
          </div>
        ))}
      </div>
      <div style={{background:"rgba(10,13,20,0.6)",border:"1px solid rgba(51,65,85,0.4)",borderRadius:"12px",padding:"2px 14px"}}>
        <StatRow label="Best Trade"    value={stats?fmt(stats.bestTrade):"$0.00"}  valueColor="#34d399"/>
        <StatRow label="Worst Trade"   value={stats?fmt(stats.worstTrade):"$0.00"} valueColor={stats&&stats.worstTrade<0?"#f87171":"#94a3b8"}/>
        <StatRow label="Avg Hold Time" value="—" valueColor="#475569"/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0"}}>
          <span style={{fontSize:"11px",color:"#64748b"}}>Max Drawdown</span>
          <span style={{fontSize:"11px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color:stats&&stats.maxDD>0?"#f87171":"#94a3b8"}}>{stats?fmt(stats.maxDD):"$0.00"}</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"5px"}}>
        {[
          {label:"Winrate",       val:stats?stats.winrate+"%":"0%", color:!stats?"#475569":parseFloat(stats?.winrate)>=50?"#34d399":"#f87171"},
          {label:"Profit Factor", val:stats?stats.profitFactor:"0", color:!stats?"#475569":parseFloat(stats?.profitFactor)>=1.5?"#34d399":parseFloat(stats?.profitFactor)>=1?"#fbbf24":"#f87171"},
          {label:"Expectancy",    val:stats?stats.exp:"0",          color:!stats?"#475569":parseFloat(stats?.exp)>0?"#34d399":"#f87171"},
        ].map(({label,val,color})=>(
          <div key={label} style={{background:"rgba(10,13,20,0.6)",border:"1px solid rgba(51,65,85,0.4)",borderRadius:"10px",padding:"10px 4px",textAlign:"center"}}>
            <p style={{fontSize:"9px",color:"#475569",marginBottom:"5px"}}>{label}</p>
            <p style={{fontSize:"12px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color}}>{val}</p>
          </div>
        ))}
      </div>
      {!trades.length&&(
        <div style={{borderRadius:"12px",border:"1px dashed rgba(51,65,85,0.3)",padding:"20px",textAlign:"center",marginTop:"4px"}}>
          <Icon name="Activity" size={20} style={{color:"#1e293b",margin:"0 auto 6px",display:"block"}}/>
          <p style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:"#1e293b"}}>No trades yet</p>
          <p style={{fontSize:"10px",color:"#0f172a",marginTop:"3px"}}>Log a trade to see stats</p>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function JournalForm({ sessionId }: { sessionId?: string | null }) {
  const [step,setStep]               = useState(1);
  const [form,setForm]               = useState<Record<string,any>>(INIT);
  const [saved,setSaved]             = useState(false);
  const [trades,setTrades]           = useState<any[]>([]);
  const [sidebarOpen,setSidebarOpen] = useState(false);
  const [analyzing,setAnalyzing]     = useState(false);
  const [analyzeError,setAnalyzeError] = useState<string|null>(null);
  const [saving,setSaving]           = useState(false);
  const [ocrFields,setOcrFields]     = useState<OcrFilledSet>(new Set());

  // ── FIX 1: live running balance from all existing session trades ──────────
  const { currentBalance } = useSessionBalance(sessionId);

  // ── FIX 2: auto-calculate P&L + accountBalance whenever key fields change ─
  // Runs when riskPercent, riskReward, outcome, or currentBalance changes.
  // calcAllTradeValues is pure — safe to call on every keystroke.
  // Only fires when all three inputs are present and outcome is valid.
  useEffect(() => {
    if (!currentBalance || !form.riskPercent || !form.riskReward || !form.outcome) return;
    const outcome = form.outcome as "Win" | "Loss" | "BE";
    if (!["Win", "Loss", "BE"].includes(outcome)) return;
    const values = calcAllTradeValues(
      currentBalance,
      String(form.riskPercent),
      String(form.riskReward),
      outcome,
    );
    setForm(prev => ({
      ...prev,
      profitLoss:     values.profitLoss,
      accountBalance: values.accountBalance,
      monetaryRisk:   values.dollarRisk,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.riskPercent, form.riskReward, form.outcome, currentBalance]);

  const set = (k: string,v: any) => setForm(p=>({...p,[k]:v}));

  const lf  = (label: string,field: string,rows?: number,placeholder?: string,type?: string) =>
    <Field label={label} field={field} value={form[field]} onChange={set} rows={rows} placeholder={placeholder} type={type} ocrFilled={ocrFields.has(field)}/>;
  const ls  = (label: string,field: string,options: string[]) =>
    <Sel label={label} field={field} value={form[field]} onChange={set} options={options} ocrFilled={ocrFields.has(field)}/>;
  const sc  = (label: string,field: string) => <Score label={label} field={field} value={form[field]} onChange={set}/>;
  const ck  = (label: string,field: string) => <Check label={label} field={field} value={form[field]} onChange={set}/>;

  const g2="grid grid-cols-1 sm:grid-cols-2 gap-4";
  const g3="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";
  const g4="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4";

  const normaliseDatetime = (val: string | null | undefined): string => {
    if (!val) return "";
    const s = String(val).trim();
    // Convert "2025-01-14 08:00" → "2025-01-14T08:00" for datetime-local inputs
    return s.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}).*$/, "$1T$2");
  };

  const computeDuration = (entryStr: string, exitStr: string): string | null => {
    if (!entryStr || !exitStr) return null;
    try {
      const entry = new Date(entryStr);
      const exit = new Date(exitStr);
      if (isNaN(entry.getTime()) || isNaN(exit.getTime())) return null;
      const diffMs = exit.getTime() - entry.getTime();
      if (diffMs <= 0) return null;
      const totalMins = Math.floor(diffMs / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    } catch { return null; }
  };

  const analyzeScreenshot = async (base64Image: string, screenshotField: string) => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await apiRequest("POST", "/api/journal/analyze-screenshot", { image: base64Image });
      const data = await res.json();

      if (data.success && data.fields) {
        const f = data.fields;
        const newOcrFields = new Set<string>();

        const mark = (field: string) => newOcrFields.add(field);
        const maybe = (field: string, val: any) => {
          if (val != null && val !== "") { mark(field); return String(val); }
          return undefined;
        };

        setForm(prev => {
          const u = { ...prev };

          if (f.instrument)   { u.instrument   = f.instrument;   mark("instrument"); }
          if (f.pairCategory) { u.pairCategory = f.pairCategory; mark("pairCategory"); }
          else if (f.instrument) {
            const sym = String(f.instrument).toUpperCase();
            if      (/BTC|ETH|BNB|XRP|SOL|ADA|DOGE|USDT/.test(sym)) u.pairCategory = "Crypto";
            else if (/XAU|XAG|GOLD|SILVER|OIL|WTI/.test(sym))        u.pairCategory = "Commodity";
            else if (/US30|SPX|NAS|DAX|FTSE|CAC|NDX|IDX/.test(sym))  u.pairCategory = "Index";
            else if (/EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|NZDUSD|USDCAD/.test(sym)) u.pairCategory = "Major";
            else u.pairCategory = "Minor";
            mark("pairCategory");
          }

          if (f.direction) { u.direction = f.direction; mark("direction"); }

          const ep = maybe("entryPrice", f.entryPrice);
          if (ep) { u.entryPrice = ep; u.plannedEntry = ep; u.actualEntry = ep; }

          const op = maybe("openingPrice", f.openingPrice);
          if (op) u.openingPrice = op;

          const cp = maybe("closingPrice", f.closingPrice);
          if (cp) u.closingPrice = cp;

          const sl = maybe("stopLoss", f.stopLoss);
          if (sl) { u.stopLoss = sl; u.plannedSL = sl; u.actualSL = sl; }

          const tp = maybe("takeProfit", f.takeProfit);
          if (tp) { u.takeProfit = tp; u.plannedTP = tp; u.actualTP = tp; }

          // Points → pips conversion.
          // The OCR Python already outputs pre-computed pips (stopLossPips / takeProfitPips)
          // using correct per-instrument factors. Prefer those. Only fall back to the
          // frontend ÷10 formula when the pre-computed values are absent.
          const INDEX_RE = /index|idx|us30|nas|spx|dax|ftse|cac|dow|usa500|spx500|nas100|usa30/i;
          const isIndex  = INDEX_RE.test(String(u.instrument ?? "")) || u.pairCategory === "Index";
          const pipFactor = isIndex ? 1 : 10;
          const ptsToPips = (pts: any) => String(Math.round(parseFloat(String(pts)) / pipFactor * 10) / 10);

          // SL pips — prefer pre-computed value from OCR, fall back to points conversion
          const slPts = f.stopLossPoints ?? f.plannedSLPoints;
          const tpPts = f.takeProfitPoints ?? f.plannedTPPoints;
          console.log("[OCR→pips] instrument:", u.instrument, "isIndex:", isIndex, "pipFactor:", pipFactor,
            "f.stopLossPips:", f.stopLossPips, "slPts:", slPts,
            "f.takeProfitPips:", f.takeProfitPips, "tpPts:", tpPts);
          if (f.stopLossPips != null) { u.stopLossDistancePips = String(f.stopLossPips); mark("stopLossDistancePips"); }
          else if (slPts != null)     { u.stopLossDistancePips = ptsToPips(slPts);        mark("stopLossDistancePips"); }

          // TP pips — same priority
          if (f.takeProfitPips != null) { u.takeProfitDistancePips = String(f.takeProfitPips); mark("takeProfitDistancePips"); }
          else if (tpPts != null)       { u.takeProfitDistancePips = ptsToPips(tpPts);          mark("takeProfitDistancePips"); }

          if (f.stopLossUSD  != null) { u.stopLossUSD   = String(f.stopLossUSD);  mark("stopLossUSD"); }
          if (f.takeProfitUSD!= null) { u.takeProfitUSD = String(f.takeProfitUSD); mark("takeProfitUSD"); }

          if (f.lotSize      != null) { u.lotSize      = String(f.lotSize);      mark("lotSize"); }
          if (f.units        != null) { u.units        = String(f.units);        mark("units"); }
          if (f.contractSize != null) { u.contractSize = String(f.contractSize); mark("contractSize"); }

          if (f.riskReward != null) { u.riskReward = String(f.riskReward); mark("riskReward"); }
          if (f.plannedRR  != null) { u.plannedRR  = String(f.plannedRR);  mark("plannedRR"); }
          if (f.achievedRR != null) { u.achievedRR = String(f.achievedRR); mark("achievedRR"); }

          if (f.outcome != null) { u.outcome = f.outcome; mark("outcome"); }

          if (f.openPLUSD != null)    { u.profitLoss    = String(f.openPLUSD);    mark("profitLoss"); }
          // pipsGainedLost: openPLPoints are in JForex points → convert to pips
          if (f.openPLPoints != null) { u.pipsGainedLost = ptsToPips(f.openPLPoints); mark("pipsGainedLost"); }

          if (f.runUpPoints != null) {
            u.mfe = `${f.runUpPoints} pts${f.runUpUSD != null ? ` ($${f.runUpUSD})` : ""}`;
            mark("mfe");
          }
          if (f.drawdownPoints != null) {
            u.mae = `${f.drawdownPoints} pts${f.drawdownUSD != null ? ` ($${f.drawdownUSD})` : ""}`;
            mark("mae");
          }

          if (screenshotField === "screenshot") {
            // Entry screenshot: grab whichever time field the OCR populated (it often stores the
            // replay-bar ISO timestamp as exitTime, not entryTime)
            const entryT = normaliseDatetime(f.entryTime || f.exitTime);
            if (entryT) { u.entryTime = entryT; mark("entryTime"); }
          } else {
            // Exit screenshot: exitTime is the close time; entryTime fills in only if still blank
            if (f.exitTime) { u.exitTime = normaliseDatetime(f.exitTime); mark("exitTime"); }
            if (f.entryTime && (!u.entryTime || u.entryTime === "")) {
              u.entryTime = normaliseDatetime(f.entryTime); mark("entryTime");
            }
          }

          const computed = computeDuration(u.entryTime, u.exitTime);
          if (computed) { u.tradeDuration = computed; mark("tradeDuration"); }
          else if (f.tradeDuration) { u.tradeDuration = f.tradeDuration; mark("tradeDuration"); }

          if (f.dayOfWeek)    { u.dayOfWeek     = f.dayOfWeek;     mark("dayOfWeek"); }

          if (f.sessionName)  { u.sessionName  = normaliseSession(f.sessionName);  mark("sessionName"); }
          if (f.sessionPhase) { u.sessionPhase = f.sessionPhase; mark("sessionPhase"); }

          u.ocrConfidence = data.confidence || "";
          u.ocrValidation = data.validation?.summary || "";

          console.log("[OCR→form] stopLossDistancePips:", u.stopLossDistancePips, "takeProfitDistancePips:", u.takeProfitDistancePips, "pipsGainedLost:", u.pipsGainedLost);
          return u;
        });

        setOcrFields(prev => new Set([...prev, ...newOcrFields]));
      } else {
        setAnalyzeError(data.error || "OCR analysis failed");
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
      analyzeScreenshot(value, field);
    }
  };

  // ── API save ─────────────────────────────────────────────────────────────
  const saveJournalEntry = async () => {
    if (!sessionId) {
      setAnalyzeError("Please select or create a session before saving a trade.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string,any> = {
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
        aiExtracted: {
          method:          "ocr_v8_jforex",
          ocrConfidence:   form.ocrConfidence,
          ocrValidation:   form.ocrValidation,
          openingPrice:    form.openingPrice    || null,
          closingPrice:    form.closingPrice    || null,
          stopLossUSD:     form.stopLossUSD     || null,
          takeProfitUSD:   form.takeProfitUSD   || null,
          runUpPoints:     form.runUpPoints     || null,
          runUpUSD:        form.runUpUSD        || null,
          drawdownPoints:  form.drawdownPoints  || null,
          drawdownUSD:     form.drawdownUSD     || null,
          contractSize:    form.contractSize    || null,
          units:           form.units           || null,
          ocrFilledFields: Array.from(ocrFields),
        },
        manualFields: {
          thesis:                  form.thesis,
          trigger:                 form.trigger,
          invalidationLogic:       form.invalidationLogic,
          expectedBehavior:        form.expectedBehavior,
          setupTag:                form.setupTag,
          tradeGrade:              form.tradeGrade,
          marketRegime:            form.marketRegime,
          trendDirection:          form.trendDirection,
          volatilityState:         form.volatilityState,
          liquidity:               form.liquidity,
          newsEnvironment:         form.newsEnvironment,
          htfBias:                 form.htfBias,
          emotionalState:          form.emotionalState,
          focusStressLevel:        form.focusStressLevel,
          postTradeEmotion:        form.postTradeEmotion,
          rulesFollowed:           form.rulesFollowed,
          confidenceLevel:         form.confidenceLevel,
          worthRepeating:          form.worthRepeating,
          whatWorked:              form.whatWorked,
          whatFailed:              form.whatFailed,
          adjustments:             form.adjustments,
          notes:                   form.notes,
          energyLevel:             form.energyLevel,
          focusLevel:              form.focusLevel,
          marketAlignment:         form.marketAlignment,
          setupClarity:            form.setupClarity,
          entryPrecision:          form.entryPrecision,
          confluence:              form.confluence,
          timingQuality:           form.timingQuality,
          confidenceAtEntry:       form.confidenceAtEntry,
          openingPrice:            form.openingPrice,
          closingPrice:            form.closingPrice,
          trendAlignment:          form.trendAlignment,
          mtfAlignment:            form.multitimeframeAlignment,
          htfKeyLevelPresent:      form.htfKeyLevelPresent,
          keyLevelRespected:       form.keyLevelRespect,
          keyLevelType:            form.keyLevelType,
          targetLogic:             form.targetLogicClarity,
          strongMomentum:          form.momentumValidity,
          managementType:          form.managementType,
          candlePattern:           form.candlePattern,
          setupFullyValid:         form.setupFullyValid,
          ruleBroken:              form.anyRuleBroken,
          breakevenApplied:        form.breakEvenApplied,
          fomoTrade:               form.impulseCheckFOMO,
          revengeTrade:            form.impulseCheckRevenge,
          boredomTrade:            form.impulseCheckBored,
          emotionalTrade:          form.impulseCheckEmotional,
          externalDistraction:     form.externalDistraction,
          strategyVersionId:       form.strategyVersionId,
        },
      };
      await apiRequest("POST", "/api/journal/entries", payload);
      queryClient.invalidateQueries({ queryKey: ['/api/journal/entries', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/compute', sessionId] });
      setTrades(p=>[...p,{...form}]);
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
        .form-scroll::-webkit-scrollbar,.side-scroll::-webkit-scrollbar{display:none}
        .form-scroll,.side-scroll{-ms-overflow-style:none;scrollbar-width:none}
        .sidebar-panel{position:relative;z-index:1;width:22vw;min-width:240px;flex-shrink:0;border-left:1px solid rgba(51,65,85,0.35);background:#07090f;display:flex;flex-direction:column;overflow-y:auto;-ms-overflow-style:none;scrollbar-width:none;padding-left:8px;padding-right:12px}
        .sidebar-panel::-webkit-scrollbar{display:none}
        @media(max-width:899px){.sidebar-panel{display:none}.sidebar-fab{display:flex!important}}
        .sidebar-drawer{position:fixed;inset:0;z-index:100;display:flex}
        .sidebar-drawer-backdrop{flex:1;background:rgba(5,7,10,0.7);backdrop-filter:blur(4px)}
        .sidebar-drawer-panel{width:min(320px,88vw);background:#07090f;border-left:1px solid rgba(51,65,85,0.35);overflow-y:auto;-ms-overflow-style:none;scrollbar-width:none;display:flex;flex-direction:column;animation:slideIn 0.22s ease}
        .sidebar-drawer-panel::-webkit-scrollbar{display:none}
        @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @media(max-width:479px){.steps-grid{grid-template-columns:1fr 1fr!important}}
      `}</style>

      <div style={{display:"flex",height:"100%",overflow:"hidden",background:"#05070a",color:"#cbd5e1",fontFamily:"sans-serif",position:"relative"}}>
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>
          <div style={{position:"absolute",top:"-10%",left:"-10%",width:"40%",height:"40%",background:"rgba(30,58,138,0.08)",filter:"blur(120px)",borderRadius:"50%"}}/>
          <div style={{position:"absolute",bottom:"-10%",right:"-10%",width:"40%",height:"40%",background:"rgba(120,53,15,0.04)",filter:"blur(120px)",borderRadius:"50%"}}/>
        </div>

        {/* FORM */}
        <div className="form-scroll" style={{position:"relative",zIndex:1,flex:1,overflowY:"auto",minWidth:0}}>
          <div style={{width:"calc(100% + 16px)",margin:"0 0 0 -16px",padding:"12px 8px 12px 16px"}}>

            {analyzeError&&(
              <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"12px",padding:"12px 16px",borderRadius:"12px",border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.05)",color:"#f87171"}}>
                <Icon name="AlertCircle" size={16}/>
                <span style={{fontSize:"12px",fontWeight:600,flex:1}}>{analyzeError}</span>
                <button onClick={()=>setAnalyzeError(null)}><Icon name="X" size={14}/></button>
              </div>
            )}

            <OcrSummaryBadge form={form} ocrFields={ocrFields}/>

            <div className="steps-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginBottom:"16px"}}>
              {STEPS.map(s=>{
                const isActive=s.id===step, isDone=s.id<step;
                return (
                  <button key={s.id} onClick={()=>setStep(s.id)}
                    className={`relative flex flex-col p-3 sm:p-4 rounded-2xl border transition-all duration-500 overflow-hidden text-left
                      ${isActive?"bg-blue-950/40 border-blue-500/70 shadow-[0_0_24px_rgba(59,130,246,0.25),inset_0_1px_0_rgba(59,130,246,0.15)]":"bg-slate-900/20 border-slate-700/60 hover:border-slate-600 hover:bg-slate-900/30"}`}>
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className={`p-1.5 sm:p-2 rounded-lg ${isActive?"bg-blue-500/15 text-blue-400":isDone?"text-blue-500/40":"text-slate-600"}`}>
                        <Icon name={s.icon} size={14}/>
                      </div>
                      <span className={`text-[9px] sm:text-[10px] font-bold ${isActive?"text-blue-400":"text-slate-600"}`}>0{s.id}</span>
                    </div>
                    <p className={`text-[10px] sm:text-[11px] font-black tracking-widest uppercase mb-0.5 ${isActive?"text-white":"text-slate-400"}`}>{s.label}</p>
                    <p className={`hidden sm:block text-[9px] font-medium tracking-wider uppercase opacity-60 ${isActive?"text-blue-300":"text-slate-600"}`}>{s.sub}</p>
                    {isActive&&<div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent"/>}
                    {isDone&&<Icon name="CheckCircle2" size={12} className="absolute top-3 right-3 text-blue-500/40"/>}
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <div className="absolute -inset-0.5 bg-gradient-to-b from-slate-700/20 to-transparent rounded-[2rem] blur opacity-20"/>
              <div className="relative bg-[#0a0d14] border border-slate-800/80 rounded-[2rem] p-5 sm:p-8 shadow-2xl">

                {step===1&&(
                  <div className="space-y-10">
                    <InfoBox color="amber" icon="AlertCircle" title="Critical Protocol" text="Most traders fail due to impulsive entry. Use this module to force cognitive friction between the impulse and the execution."/>
                    <section className="space-y-6">
                      <SectionHeader icon="Lightbulb" title="Core Thesis"/>
                      {lf("Trade Thesis","thesis",4,"Example: Price broke key resistance at 1.0850...")}
                      <div className={g2}>
                        <InfoBox color="blue"  icon="Target" title="Objective" text="Clarity of thought. If you can't articulate your edge in 2-3 sentences, you don't have one."/>
                        <InfoBox color="green" icon="Zap"    title="Edge"      text="Defines your systematic advantage. Separates disciplined entries from random impulse trades."/>
                      </div>
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="Zap" title="Execution Trigger"/>
                      {lf("Entry Trigger","trigger",3,"Example: 15M engulfing candle close above 1.0850...")}
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="Shield" title="Defensive Overlay"/>
                      {lf("Invalidation Logic","invalidationLogic",3,"Example: If price closes below 1.0830...")}
                      {lf("Expected Behavior","expectedBehavior",3,"Example: Expect immediate bullish momentum...")}
                    </section>
                    <section className="space-y-6">
                      <SectionHeader icon="Battery" title="Pre-Entry State Check"/>
                      <div className={g2}>
                        <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                          {sc("Energy Level","energyLevel")}{sc("Focus Level","focusLevel")}{sc("Confidence at Entry","confidenceAtEntry")}
                          {ls("External Distraction","externalDistraction",["No","Yes"])}
                        </div>
                        <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                          {lf("Open Trades Count","openTradesCount",undefined,"0","number")}
                          {lf("Total Risk Open (%)","totalRiskOpen",undefined,"2.5","number")}
                          {ls("Correlated Exposure","correlatedExposure",["No","Yes"])}
                        </div>
                      </div>
                    </section>
                    <section className="space-y-6">
                      <SectionHeader icon="Layers" title="Classification & Quality"/>
                      <div className={g2}>
                        <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                          {lf("Strategy Version ID","strategyVersionId",undefined,"e.g., v2.1")}
                          {ls("Setup Tag","setupTag",["Breakout","Reversal","Continuation","Range Bound","Trend Following","Momentum","Pullback"])}
                        </div>
                        <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-5">
                          {ls("Trade Grade","tradeGrade",["A - Textbook","B - Solid","C - Acceptable","D - Marginal","F - Poor"])}
                        </div>
                      </div>
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="ShieldCheck" title="Rule Governance"/>
                      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                        <div className={g2}>
                          {ls("Setup Fully Valid","setupFullyValid",["Yes","No"])}
                          {ls("Any Rule Broken?","anyRuleBroken",["No","Yes"])}
                        </div>
                        {form.anyRuleBroken==="Yes"&&lf("Rule Broken","ruleBroken",undefined,"e.g., Risk > 2%")}
                      </div>
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="Brain" title="Impulse Control Check"/>
                      <InfoBox color="amber" icon="Flame" title="Red Flags" text="If ANY box below is checked — stop and reconsider before executing."/>
                      <div className={g2}>
                        {ck("Entering due to FOMO","impulseCheckFOMO")}
                        {ck("Revenge trading after a loss","impulseCheckRevenge")}
                        {ck("Trading out of boredom","impulseCheckBored")}
                        {ck("Emotionally compromised","impulseCheckEmotional")}
                      </div>
                    </section>
                    <NavButtons step={step} onPrev={()=>setStep(s=>s-1)} onNext={()=>setStep(s=>s+1)}/>
                  </div>
                )}

                {step===2&&(
                  <div className="space-y-10">
                    <section className="space-y-4">
                      <SectionHeader icon="Camera" title="Trade Setup Screenshot"/>
                      <Upload field="screenshot" inputId="up-entry" value={form.screenshot} onChange={handleScreenshotUpload} label="Upload trade setup screenshot" sublabel="PNG · JPG · JForex replay-mode"/>
                      {analyzing&&(
                        <div style={{display:"flex",alignItems:"center",gap:"10px",marginTop:"8px",padding:"10px 14px",borderRadius:"12px",border:"1px solid rgba(52,211,153,0.3)",background:"rgba(52,211,153,0.05)",color:"#34d399"}}>
                          <Icon name="Activity" size={14}/>
                          <span style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>OCR v8 analyzing screenshot… extracting fields</span>
                        </div>
                      )}
                      {form.ocrConfidence && !analyzing && (
                        <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"6px",padding:"8px 14px",borderRadius:"10px",border:"1px solid rgba(52,211,153,0.2)",background:"rgba(52,211,153,0.04)"}}>
                          <Icon name="CheckCircle2" size={12} style={{color:"#34d399"}}/>
                          <span style={{fontSize:"10px",color:"#34d399",fontStyle:"italic"}}>
                            OCR complete · {ocrFields.size} fields extracted · confidence: {form.ocrConfidence}
                          </span>
                          {form.ocrValidation && (
                            <span style={{fontSize:"9px",color:"#64748b",marginLeft:"auto",fontStyle:"italic"}}>{form.ocrValidation}</span>
                          )}
                        </div>
                      )}
                    </section>

                    <section className="space-y-4">
                      <SectionHeader icon="Camera" title="Exit Chart Screenshot"/>
                      <InfoBox color="green" icon="Activity" title="Post-Trade Evidence" text="Upload the outcome screenshot — OCR will extract Closed P/L, achieved RR, and drawdown."/>
                      <Upload field="exitScreenshot" inputId="up-exit" value={form.exitScreenshot} onChange={handleScreenshotUpload} label="Upload exit chart" sublabel="Outcome screenshot · Win/Loss detection"/>
                    </section>

                    <section className="space-y-4">
                      <SectionHeader icon="Crosshair" title="Position Details"/>
                      <div className={g4}>
                        {lf("Instrument","instrument",undefined,"EURUSD")}
                        {ls("Pair Category","pairCategory",["Major","Minor","Exotic","Index","Crypto","Commodity"])}
                        {ls("Direction","direction",["Long","Short"])}
                        {lf("Lot Size","lotSize",undefined,"0.01")}
                        {lf("Entry Price","entryPrice",undefined,"0.00","number")}
                        {lf("Stop Loss","stopLoss",undefined,"0.00","number")}
                        {lf("SL Distance (Pips)","stopLossDistancePips",undefined,"0","number")}
                        {lf("Take Profit","takeProfit",undefined,"0.00","number")}
                        {lf("TP Distance (Pips)","takeProfitDistancePips",undefined,"0","number")}
                        {lf("Risk %","riskPercent",undefined,"1.0","number")}
                        {ls("Order Type","orderType",["Market","Limit","Stop","Stop-Limit"])}
                        {ls("Outcome","outcome",["Win","Loss","BE"])}
                      </div>
                    </section>

                    {(form.openingPrice || form.closingPrice) && (
                      <section className="space-y-4">
                        <SectionHeader icon="Target" title="Price Axis (OCR Coordinate Mapping)"/>
                        <InfoBox color="green" icon="Sparkles" title="Axis Calibration" text="Opening and closing prices are read directly from the chart's right-edge price axis using pixel-to-price linear interpolation (R²=1.0 on JForex charts)."/>
                        <div className={g2}>
                          {lf("Opening Price (SL axis)","openingPrice",undefined,"—")}
                          {lf("Closing Price (TP axis)","closingPrice",undefined,"—")}
                        </div>
                      </section>
                    )}

                    <section className="space-y-4">
                      <SectionHeader icon="Clock" title="Timing & Duration"/>
                      <div className={g4}>
                        {lf("Entry Time","entryTime",undefined,"","datetime-local")}
                        {lf("Exit Time","exitTime",undefined,"","datetime-local")}
                        {ls("Day of Week","dayOfWeek",["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"])}
                        {lf("Trade Duration","tradeDuration",undefined,"2h 30m")}
                      </div>
                    </section>

                    <section className="space-y-4">
                      <SectionHeader icon="LayoutGrid" title="Timeframe Analysis"/>
                      <div className={g3}>
                        {ls("Entry TF","entryTF",["1M","3M","5M","15M"])}
                        {ls("Analysis TF","analysisTF",["15M","30MIN","1HR","2HR","4HR"])}
                        {ls("Context TF","contextTF",["1W","1D","4HR"])}
                      </div>
                    </section>

                    <section className="space-y-4">
                      <SectionHeader icon="Zap" title="Entry & Management"/>
                      <div className={g3}>
                        {ls("Entry Method","entryMethod",["Market","Limit","Stop"])}
                        {lf("Exit Strategy","exitStrategy",undefined,"Describe exit approach")}
                        {ls("Management Type","managementType",["Rule-based","Discretionary","Hybrid"])}
                        {ls("Risk Heat","riskHeat",["Low","Medium","High"])}
                        {ck("Break-Even Applied","breakEvenApplied")}
                        {ck("Trailing Stop Applied","trailingStopApplied")}
                      </div>
                    </section>
                    <NavButtons step={step} onPrev={()=>setStep(s=>s-1)} onNext={()=>setStep(s=>s+1)}/>
                  </div>
                )}

                {step===3&&(
                  <div className="space-y-10">
                    <section className="space-y-4">
                      <SectionHeader icon="Boxes" title="Market Environment"/>
                      <div className={g4}>
                        {ls("Market Regime","marketRegime",["Trending","Ranging"])}
                        {ls("Trend Direction","trendDirection",["Bullish","Bearish","Sideways"])}
                        {ls("Volatility","volatilityState",["Low","Normal","High"])}
                        {ls("Liquidity","liquidity",["Low","Normal","High"])}
                        {ls("News Environment","newsEnvironment",["Clear","Minor","Major"])}
                        {ls("Session Phase","sessionPhase",["Open","Mid","Close"])}
                        {lf("ATR at Entry","atrAtEntry",undefined,"0.0045","number")}
                      </div>
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="Layers3" title="Timeframe Context"/>
                      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                        <div className={g2}>
                          {ls("HTF Bias","htfBias",["Bull","Bear","Range"])}
                          {ls("HTF Key Level Present","htfKeyLevelPresent",["Yes","No"])}
                          {ls("Trend Alignment","trendAlignment",["Yes","No"])}
                          {ls("MTF Alignment","multitimeframeAlignment",["Yes","No"])}
                        </div>
                        {lf("Higher TF Context","higherTFContext",2,"Higher timeframe analysis...")}
                        {lf("Analysis TF Context","analysisTFContext",2,"Analysis timeframe context...")}
                        {lf("Entry TF Context","entryTFContext",2,"Entry timeframe context...")}
                        {lf("Other Confluences","otherConfluences",2,"Additional confluences...")}
                      </div>
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="Target" title="Liquidity & Bias"/>
                      {lf("Liquidity Targets","liquidityTargets",3,"Major liquidity pools, stop hunts...")}
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="Clock" title="Session Timing"/>
                      <div className={g3}>
                        {lf("Entry Time (UTC)","entryTimeUTC",undefined,"","time")}
                        {ls("Session","sessionName",["London","New York","Tokyo","Sydney","Overlap"])}
                        {ls("Timing Context","timingContext",["Impulse","Correction","Consolidation"])}
                      </div>
                    </section>
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <SectionHeader icon="Gauge" title="Setup Quality Scores"/>
                        <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-4">
                          {sc("Market Alignment","marketAlignment")}{sc("Setup Clarity","setupClarity")}
                          {sc("Entry Precision","entryPrecision")}{sc("Confluence","confluence")}{sc("Timing Quality","timingQuality")}
                        </div>
                      </div>
                      <div className="space-y-8">
                        <div className="space-y-4">
                          <SectionHeader icon="Activity" title="Technical Signals"/>
                          <div className="space-y-4">
                            {lf("Candle Pattern","candlePattern",undefined,"e.g., Engulfing")}
                            {lf("Indicator State","indicatorState",undefined,"e.g., RSI 70")}
                            {lf("Primary Signals","primarySignals",2,"Main confirmations")}
                            {lf("Secondary Signals","secondarySignals",2,"Supporting factors")}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <SectionHeader icon="Target" title="Key Level Analysis"/>
                          <div className="space-y-4">
                            {ls("Key Level Respect","keyLevelRespect",["Yes","No","Partial"])}
                            {ls("Key Level Type","keyLevelType",["Support","Resistance","Pivot","Fib Level"])}
                            {ls("Momentum Validity","momentumValidity",["Strong","Moderate","Weak"])}
                            {ls("Target Logic Clarity","targetLogicClarity",["High","Medium","Low"])}
                          </div>
                        </div>
                      </div>
                    </section>
                    <NavButtons step={step} onPrev={()=>setStep(s=>s-1)} onNext={()=>setStep(s=>s+1)}/>
                  </div>
                )}

                {step===4&&(
                  <div className="space-y-10">
                    <section className="space-y-4">
                      <SectionHeader icon="DoorOpen" title="Exit Causation"/>
                      {ls("Primary Exit Reason","primaryExitReason",["Target Hit","Stop Hit","Time Exit","Structure Change","News","Emotional Exit"])}
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="TrendingUp" title="Performance Data"/>
                      <div className={g4}>
                        {lf("Pips / Points Gained-Lost","pipsGainedLost",undefined,"0","number")}
                        {lf("P&L Amount ($)","profitLoss",undefined,"0.00","number")}
                        {lf("Account Balance","accountBalance",undefined,"0.00","number")}
                        {lf("Commission / Fees","commission",undefined,"3.50","number")}
                      </div>
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="Target" title="Planning vs Execution"/>
                      <div className={g3}>
                        {lf("Planned Entry","plannedEntry",undefined,"0.00","number")}
                        {lf("Planned SL","plannedSL",undefined,"0.00","number")}
                        {lf("Planned TP","plannedTP",undefined,"0.00","number")}
                        {lf("Actual Entry","actualEntry",undefined,"0.00","number")}
                        {lf("Actual SL","actualSL",undefined,"0.00","number")}
                        {lf("Actual TP","actualTP",undefined,"0.00","number")}
                      </div>
                    </section>
                    <section className="space-y-4">
                      <SectionHeader icon="Activity" title="Trade Metrics"/>
                      <div className={g3}>
                        {lf("MAE (Max Adverse Excursion)","mae",undefined,"-15 pts")}
                        {lf("MFE (Max Favorable Excursion)","mfe",undefined,"+45 pts")}
                        {lf("Monetary Risk ($)","monetaryRisk",undefined,"0.00","number")}
                        {lf("Potential Reward ($)","potentialReward",undefined,"0.00","number")}
                        {lf("Planned R:R","plannedRR",undefined,"1:2")}
                        {lf("Achieved R:R","achievedRR",undefined,"1:1.5")}
                      </div>
                    </section>
                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-2 space-y-8">
                        <div className="space-y-4">
                          <SectionHeader icon="BrainCircuit" title="Psychological State"/>
                          <div className={g3}>
                            {ls("Emotional State","emotionalState",["Calm","Anxious","FOMO","Confident","Fearful","Neutral"])}
                            {ls("Focus / Stress","focusStressLevel",["Low","Medium","High"])}
                            {lf("Rules Followed %","rulesFollowed",undefined,"100","number")}
                            {lf("Confidence (1–5)","confidenceLevel",undefined,"3","number")}
                            {ls("Post-Trade Emotion","postTradeEmotion",["Neutral","Relieved","Euphoric","Frustrated","Regretful","Calm","Anxious"])}
                            {ck("Recency bias (influenced by last trade)","recencyBiasFlag")}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <SectionHeader icon="CheckCircle2" title="Trade Assessment"/>
                          <div className="space-y-4">
                            {ck("Worth Repeating This Setup","worthRepeating")}
                            {lf("Additional Notes","notes",3,"Any other observations...")}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <SectionHeader icon="Microscope" title="Trade Reflections"/>
                        <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-5 space-y-5">
                          <div>
                            <p className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-500/80 mb-3">What Worked</p>
                            <textarea rows={3} className={INPUT_CLS} placeholder="What did you execute well?" value={form.whatWorked} onChange={(e: any)=>set("whatWorked",e.target.value)}/>
                          </div>
                          <div>
                            <p className="text-[10px] font-black tracking-[0.2em] uppercase text-rose-500/80 mb-3">What Failed</p>
                            <textarea rows={3} className={INPUT_CLS} placeholder="What went wrong?" value={form.whatFailed} onChange={(e: any)=>set("whatFailed",e.target.value)}/>
                          </div>
                          <div>
                            <p className="text-[10px] font-black tracking-[0.2em] uppercase text-blue-500/80 mb-3">Future Adjustments</p>
                            <textarea rows={3} className={INPUT_CLS} placeholder="What will you change next time?" value={form.adjustments} onChange={(e: any)=>set("adjustments",e.target.value)}/>
                          </div>
                        </div>
                      </div>
                    </section>
                    <NavButtons step={step} onPrev={()=>setStep(s=>s-1)} onNext={saveJournalEntry}/>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>

        {/* SIDEBAR desktop */}
        <div className="sidebar-panel side-scroll">
          <div style={{padding:"12px",borderBottom:"1px solid rgba(51,65,85,0.35)",background:"#07090f"}}>
            <div style={{background:"rgba(10,13,20,0.9)",border:"1px solid rgba(59,130,246,0.25)",borderRadius:"16px",padding:"14px 16px",height:"94px",boxSizing:"border-box",display:"flex",flexDirection:"column",justifyContent:"space-between",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(59,130,246,0.06),transparent)",borderRadius:"16px",pointerEvents:"none"}}/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:"9px",fontWeight:900,letterSpacing:"0.25em",textTransform:"uppercase",color:"#475569"}}>SESSION</span>
                <div style={{width:"6px",height:"6px",borderRadius:"50%",background:trades.length>0?"#34d399":"#1e3a5f",boxShadow:trades.length>0?"0 0 6px #34d399":"none",transition:"all 0.3s"}}/>
              </div>
              <div>
                <div style={{display:"flex",alignItems:"flex-end",gap:"6px"}}>
                  <span style={{fontSize:"17px",fontWeight:400,fontFamily:"'JetBrains Mono', monospace",color:"#e2e8f0",lineHeight:1}}>{trades.length}</span>
                  <span style={{fontSize:"11px",fontWeight:700,color:"#475569",marginBottom:"2px"}}>{trades.length===1?"TRADE":"TRADES"}</span>
                </div>
                <div style={{marginTop:"4px",height:"2px",borderRadius:"2px",background:"rgba(51,65,85,0.4)",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:"2px",background:"linear-gradient(90deg,#3b82f6,#1d4ed8)",width:`${Math.min((trades.length/10)*100,100)}%`,transition:"width 0.4s ease"}}/>
                </div>
              </div>
            </div>
          </div>
          <SidebarContent trades={trades}/>
        </div>

        {/* FAB mobile */}
        <button className="sidebar-fab" onClick={()=>setSidebarOpen(true)}
          style={{display:"none",position:"fixed",bottom:"24px",right:"20px",zIndex:50,alignItems:"center",gap:"8px",padding:"12px 18px",borderRadius:"16px",background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",border:"none",cursor:"pointer",boxShadow:"0 8px 32px rgba(59,130,246,0.35)",color:"#fff",fontSize:"11px",fontWeight:900,letterSpacing:"0.15em"}}>
          <Icon name="BarChart2" size={16}/>
          STATS
          {trades.length>0&&<span style={{background:"rgba(255,255,255,0.2)",borderRadius:"8px",padding:"2px 7px",fontSize:"10px",fontWeight:900}}>{trades.length}</span>}
        </button>

        {/* Mobile drawer */}
        {sidebarOpen&&(
          <div className="sidebar-drawer">
            <div className="sidebar-drawer-backdrop" onClick={()=>setSidebarOpen(false)}/>
            <div className="sidebar-drawer-panel side-scroll">
              <div style={{padding:"16px",borderBottom:"1px solid rgba(51,65,85,0.35)",background:"#07090f",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:2}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <Icon name="BarChart2" size={16} style={{color:"#3b82f6"}}/>
                  <span style={{fontSize:"11px",fontWeight:900,letterSpacing:"0.2em",textTransform:"uppercase",color:"#cbd5e1"}}>Session Stats</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",background:trades.length>0?"#34d399":"#1e3a5f",boxShadow:trades.length>0?"0 0 6px #34d399":"none"}}/>
                    <span style={{fontSize:"12px",fontWeight:900,fontFamily:"monospace",color:"#e2e8f0"}}>{trades.length} {trades.length===1?"trade":"trades"}</span>
                  </div>
                  <button onClick={()=>setSidebarOpen(false)} style={{padding:"6px",borderRadius:"10px",background:"rgba(51,65,85,0.3)",border:"1px solid rgba(51,65,85,0.5)",cursor:"pointer",color:"#94a3b8",display:"flex"}}>
                    <Icon name="X" size={14}/>
                  </button>
                </div>
              </div>
              <SidebarContent trades={trades}/>
            </div>
          </div>
        )}

        {/* Save modal */}
        {saved&&(
          <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"rgba(5,7,10,0.92)",backdropFilter:"blur(8px)"}}>
            <div style={{background:"#0a0d14",border:"1px solid rgba(51,65,85,0.5)",borderRadius:"2rem",padding:"40px",maxWidth:"360px",width:"100%",textAlign:"center",boxShadow:"0 25px 50px rgba(0,0,0,0.5)"}}>
              <div style={{width:"80px",height:"80px",borderRadius:"1.5rem",background:"rgba(30,41,59,0.5)",border:"1px solid rgba(51,65,85,0.5)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px"}}>
                <Icon name="CheckCircle2" size={36} style={{color:"#34d399",opacity:0.8}}/>
              </div>
              <h3 style={{fontSize:"13px",fontWeight:900,letterSpacing:"0.4em",color:"#cbd5e1",textTransform:"uppercase",marginBottom:"12px"}}>Trade Logged</h3>
              <p style={{fontSize:"13px",color:"#64748b",fontFamily:"monospace",lineHeight:1.6,marginBottom:"32px"}}>
                OCR-extracted data and manual annotations recorded.
              </p>
              <button onClick={()=>{setForm(INIT);setStep(1);setSaved(false);setOcrFields(new Set());}}
                style={{width:"100%",padding:"12px 32px",borderRadius:"12px",fontSize:"11px",fontWeight:900,letterSpacing:"0.15em",color:"#fff",border:"none",cursor:"pointer",background:"linear-gradient(135deg,#3b82f6,#1d4ed8)"}}>
                CONTINUE TRADING
              </button>
            </div>
          </div>
        )}

        {saving&&(
          <div style={{position:"fixed",inset:0,zIndex:199,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(5,7,10,0.6)",backdropFilter:"blur(4px)"}}>
            <div style={{background:"#0a0d14",border:"1px solid rgba(59,130,246,0.3)",borderRadius:"1.5rem",padding:"32px 40px",textAlign:"center"}}>
              <Icon name="Activity" size={28} style={{color:"#3b82f6",margin:"0 auto 12px",display:"block"}}/>
              <p style={{fontSize:"11px",fontWeight:900,letterSpacing:"0.2em",color:"#cbd5e1",textTransform:"uppercase"}}>Saving trade…</p>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
