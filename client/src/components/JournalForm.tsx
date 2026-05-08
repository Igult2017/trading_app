import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSessionBalance } from "@/hooks/useSessionBalance";
import { calcDollarRisk } from "@/lib/tradeCalculations";

// ─── Obsidian font isolation (scoped, beats any global !important) ────────────
const OBS_CSS = `
  .obs-jf,
  .obs-jf *,
  .obs-jf input,
  .obs-jf textarea,
  .obs-jf select,
  .obs-jf button,
  .obs-jf label,
  .obs-jf span,
  .obs-jf p,
  .obs-jf div,
  .obs-jf a,
  .obs-jf h1, .obs-jf h2, .obs-jf h3, .obs-jf h4, .obs-jf h5, .obs-jf h6,
  .obs-jf [class*="font-"] {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
                 "Liberation Mono", "Courier New", monospace !important;
    box-sizing: border-box;
  }
  .obs-jf input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; outline: none; cursor: pointer; width: 100%; }
  .obs-jf input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 99px; background: linear-gradient(to right, #4e8cff var(--pct, 50%), #27272a var(--pct, 50%)); }
  .obs-jf input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #4e8cff; cursor: pointer; border: 2px solid #0c0c0e; box-shadow: 0 0 0 1px rgba(78,140,255,0.4); margin-top: -4px; }
  .obs-jf input[type=range]::-moz-range-track { height: 4px; border-radius: 99px; background: #27272a; }
  .obs-jf input[type=range]::-moz-range-progress { height: 4px; border-radius: 99px; background: #4e8cff; }
  .obs-jf input[type=range]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #4e8cff; cursor: pointer; border: 2px solid #0c0c0e; box-sizing: border-box; }
  .obs-jf select option { background: #0c0c0e; color: #e4e4e7; }
  .obs-jf textarea::placeholder, .obs-jf input::placeholder { opacity: 0.35; }
  .obs-jf .obs-scrollbar::-webkit-scrollbar { width: 2px; }
  .obs-jf .obs-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .obs-jf .obs-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
  .obs-jf .no-scrollbar::-webkit-scrollbar { display: none; }
  .obs-jf .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;

// ─── Monthly stats computation (prop-firm carry-over model) ──────────────────
function entryToStat(e: any) {
  const raw = (e.outcome || "").toLowerCase();
  const outcome = raw === "win" ? "Win" : raw === "loss" ? "Loss" : "BE";
  const pnl = parseFloat(e.profitLoss) || 0;
  const dir = (e.direction || "").toLowerCase();
  const direction = dir === "long" ? "Long" : "Short";
  const commission = parseFloat((e.manualFields as any)?.commission ?? (e.commission ?? 0)) || 0;
  const balance = parseFloat(e.accountBalance) || 0;
  const achievedRR = e.riskReward ? String(e.riskReward) : String((e.manualFields as any)?.achievedRR ?? "");
  return { outcome, pnl, direction, commission, balance, achievedRR };
}

const fmtUsd = (n: number) => (n >= 0 ? "+" : "-") + "$" + Math.abs(n).toFixed(2);

const _MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function computeMonthlyStats(allEntries: any[], startingBalance: number) {
  const sb = startingBalance > 0 ? startingBalance : 10000;

  // Group entries by "YYYY-MM" using best available date field
  const groups: Map<string, any[]> = new Map();
  for (const e of allEntries) {
    const raw = e.entryTime || e.exitTime || e.createdAt;
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const sortedKeys = Array.from(groups.keys()).sort();

  // Walk chronologically applying prop-firm rules:
  //   • Profits are withdrawn → next month starts at sb (carriedDeficit → 0)
  //   • Losses accumulate as carried deficit → next month starts at sb − deficit
  let carriedDeficit = 0;
  const monthData: Map<string, any> = new Map();

  for (const key of sortedKeys) {
    const entries = groups.get(key)!;
    const carriedDeficitIn = carriedDeficit;
    const effectiveStart   = sb - carriedDeficit;

    const trades      = entries.map(entryToStat);
    const commissions = trades.reduce((a, t) => a + t.commission, 0);
    const pnlSum      = trades.reduce((a, t) => a + t.pnl,        0);
    const netPnL      = pnlSum - commissions;
    const effectiveEnd = effectiveStart + netPnL;

    let newCarriedDeficit: number;
    let withdrawn: number;
    if (effectiveEnd >= sb) {
      withdrawn        = effectiveEnd - sb;
      newCarriedDeficit = 0;
    } else {
      withdrawn        = 0;
      newCarriedDeficit = sb - effectiveEnd;
    }

    const wins     = trades.filter(t => t.outcome === "Win");
    const losses   = trades.filter(t => t.outcome === "Loss");
    const grossWin  = wins.reduce((a, t) => a + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
    const pf        = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
    const winRate   = trades.length ? (wins.length / trades.length) * 100 : 0;
    const growth    = effectiveStart > 0 ? ((effectiveEnd - effectiveStart) / effectiveStart) * 100 : 0;
    const rrTs      = trades.filter(t => t.achievedRR);
    const avgRR     = rrTs.length ? rrTs.reduce((a, t) => a + (parseFloat(t.achievedRR) || 0), 0) / rrTs.length : 0;
    const avgWin    = wins.length   ? grossWin  / wins.length   : 0;
    const avgLoss   = losses.length ? grossLoss / losses.length : 0;
    const exp       = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;
    const pnls      = trades.map(t => t.pnl);

    monthData.set(key, {
      netPnL, winRate, wins: wins.length, losses: losses.length, total: trades.length,
      profitFactor: pf.toFixed(2), commissions,
      startBalance: effectiveStart, endBalance: effectiveEnd, growth,
      avgRR: avgRR.toFixed(2), expectancy: exp.toFixed(2),
      buys:       trades.filter(t => t.direction === "Long").length,
      sells:      trades.filter(t => t.direction === "Short").length,
      bestTrade:  pnls.length ? Math.max(...pnls) : 0,
      worstTrade: pnls.length ? Math.min(...pnls) : 0,
      carriedDeficitIn, carriedDeficit: newCarriedDeficit, withdrawn,
    });

    carriedDeficit = newCarriedDeficit;
  }

  return { monthData, sortedKeys };
}

// ─── Obsidian primitives ──────────────────────────────────────────────────────
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 pb-3 mb-5 border-b border-[#18181b]">
    <div className="w-[2px] h-3 bg-[#4e8cff] flex-shrink-0" />
    <h3 className="text-[10px] uppercase tracking-[0.3em] font-bold text-[#4e8cff]">{children as any}</h3>
  </div>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[9px] uppercase tracking-[0.25em] font-bold text-[#3f3f46] mb-1.5">{children as any}</div>
);

const Txt = ({ label, value, onChange, placeholder, rows = 3, danger }: any) => (
  <div className="group space-y-1.5">
    <label className={`text-[9px] uppercase tracking-[0.25em] font-bold text-[#3f3f46] ${danger ? "group-focus-within:text-rose-500" : "group-focus-within:text-white"} transition-colors`}>{label}</label>
    <textarea rows={rows} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder || ""}
      className={`w-full bg-[#0c0c0e] border border-[#18181b] ${danger ? "focus:border-rose-500/30" : "focus:border-[#4e8cff]/50"} p-3 rounded-sm outline-none text-[#e4e4e7] placeholder:text-[#3f3f46] text-xs leading-relaxed transition-all resize-none`}
    />
  </div>
);

const Inp = ({ label, type = "text", value, onChange, placeholder, readOnly }: any) => (
  <div className="group space-y-1.5">
    {label && <label className="text-[9px] uppercase tracking-[0.25em] font-bold text-[#3f3f46] group-focus-within:text-white transition-colors">{label}</label>}
    <input type={type} value={value ?? ""} onChange={e => onChange?.(e.target.value)} placeholder={placeholder || ""} readOnly={readOnly}
      className="w-full bg-[#0c0c0e] border border-[#18181b] focus:border-[#4e8cff]/50 px-3 py-2 rounded-sm outline-none text-[#e4e4e7] placeholder:text-[#3f3f46] text-xs transition-all"
    />
  </div>
);

const OBS_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%233f3f46' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`;

function Sel({ label, options, value, onChange }: any) {
  const notInList = value && !options.includes(value);
  const [other, setOther] = useState(notInList);
  useEffect(() => {
    if (value && !options.includes(value)) setOther(true);
    else if (options.includes(value)) setOther(false);
  }, [value, options.join(",")]);

  const selVal = other ? "Other" : (options.includes(value) ? value : "");

  return (
    <div className="group space-y-1.5">
      {label && <label className="text-[9px] uppercase tracking-[0.25em] font-bold text-[#3f3f46] group-focus-within:text-white transition-colors">{label}</label>}
      {other ? (
        <div className="flex gap-1">
          <input autoFocus type="text" value={value || ""} placeholder="Type custom value…"
            onChange={e => { const v = e.target.value; if (!v) { setOther(false); onChange(options[0]||""); } else onChange(v); }}
            className="flex-1 bg-[#0c0c0e] border border-[#4e8cff]/40 px-3 py-2 rounded-sm outline-none text-[#e4e4e7] text-xs"
          />
          <button type="button" onClick={() => { setOther(false); onChange(options[0]||""); }}
            className="px-2 py-2 bg-[#0c0c0e] border border-[#18181b] rounded-sm text-[#3f3f46] hover:text-white text-xs">↩</button>
        </div>
      ) : (
        <select value={selVal} onChange={e => { const v = e.target.value; if (v === "Other") { setOther(true); onChange(""); } else onChange(v); }}
          className="w-full bg-[#0c0c0e] border border-[#18181b] focus:border-[#4e8cff]/50 px-3 py-2 rounded-sm outline-none text-[#e4e4e7] text-xs transition-all appearance-none cursor-pointer"
          style={{ backgroundImage: OBS_ARROW, backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center", paddingRight:28 }}
        >
          <option value="">— select —</option>
          {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
          <option value="Other">Other…</option>
        </select>
      )}
    </div>
  );
}

const Radio = ({ label, options, value, onChange }: any) => (
  <div className="space-y-1.5">
    <FieldLabel>{label}</FieldLabel>
    <div className="flex flex-wrap gap-1.5">
      {options.map((o: string) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`px-3 py-1.5 text-[11px] border rounded-sm transition-all ${value === o
            ? "bg-[#4e8cff]/10 border-[#4e8cff]/70 text-[#4e8cff] font-bold"
            : "bg-[#0c0c0e] border-[#27272a] text-[#71717a] hover:border-[#4e8cff]/30 hover:text-[#a1a1aa]"}`}
        >{o}</button>
      ))}
    </div>
  </div>
);

const Dots = ({ name, value = 0, onChange, max = 5 }: any) => (
  <div className="flex items-center gap-4 py-1.5 border-b border-[#18181b]/60 last:border-0">
    <span className="text-[11px] text-[#71717a] min-w-[170px] flex-shrink-0">{name}</span>
    <div className="flex gap-1.5">
      {Array.from({ length: max }).map((_, i) => (
        <button key={i} type="button" onClick={() => onChange(i + 1)}
          className={`w-4 h-4 rounded-full border transition-all ${i < value ? "bg-[#4e8cff] border-[#4e8cff]" : "bg-[#0c0c0e] border-[#27272a] hover:border-[#4e8cff]/50"}`}
        />
      ))}
    </div>
  </div>
);

const Slider = ({ label, min = 1, max = 5, step = 1, value, onChange, suffix = "" }: any) => {
  const v = value ?? min;
  const pct = ((v - min) / (max - min)) * 100;
  return (
  <div className="space-y-1.5">
    <FieldLabel>{label}</FieldLabel>
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 cursor-pointer"
        style={{ '--pct': `${pct}%` } as React.CSSProperties} />
      <span className="text-xs font-bold text-[#4e8cff] min-w-[36px] text-right">{v}{suffix}</span>
    </div>
  </div>
  );
};

const InfoBox = ({ children }: { children: React.ReactNode }) => (
  <div className="p-4 border-l-2 border-[#4e8cff]/30 bg-[#4e8cff]/[0.04] mb-5">
    <p className="text-[11px] text-[#5fb391] leading-relaxed tracking-tight">
      <span className="text-[#4e8cff]/50 mr-2 select-none">//</span>{children as any}
    </p>
  </div>
);

const Strip = ({ children }: { children: React.ReactNode }) => (
  <div className="p-3 border-l-2 border-rose-500/50 bg-rose-500/[0.04] mb-4 flex items-center gap-2">
    <span className="text-rose-500/60 text-[10px] font-bold select-none flex-shrink-0">!!</span>
    <p className="text-[11px] text-rose-400/70 tracking-tight">{children as any}</p>
  </div>
);

const Checkbox = ({ label, checked, onChange }: any) => (
  <label className="flex items-center gap-3 cursor-pointer group py-2 px-3 hover:bg-[#0c0c0e] border border-transparent hover:border-[#18181b] rounded-sm transition-all">
    <div className="w-4 h-4 border border-[#3f3f46] rounded-sm bg-[#09090b] flex-shrink-0 flex items-center justify-center group-hover:border-[#4e8cff]/50 transition-colors relative">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
      {checked && <span className="text-[9px] text-[#4e8cff] font-bold leading-none pointer-events-none">✓</span>}
    </div>
    <span className="text-[11px] font-bold text-[#71717a] group-hover:text-[#a1a1aa] transition-colors uppercase tracking-widest">{label}</span>
  </label>
);

// ─── StickyChip — pin a value for the whole session ──────────────────────────
function StickyChip({ storageKey, label, value, options, onChoose }: {
  storageKey: string; label: string; value: string; options?: string[]; onChoose: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [typingCustom, setTypingCustom] = useState(false);
  const [sticky, setSticky] = useState<string>(() => {
    try { return sessionStorage.getItem(storageKey) || ""; } catch { return ""; }
  });

  // Re-fill the manual field whenever sticky exists but field is empty (e.g. after form reset)
  useEffect(() => {
    if (sticky && !value) onChoose(sticky);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sticky, value]);

  const apply = (raw: string) => {
    const v = (raw || "").trim();
    if (!v) return;
    try { sessionStorage.setItem(storageKey, v); } catch {}
    setSticky(v);
    setDraft("");
    setTypingCustom(false);
    onChoose(v);
  };

  const clear = () => {
    try { sessionStorage.removeItem(storageKey); } catch {}
    setSticky("");
    setTypingCustom(false);
    setDraft("");
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (!v) return;
    if (v === "__other__") {
      setTypingCustom(true);
      setDraft("");
    } else {
      apply(v);
    }
  };

  // Text-input row (used both when no options, and when "Other…" is chosen from the dropdown)
  const textInputRow = (
    <div className="flex gap-1">
      <input autoFocus type="text" placeholder="Type to pin…" value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); apply(draft); } }}
        className="flex-1 bg-[#0c0c0e] border border-[#4e8cff]/40 focus:border-[#4e8cff]/80 px-3 py-2 rounded-sm outline-none text-[#e4e4e7] text-xs transition-all"
      />
      {typingCustom && (
        <button type="button" onClick={() => { setTypingCustom(false); setDraft(""); }}
          className="px-2.5 py-2 bg-[#0c0c0e] border border-[#27272a] rounded-sm text-[#3f3f46] hover:text-white text-xs transition-all">↩</button>
      )}
      <button type="button" onClick={() => apply(draft)} disabled={!draft.trim()}
        className="px-2.5 py-2 bg-[#0c0c0e] border border-[#27272a] hover:border-[#4e8cff]/50 rounded-sm text-[#3f3f46] hover:text-[#4e8cff] disabled:opacity-30 text-xs transition-all">pin</button>
    </div>
  );

  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      {sticky ? (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#4e8cff]/10 border border-[#4e8cff]/40 rounded-sm">
          <span className="text-[11px] text-[#4e8cff] font-bold">{sticky}</span>
          <button type="button" onClick={clear}
            className="ml-1 text-[#4e8cff]/60 hover:text-rose-400 text-xs leading-none transition-colors">×</button>
        </div>
      ) : options && !typingCustom ? (
        <select value="" onChange={handleSelectChange}
          className="w-full bg-[#0c0c0e] border border-[#27272a] focus:border-[#4e8cff]/50 px-3 py-2 rounded-sm outline-none text-[#71717a] text-xs transition-all appearance-none cursor-pointer"
          style={{ backgroundImage: OBS_ARROW, backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center", paddingRight:28 }}
        >
          <option value="">Select to pin…</option>
          {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
          <option value="__other__">Other…</option>
        </select>
      ) : (
        textInputRow
      )}
      <div className="text-[8px] text-[#27272a] uppercase tracking-widest">
        {sticky ? "Auto-fills until removed" : "Pin once, reuse all session"}
      </div>
    </div>
  );
}

// ─── StickyTF — pin a timeframe select for the whole session ─────────────────
function StickyTF({ storageKey, label, options, value, onChange }: {
  storageKey: string; label: string; options: string[]; value: any; onChange: (v: any) => void;
}) {
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved && options.includes(saved) && saved !== value) onChange(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="group space-y-1.5">
      <label className="text-[9px] uppercase tracking-[0.25em] font-bold text-[#3f3f46] group-focus-within:text-white transition-colors">{label}</label>
      <select value={value || ""} onChange={e => { const v = e.target.value; try { sessionStorage.setItem(storageKey, v); } catch {} onChange(v); }}
        className="w-full bg-[#0c0c0e] border border-[#18181b] focus:border-[#4e8cff]/50 px-3 py-2 rounded-sm outline-none text-[#e4e4e7] text-xs transition-all appearance-none cursor-pointer"
        style={{ backgroundImage: OBS_ARROW, backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center", paddingRight:28 }}
      >
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── UploadBox — screenshot upload with OCR paste support ────────────────────
function UploadBox({ label, value, onChange, inputId, onPasteText, analyzing }: any) {
  const editRef = useRef<HTMLDivElement>(null);

  const handleFile = (e: any) => {
    const f = e.target.files[0];
    if (f) { const r = new FileReader(); r.onloadend = () => onChange(r.result as string); r.readAsDataURL(f); }
  };

  const applyPaste = useCallback((e: ClipboardEvent | React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from((e as any).clipboardData?.items ?? []);
    const img = (items as DataTransferItem[]).find(i => i.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      (e as any).stopImmediatePropagation?.();
      if (editRef.current) editRef.current.textContent = "";
      const f = img.getAsFile();
      if (f) { const r = new FileReader(); r.onloadend = () => onChange(r.result as string); r.readAsDataURL(f); }
      return true;
    }
    const text = (e as any).clipboardData?.getData("text/plain") ?? "";
    if (text.trim() && onPasteText) { onPasteText(text); if (editRef.current) editRef.current.blur(); return true; }
    return false;
  }, [onChange, onPasteText]);

  useEffect(() => {
    if (value) return;
    const handler = (e: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && active !== editRef.current) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (active.isContentEditable) return;
      }
      applyPaste(e);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [value, applyPaste]);

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className={`relative border border-dashed rounded-sm flex flex-col items-center justify-center gap-2 bg-[#0c0c0e] transition-all cursor-pointer overflow-hidden ${value ? "border-emerald-500/30 p-0" : "border-[#27272a] hover:border-[#4e8cff]/40 p-5"}`} style={{ height: "130px" }}>
        {!value && (
          <div ref={editRef} contentEditable suppressContentEditableWarning
            onPaste={applyPaste as any}
            onClick={() => document.getElementById(inputId)?.click()}
            onKeyDown={e => { if (!e.ctrlKey && !e.metaKey) e.preventDefault(); }}
            style={{ position:"absolute", inset:0, zIndex:10, opacity:0, outline:"none", cursor:"pointer" }}
          />
        )}
        <input type="file" id={inputId} accept="image/*" onChange={handleFile}
          style={{ position:"absolute", inset:0, opacity:0, cursor:"pointer", width:"100%", height:"100%" }} />
        {value ? (
          <div className="w-full h-full flex flex-col relative p-1.5" style={{ minHeight: 0 }}>
            <img src={value} alt="chart" className="w-full object-contain rounded-sm" style={{ flex: 1, minHeight: 0, maxHeight: "calc(100% - 28px)" }} />
            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-sm gap-1.5">
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4e8cff" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#4e8cff"/></svg>
                <span className="text-[9px] text-[#4e8cff] uppercase tracking-[0.15em]">Analyzing…</span>
              </div>
            )}
            {!analyzing && (
              <div className="flex gap-2 mt-1 flex-shrink-0" style={{ position: "relative", zIndex: 10, height: "22px" }}>
                <label htmlFor={inputId} className="flex-1 text-center text-[9px] text-[#4e8cff] border border-[#4e8cff]/30 rounded-sm py-0.5 cursor-pointer hover:bg-[#4e8cff]/5 transition-all leading-none flex items-center justify-center">↺ Replace</label>
                <button type="button" onClick={(e) => { e.stopPropagation(); onChange(null); }}
                  className="flex-1 text-[9px] text-rose-400 border border-rose-500/30 rounded-sm py-0.5 hover:bg-rose-500/5 transition-all leading-none flex items-center justify-center">✕ Remove</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <span className="text-[20px] text-[#3f3f46] leading-none select-none">↑</span>
            <span className="text-[9px] text-[#3f3f46] uppercase tracking-[0.2em]">click or paste screenshot</span>
            {analyzing && (
              <span className="flex items-center gap-1 text-[9px] text-[#4e8cff] mt-1">
                <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4e8cff" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#4e8cff"/></svg>
                Analyzing…
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Step 1 — Decision ────────────────────────────────────────────────────────
function Step1({ d, set, hiddenPanels }: any) {
  const f = (k: string) => (v: any) => set((prev: any) => ({ ...prev, [k]: v }));
  const H = hiddenPanels as string[];
  return (
    <div className="space-y-10">

      {!H.includes('core-thesis') && (
      <section>
        <SectionLabel>Core Thesis</SectionLabel>
        <InfoBox>Most traders fail due to impulsive entry. Use this module to force cognitive friction between the impulse and the execution.</InfoBox>
        <div className="space-y-4">
          <Txt label="Trade Thesis" value={d.thesis} onChange={f("thesis")} placeholder="What is the core reasoning behind this trade?" rows={3} />
          <Txt label="Entry Trigger" value={d.trigger} onChange={f("trigger")} placeholder="What specifically triggered your entry?" rows={2} />
          <Txt label="Invalidation Logic" value={d.invalidationLogic} onChange={f("invalidationLogic")} placeholder="What would make this setup invalid?" rows={2} danger />
          <Txt label="Expected Behavior" value={d.expectedBehavior} onChange={f("expectedBehavior")} placeholder="How do you expect price to move?" rows={2} />
        </div>
      </section>
      )}

      {!H.includes('pre-entry-state') && (
      <section>
        <SectionLabel>Pre-Entry State Check</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Slider label="Energy Level"         min={1} max={5} value={d.energyLevel}       onChange={f("energyLevel")}       suffix="/5" />
          <Slider label="Focus Level"          min={1} max={5} value={d.focusLevel}        onChange={f("focusLevel")}        suffix="/5" />
          <Slider label="Confidence at Entry" min={1} max={5} value={d.confidenceAtEntry} onChange={f("confidenceAtEntry")} suffix="/5" />
          <Radio label="External Distraction"  options={["No","Yes"]}       value={d.externalDistraction} onChange={f("externalDistraction")} />
          <Inp   label="Open Trades Count"     type="number" placeholder="0"   value={d.openTradesCount}    onChange={f("openTradesCount")} />
          <Inp   label="Total Risk Open %"     type="number" placeholder="2.0" value={d.totalRiskOpen}      onChange={f("totalRiskOpen")} />
          <Radio label="Correlated Exposure"   options={["No","Yes"]}       value={d.correlatedExposure}   onChange={f("correlatedExposure")} />
        </div>
      </section>
      )}

      {!H.includes('classification') && (
      <section>
        <SectionLabel>Classification &amp; Quality</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Inp label="Strategy" placeholder="e.g. ICT Breaker Block, M1H1…" value={d.strategyVersionId} onChange={f("strategyVersionId")} />
          <Sel label="Setup Tag" options={["Breakout","Reversal","Continuation","Range Bound","Trend Following","Momentum","Pullback"]} value={d.setupTag} onChange={f("setupTag")} />
          <StickyChip storageKey="fsd:stickyStrategy" label="Active Strategy"
            value={d.strategyVersionId} onChoose={v => set((prev: any) => ({ ...prev, strategyVersionId: v }))} />
          <StickyChip storageKey="fsd:stickySetup" label="Active Setup"
            options={["Breakout","Reversal","Continuation","Range Bound","Trend Following","Momentum","Pullback"]}
            value={d.setupTag} onChoose={v => set((prev: any) => ({ ...prev, setupTag: v }))} />
          <div className="lg:col-span-2">
            <Sel label="Trade Grade" options={["A - Textbook","B - Solid","C - Acceptable","D - Marginal","F - Poor"]} value={d.tradeGrade} onChange={f("tradeGrade")} />
          </div>
        </div>
      </section>
      )}

      {!H.includes('rule-governance') && (
      <section>
        <SectionLabel>Rule Governance</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Radio label="Setup Fully Valid" options={["Yes","No","Partial"]} value={d.setupFullyValid} onChange={f("setupFullyValid")} />
          <Radio label="Any Rule Broken?" options={["No","Yes"]}           value={d.anyRuleBroken}   onChange={f("anyRuleBroken")} />
          {d.anyRuleBroken === "Yes" && (
            <div className="lg:col-span-2">
              <Inp label="Which Rule?" placeholder="Describe the rule that was broken…" value={d.ruleBroken} onChange={f("ruleBroken")} />
            </div>
          )}
        </div>
      </section>
      )}

      {!H.includes('impulse-control') && (
      <section>
        <SectionLabel>Impulse Control Check</SectionLabel>
        <Strip>Flag any emotional or reactive impulses before committing to this trade.</Strip>
        <div className="space-y-1">
          <Checkbox label="Entering due to FOMO"           checked={d.impulseCheckFOMO}      onChange={f("impulseCheckFOMO")} />
          <Checkbox label="Revenge trading after a loss"   checked={d.impulseCheckRevenge}   onChange={f("impulseCheckRevenge")} />
          <Checkbox label="Trading out of boredom"         checked={d.impulseCheckBored}      onChange={f("impulseCheckBored")} />
          <Checkbox label="Emotionally compromised"        checked={d.impulseCheckEmotional}  onChange={f("impulseCheckEmotional")} />
        </div>
      </section>
      )}

    </div>
  );
}

// ─── Step 2 — Execution ───────────────────────────────────────────────────────
function Step2({ d, set, onScreenshotUpload, analyzing, currentBalance, hiddenPanels }: any) {
  const f = (k: string) => (v: any) => set((prev: any) => ({ ...prev, [k]: v }));
  const H = hiddenPanels as string[];

  const handleEntryTime = (v: string) => {
    const updates: any = { entryTime: v };
    if (v) {
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      updates.dayOfWeek = days[new Date(v).getDay()];
    }
    if (v && d.exitTime) {
      const diff = Math.round((new Date(d.exitTime).getTime() - new Date(v).getTime()) / 60000);
      if (diff > 0) updates.tradeDuration = diff >= 60 ? `${Math.floor(diff/60)}h ${diff%60}m` : `${diff}m`;
    }
    set((prev: any) => ({ ...prev, ...updates }));
  };

  const handleExitTime = (v: string) => {
    const updates: any = { exitTime: v };
    if (v && d.entryTime) {
      const diff = Math.round((new Date(v).getTime() - new Date(d.entryTime).getTime()) / 60000);
      if (diff > 0) updates.tradeDuration = diff >= 60 ? `${Math.floor(diff/60)}h ${diff%60}m` : `${diff}m`;
    }
    set((prev: any) => ({ ...prev, ...updates }));
  };

  const riskAmt = currentBalance > 0 && parseFloat(d.riskPercent) > 0
    ? (currentBalance * parseFloat(d.riskPercent) / 100).toFixed(2)
    : null;

  return (
    <div className="space-y-10">

      {!H.includes('screenshots') && (
      <section>
        <SectionLabel>Trade Screenshots</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <UploadBox label="Entry / Setup Screenshot" value={d.screenshot} inputId="obs-entry-ss"
            onChange={(v: any) => onScreenshotUpload("screenshot", v)}
            onPasteText={(t: any) => onScreenshotUpload("screenshot-text", t)}
            analyzing={analyzing} />
          <UploadBox label="Exit Chart Screenshot" value={d.exitScreenshot} inputId="obs-exit-ss"
            onChange={(v: any) => onScreenshotUpload("exitScreenshot", v)}
            onPasteText={(t: any) => onScreenshotUpload("exitScreenshot-text", t)}
            analyzing={analyzing} />
        </div>

        {/* Analysis status / error feedback */}
        {d.ocrValidation && (
          <div className="mt-3 flex items-start gap-2 rounded-sm border border-rose-500/30 bg-rose-500/5 px-3 py-2">
            <span className="text-rose-400 text-[11px] leading-tight mt-px">⚠</span>
            <span className="text-[11px] text-rose-300 leading-tight">{d.ocrValidation}</span>
          </div>
        )}
        {d.ocrConfidence && !d.ocrValidation && (
          <div className="mt-3 flex items-center gap-2 rounded-sm border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <span className="text-emerald-400 text-[11px]">✓</span>
            <span className="text-[11px] text-emerald-300">Extracted with <strong>{d.ocrConfidence}</strong></span>
          </div>
        )}
      </section>
      )}

      <section>
        <SectionLabel>Position Details</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Inp label="Instrument"           placeholder="EURUSD"   value={d.instrument}             onChange={f("instrument")} />
          <Sel label="Pair Category"        options={["Major","Minor","Exotic","Index","Crypto","Commodity"]} value={d.pairCategory} onChange={f("pairCategory")} />
          <Radio label="Direction"          options={["Long","Short"]}   value={d.direction}          onChange={f("direction")} />
          <Inp label="Lot Size"     type="number" placeholder="0.10"     value={d.lotSize}            onChange={f("lotSize")} />
          <Inp label="Entry Price"  type="number" placeholder="1.09250"  value={d.entryPrice}         onChange={f("entryPrice")} />
          <Inp label="Stop Loss"    type="number" placeholder="1.09100"  value={d.stopLoss}           onChange={f("stopLoss")} />
          <Inp label="SL Distance (Pips)" type="number" placeholder="15" value={d.stopLossDistancePips}  onChange={f("stopLossDistancePips")} />
          <Inp label="Take Profit"  type="number" placeholder="1.09600"  value={d.takeProfit}         onChange={f("takeProfit")} />
          <Inp label="TP Distance (Pips)" type="number" placeholder="35" value={d.takeProfitDistancePips} onChange={f("takeProfitDistancePips")} />
          <Inp label="Risk %"       type="number" placeholder="1.0"      value={d.riskPercent}        onChange={f("riskPercent")} />
          <Sel label="Order Type"   options={["Market","Limit","Stop","Stop-Limit"]} value={d.orderType} onChange={f("orderType")} />
          <Radio label="Outcome"    options={["Win","Loss","BE"]}         value={d.outcome}            onChange={f("outcome")} />
        </div>
        <div className="mt-4 flex gap-3 flex-wrap">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0c0c0e] border border-[#18181b] rounded-sm flex-1 min-w-[160px]">
            <span className="text-[8px] text-[#3f3f46] uppercase tracking-widest font-bold">Balance</span>
            <span className="text-xs text-white font-bold ml-auto">{currentBalance > 0 ? "$" + currentBalance.toFixed(2) : "—"}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0c0c0e] border border-[#18181b] rounded-sm flex-1 min-w-[160px]">
            <span className="text-[8px] text-[#3f3f46] uppercase tracking-widest font-bold">Risk Amount</span>
            <span className="text-xs text-rose-400 font-bold ml-auto">{riskAmt ? "-$" + riskAmt : "—"}</span>
          </div>
        </div>
      </section>

      {!H.includes('timing-duration') && (
      <section>
        <SectionLabel>Timing &amp; Duration</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Inp label="Entry Time" type="datetime-local" value={d.entryTime}     onChange={handleEntryTime} />
          <Inp label="Exit Time"  type="datetime-local" value={d.exitTime}      onChange={handleExitTime} />
          <Sel label="Day of Week" options={["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]} value={d.dayOfWeek} onChange={f("dayOfWeek")} />
          <Inp label="Trade Duration" placeholder="Auto-calculated" value={d.tradeDuration} onChange={f("tradeDuration")} />
        </div>
      </section>
      )}

      {!H.includes('tf-analysis') && (
      <section>
        <SectionLabel>Timeframe Analysis</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StickyTF storageKey="fsd:tf:entry"    label="Entry TF"    options={["1M","3M","5M","15M","30MIN"]}   value={d.entryTF}    onChange={f("entryTF")} />
          <StickyTF storageKey="fsd:tf:analysis" label="Analysis TF" options={["15M","30MIN","1HR","2HR","4HR"]} value={d.analysisTF} onChange={f("analysisTF")} />
          <StickyTF storageKey="fsd:tf:context"  label="Context TF"  options={["1W","1D","4HR"]}                 value={d.contextTF}  onChange={f("contextTF")} />
        </div>
      </section>
      )}

      {!H.includes('entry-management') && (
      <section>
        <SectionLabel>Entry &amp; Trade Management</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Sel label="Entry Method"    options={["Market","Limit","Stop"]}                     value={d.entryMethod}     onChange={f("entryMethod")} />
          <Inp label="Exit Strategy"   placeholder="e.g. Scale out at 1R, close at 2R"        value={d.exitStrategy}    onChange={f("exitStrategy")} />
          <Sel label="Management Type" options={["Rule-based","Discretionary","Hybrid"]}       value={d.managementType}  onChange={f("managementType")} />
          <Sel label="Risk Heat"       options={["Low","Medium","High"]}                        value={d.riskHeat}        onChange={f("riskHeat")} />
          <Inp label="Spread at Entry (Pips)" type="number" placeholder="1.2"                  value={d.spreadAtEntry}   onChange={f("spreadAtEntry")} />
          <Inp label="Strategy Version" placeholder="v2.3"                                      value={d.strategyVersionId2} onChange={f("strategyVersionId2")} />
        </div>
        <div className="mt-3 space-y-1">
          <Checkbox label="Break-Even Applied"   checked={d.breakEvenApplied}    onChange={f("breakEvenApplied")} />
          <Checkbox label="Trailing Stop Applied" checked={d.trailingStopApplied} onChange={f("trailingStopApplied")} />
        </div>
      </section>
      )}

    </div>
  );
}

// ─── Step 3 — Context ─────────────────────────────────────────────────────────
function Step3({ d, set, direction, regimeTouchedRef, trendTouchedRef, hiddenPanels }: any) {
  const lastDirectionRef = useRef<string | null>(null);
  const htfTouchedRef = useRef(false);

  useEffect(() => {
    if (lastDirectionRef.current === direction) return;
    lastDirectionRef.current = direction;
    const derived = direction === "Short" ? "Bear" : "Bull";
    set((prev: any) => ({
      ...prev,
      ...(!regimeTouchedRef.current ? { marketRegime: derived === "Bull" ? "Bullish" : "Bearish" } : {}),
      ...(!trendTouchedRef.current  ? { trendDirection: derived === "Bull" ? "Bullish" : "Bearish" } : {}),
      ...(!htfTouchedRef.current ? { htfBias: derived } : {}),
    }));
  }, [direction]);

  const f = (k: string) => (v: any) => {
    if (k === "marketRegime")   regimeTouchedRef.current = true;
    if (k === "trendDirection") trendTouchedRef.current  = true;
    if (k === "htfBias") htfTouchedRef.current = true;
    set((prev: any) => ({ ...prev, [k]: v }));
  };

  const SCORES: [string, string][] = [
    ["marketAlignment","Market Alignment"],
    ["setupClarity","Setup Clarity"],
    ["entryPrecision","Entry Precision"],
    ["confluence","Confluence"],
    ["timingQuality","Timing Quality"],
    ["signalValidation","Signal Validation"],
  ];

  const H = hiddenPanels as string[];

  return (
    <div className="space-y-10">

      {!H.includes('market-env') && (
      <section>
        <SectionLabel>Market Environment</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Sel label="Market Regime"    options={["Bullish","Bearish","Ranging"]}           value={d.marketRegime}   onChange={f("marketRegime")} />
          <Sel label="Trend Direction"  options={["Bullish","Bearish","Sideways"]}          value={d.trendDirection} onChange={f("trendDirection")} />
          <Sel label="Volatility"       options={["Low","Normal","High"]}                   value={d.volatilityState} onChange={f("volatilityState")} />
          <Sel label="Liquidity"        options={["Low","Normal","High"]}                   value={d.liquidity}      onChange={f("liquidity")} />
          <Sel label="News Environment" options={["Clear","Minor","Major"]}                 value={d.newsEnvironment} onChange={f("newsEnvironment")} />
          <Sel label="Session"          options={["London","New York","Tokyo","Sydney","Overlap"]} value={d.sessionName}  onChange={f("sessionName")} />
          <Sel label="Session Phase"    options={["Open","Mid","Close"]}                    value={d.sessionPhase}   onChange={f("sessionPhase")} />
          <Inp label="ATR at Entry" type="number" placeholder="0.0045"                     value={d.atrAtEntry}     onChange={f("atrAtEntry")} />
        </div>
      </section>
      )}

      {!H.includes('htf-context') && (
      <section>
        <SectionLabel>Higher Timeframe Context</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <Radio label="HTF Bias"              options={["Bull","Bear","Range"]} value={d.htfBias}                onChange={f("htfBias")} />
          <Radio label="HTF Key Level Present" options={["Yes","No"]}           value={d.htfKeyLevelPresent}     onChange={f("htfKeyLevelPresent")} />
          <Radio label="Trend Alignment"       options={["Yes","No"]}           value={d.trendAlignment}         onChange={f("trendAlignment")} />
          <Radio label="MTF Alignment"         options={["Yes","No"]}           value={d.multitimeframeAlignment} onChange={f("multitimeframeAlignment")} />
        </div>
        <div className="space-y-4">
          <Txt label="Higher TF Context"    value={d.higherTFContext}    onChange={f("higherTFContext")}    placeholder="Weekly / Daily bias and key levels…" rows={2} />
          <Txt label="Analysis TF Context"  value={d.analysisTFContext}  onChange={f("analysisTFContext")}  placeholder="4H / 1H structure overview…" rows={2} />
          <Txt label="Entry TF Context"     value={d.entryTFContext}     onChange={f("entryTFContext")}     placeholder="15M / 5M entry setup details…" rows={2} />
          <Txt label="Other Confluences"    value={d.otherConfluences}   onChange={f("otherConfluences")}   placeholder="Any additional confluences…" rows={2} />
        </div>
      </section>
      )}

      {!H.includes('tech-signals') && (
      <section>
        <SectionLabel>Technical Signals</SectionLabel>
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Inp label="Timing Context"   placeholder="Kill zone, London open push…" value={d.timingContext}  onChange={f("timingContext")} />
            <Inp label="Candle Pattern"   placeholder="Engulfing, Pin Bar, Doji…"    value={d.candlePattern} onChange={f("candlePattern")} />
          </div>
          <Txt label="Primary Signals"   value={d.primarySignals}   onChange={f("primarySignals")}   placeholder="Describe the primary technical signals…" rows={2} />
          <Txt label="Secondary Signals" value={d.secondarySignals} onChange={f("secondarySignals")} placeholder="Describe any secondary signals…" rows={2} />
          <Inp label="Indicator State"   placeholder="RSI 62, MACD bullish cross, above 50 EMA…" value={d.indicatorState} onChange={f("indicatorState")} />
          <Txt label="Liquidity Targets" value={d.liquidityTargets} onChange={f("liquidityTargets")} placeholder="Nearby liquidity pools, equal highs/lows, order blocks…" rows={2} />
        </div>
      </section>
      )}

      {!H.includes('key-level') && (
      <section>
        <SectionLabel>Key Level Analysis</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Radio label="Key Level Respect"     options={["Yes","No","Partial"]}      value={d.keyLevelRespect}   onChange={f("keyLevelRespect")} />
          <Sel   label="Key Level Type"        options={["Support","Resistance","Pivot","Fib Level"]} value={d.keyLevelType} onChange={f("keyLevelType")} />
          <Radio label="Momentum Validity"     options={["Strong","Moderate","Weak"]} value={d.momentumValidity}  onChange={f("momentumValidity")} />
          <Radio label="Target Logic Clarity"  options={["High","Medium","Low"]}     value={d.targetLogicClarity} onChange={f("targetLogicClarity")} />
        </div>
      </section>
      )}

      {!H.includes('quality-scores') && (
      <section>
        <SectionLabel>Setup Quality Scores (1–5)</SectionLabel>
        <div className="mt-1">
          {SCORES.map(([k, name]) => (
            <Dots key={k} name={name} value={d[k]} onChange={(v: number) => f(k)(v)} />
          ))}
        </div>
      </section>
      )}

    </div>
  );
}

// ─── Step 4 — Review ──────────────────────────────────────────────────────────
function Step4({ d, set, hiddenPanels }: any) {
  const f = (k: string) => (v: any) => set((prev: any) => ({ ...prev, [k]: v }));
  const H = hiddenPanels as string[];
  return (
    <div className="space-y-10">

      <section>
        <SectionLabel>Exit Causation</SectionLabel>
        <Sel label="Primary Exit Reason"
          options={["Target Hit","Partial TP","Trailing Stop","Stop Hit","Break-Even","Time Exit","Structure Change","News","Emotional Exit","Manual"]}
          value={d.primaryExitReason} onChange={f("primaryExitReason")} />
      </section>

      <section>
        <SectionLabel>Performance Data</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Inp label="Pips / Points" type="number" placeholder="25"      value={d.pipsGainedLost} onChange={f("pipsGainedLost")} />
          <Inp label="P&L Amount $"  type="number" placeholder="+250.00" value={d.profitLoss}     onChange={f("profitLoss")} />
          <Inp label="Account Balance" type="number" placeholder="10000" value={d.accountBalance} onChange={f("accountBalance")} />
          <Inp label="Commission / Fees" type="number" placeholder="3.50" value={d.commission}   onChange={f("commission")} />
        </div>
      </section>

      {!H.includes('plan-vs-exec') && (
      <section>
        <SectionLabel>Planning vs Execution</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Inp label="Planned Entry"  type="number" placeholder="1.09250" value={d.plannedEntry} onChange={f("plannedEntry")} />
          <Inp label="Planned SL"     type="number" placeholder="1.09100" value={d.plannedSL}    onChange={f("plannedSL")} />
          <Inp label="Planned TP"     type="number" placeholder="1.09600" value={d.plannedTP}    onChange={f("plannedTP")} />
          <Inp label="Actual Entry"   type="number" placeholder="1.09260" value={d.actualEntry}  onChange={f("actualEntry")} />
          <Inp label="Actual SL"      type="number" placeholder="1.09090" value={d.actualSL}     onChange={f("actualSL")} />
          <Inp label="Actual TP"      type="number" placeholder="1.09590" value={d.actualTP}     onChange={f("actualTP")} />
        </div>
      </section>
      )}

      {!H.includes('trade-metrics') && (
      <section>
        <SectionLabel>Trade Metrics</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Inp label="MAE — Max Adverse"    placeholder="e.g. 12 pips"  value={d.mae}           onChange={f("mae")} />
          <Inp label="MFE — Max Favorable"  placeholder="e.g. 38 pips"  value={d.mfe}           onChange={f("mfe")} />
          <Inp label="Monetary Risk $" type="number" placeholder="100"   value={d.monetaryRisk}  onChange={f("monetaryRisk")} />
          <Inp label="Potential Reward $" type="number" placeholder="250" value={d.potentialReward} onChange={f("potentialReward")} />
          <Inp label="Planned R:R"   placeholder="1:2"                   value={d.plannedRR}     onChange={f("plannedRR")} />
          <Inp label="Achieved R:R"  placeholder="1:1.5"                 value={d.achievedRR}    onChange={f("achievedRR")} />
        </div>
      </section>
      )}

      {!H.includes('psych-state') && (
      <section>
        <SectionLabel>Psychological State</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Sel label="Emotional State"     options={["Calm","Anxious","FOMO","Confident","Fearful","Frustrated","Neutral"]} value={d.emotionalState}    onChange={f("emotionalState")} />
          <Sel label="Focus / Stress"      options={["Low","Medium","High"]}                                                value={d.focusStressLevel}  onChange={f("focusStressLevel")} />
          <Inp label="Rules Followed %"    type="number" placeholder="80"                                                   value={d.rulesFollowed}      onChange={f("rulesFollowed")} />
          <Slider label="Confidence Level" min={1} max={5} value={d.confidenceLevel} onChange={f("confidenceLevel")} suffix="/5" />
          <Sel label="Post-Trade Emotion"  options={["Neutral","Relieved","Euphoric","Frustrated","Regretful","Calm","Anxious"]} value={d.postTradeEmotion} onChange={f("postTradeEmotion")} />
          <Inp label="Consecutive Trade Count" type="number" placeholder="3"                                                value={d.consecutiveTradeCount} onChange={f("consecutiveTradeCount")} />
        </div>
        <div className="mt-3 space-y-1">
          <Checkbox label="Worth repeating this setup"              checked={d.worthRepeating}  onChange={f("worthRepeating")} />
          <Checkbox label="Recency bias — influenced by last trade" checked={d.recencyBiasFlag} onChange={f("recencyBiasFlag")} />
        </div>
      </section>
      )}

      {!H.includes('trade-debrief') && (
      <section>
        <SectionLabel>Trade Debrief</SectionLabel>
        <div className="space-y-4">
          <Txt label="What Worked"         value={d.whatWorked}  onChange={f("whatWorked")}  placeholder="Describe what went well in this trade…" />
          <Txt label="What Failed"         value={d.whatFailed}  onChange={f("whatFailed")}  placeholder="Describe what went wrong or could be improved…" />
          <Txt label="Future Adjustments"  value={d.adjustments} onChange={f("adjustments")} placeholder="What would you do differently next time?" />
          <Txt label="Additional Notes"    value={d.notes}       onChange={f("notes")}       placeholder="Any additional observations, ideas, or lessons learned…" rows={4} />
        </div>
      </section>
      )}

    </div>
  );
}

// ─── Sidebar (monthly prop-firm stats) ────────────────────────────────────────
const StatItem = ({ label, value, colorCls }: any) => (
  <div className="flex justify-between items-center group py-1.5 border-b border-[#18181b] last:border-0">
    <span className="text-[10px] text-[#3f3f46] font-bold uppercase tracking-[0.2em] group-hover:text-[#71717a] transition-colors">{label}</span>
    <span className={`text-xs font-bold ${colorCls || "text-white"}`}>{value}</span>
  </div>
);

const StatBox = ({ label, value, colorCls }: any) => (
  <div className="bg-[#0c0c0e] border border-[#18181b] p-3 rounded-sm space-y-1">
    <span className="text-[8px] text-[#3f3f46] font-bold uppercase tracking-[0.2em] block">{label}</span>
    <div className={`text-xs font-bold ${colorCls || "text-white"}`}>{value}</div>
  </div>
);

function Sidebar({ allEntries, startingBalance }: { allEntries: any[]; startingBalance?: number }) {
  const sb = startingBalance && startingBalance > 0 ? startingBalance : 10000;

  // Default to current month
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedKey, setSelectedKey] = useState(currentKey);

  const { monthData, sortedKeys } = useMemo(
    () => computeMonthlyStats(allEntries, sb),
    [allEntries, sb],
  );

  // Navigable keys = all months with data + current month, sorted
  const navKeys = useMemo(() => {
    const s = new Set([...sortedKeys, currentKey]);
    return Array.from(s).sort();
  }, [sortedKeys, currentKey]);

  const idx    = navKeys.indexOf(selectedKey);
  const canPrev = idx > 0;
  const canNext = idx < navKeys.length - 1;

  const stats = monthData.get(selectedKey) ?? null;
  const has   = !!stats && stats.total > 0;

  // Parse "YYYY-MM" → display label
  const [selYear, selMon] = selectedKey.split("-").map(Number);
  const monthLabel = `${_MONTH_ABBR[selMon - 1]} ${selYear}`;

  return (
    <div className="w-full lg:w-[260px] xl:w-[260px] bg-[#09090b] flex flex-col h-full overflow-hidden border-l border-[#18181b] flex-shrink-0">
      <div className="h-[2px] bg-[#18181b] flex-shrink-0" />
      {/* Header */}
      <div className="h-[52px] px-4 border-b border-[#18181b] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-[#4e8cff] rounded-full animate-pulse" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-white">Monthly</h2>
        </div>
        <span className={`text-[10px] font-bold ${has ? (stats!.growth >= 0 ? "text-emerald-500" : "text-rose-500") : "text-[#3f3f46]"}`}>
          {has ? (stats!.growth >= 0 ? "+" : "") + stats!.growth.toFixed(1) + "%" : "+0.0%"} growth
        </span>
      </div>

      <div className="flex-1 overflow-y-auto obs-scrollbar p-4 space-y-6 pb-10">

        {/* Net P&L */}
        <div className="space-y-3">
          <div className="text-[9px] font-bold text-[#3f3f46] uppercase tracking-[0.2em]">Net P&amp;L</div>
          <div className={`text-sm font-bold tabular-nums ${has ? (stats!.netPnL > 0 ? "text-emerald-400" : stats!.netPnL < 0 ? "text-rose-400" : "text-white") : "text-white"}`}>
            {has ? fmtUsd(stats!.netPnL) : "+$0.00"}
          </div>

          {/* Start / End */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-[#0c0c0e] border border-[#18181b] rounded-sm">
              <div className="text-[8px] text-[#3f3f46] uppercase font-bold tracking-widest mb-1">Start</div>
              <div className="text-xs text-[#a1a1aa]">${has ? stats!.startBalance.toFixed(2) : sb.toFixed(2)}</div>
            </div>
            <div className="p-3 bg-[#0c0c0e] border border-[#18181b] rounded-sm text-right">
              <div className="text-[8px] text-[#3f3f46] uppercase font-bold tracking-widest mb-1">End</div>
              <div className="text-xs text-white">${has ? stats!.endBalance.toFixed(2) : sb.toFixed(2)}</div>
            </div>
          </div>

          {/* Month navigator — replaces Fees row */}
          <div className="flex items-center justify-between px-2 py-2 bg-[#0c0c0e]/50 border border-[#18181b] rounded-sm">
            <button
              onClick={() => canPrev && setSelectedKey(navKeys[idx - 1])}
              disabled={!canPrev}
              className={`w-6 text-center text-base font-bold leading-none transition-colors ${canPrev ? "text-[#4e8cff] hover:text-white" : "text-[#27272a] cursor-default"}`}
            >‹</button>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a1a1aa]">{monthLabel}</span>
            <button
              onClick={() => canNext && setSelectedKey(navKeys[idx + 1])}
              disabled={!canNext}
              className={`w-6 text-center text-base font-bold leading-none transition-colors ${canNext ? "text-[#4e8cff] hover:text-white" : "text-[#27272a] cursor-default"}`}
            >›</button>
          </div>

          {/* Carried deficit in / outstanding */}
          {has && stats!.carriedDeficitIn > 0 && (
            <div className="flex justify-between text-[9px] px-2 py-1.5 bg-[#0c0c0e]/40 border border-[#27272a] rounded-sm">
              <span className="text-[#3f3f46] uppercase tracking-widest font-bold">Deficit carried in</span>
              <span className="text-rose-500 font-bold">-${stats!.carriedDeficitIn.toFixed(2)}</span>
            </div>
          )}
          {has && stats!.carriedDeficit > 0 && (
            <div className="flex justify-between text-[9px] px-2 py-1.5 bg-[#0c0c0e]/40 border border-rose-900/30 rounded-sm">
              <span className="text-rose-800 uppercase tracking-widest font-bold">Outstanding deficit</span>
              <span className="text-rose-500 font-bold">-${stats!.carriedDeficit.toFixed(2)}</span>
            </div>
          )}
          {has && stats!.withdrawn > 0 && (
            <div className="flex justify-between text-[9px] px-2 py-1.5 bg-[#0c0c0e]/40 border border-emerald-900/30 rounded-sm">
              <span className="text-emerald-800 uppercase tracking-widest font-bold">Withdrawn</span>
              <span className="text-emerald-400 font-bold">+${stats!.withdrawn.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Trading Stats */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 pb-2 border-b border-[#18181b]">
            <div className="w-[2px] h-3 bg-[#3f3f46] flex-shrink-0" />
            <h3 className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#3f3f46]">Trading Stats</h3>
          </div>
          <StatItem label="Buys"         value={has ? stats!.buys  : 0} />
          <StatItem label="Sells"        value={has ? stats!.sells : 0} />
          <StatItem label="Total Trades" value={has ? stats!.total : 0} />
          <StatItem label="Best Trade"   value={has ? fmtUsd(stats!.bestTrade)  : "$0.00"} colorCls={has && stats!.bestTrade  > 0 ? "text-emerald-400" : undefined} />
          <StatItem label="Worst Trade"  value={has ? fmtUsd(stats!.worstTrade) : "$0.00"} colorCls={has && stats!.worstTrade < 0 ? "text-rose-400"    : undefined} />
          <StatItem label="Fees"         value={has ? "-$" + stats!.commissions.toFixed(2) : "$0.00"} colorCls={has && stats!.commissions > 0 ? "text-rose-400" : undefined} />
        </section>

        {/* Win Rate */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[2px] h-3 bg-[#3f3f46] flex-shrink-0" />
              <h3 className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#3f3f46]">Win Rate</h3>
            </div>
            <span className="text-xs font-bold text-white">{has ? Math.round(stats!.winRate) + "%" : "0%"}</span>
          </div>
          <div className="h-[2px] w-full bg-[#18181b]">
            <div className="h-full bg-[#4e8cff] transition-all duration-500" style={{ width: has ? stats!.winRate + "%" : "0%" }} />
          </div>
          <div className="flex justify-between text-[9px] font-bold tracking-[0.1em]">
            <span className="text-[#4e8cff] uppercase">Wins {String(has ? stats!.wins : 0).padStart(2,"0")}</span>
            <span className="text-[#3f3f46]">{has ? stats!.wins + " / " + stats!.total : "0 / 0"}</span>
            <span className="text-rose-500 uppercase">Losses {String(has ? stats!.losses : 0).padStart(2,"0")}</span>
          </div>
        </section>

        {/* Stat boxes */}
        <section className="grid grid-cols-2 gap-2">
          <StatBox label="PROFIT FACTOR" value={has ? stats!.profitFactor : "0"} colorCls={has && parseFloat(stats!.profitFactor) > 1 ? "text-emerald-400" : undefined} />
          <StatBox label="EXPECTANCY"    value={has ? stats!.expectancy    : "0"} colorCls={has && parseFloat(stats!.expectancy) > 0    ? "text-emerald-400" : undefined} />
          <StatBox label="AVG R:R"       value={has ? stats!.avgRR         : "0"} colorCls={has && parseFloat(stats!.avgRR) > 0         ? "text-emerald-400" : undefined} />
          <StatBox label="W / L"         value={has ? stats!.wins + "/" + stats!.losses : "0/0"} />
        </section>

      </div>
    </div>
  );
}

// ─── Initial state ─────────────────────────────────────────────────────────────
const INIT_STEP1 = {
  thesis: "", trigger: "", invalidationLogic: "", expectedBehavior: "",
  energyLevel: 3, focusLevel: 3, confidenceAtEntry: 3,
  externalDistraction: "No", openTradesCount: "", totalRiskOpen: "", correlatedExposure: "No",
  strategyVersionId: "", setupTag: "", tradeGrade: "A - Textbook",
  setupFullyValid: "Yes", anyRuleBroken: "No", ruleBroken: "",
  impulseCheckFOMO: false, impulseCheckRevenge: false, impulseCheckBored: false, impulseCheckEmotional: false,
};
const INIT_STEP2 = {
  screenshot: null, exitScreenshot: null,
  instrument: "", pairCategory: "Major", direction: "Long", lotSize: "",
  entryPrice: "", stopLoss: "", stopLossDistancePips: "", takeProfit: "", takeProfitDistancePips: "",
  riskPercent: "1", orderType: "Market", outcome: "Win",
  entryTime: "", exitTime: "", dayOfWeek: "Monday", tradeDuration: "",
  entryTF: "5M", analysisTF: "1HR", contextTF: "1D",
  entryMethod: "Market", exitStrategy: "", managementType: "Rule-based",
  riskHeat: "Low", spreadAtEntry: "", strategyVersionId2: "", breakEvenApplied: false, trailingStopApplied: false,
  ocrConfidence: "", ocrValidation: "",
};
const INIT_STEP3 = {
  marketRegime: "Bullish", trendDirection: "Bullish", volatilityState: "Normal",
  liquidity: "Normal", newsEnvironment: "Clear", sessionName: "London",
  sessionPhase: "Open", atrAtEntry: "",
  htfBias: "Bull", htfKeyLevelPresent: "Yes", trendAlignment: "Yes", multitimeframeAlignment: "Yes",
  higherTFContext: "", analysisTFContext: "", entryTFContext: "", otherConfluences: "",
  timingContext: "", candlePattern: "", primarySignals: "", secondarySignals: "",
  indicatorState: "", liquidityTargets: "",
  keyLevelRespect: "Yes", keyLevelType: "Support", momentumValidity: "Strong", targetLogicClarity: "High",
  marketAlignment: 3, setupClarity: 3, entryPrecision: 3, confluence: 3, timingQuality: 3, signalValidation: 3,
};
const INIT_STEP4 = {
  primaryExitReason: "Target Hit",
  pipsGainedLost: "", profitLoss: "", accountBalance: "", commission: "",
  plannedEntry: "", plannedSL: "", plannedTP: "",
  actualEntry: "", actualSL: "", actualTP: "",
  mae: "", mfe: "", monetaryRisk: "", potentialReward: "", plannedRR: "", achievedRR: "",
  emotionalState: "Calm", focusStressLevel: "Low", rulesFollowed: 100,
  confidenceLevel: 3, postTradeEmotion: "Neutral", consecutiveTradeCount: "",
  worthRepeating: true, recencyBiasFlag: false,
  whatWorked: "", whatFailed: "", adjustments: "", notes: "",
};

const STEPS_DEF = [
  { n: 1, label: "Decision",  key: "step1" },
  { n: 2, label: "Execution", key: "step2" },
  { n: 3, label: "Context",   key: "step3" },
  { n: 4, label: "Review",    key: "step4" },
];

// ─── Main component ────────────────────────────────────────────────────────────
export default function JournalForm({ sessionId, startingBalance }: { sessionId?: string | number | null; startingBalance?: number }) {
  const [step, setStep]           = useState(1);
  const [s1, setS1]               = useState({ ...INIT_STEP1 });
  const [s2, setS2]               = useState({ ...INIT_STEP2 });
  const [s3, setS3]               = useState({ ...INIT_STEP3 });
  const [s4, setS4]               = useState({ ...INIT_STEP4 });
  const [saving, setSaving]       = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Read hidden panels from persisted settings — no need for a separate subscription;
  // the settings page writes to the same key so changes are picked up on next form mount.
  const hiddenPanels: string[] = (() => {
    try {
      const raw = localStorage.getItem('journal_settings_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.hiddenPanels)) return parsed.hiddenPanels;
      }
    } catch {}
    return [];
  })();
  const [ocrFields, setOcrFields] = useState<Set<string>>(new Set());
  const [unfilledSections, setUnfilledSections] = useState<{ step: number; name: string }[] | null>(null);
  const [mobileTab, setMobileTab] = useState<"form"|"stats">("form");

  const regimeTouchedRef = useRef(false);
  const trendTouchedRef  = useRef(false);

  // Live journal entries (all) — filtered by sessionId for sidebar
  const { data: allEntries = [] } = useQuery<any[]>({
    queryKey: ["/api/journal/entries"],
    select: (d: any) => (Array.isArray(d) ? d : d?.entries ?? []),
  });
  const sessionEntries = useMemo(
    () => allEntries.filter((e: any) => sessionId && String(e.sessionId) === String(sessionId)),
    [allEntries, sessionId],
  );

  // Live running balance (starting balance + prior trade P&Ls)
  const { currentBalance } = useSessionBalance(sessionId != null ? String(sessionId) : null);

  // ── Parse "1:8.07" or "8.07" → 8.07
  const parseRRNum = (v: string) => {
    if (!v) return 0;
    const parts = v.split(":");
    const n = parseFloat(parts[parts.length - 1]);
    return isNaN(n) ? 0 : n;
  };
  const fmtRR = (v: any): string | null => {
    if (v == null) return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (isNaN(n)) return String(v);
    return `1:${n}`;
  };

  // ── Auto-calc monetary fields ──────────────────────────────────────────────
  useEffect(() => {
    const riskPct = parseFloat(s2.riskPercent);
    if (!riskPct || riskPct <= 0 || !currentBalance || currentBalance <= 0) return;
    const monetaryRisk  = calcDollarRisk(currentBalance, riskPct);
    const achievedRRNum = parseRRNum(s4.achievedRR);
    const plannedRRNum  = parseRRNum(s4.plannedRR);
    const outcome       = s2.outcome as "Win"|"Loss"|"BE";
    const s4Up: Record<string,string> = { monetaryRisk: monetaryRisk.toFixed(2) };
    if (plannedRRNum > 0) s4Up.potentialReward = (monetaryRisk * plannedRRNum).toFixed(2);
    let pnl: number | null = null;
    if (outcome === "Loss")                     pnl = -monetaryRisk;
    else if (outcome === "BE")                   pnl = 0;
    else if (outcome === "Win" && achievedRRNum > 0) pnl = monetaryRisk * achievedRRNum;
    if (pnl !== null) {
      s4Up.profitLoss    = pnl.toFixed(2);
      s4Up.accountBalance = (currentBalance + pnl).toFixed(2);
    }
    if (outcome === "Loss" && s2.stopLossDistancePips) {
      const slPips = parseFloat(s2.stopLossDistancePips);
      if (!isNaN(slPips) && slPips > 0) s4Up.pipsGainedLost = String(-Math.abs(slPips));
    }
    setS4(prev => ({ ...prev, ...s4Up }));
    setOcrFields(prev => {
      const next = new Set(prev);
      let changed = false;
      Object.keys(s4Up).forEach(k => { if (!next.has(k)) { next.add(k); changed = true; } });
      return changed ? next : prev;
    });
  }, [s2.riskPercent, s2.outcome, s4.achievedRR, s4.plannedRR, s2.stopLossDistancePips, currentBalance]);

  // ── Auto-fill exit reason ──────────────────────────────────────────────────
  useEffect(() => {
    const outcome = s2.outcome as "Win"|"Loss"|"BE";
    let reason: string | null = null;
    if (outcome === "Loss") {
      reason = "Stop Hit";
    } else if (outcome === "BE") {
      reason = "Break-Even";
    } else if (outcome === "Win") {
      const planned  = parseRRNum(s4.plannedRR);
      const achieved = parseRRNum(s4.achievedRR);
      if (achieved > 0 && planned > 0)
        reason = achieved + 0.01 >= planned ? "Target Hit" : "Partial TP";
      else
        reason = "Target Hit"; // default for wins with no RR data yet
    }
    if (reason && reason !== s4.primaryExitReason) {
      setS4(prev => ({ ...prev, primaryExitReason: reason! }));
      setOcrFields(prev => { if (prev.has("primaryExitReason")) return prev; const n = new Set(prev); n.add("primaryExitReason"); return n; });
    }
  }, [s2.outcome, s4.plannedRR, s4.achievedRR]);

  // ── OCR field distribution ─────────────────────────────────────────────────
  const applyAnalyzedFields = useCallback((fields: Record<string, any>, confidence: string) => {
    const s2Up: Record<string, any> = {};
    const s3Up: Record<string, any> = {};
    const s4Up: Record<string, any> = {};
    const filled = new Set<string>();
    const set2 = (k: string, v: any) => { if (v != null && v !== "") { s2Up[k] = v; filled.add(k); } };
    const set3 = (k: string, v: any) => { if (v != null && v !== "") { s3Up[k] = v; filled.add(k); } };
    const set4 = (k: string, v: any) => { if (v != null && v !== "") { s4Up[k] = v; filled.add(k); } };

    // ── Step 2: Instrument & Position ───────────────────────────────────────────
    set2("instrument",             fields.instrument);
    set2("pairCategory",           fields.pairCategory);
    set2("direction",              fields.direction);
    set2("orderType",              fields.orderType);
    // lotSize: try primary field, then fallback to units, contractSize, or dig into raw AI output
    const rawLot = fields.lotSize ?? fields.units ?? fields.contractSize
      ?? fields.aiExtractedRaw?.lotSize ?? fields.aiExtractedRaw?.volume
      ?? fields.aiExtractedRaw?.units ?? fields.aiExtractedRaw?.qty
      ?? fields.aiExtractedRaw?.quantity ?? fields.aiExtractedRaw?.size;
    set2("lotSize", rawLot != null ? String(rawLot) : null);
    set2("entryPrice",             fields.entryPrice != null ? String(fields.entryPrice) : null);
    set2("stopLoss",               fields.stopLoss != null ? String(fields.stopLoss) : null);
    set2("takeProfit",             fields.takeProfit != null ? String(fields.takeProfit) : null);
    // Pips: Gemini returns stopLossDistancePips / takeProfitDistancePips after map_to_journal_fields;
    // OCR returns stopLossPips / takeProfitPips — check both as fallback
    const slPipVal = fields.stopLossDistancePips ?? fields.stopLossPips ?? fields.plannedSlPips ?? fields.plannedSLPips ?? fields.actualSlPips;
    const tpPipVal = fields.takeProfitDistancePips ?? fields.takeProfitPips ?? fields.plannedTpPips ?? fields.plannedTPPips ?? fields.actualTpPips;
    set2("stopLossDistancePips",   slPipVal != null ? String(slPipVal) : null);
    set2("takeProfitDistancePips", tpPipVal != null ? String(tpPipVal) : null);
    // Normalize outcome: accept any casing; drop "Open" (no matching radio option)
    const rawOutcome = fields.outcome ? String(fields.outcome).trim().toLowerCase() : null;
    const normalOutcome = rawOutcome === "win"  ? "Win"
      : rawOutcome === "loss" ? "Loss"
      : (rawOutcome === "be" || rawOutcome === "break-even" || rawOutcome === "breakeven") ? "BE"
      : null;
    if (normalOutcome) set2("outcome", normalOutcome);

    // Strip seconds from timestamps — datetime-local inputs only accept "YYYY-MM-DDTHH:mm"
    const toDatetimeLocal = (v: any): string | null => {
      if (v == null || v === "") return null;
      const m = String(v).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
      return m ? m[1] : String(v);
    };
    set2("entryTime",              toDatetimeLocal(fields.entryTime));
    set2("exitTime",               toDatetimeLocal(fields.exitTime));
    set2("dayOfWeek",              fields.dayOfWeek);
    set2("tradeDuration",          fields.tradeDuration != null ? String(fields.tradeDuration) : null);
    set2("entryTF",                fields.entryTF);
    set2("spreadAtEntry",          fields.spreadAtEntry != null ? String(fields.spreadAtEntry) : null);

    // Frontend fallback: compute duration if Python couldn't (timestamp format issues)
    if (!s2Up.tradeDuration && s2Up.entryTime && s2Up.exitTime) {
      const diff = Math.round((new Date(s2Up.exitTime).getTime() - new Date(s2Up.entryTime).getTime()) / 60000);
      if (diff > 0) {
        const h = Math.floor(diff / 60), m = diff % 60;
        s2Up.tradeDuration = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
        filled.add("tradeDuration");
      }
    }

    // ── Step 3: Session ──────────────────────────────────────────────────────
    if (fields.sessionName) {
      const sn = String(fields.sessionName).toLowerCase();
      if (/overlap/.test(sn))                             set3("sessionName","Overlap");
      else if (/london/.test(sn) && /new.?york|us/.test(sn)) set3("sessionName","Overlap");
      else if (/london/.test(sn))                         set3("sessionName","London");
      else if (/new.?york|us|ny/.test(sn))                set3("sessionName","New York");
      else if (/tokyo|asian|asia/.test(sn))               set3("sessionName","Tokyo");
      else if (/sydney|aus/.test(sn))                     set3("sessionName","Sydney");
    }
    if (fields.sessionPhase) {
      const sp = String(fields.sessionPhase).toLowerCase();
      if (/open|early|start/.test(sp))    set3("sessionPhase","Open");
      else if (/mid|middle/.test(sp))     set3("sessionPhase","Mid");
      else if (/close|late|end/.test(sp)) set3("sessionPhase","Close");
    }

    // ── Step 4: Review / P&L ────────────────────────────────────────────────
    set4("primaryExitReason", fields.primaryExitReason);
    set4("plannedEntry", fields.entryPrice    != null ? String(fields.entryPrice)    : null);
    set4("plannedSL",    fields.stopLoss      != null ? String(fields.stopLoss)      : null);
    set4("plannedTP",    fields.takeProfit    != null ? String(fields.takeProfit)    : null);
    set4("actualEntry",  fields.openingPrice  != null ? String(fields.openingPrice)  : (fields.entryPrice != null ? String(fields.entryPrice) : null));
    set4("actualSL",     fields.stopLoss      != null ? String(fields.stopLoss)      : null);
    set4("actualTP",     fields.closingPrice  != null ? String(fields.closingPrice)  : (fields.takeProfit != null ? String(fields.takeProfit) : null));
    set4("profitLoss",   fields.profitLoss    != null ? String(fields.profitLoss)    : null);
    // mae/mfe: Python's map_to_journal_fields renames drawdownPoints→mae, runUpPoints→mfe
    const maeVal = fields.mae ?? fields.drawdownPoints;
    const mfeVal = fields.mfe ?? fields.runUpPoints;
    if (maeVal != null) set4("mae", `${maeVal} pts`);
    if (mfeVal != null) set4("mfe", `${mfeVal} pts`);
    if (fields.plannedRR  != null) set4("plannedRR",  fmtRR(fields.plannedRR));
    if (fields.riskReward != null && fields.plannedRR == null) set4("plannedRR", fmtRR(fields.riskReward));
    if (fields.achievedRR != null) set4("achievedRR", fmtRR(fields.achievedRR));

    // Pips gained/lost: prefer direct closed P&L, fall back to calculated from SL/TP distance
    const isLoss   = fields.outcome === "Loss";
    const slPips   = fields.stopLossDistancePips ?? fields.actualSlPips ?? fields.plannedSlPips;
    const openPL   = fields.openPLPips;
    const closedPL = fields.closedPLPips;
    const actualTpPips = fields.actualTpPips;
    let pips: string | null = null;
    if (closedPL != null && closedPL !== 0)       pips = String(closedPL);
    else if (openPL != null && openPL !== 0)       pips = String(openPL);
    else if (isLoss && slPips != null)             pips = String(-Math.abs(slPips));
    else if (actualTpPips != null)                 pips = String(actualTpPips);
    if (pips != null) set4("pipsGainedLost", pips);

    setS2(prev => ({ ...prev, ...s2Up, ocrConfidence: confidence, ocrValidation: "" }));
    setS3(prev => ({ ...prev, ...s3Up }));
    setS4(prev => ({ ...prev, ...s4Up }));
    setOcrFields(prev => new Set([...Array.from(prev), ...Array.from(filled)]));
  }, []);

  const handleScreenshotUpload = useCallback(async (field: string, value: any) => {
    if (field === "screenshot" || field === "exitScreenshot") {
      setS2(prev => ({ ...prev, [field]: value }));
      if (value && typeof value === "string" && value.startsWith("data:image")) {
        setAnalyzing(true);
        setS2(prev => ({ ...prev, ocrConfidence: "", ocrValidation: "" }));
        try {
          const raw = await apiRequest("POST", "/api/journal/analyze-screenshot", { image: value, field });
          const res = await raw.json();
          if (res?.fields) {
            applyAnalyzedFields(res.fields, res.confidence ?? "high");
            const methodLabel = res.method === "gemini" ? "Gemini" : "OCR";
            setS2(prev => ({ ...prev, ocrConfidence: methodLabel, ocrValidation: "" }));
          } else if (res?.error) {
            setS2(prev => ({ ...prev, ocrConfidence: "", ocrValidation: `Analysis failed: ${res.error}` }));
          }
        } catch (err: any) {
          const msg = err?.message ?? "Network error — could not reach the analysis service";
          setS2(prev => ({ ...prev, ocrConfidence: "", ocrValidation: `Error: ${msg}` }));
        } finally {
          setAnalyzing(false);
        }
      }
    } else if (field === "screenshot-text" || field === "exitScreenshot-text") {
      setAnalyzing(true);
      try {
        const raw = await apiRequest("POST", "/api/journal/analyze-text", { text: value });
        const res = await raw.json();
        if (res?.fields) applyAnalyzedFields(res.fields, "text input");
        else if (res?.error) setS2(prev => ({ ...prev, ocrValidation: `Text parse error: ${res.error}` }));
      } catch (err: any) {
        setS2(prev => ({ ...prev, ocrValidation: `Error: ${err?.message ?? "Unknown error"}` }));
      } finally {
        setAnalyzing(false);
      }
    }
  }, [applyAnalyzedFields]);

  // ── Unfilled sections checker ──────────────────────────────────────────────
  const getUnfilledSections = (): { step: number; name: string }[] => {
    const eq = (a: any, b: any) => {
      const norm = (v: any) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) ? "" : v;
      return norm(a) === norm(b);
    };
    const untouched = (state: any, init: any, fields: string[]) =>
      fields.every(f => eq(state[f], init[f]) && !ocrFields.has(f));

    const sections = [
      { step:1, name:"Core Thesis",             state:s1, init:INIT_STEP1, fields:["thesis","trigger","invalidationLogic","expectedBehavior"] },
      { step:1, name:"Pre-Entry State Check",   state:s1, init:INIT_STEP1, fields:["energyLevel","focusLevel","confidenceAtEntry","externalDistraction","openTradesCount","totalRiskOpen","correlatedExposure"] },
      { step:1, name:"Classification & Quality",state:s1, init:INIT_STEP1, fields:["setupTag","tradeGrade"] },
      { step:1, name:"Rule Governance",         state:s1, init:INIT_STEP1, fields:["setupFullyValid","anyRuleBroken","ruleBroken"] },
      { step:1, name:"Impulse Control Check",   state:s1, init:INIT_STEP1, fields:["impulseCheckFOMO","impulseCheckRevenge","impulseCheckBored","impulseCheckEmotional"] },
      { step:2, name:"Trade Screenshots",       state:s2, init:INIT_STEP2, fields:["screenshot","exitScreenshot"] },
      { step:2, name:"Position Details",        state:s2, init:INIT_STEP2, fields:["instrument","pairCategory","direction","lotSize","entryPrice","stopLoss","takeProfit","riskPercent","orderType","outcome"] },
      { step:2, name:"Timing & Duration",       state:s2, init:INIT_STEP2, fields:["entryTime","exitTime","dayOfWeek","tradeDuration"] },
      { step:2, name:"Timeframe Analysis",      state:s2, init:INIT_STEP2, fields:["entryTF","analysisTF","contextTF"] },
      { step:2, name:"Entry & Trade Management",state:s2, init:INIT_STEP2, fields:["entryMethod","exitStrategy","managementType","riskHeat","breakEvenApplied","trailingStopApplied"] },
      { step:3, name:"Market Environment",      state:s3, init:INIT_STEP3, fields:["marketRegime","trendDirection","volatilityState","liquidity","newsEnvironment","sessionName","sessionPhase","atrAtEntry"] },
      { step:3, name:"Higher Timeframe Context",state:s3, init:INIT_STEP3, fields:["htfBias","htfKeyLevelPresent","trendAlignment","multitimeframeAlignment","higherTFContext","analysisTFContext","entryTFContext","otherConfluences"] },
      { step:3, name:"Technical Signals",       state:s3, init:INIT_STEP3, fields:["timingContext","candlePattern","primarySignals","secondarySignals","indicatorState","liquidityTargets"] },
      { step:3, name:"Key Level Analysis",      state:s3, init:INIT_STEP3, fields:["keyLevelRespect","keyLevelType","momentumValidity","targetLogicClarity"] },
      { step:3, name:"Setup Quality Scores",    state:s3, init:INIT_STEP3, fields:["marketAlignment","setupClarity","entryPrecision","confluence","timingQuality","signalValidation"] },
      { step:4, name:"Exit Causation",          state:s4, init:INIT_STEP4, fields:["primaryExitReason"] },
      { step:4, name:"Performance Data",        state:s4, init:INIT_STEP4, fields:["pipsGainedLost","profitLoss","accountBalance","commission"] },
      { step:4, name:"Planning vs Execution",   state:s4, init:INIT_STEP4, fields:["plannedEntry","plannedSL","plannedTP","actualEntry","actualSL","actualTP"] },
      { step:4, name:"Trade Metrics",           state:s4, init:INIT_STEP4, fields:["mae","mfe","monetaryRisk","potentialReward","plannedRR","achievedRR"] },
      { step:4, name:"Psychological State",     state:s4, init:INIT_STEP4, fields:["emotionalState","focusStressLevel","rulesFollowed","confidenceLevel","postTradeEmotion","consecutiveTradeCount","worthRepeating","recencyBiasFlag"] },
      { step:4, name:"Trade Debrief",           state:s4, init:INIT_STEP4, fields:["whatWorked","whatFailed","adjustments","notes"] },
    ];
    return sections.filter(s => untouched(s.state, s.init, s.fields)).map(({ step, name }) => ({ step, name }));
  };

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSave = async (forceSubmit: boolean = false) => {
    if (!s2.entryTime) {
      setSaveError("Entry Time is required — please set the date/time the trade occurred (Step 2 → Timing & Duration).");
      setStep(2);
      return;
    }
    if (!forceSubmit) {
      const unfilled = getUnfilledSections();
      if (unfilled.length > 0) { setUnfilledSections(unfilled); return; }
    }
    setUnfilledSections(null);
    setSaving(true);
    setSaveError(null);
    try {
      const parseRR = (s: string): string | null => {
        if (!s) return null;
        const parts = s.split(":");
        const val = parseFloat(parts[parts.length - 1]);
        return isNaN(val) ? null : String(val);
      };
      const fillDefaults = <T extends Record<string, any>>(state: T, init: T): T => {
        const out: Record<string, any> = { ...state };
        for (const k of Object.keys(init) as (keyof T)[]) {
          const v = out[k as string];
          if (v === undefined || v === null || v === "") out[k as string] = (init as any)[k];
        }
        return out as T;
      };
      const f1 = fillDefaults(s1, INIT_STEP1);
      const f2 = fillDefaults(s2, INIT_STEP2);
      const f3 = fillDefaults(s3, INIT_STEP3);
      const f4 = fillDefaults(s4, INIT_STEP4);

      const payload: Record<string, any> = {
        instrument:          f2.instrument           || null,
        pairCategory:        f2.pairCategory         || null,
        direction:           f2.direction             || null,
        orderType:           f2.orderType             || null,
        entryPrice:          f2.entryPrice            || null,
        stopLoss:            f2.stopLoss              || null,
        takeProfit:          f2.takeProfit            || null,
        stopLossDistance:    f2.stopLossDistancePips  || null,
        takeProfitDistance:  f2.takeProfitDistancePips|| null,
        lotSize:             f2.lotSize               || null,
        riskPercent:         f2.riskPercent           || null,
        spreadAtEntry:       f2.spreadAtEntry         || null,
        entryTime:           f2.entryTime             || null,
        exitTime:            f2.exitTime              || null,
        dayOfWeek:           f2.dayOfWeek             || null,
        tradeDuration:       f2.tradeDuration         || null,
        entryTF:             f2.entryTF               || null,
        analysisTF:          f2.analysisTF            || null,
        contextTF:           f2.contextTF             || null,
        outcome:             f2.outcome               || null,
        profitLoss:          f4.profitLoss  !== "" ? f4.profitLoss  : null,
        pipsGainedLost:      f4.pipsGainedLost !== "" ? f4.pipsGainedLost : null,
        accountBalance:      f4.accountBalance !== "" ? f4.accountBalance : null,
        commission:          f4.commission            || null,
        mae:                 f4.mae                   || null,
        mfe:                 f4.mfe                   || null,
        plannedRR:           f4.plannedRR             || null,
        achievedRR:          f4.achievedRR            || null,
        monetaryRisk:        f4.monetaryRisk          || null,
        potentialReward:     f4.potentialReward       || null,
        primaryExitReason:   f4.primaryExitReason     || null,
        riskReward:          parseRR(f4.achievedRR),
        sessionName:         f3.sessionName           || null,
        sessionPhase:        f3.sessionPhase          || null,
        sessionId:           sessionId                || null,
        timingContext:       f3.timingContext          || null,
        aiExtracted: {
          method:         "ocr_v8_jforex",
          ocrConfidence:  f2.ocrConfidence,
          ocrValidation:  f2.ocrValidation,
          ocrFilledFields: Array.from(ocrFields),
        },
        manualFields: {
          thesis:               f1.thesis,
          trigger:              f1.trigger,
          invalidationLogic:    f1.invalidationLogic,
          expectedBehavior:     f1.expectedBehavior,
          setupTag:             f1.setupTag,
          tradeGrade:           f1.tradeGrade,
          marketRegime:         f3.marketRegime,
          trendDirection:       f3.trendDirection,
          volatilityState:      f3.volatilityState,
          liquidity:            f3.liquidity,
          newsEnvironment:      f3.newsEnvironment,
          htfBias:              f3.htfBias,
          emotionalState:       f4.emotionalState,
          focusStressLevel:     f4.focusStressLevel,
          postTradeEmotion:     f4.postTradeEmotion,
          rulesFollowed:        f4.rulesFollowed,
          confidenceLevel:      f4.confidenceLevel,
          worthRepeating:       f4.worthRepeating,
          whatWorked:           f4.whatWorked,
          whatFailed:           f4.whatFailed,
          adjustments:          f4.adjustments,
          notes:                f4.notes,
          energyLevel:          f1.energyLevel,
          focusLevel:           f1.focusLevel,
          marketAlignment:      f3.marketAlignment,
          setupClarity:         f3.setupClarity,
          entryPrecision:       f3.entryPrecision,
          confluence:           f3.confluence,
          timingQuality:        f3.timingQuality,
          signalValidation:     f3.signalValidation,
          plannedEntry:         f4.plannedEntry       || null,
          plannedSL:            f4.plannedSL          || null,
          plannedTP:            f4.plannedTP          || null,
          actualEntry:          f4.actualEntry        || null,
          actualSL:             f4.actualSL           || null,
          actualTP:             f4.actualTP           || null,
          confidenceAtEntry:    f1.confidenceAtEntry,
          trendAlignment:       f3.trendAlignment,
          mtfAlignment:         f3.multitimeframeAlignment,
          htfKeyLevelPresent:   f3.htfKeyLevelPresent,
          keyLevelRespected:    f3.keyLevelRespect,
          keyLevelType:         f3.keyLevelType,
          targetLogic:          f3.targetLogicClarity,
          strongMomentum:       f3.momentumValidity,
          managementType:       f2.managementType,
          candlePattern:        f3.candlePattern,
          indicatorState:       f3.indicatorState     || null,
          setupFullyValid:      f1.setupFullyValid,
          anyRuleBroken:        f1.anyRuleBroken,
          ruleBroken:           f1.ruleBroken         || null,
          breakevenApplied:     f2.breakEvenApplied,
          fomoTrade:            f1.impulseCheckFOMO,
          revengeTrade:         f1.impulseCheckRevenge,
          boredomTrade:         f1.impulseCheckBored,
          emotionalTrade:       f1.impulseCheckEmotional,
          externalDistraction:  f1.externalDistraction,
          strategyVersionId:    f1.strategyVersionId,
          riskHeat:             f2.riskHeat,
          trailingStopApplied:  f2.trailingStopApplied,
          exitStrategy:         f2.exitStrategy,
          openTradesCount:      f1.openTradesCount,
          totalRiskOpen:        f1.totalRiskOpen,
          correlatedExposure:   f1.correlatedExposure,
          primarySignals:       f3.primarySignals,
          secondarySignals:     f3.secondarySignals,
          liquidityTargets:     f3.liquidityTargets,
          higherTFContext:      f3.higherTFContext,
          analysisTFContext:    f3.analysisTFContext,
          entryTFContext:       f3.entryTFContext,
          otherConfluences:     f3.otherConfluences,
          consecutiveTradeCount: f4.consecutiveTradeCount,
          recencyBiasFlag:      f4.recencyBiasFlag,
          atrAtEntry:           f3.atrAtEntry         || null,
          strategyVersion:      f2.strategyVersionId2 || null,
        },
      };
      await apiRequest("POST", "/api/journal/entries", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/journal/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metrics/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drawdown/compute"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      setS1({ ...INIT_STEP1 });
      setS2({ ...INIT_STEP2 });
      setS3({ ...INIT_STEP3 });
      setS4({ ...INIT_STEP4 });
      regimeTouchedRef.current = false;
      trendTouchedRef.current  = false;
      setOcrFields(new Set());
      setStep(1);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save entry");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="obs-jf font-mono flex flex-col lg:flex-row bg-[#09090b] text-[#d4d4d8]" style={{ minHeight:"100%", height:"100%", fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
      <style dangerouslySetInnerHTML={{ __html: OBS_CSS }} />

      {/* ── Form column ──────────────────────────────────────────────────── */}
      <main className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-[#09090b] border-r border-[#18181b] ${mobileTab === "stats" ? "hidden lg:flex" : "flex"}`}>

        {/* Progress bar */}
        <div className="h-[2px] bg-[#18181b] flex-shrink-0">
          <div className="h-full bg-[#4e8cff] transition-all duration-500" style={{ width:`${(step / STEPS_DEF.length) * 100}%` }} />
        </div>

        {/* Step nav */}
        <nav className="flex-shrink-0 border-b border-[#18181b] overflow-x-auto no-scrollbar">
          <div className="px-6 flex items-center space-x-1">
            {STEPS_DEF.map((s, idx) => (
              <div key={s.n} className="flex items-center">
                <button onClick={() => setStep(s.n)}
                  className={`flex items-center space-x-2 text-[9px] uppercase tracking-[0.2em] font-bold transition-all whitespace-nowrap py-4 border-b-2 -mb-px ${
                    step === s.n ? "text-[#4e8cff] border-[#4e8cff]" : "text-[#3f3f46] hover:text-[#71717a] border-transparent"
                  }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] border flex-shrink-0 transition-all ${
                    step === s.n ? "bg-[#4e8cff] text-[#0d0f10] border-[#4e8cff]" :
                    step >  s.n ? "bg-[#0c0c0e] text-[#4e8cff] border-[#4e8cff]/40" :
                                  "border-[#18181b] bg-[#0c0c0e] text-[#3f3f46]"
                  }`}>{step > s.n ? "✓" : s.n}</span>
                  <span className={step === s.n ? "block" : "hidden md:block"}>{s.label}</span>
                </button>
                {idx < STEPS_DEF.length - 1 && <div className="w-4 lg:w-8 h-[1px] bg-[#18181b] mx-1 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </nav>

        {/* Unfilled dialog */}
        {unfilledSections && unfilledSections.length > 0 && (
          <div onClick={() => setUnfilledSections(null)}
            className="absolute inset-0 z-50 flex items-center justify-center p-5"
            style={{ background:"rgba(4,8,14,0.82)", backdropFilter:"blur(4px)", position:"absolute" }}>
            <div onClick={e => e.stopPropagation()}
              className="w-full max-w-[460px] bg-[#0c1422] border border-white/[0.08] rounded-xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400 font-bold text-sm">!</div>
                <div className="text-[15px] font-semibold">Some panels are still empty</div>
              </div>
              <p className="text-xs text-white/50 leading-relaxed mb-4">These sections look untouched. Tap any one to jump to it, or submit the entry as-is.</p>
              <div className="flex flex-col gap-1.5 mb-5 max-h-[260px] overflow-y-auto obs-scrollbar">
                {unfilledSections.map((u, i) => (
                  <button key={i} onClick={() => { setStep(u.step); setUnfilledSections(null); }}
                    className="flex justify-between items-center text-left px-3 py-2.5 bg-white/[0.035] hover:bg-indigo-500/10 border border-white/[0.07] hover:border-indigo-500/35 rounded-lg text-sm text-white/85 transition-all">
                    <span>{u.name}</span>
                    <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Step {u.step} →</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setUnfilledSections(null)}
                  className="px-4 py-2 text-xs font-medium text-white/75 border border-white/12 rounded-lg hover:bg-white/5 transition-all">
                  Go back &amp; fill
                </button>
                <button onClick={() => { setUnfilledSections(null); handleSave(true); }}
                  className="px-4 py-2 text-xs font-semibold text-white rounded-lg transition-all"
                  style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                  Submit anyway
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto obs-scrollbar">
          <div className="px-6 py-8 w-full">
            {saveError && (
              <div className="mb-5 p-3 border-l-2 border-rose-500/60 bg-rose-500/[0.06] text-xs text-rose-400">
                {saveError}
              </div>
            )}
            {step === 1 && <Step1 d={s1} set={setS1} hiddenPanels={hiddenPanels} />}
            {step === 2 && <Step2 d={s2} set={setS2} onScreenshotUpload={handleScreenshotUpload} analyzing={analyzing} currentBalance={currentBalance} hiddenPanels={hiddenPanels} />}
            {step === 3 && <Step3 d={s3} set={setS3} direction={s2.direction} regimeTouchedRef={regimeTouchedRef} trendTouchedRef={trendTouchedRef} hiddenPanels={hiddenPanels} />}
            {step === 4 && <Step4 d={s4} set={setS4} hiddenPanels={hiddenPanels} />}
            <div className="h-8" />
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex-shrink-0 border-t border-[#18181b] bg-[#09090b]">
          <div className="px-6 py-4 flex justify-between items-center">
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-[#3f3f46] hover:text-white transition-colors">
                <span className="text-sm">←</span> Prev
              </button>
            ) : <div />}
            <div className="flex items-center gap-4">
              {step < STEPS_DEF.length ? (
                <button onClick={() => setStep(s => s + 1)}
                  className="flex items-center gap-3 text-white hover:text-[#4e8cff] transition-all uppercase tracking-[0.3em] font-bold text-[10px] group">
                  <div className="w-10 h-10 rounded-full border border-[#18181b] flex items-center justify-center group-hover:border-[#4e8cff] transition-all bg-[#0c0c0e]">
                    <span className="text-sm group-hover:translate-x-0.5 transition-transform inline-block">→</span>
                  </div>
                  Next
                </button>
              ) : (
                <button onClick={() => handleSave(false)} disabled={saving}
                  className="flex items-center gap-3 text-white hover:text-[#4e8cff] transition-all uppercase tracking-[0.3em] font-bold text-[10px] group disabled:opacity-50">
                  <div className="w-10 h-10 rounded-full border border-[#18181b] flex items-center justify-center group-hover:border-[#4e8cff] transition-all bg-[#0c0c0e]">
                    <span className="text-sm">{saving ? "…" : "+"}</span>
                  </div>
                  {saving ? "Saving…" : "Commit Entry"}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`w-full lg:w-auto bg-[#09090b] flex flex-col overflow-hidden ${mobileTab === "form" ? "hidden lg:flex" : "flex"}`}
        style={{ height:"100%" }}>
        <Sidebar allEntries={allEntries} startingBalance={startingBalance} />
      </aside>

      {/* ── Mobile tab bar ─────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#09090b]/90 backdrop-blur-lg border-t border-[#18181b] flex items-center justify-around py-3 px-4 z-50">
        <button onClick={() => setMobileTab("form")}
          className={`flex flex-col items-center gap-1 transition-colors ${mobileTab === "form" ? "text-[#4e8cff]" : "text-[#3f3f46]"}`}>
          <span className="text-lg leading-none">⊞</span>
          <span className="text-[8px] font-bold uppercase tracking-widest">Entry</span>
        </button>
        <button onClick={() => setMobileTab("stats")}
          className={`flex flex-col items-center gap-1 transition-colors ${mobileTab === "stats" ? "text-[#4e8cff]" : "text-[#3f3f46]"}`}>
          <span className="text-lg leading-none">▦</span>
          <span className="text-[8px] font-bold uppercase tracking-widest">Stats</span>
        </button>
      </nav>
    </div>
  );
}
