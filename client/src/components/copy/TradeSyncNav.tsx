import { Radio, Users, ArrowLeft, Menu } from "lucide-react";

/**
 * TradeSync terminal header (controlled) — brand on the left, role tabs on the right.
 * Uses ONLY the wizard's two fonts (Plus Jakarta Sans / JetBrains Mono via .ts-wizard-root)
 * — no third font import. Blue accent on the active tab; utility actions are minimal ghost
 * icons so the bar stays clean. ids match data.role: follower | provider | self | telegram.
 */
const MODES = [
  { id: "follower", label: "FOLLOWER" },
  { id: "provider", label: "PROVIDER" },
  { id: "self",     label: "SELF" },
  { id: "telegram", label: "TELEGRAM" },
];

interface Props {
  active: string;
  onSelect: (id: string) => void;
  onOpenDashboard: (tab: "provider" | "follower") => void;
  onBack: () => void;
  onMenu?: () => void;
}

export default function TradeSyncNav({ active, onSelect, onOpenDashboard, onBack, onMenu }: Props) {
  return (
    <header className="flex items-center justify-between gap-4 px-5 md:px-12 lg:px-20 py-3.5 border-b border-white/[0.06] bg-[#020203]/85 backdrop-blur-sm flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"
          style={{ boxShadow: "0 0 7px rgba(59,130,246,0.8)" }}
          aria-hidden="true"
        />
        <span className="font-mono text-[10px] md:text-[11px] uppercase tracking-[0.28em] text-slate-500 truncate">
          TradeSync Terminal
        </span>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Role tabs */}
        <div className="hidden sm:flex items-center gap-1.5 md:gap-2" role="tablist" aria-label="Copy mode">
          {MODES.map((m) => {
            const isActive = m.id === active;
            return (
              <button
                key={m.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(m.id)}
                className={`px-2.5 md:px-3.5 py-1.5 rounded-[5px] border font-mono text-[9px] md:text-[10px] uppercase tracking-[0.18em] transition-all duration-200
                  ${isActive
                    ? "border-blue-500/70 bg-blue-500/[0.07] text-blue-300"
                    : "border-white/[0.07] text-slate-500 hover:border-white/25 hover:text-slate-300"}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <span className="hidden md:block w-px h-4 bg-white/10 mx-1" aria-hidden="true" />

        {/* Utility — minimal ghost icons */}
        <button
          onClick={() => onOpenDashboard("provider")}
          title="Provider dashboard"
          className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-[5px] text-slate-600 hover:text-blue-300 hover:bg-white/[0.04] transition-colors"
        >
          <Radio size={13} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => onOpenDashboard("follower")}
          title="Follower dashboard"
          className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-[5px] text-slate-600 hover:text-blue-300 hover:bg-white/[0.04] transition-colors"
        >
          <Users size={13} strokeWidth={1.5} />
        </button>
        <button
          onClick={onBack}
          title="Back to Trade Sync home"
          className="inline-flex items-center justify-center w-7 h-7 rounded-[5px] text-slate-600 hover:text-white hover:bg-white/[0.04] transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label="Open navigation"
            className="sm:hidden inline-flex items-center justify-center w-7 h-7 rounded-[5px] text-slate-500 hover:text-white"
          >
            <Menu size={15} />
          </button>
        )}
      </div>
    </header>
  );
}
