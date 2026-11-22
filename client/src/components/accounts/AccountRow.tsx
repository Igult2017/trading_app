import type { ReactNode } from "react";
import { BarChart2, Copy, Wrench, RefreshCw, History, ArrowUpRight, LogOut, Plug, Pencil, Trash2, Settings2,
         DollarSign, type LucideIcon } from "lucide-react";
import { type BrokerAccount, type Theme, DISCONNECTED, ROW_GRID, displayName, formatMoney } from "./accountTypes";

/** One account, in his design: a floating row on wide screens, a stacked card on a phone (22 Nov 2026). */
export interface RowActions {
  onAnalytics?: () => void; onCopyToggle: () => void; onRepair: () => void; onSync: () => void;
  onLogs: () => void; onLogout: () => void; onReconnect: () => void; onEdit: () => void; onDelete: () => void;
  onWebhook: () => void; onRefreshBalance: () => void;
}

/** Icon-only action with a visible label on hover AND keyboard focus, and the label as its accessible name. */
function Action({ icon: Icon, label, tone, onClick, busy = false, T, href }: {
  icon: LucideIcon; label: string; tone: string; onClick?: () => void; busy?: boolean; T: Theme; href?: string;
}) {
  const cls = `relative grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 hover:scale-110 active:scale-95 ${tone} ${T.focus} disabled:cursor-wait disabled:opacity-60`;
  const tip = <span className={`pointer-events-none absolute -top-9 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-medium opacity-0 shadow-xl transition-opacity duration-150 group-hover/act:opacity-100 group-focus-within/act:opacity-100 ${T.tooltip}`}>{label}</span>;
  return (
    <span className="group/act relative">
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={cls}><Icon className="h-4 w-4" /></a>
        : <button type="button" aria-label={label} onClick={onClick} disabled={busy} className={cls}>
            <Icon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>}
      {tip}
    </span>
  );
}

function LastSync({ a, T }: { a: BrokerAccount; T: Theme }) {
  if (a.syncStatus === DISCONNECTED) {
    return <span className={T.muted} title="Signed out. Its trades and journal are kept.">Logged out
      {a.lastSyncAt && <span className={`block text-xs ${T.faint}`}>resumes from {new Date(a.lastSyncAt).toLocaleDateString()}</span>}</span>;
  }
  if (a.syncStatus === "error") {
    return <span className={T.bad} title={a.lastSyncError ?? undefined}>Error
      {a.lastSyncError && <span className={`block max-w-[160px] truncate text-xs ${T.faint}`}>{a.lastSyncError}</span>}</span>;
  }
  if (a.syncStatus === "syncing") return <span className={T.accent}>Syncing…</span>;
  return <span className={`font-medium tabular-nums ${T.good}`}>
    {a.lastSyncAt ? new Date(a.lastSyncAt).toLocaleDateString() : "Pending"}</span>;
}

/** The column headings — the SAME grid as the rows (`ROW_GRID`), so they always line up. */
export function AccountsColumnHeads({ T }: { T: Theme }) {
  return (
    <div className={`mb-3 hidden items-center gap-3 rounded-2xl px-6 py-4 text-[13px] font-medium tracking-wider ${ROW_GRID} ${T.surface} ${T.faint}`}>
      <div>Name</div><div>Number</div><div>Type</div><div className="text-center">Platform</div>
      <div>Balance</div><div>Connection</div><div>Last sync</div><div className="pr-2 text-right">Actions</div>
    </div>
  );
}

export function AccountRow({ a, T, platformIcon, syncing, resyncing, act }: {
  a: BrokerAccount; T: Theme; platformIcon: ReactNode; syncing: boolean; resyncing: boolean; act: RowActions;
}) {
  const isCt = a.platform.toLowerCase() === "ctrader";
  const isApi = a.connectionType === "api";
  const out = a.syncStatus === DISCONNECTED;
  const type = (a.accountType || "demo").toUpperCase();
  const typeTone = type === "LIVE" ? "bg-[#10B981]/15 text-[#059669]" : type === "FUNDED" ? "bg-[#8B5CF6]/15 text-[#7C3AED]" : "bg-[#F43F5E]/12 text-[#E11D48]";
  const name = displayName(a);

  const actions = (
    <div className="flex flex-wrap items-center justify-start gap-0.5 lg:justify-end">
      {act.onAnalytics && <Action T={T} icon={BarChart2} label="Analytics" tone="text-[#059669] hover:bg-[#10B981]/15" onClick={act.onAnalytics} />}
      <Action T={T} icon={Copy} label={a.copyEnabled ? "In your copier — click to remove" : "Use in your copier"}
              tone={`${a.copyEnabled ? "text-[#059669]" : T.faint} hover:bg-[#10B981]/15`} onClick={act.onCopyToggle} />
      {isApi && <Action T={T} icon={Wrench} label="History repair — fetch the whole history again" tone="text-[#D97706] hover:bg-[#F59E0B]/15" onClick={act.onRepair} busy={resyncing} />}
      {!isApi && <Action T={T} icon={Settings2} label="EA setup & webhook" tone="text-[#D97706] hover:bg-[#F59E0B]/15" onClick={act.onWebhook} />}
      <Action T={T} icon={RefreshCw} label={syncing ? "Syncing…" : "Sync — the last week's closed trades"} tone={`${T.muted} hover:bg-[#94A3B8]/15`} onClick={act.onSync} busy={syncing} />
      <Action T={T} icon={History} label="Sync logs" tone={`${T.accent} hover:bg-[#0EA5E9]/15`} onClick={act.onLogs} />
      {isCt && <Action T={T} icon={ArrowUpRight} label="Open in cTrader Web" tone={`${T.accent} hover:bg-[#0EA5E9]/15`} href="https://app.ctrader.com/" />}
      {isCt && (out
        ? <Action T={T} icon={Plug} label="Sign back in — nothing was deleted" tone="text-[#059669] hover:bg-[#10B981]/15" onClick={act.onReconnect} />
        : <Action T={T} icon={LogOut} label="Log out — keeps its trades and journal" tone="text-[#B45309] hover:bg-[#EAB308]/15" onClick={act.onLogout} />)}
      <Action T={T} icon={Pencil} label="Edit nickname" tone="text-[#3B82F6] hover:bg-[#3B82F6]/15" onClick={act.onEdit} />
      <Action T={T} icon={Trash2} label="Delete account" tone="text-[#EF4444] hover:bg-[#EF4444]/15" onClick={act.onDelete} />
    </div>
  );

  const nameCell = (
    <div className="min-w-0">
      {act.onAnalytics
        ? <button type="button" onClick={act.onAnalytics} className={`truncate text-left text-[17px] font-semibold tracking-tight ${T.accent} ${T.accentHover} ${T.focus} rounded`}>{name}</button>
        : <span className={`truncate text-[17px] font-semibold tracking-tight ${T.strong}`}>{name}</span>}
      {name !== a.name && <span className={`block truncate text-xs ${T.faint}`}>{a.name}</span>}
    </div>
  );
  const balance = (
    <span className="inline-flex items-center gap-1.5">
      <span className={`text-[17px] font-semibold tabular-nums ${T.strong}`}>{formatMoney(a.balance, a.currency)}</span>
      {isCt && <button type="button" aria-label="Refresh balance" onClick={act.onRefreshBalance}
                       className={`rounded-md p-1 text-[#059669] hover:bg-[#10B981]/15 ${T.focus}`}><DollarSign className="h-3.5 w-3.5" /></button>}
    </span>
  );
  const conn = (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-wider ${T.inset} ${T.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${out ? "bg-[#94A3B8]" : "bg-[#10B981]"}`} />{isApi ? "API" : "EA"}
    </span>
  );
  const typeBadge = <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold tracking-[0.12em] ${typeTone}`}>{type}</span>;

  return (
    <div className={`group rounded-2xl px-4 py-4 transition-all duration-200 lg:px-6 ${T.row} ${T.rowHover}`}>
      {/* Wide screens: his row. */}
      <div className={`hidden items-center gap-3 ${ROW_GRID}`}>
        {nameCell}
        <div><span className={`font-semibold tabular-nums ${T.accent}`}>{a.loginId}</span>
          {a.server && <span className={`block truncate text-xs ${T.faint}`}>{a.server}</span>}</div>
        <div>{typeBadge}</div>
        <div className="flex justify-center" title={a.platform}>{platformIcon}</div>
        <div>{balance}</div>
        <div>{conn}</div>
        <div className="text-[15px]"><LastSync a={a} T={T} /></div>
        {actions}
      </div>
      {/* A phone: the same facts, stacked. */}
      <div className="space-y-3 lg:hidden">
        <div className="flex items-start justify-between gap-3">{nameCell}{typeBadge}</div>
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${T.text}`}>
          <span className="flex items-center gap-2">{platformIcon}<span className={`font-semibold tabular-nums ${T.accent}`}>{a.loginId}</span></span>
          {balance}{conn}<LastSync a={a} T={T} />
        </div>
        <div className="flex justify-start">{actions}</div>
      </div>
    </div>
  );
}
