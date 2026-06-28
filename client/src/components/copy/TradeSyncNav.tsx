import { useState, useRef, useLayoutEffect, useCallback } from "react";
import { User, Radio, GitFork, Send, Users, ArrowLeft, Menu } from "lucide-react";

/**
 * TradeSync terminal navigation bar (controlled).
 * Wired to the wizard's role state; amber terminal aesthetic over the page background.
 * ids match data.role: follower | provider | self | telegram.
 */
const MODES = [
  { id: "follower", label: "FOLLOWER",  Icon: User },
  { id: "provider", label: "PROVIDER",  Icon: Radio },
  { id: "self",     label: "SELF-COPY", Icon: GitFork },
  { id: "telegram", label: "TELEGRAM",  Icon: Send },
];

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap');
.tsx-stage{--surface:#0d1117;--hairline:#20272f;--hairline-soft:#171d24;--ink:#cfd6df;--ink-dim:#707a86;--ink-faint:#4b545f;--amber:#f6b73c;--amber-bright:#ffd684;--amber-deep:#6e4f17;--amber-glow:rgba(246,183,60,0.5);font-family:"DM Mono",ui-monospace,Menlo,Consolas,monospace;background:radial-gradient(130% 130% at 50% -40%,rgba(246,183,60,0.045),transparent 55%),transparent;padding:14px 24px;box-sizing:border-box;flex-shrink:0;}
.tsx-frame{position:relative;}
.tsx-bar{position:relative;display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:10px 16px;border:1px solid var(--hairline);border-radius:9px;background:linear-gradient(180deg,rgba(255,255,255,0.015),transparent 40%),var(--surface);box-shadow:0 20px 50px -34px rgba(0,0,0,0.95);}
.tsx-tick{position:absolute;width:8px;height:8px;border-color:var(--amber-deep);border-style:solid;border-width:0;opacity:.8;pointer-events:none;}
.tsx-tick.tl{top:-1px;left:-1px;border-top-width:1px;border-left-width:1px;}
.tsx-tick.tr{top:-1px;right:-1px;border-top-width:1px;border-right-width:1px;}
.tsx-tick.bl{bottom:-1px;left:-1px;border-bottom-width:1px;border-left-width:1px;}
.tsx-tick.br{bottom:-1px;right:-1px;border-bottom-width:1px;border-right-width:1px;}
.tsx-brand{display:flex;align-items:center;gap:10px;}
.tsx-led{width:6px;height:6px;border-radius:50%;background:var(--amber);box-shadow:0 0 8px 1px var(--amber-glow);animation:tsx-pulse 2.6s ease-out infinite;}
.tsx-brand-name{font-size:10px;font-weight:500;letter-spacing:.24em;color:var(--ink);white-space:nowrap;}
.tsx-rule{width:1px;align-self:stretch;background:var(--hairline-soft);margin:2px 0;}
.tsx-switch{position:relative;display:flex;align-items:stretch;}
.tsx-seg{position:relative;display:inline-flex;align-items:center;gap:8px;padding:8px 14px 9px;border:none;background:transparent;color:var(--ink-dim);font:inherit;font-size:10px;font-weight:400;letter-spacing:.16em;cursor:pointer;white-space:nowrap;transition:color .22s ease;}
.tsx-seg:hover{color:var(--ink);}
.tsx-seg.is-active{color:var(--amber-bright);font-weight:500;}
.tsx-seg-icon{flex-shrink:0;opacity:.85;transition:transform .2s ease,opacity .2s ease;}
.tsx-seg:hover .tsx-seg-icon{opacity:1;transform:translateY(-1px);}
.tsx-seg.is-active .tsx-seg-icon{opacity:1;filter:drop-shadow(0 0 5px var(--amber-glow));}
.tsx-caret{display:inline-block;width:6px;height:11px;margin-left:1px;background:var(--amber);box-shadow:0 0 6px var(--amber-glow);animation:tsx-blink 1.05s steps(1,end) infinite;}
.tsx-trace{position:absolute;bottom:0;left:0;height:2px;background:linear-gradient(90deg,transparent,var(--amber),transparent);box-shadow:0 0 10px var(--amber-glow);transition:transform .36s cubic-bezier(.32,.72,0,1),width .36s cubic-bezier(.32,.72,0,1);}
.tsx-cluster{display:flex;align-items:center;gap:9px;margin-left:auto;}
.tsx-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border:1px solid var(--hairline);border-radius:7px;background:rgba(255,255,255,.008);color:var(--ink-dim);font:inherit;font-size:9.5px;font-weight:400;letter-spacing:.15em;cursor:pointer;transition:color .2s,border-color .2s,background .2s;}
.tsx-chip-icon{color:var(--ink-faint);transition:color .2s;flex-shrink:0;}
.tsx-chip:hover{color:var(--ink);border-color:var(--amber-deep);background:rgba(246,183,60,.04);}
.tsx-chip:hover .tsx-chip-icon{color:var(--amber);}
.tsx-divider{width:1px;height:18px;background:var(--hairline);margin:0 2px;}
.tsx-back{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--ink-faint);font:inherit;font-size:9.5px;font-weight:400;letter-spacing:.18em;cursor:pointer;transition:color .2s,border-color .2s;}
.tsx-back:hover{color:var(--ink);border-color:var(--hairline);}
.tsx-back-icon{transition:transform .2s;}
.tsx-back:hover .tsx-back-icon{transform:translateX(-2px);}
.tsx-menu{display:none;align-items:center;justify-content:center;padding:8px;border:1px solid var(--hairline);border-radius:7px;background:transparent;color:var(--ink-dim);cursor:pointer;}
.tsx-seg:focus-visible,.tsx-chip:focus-visible,.tsx-back:focus-visible,.tsx-menu:focus-visible{outline:2px solid var(--amber);outline-offset:2px;border-radius:6px;}
@keyframes tsx-pulse{0%{box-shadow:0 0 8px 1px var(--amber-glow);}70%{box-shadow:0 0 8px 7px rgba(246,183,60,0);}100%{box-shadow:0 0 8px 1px rgba(246,183,60,0);}}
@keyframes tsx-blink{0%,55%{opacity:1;}56%,100%{opacity:0;}}
@media (prefers-reduced-motion:reduce){.tsx-trace{transition:none;}.tsx-led,.tsx-caret{animation:none;}.tsx-caret{opacity:1;}.tsx-seg-icon,.tsx-back-icon{transition:none;}}
@media (max-width:820px){.tsx-cluster{margin-left:0;}.tsx-rule{display:none;}.tsx-bar{gap:14px;}.tsx-chip span,.tsx-back span{display:none;}}
@media (max-width:560px){.tsx-brand-name{display:none;}.tsx-menu{display:inline-flex;}}
`;

interface Props {
  active: string;
  onSelect: (id: string) => void;
  onOpenDashboard: (tab: "provider" | "follower") => void;
  onBack: () => void;
  onMenu?: () => void;
}

export default function TradeSyncNav({ active, onSelect, onOpenDashboard, onBack, onMenu }: Props) {
  const switchRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [trace, setTrace] = useState({ left: 0, width: 0 });

  const measure = useCallback(() => {
    const el = segRefs.current[active];
    const wrap = switchRef.current;
    if (!el || !wrap) return;
    const a = el.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    setTrace({ left: a.left - b.left, width: a.width });
  }, [active]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (switchRef.current) ro.observe(switchRef.current);
    window.addEventListener("resize", measure);
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    const t = setTimeout(measure, 160);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); clearTimeout(t); };
  }, [measure]);

  const onKeyNav = (e: React.KeyboardEvent) => {
    const i = MODES.findIndex((m) => m.id === active);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); onSelect(MODES[(i + 1) % MODES.length].id); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); onSelect(MODES[(i - 1 + MODES.length) % MODES.length].id); }
  };

  return (
    <div className="tsx-stage">
      <style>{STYLES}</style>
      <div className="tsx-frame">
        <span className="tsx-tick tl" aria-hidden="true" /><span className="tsx-tick tr" aria-hidden="true" />
        <span className="tsx-tick bl" aria-hidden="true" /><span className="tsx-tick br" aria-hidden="true" />

        <nav className="tsx-bar" aria-label="TradeSync terminal navigation">
          <div className="tsx-brand">
            <span className="tsx-led" aria-hidden="true" />
            <span className="tsx-brand-name">TRADESYNC TERMINAL</span>
          </div>

          <span className="tsx-rule" aria-hidden="true" />

          <div className="tsx-switch" ref={switchRef} role="tablist" aria-label="Copy mode" onKeyDown={onKeyNav}>
            {MODES.map((m) => {
              const isActive = m.id === active;
              return (
                <button key={m.id} ref={(el) => { segRefs.current[m.id] = el; }} role="tab" aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1} className={`tsx-seg${isActive ? " is-active" : ""}`} onClick={() => onSelect(m.id)}>
                  <m.Icon size={12} className="tsx-seg-icon" aria-hidden="true" />
                  {m.label}
                  {isActive && <span className="tsx-caret" aria-hidden="true" />}
                </button>
              );
            })}
            <span className="tsx-trace" style={{ transform: `translateX(${trace.left}px)`, width: trace.width }} aria-hidden="true" />
          </div>

          <div className="tsx-cluster">
            <button className="tsx-chip" onClick={() => onOpenDashboard("provider")} title="Open your provider dashboard">
              <Radio size={11} className="tsx-chip-icon" aria-hidden="true" /><span>PROVIDERS</span>
            </button>
            <button className="tsx-chip" onClick={() => onOpenDashboard("follower")} title="Open your follower dashboard">
              <Users size={11} className="tsx-chip-icon" aria-hidden="true" /><span>FOLLOWERS</span>
            </button>
            <span className="tsx-divider" aria-hidden="true" />
            <button className="tsx-back" onClick={onBack} title="Back to Trade Sync home">
              <ArrowLeft size={11} className="tsx-back-icon" aria-hidden="true" /><span>BACK</span>
            </button>
            {onMenu && <button className="tsx-menu" onClick={onMenu} aria-label="Open navigation"><Menu size={15} /></button>}
          </div>
        </nav>
      </div>
    </div>
  );
}
