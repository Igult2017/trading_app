import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Wrench, History } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type BrokerAccount, type Theme, displayName } from "./accountTypes";

/** The design's footer: page size, "1 to 5 of 5", first / previous / next / last. */
export function AccountsPager({ T, total, page, pageSize, onPage, onPageSize }: {
  T: Theme; total: number; page: number; pageSize: number; onPage: (p: number) => void; onPageSize: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const btn = `rounded-xl p-2 transition-colors disabled:pointer-events-none disabled:opacity-35 ${T.secondaryBtn} ${T.focus}`;
  return (
    <footer className={`mt-6 flex flex-wrap items-center justify-end gap-5 rounded-2xl px-6 py-3.5 text-sm ${T.surface} ${T.muted}`}>
      <label className="flex items-center gap-3">Page size:
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}
                className={`rounded-xl px-3 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-[#38BDF8] ${T.inset} ${T.strong}`}>
          {[5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <span className={`tabular-nums ${T.text}`}>{from} to {Math.min(page * pageSize, total)} of {total}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="First page" className={btn} disabled={page <= 1} onClick={() => onPage(1)}><ChevronsLeft className="h-4 w-4" /></button>
        <button type="button" aria-label="Previous page" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" aria-label="Next page" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
        <button type="button" aria-label="Last page" className={btn} disabled={page >= pages} onClick={() => onPage(pages)}><ChevronsRight className="h-4 w-4" /></button>
      </div>
    </footer>
  );
}

interface LogEvent { at: string; stage: string; symbol: string | null; detail: string | null }

const STAGE_TONE: Record<string, string> = {
  failed: "text-[#EF4444]", skipped: "text-[#F59E0B]", recorded: "text-[#10B981]", journaled: "text-[#10B981]",
};

/** "Sync logs": what each sync of this account found, recorded, skipped or failed on — newest first. */
export function SyncLogDialog({ account, onClose, headers }: {
  account: BrokerAccount | null; onClose: () => void; headers: () => Promise<HeadersInit>;
}) {
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!account) return;
    setEvents(null); setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/broker-accounts/${account.id}/sync-log`, { headers: await headers() });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `could not load the log (error ${res.status})`);
        setEvents(body.events ?? []);
      } catch (e: any) { setError(e?.message ?? "could not load the log"); }
    })();
  }, [account?.id]);

  return (
    <Dialog open={!!account} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync log — {account ? displayName(account) : ""}</DialogTitle>
          <DialogDescription>What each sync of #{account?.loginId} found, recorded, skipped or failed on. Newest first, last 100.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg bg-[#EF4444]/10 px-3 py-2 text-sm text-[#B91C1C]">Could not load the log: {error}. Close and try again.</p>}
        {!error && events === null && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
        {events && events.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <History className="h-6 w-6" />Nothing logged for this account yet. Press Sync and it will appear here.
          </div>
        )}
        {events && events.length > 0 && (
          <ol className="space-y-2">
            {events.map((e, i) => (
              <li key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{new Date(e.at).toLocaleString()}</span>{"  "}
                <span className={`font-semibold ${STAGE_TONE[e.stage] ?? ""}`}>{e.stage}</span>
                {e.symbol && <span className="text-muted-foreground"> · {e.symbol}</span>}
                {e.detail && <span className="block text-foreground/80">{e.detail}</span>}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The banner's "account history repair": pick the account — the repair itself keeps its existing confirm. */
export function RepairPickerDialog({ open, accounts, onClose, onPick }: {
  open: boolean; accounts: BrokerAccount[]; onClose: () => void; onPick: (a: BrokerAccount) => void;
}) {
  const api = accounts.filter((a) => a.connectionType === "api");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Account history repair</DialogTitle>
          <DialogDescription>Fetches an account's whole history from the broker again and rebuilds what is missing — including trades you deleted from the journal. Choose the account.</DialogDescription>
        </DialogHeader>
        {api.length === 0
          ? <p className="py-6 text-center text-sm text-muted-foreground">No API-connected accounts — EA accounts send their own trades.</p>
          : <ul className="space-y-2">
              {api.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onPick(a)}
                          className="flex w-full items-center justify-between rounded-xl bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                    <span><span className="font-semibold">{displayName(a)}</span> <span className="text-muted-foreground">#{a.loginId}</span></span>
                    <Wrench className="h-4 w-4 text-[#F59E0B]" />
                  </button>
                </li>
              ))}
            </ul>}
      </DialogContent>
    </Dialog>
  );
}
