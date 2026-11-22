import { Info, Wrench, Plus, RefreshCw, Search, X } from "lucide-react";
import { type BrokerAccount, type Theme, formatMoney } from "./accountTypes";

/**
 * His design's top of the page (22 Nov 2026): the repair notice, the Accounts tab (Portfolios marked "coming
 * soon" — it does not exist, so it is shown, not faked), the combined balance PER CURRENCY (adding EUR to USD
 * would be a wrong number), the quota from the server's real limit, Add Account and Sync All.
 */
export function AccountsHeader({ T, accounts, limit, syncingAll, onRepair, onAdd, onSyncAll }: {
  T: Theme; accounts: BrokerAccount[]; limit: number | null; syncingAll: boolean;
  onRepair: () => void; onAdd: () => void; onSyncAll: () => void;
}) {
  const totals = new Map<string, number>();
  for (const a of accounts) {
    const n = Number(a.balance);
    if (Number.isFinite(n)) totals.set(a.currency || "USD", (totals.get(a.currency || "USD") ?? 0) + n);
  }
  const full = limit !== null && accounts.length >= limit;

  return (
    <>
      <div className={`mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3.5 transition-colors duration-200 ${T.surface} ${T.surfaceHover}`}>
        <div className="flex items-center gap-3">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#38BDF8]/15 ${T.accent}`}><Info className="h-4 w-4" /></span>
          <p className={`text-sm sm:text-[15px] ${T.text}`}>
            Issues syncing?{" "}
            <button type="button" onClick={onRepair}
                    className={`inline-flex items-center gap-1.5 font-medium underline decoration-[#38BDF8]/40 underline-offset-4 ${T.accent} ${T.accentHover} ${T.focus} rounded`}>
              Try an account history repair <Wrench className={`h-3.5 w-3.5 ${T.faint}`} />
            </button>
          </p>
        </div>
      </div>

      <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="sr-only">Accounts</h1>
          <p className={`mb-2 text-xs uppercase tracking-[0.22em] ${T.accent}`}>Capital &amp; Execution Vault</p>
          <div className="flex flex-wrap items-center gap-6">
            <nav aria-label="Accounts sections" className={`flex items-center gap-2 rounded-2xl p-1.5 shadow-inner ${T.inset}`}>
              <span aria-current="page" className={`flex items-center gap-2.5 rounded-xl px-5 py-2.5 text-xl font-semibold tracking-tight ${T.pillOn}`}>
                Accounts <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_8px_#38BDF8]" />
              </span>
              <span title="Portfolios are not built yet" className={`flex items-center gap-2 px-4 py-2.5 text-lg ${T.faint}`}>
                Portfolios <span className="whitespace-nowrap rounded-md bg-[#2563EB]/15 px-2 py-0.5 text-[11px] font-semibold tracking-wider text-[#2563EB]">Coming soon</span>
              </span>
            </nav>
            {totals.size > 0 && (
              <div className={`hidden items-baseline gap-3 rounded-2xl px-4 py-2 sm:flex ${T.inset}`}>
                <span className={`text-xs uppercase tracking-widest ${T.faint}`}>Combined balance</span>
                <span className={`text-lg font-semibold tabular-nums ${T.strong}`}>
                  {[...totals].map(([c, n]) => formatMoney(String(n), c)).join("  ·  ")}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div title={full ? "The most accounts allowed — delete one to add another" : "Connected accounts"}
               className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${T.surface} ${T.text}`}>
            <span className={`h-2 w-2 rounded-full ${full ? "bg-[#F59E0B]" : "bg-[#10B981]"}`} />
            <span className="tabular-nums tracking-wider">{accounts.length}{limit !== null ? `/${limit}` : ""}</span>
          </div>
          <button type="button" onClick={onAdd} disabled={full}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[15px] font-semibold transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${T.primaryBtn} ${T.focus}`}>
            <Plus className="h-4 w-4" /> Add Account
          </button>
          <button type="button" onClick={onSyncAll} disabled={syncingAll}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-[15px] font-medium transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 ${T.secondaryBtn} ${T.focus}`}>
            <RefreshCw className={`h-4 w-4 ${syncingAll ? `animate-spin ${T.accent}` : T.muted}`} />
            {syncingAll ? "Syncing…" : "Sync All"}
          </button>
        </div>
      </header>
    </>
  );
}

export type TypeFilter = "ALL" | "DEMO" | "LIVE";

export function AccountsFilters({ T, query, onQuery, type, onType }: {
  T: Theme; query: string; onQuery: (q: string) => void; type: TypeFilter; onType: (t: TypeFilter) => void;
}) {
  return (
    <div className="mb-5 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
      <div className="relative max-w-md flex-1">
        <Search className={`pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 ${T.faint}`} />
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} aria-label="Filter accounts"
               placeholder="Filter by broker, nickname or number…"
               className={`w-full rounded-xl py-2.5 pl-11 pr-10 text-sm shadow-inner placeholder:text-[#64748B] ring-1 ring-transparent focus:outline-none focus:ring-2 focus:ring-[#38BDF8] ${T.surface} ${T.strong}`} />
        {query && (
          <button type="button" aria-label="Clear filter" onClick={() => onQuery("")}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 ${T.inset} ${T.muted} ${T.focus}`}><X className="h-3 w-3" /></button>
        )}
      </div>
      <div role="group" aria-label="Account type" className={`flex items-center gap-1.5 self-start rounded-xl p-1 sm:self-auto ${T.surface}`}>
        {(["ALL", "DEMO", "LIVE"] as TypeFilter[]).map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => onType(t)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wider transition-all ${type === t ? T.pillOn : T.pillOff} ${T.focus}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}
