import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { SOURCES } from "../data/dashboard";
import type { AccountStatus, CopyAccount, OwnAccount, SourceId } from "../types";
import type { SetToast } from "./useToast";
import type { Overview } from "./useOverview";

/** The human sentence out of a thrown API error.
 *
 *  `apiRequest` throws `Error("400: {\"error\":\"...\"}")` — the status, then the raw body. Shown
 *  as-is, the refusal he most needs to read arrives as JSON behind a number. This pulls the
 *  server's own `error` out and falls back to the raw message when the body is not JSON. */
function serverReason(err: any): string {
  const msg = String(err?.message ?? err ?? "something went wrong");
  const body = msg.slice(msg.indexOf("{"));
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error === "string" && parsed.error) return parsed.error;
  } catch { /* not JSON — fall through to the raw message */ }
  return msg;
}

/** The engine-setup panel, wired to the real copy backend: the accounts being mirrored come from
 *  the overview, and Start actually creates/activates followers (self-copy · provider · telegram). */
export function useCopySetup(
  setToast: SetToast,
  accountStatus: AccountStatus,
  overview: Overview | undefined,
  invalidate: () => void,
) {
  const [source, setSource] = useState<SourceId>("provider");
  const [sessions, setSessions] = useState<string[]>(["London"]);
  const [instruments, setInstruments] = useState<string[]>(["Forex", "Metals"]);
  const [sizingMode, setSizingMode] = useState("Risk %");
  const [sizingValue, setSizingValue] = useState("1.00");
  const [drawdown, setDrawdown] = useState("10");
  const [agreed, setAgreed] = useState(false);
  const [telegramChannel, setTelegramChannel] = useState("");
  const [selectedOwnAccounts, setSelectedOwnAccounts] = useState<string[]>([]);
  const [masterAccountId, setMasterAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [platformBySource, setPlatformBySource] = useState<Record<SourceId, string>>({
    provider: "cTrader", "self-copy": "cTrader", telegram: "Channel",
  });

  const accounts: CopyAccount[] = overview?.copies ?? [];
  const ownAccounts = overview?.ownAccounts ?? [];
  const mirroring = overview?.mirroring ?? false;

  // ── RESTORE THE SAVED SETUP ────────────────────────────────────────────────
  // Everything above is browser memory. Before this, "Set as master" and "Add as mirror" changed
  // nothing but that memory, so a page reload put it all back to these defaults and his answer was
  // "when I reload the page everything is undone". The setup HAS been saved since the first Start
  // (`POST /api/copy/self-copy` writes the master and follower rows); the panel simply never asked
  // for it back. `overview.selfCopy` is that saved setup.
  //
  // SEEDED EXACTLY ONCE. The overview refetches every 20 seconds (useOverview), so seeding on every
  // payload would wipe whatever he was in the middle of choosing, twice a minute — a worse bug than
  // the one being fixed. The ref flips on the first payload that arrives and never again this
  // mount, which also means his edits after that always win over the poll.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !overview) return;
    hydrated.current = true;
    const s = overview.selfCopy;
    if (!s) return;
    setSource("self-copy");
    // THE FORM STARTS EMPTY, DELIBERATELY. It now builds ONE link at a time, so there is no single
    // "saved master" to restore into it — what is saved is the LIST of links, and that is rendered
    // in Mirror feeds from `overview.selfCopy.links` rather than held in form state. Restoring a
    // master here would pre-fill the form with a relationship that already exists and invite him to
    // create it twice.
    // ⚠ NEVER ASSUME THE SHAPE OF A PERSISTED PAYLOAD. This read `s.defaults.symbolWhitelist`
    // directly and WHITE-SCREENED the whole Journal on 2026-09-27. The React Query cache is written
    // to localStorage and seeded SYNCHRONOUSLY at startup (`lib/queryClient.ts:136`), so the first
    // `overview` this effect sees can be a payload saved by an OLDER build of the app — one with
    // `masterBrokerAccountId` and no `defaults` at all. Reading a property off that undefined threw,
    // the whole React tree died, and the page rendered nothing.
    //
    // A SHAPE CHANGE IS A MIGRATION when the old shape lives on disk. Optional-chaining every read
    // here means any payload, of any age, degrades to "restore nothing" instead of taking the page
    // down. The cache key was bumped in the same change so nobody has to wait it out — but the key
    // is the cure for THIS one, and this is the cure for the next one.
    const d = s.defaults ?? ({} as Partial<NonNullable<typeof s.defaults>>);
    if (d.symbolWhitelist?.length) setInstruments(d.symbolWhitelist);
    if (d.activeSessions?.length) setSessions(d.activeSessions);
    if (d.maxDdPercent != null) setDrawdown(String(d.maxDdPercent));
    // Only the two modes the dropdown actually offers (RiskParameters.tsx: "Risk %" / "Lot Size").
    // A follower saved with lotMode 'mult' has no control to restore into, so the default is left
    // alone rather than writing a label the <select> cannot show.
    if (d.lotMode === "fixed" && d.fixedLot != null) {
      setSizingMode("Lot Size"); setSizingValue(String(d.fixedLot));
    } else if (d.lotMode === "risk" && d.riskPercent != null) {
      setSizingMode("Risk %"); setSizingValue(String(d.riskPercent));
    }
    // The terms were accepted when this was saved; re-ticking a box he already ticked is what made
    // "Stop mirroring" unreachable after a reload.
    if (d.riskAccepted) setAgreed(true);
  }, [overview]);

  const toggleFrom = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  /** Pause/resume a copy relationship — PUT the follower's isActive and refetch. */
  const toggleAccountStatus = async (id: number) => {
    const row = overview?.copies.find((c) => c.id === id);
    if (!row) return;
    try {
      await apiRequest("PUT", `/api/copy/followers/${row.followerId}`, { isActive: row.status !== "live" });
      setToast(row.status === "live" ? `${row.name} paused.` : `${row.name} is live again.`);
      invalidate();
    } catch (err: any) { setToast(`Could not update ${row.name}: ${err.message}`); }
  };

  const activeSource = useMemo(() => SOURCES.find((s) => s.id === source), [source]);
  const needsAccountConnect = (source === "provider" || source === "self-copy") && accountStatus !== "connected";
  const needsMasterAccount = source === "self-copy" && !masterAccountId;
  const needsChannel = source === "telegram" && !telegramChannel.trim();
  const masterAccount = useMemo(() => ownAccounts.find((a) => a.id === masterAccountId), [ownAccounts, masterAccountId]);
  // THESE GATE STARTING ONLY. The same button stops mirroring, and stopping needs no master, no
  // mirror and no channel — it just pauses what is already running. Leaving them applied meant that
  // after a reload (master blank) the "declare a master" blocker fired and the STOP button was
  // disabled too: he could not turn off copying that was already live, and had no way to reach it.
  const startBlockers = mirroring ? [] : ([
    needsAccountConnect && "Add and connect a trading account above before you can start mirroring.",
    needsMasterAccount && "Declare a master account below before you can start mirroring.",
    source === "self-copy" && !needsMasterAccount && selectedOwnAccounts.length === 0 &&
      "Mark at least one account as a mirror destination below.",
    needsChannel && "Enter the Telegram channel to copy from.",
  ].filter(Boolean) as string[]);

  const toggleOwnAccount = (account: OwnAccount) => {
    setSelectedOwnAccounts((prev) => {
      const isSelected = prev.includes(account.id);
      setToast(isSelected ? `${account.name} removed from the mirror group.` : `${account.name} added to the mirror group.`);
      return isSelected ? prev.filter((id) => id !== account.id) : [...prev, account.id];
    });
  };

  const setMasterAccount = (account: OwnAccount) => {
    setMasterAccountId(account.id);
    setSelectedOwnAccounts((prev) => prev.filter((id) => id !== account.id));
    setToast(`${account.name} set as your master account.`);
  };

  /** Sizing selections → the follower lot fields the backend expects. */
  const lotFields = () =>
    sizingMode === "Lot Size" ? { lotMode: "fixed", fixedLot: sizingValue }
    : sizingMode === "Risk %" ? { lotMode: "risk", riskPercent: sizingValue }
    : { lotMode: "mult", lotMultiplier: sizingValue };

  const handleStart = async () => {
    if (!agreed || startBlockers.length > 0 || busy) return;
    setBusy(true);
    try {
      if (mirroring) {
        // Stop = pause every live relationship (they stay configured, nothing is deleted).
        await Promise.all((overview?.copies ?? []).filter((c) => c.status === "live")
          .map((c) => apiRequest("PUT", `/api/copy/followers/${c.followerId}`, { isActive: false })));
        setToast("Mirroring stopped — all copy relationships paused.");
      } else if (source === "self-copy") {
        // ONE LINK PER SUBMIT — his rule, 2026-09-26: *"the UI should be just like a form that user
        // marks and if he does everything right, he gets the notification that copying was
        // successful and then account that copies is displayed in mirror feeds."* This used to loop
        // over a set of targets for a single master, which is why the panel could only ever express
        // one master. The list of links now lives in the database and is READ back into Mirror
        // feeds, instead of being held as form state.
        {
          const target = selectedOwnAccounts[0];
          await apiRequest("POST", "/api/copy/self-copy", {
            sourceBrokerAccountId: masterAccountId, targetBrokerAccountId: target,
            ...lotFields(), maxDdPercent: drawdown || null, riskAccepted: true,
            // The instrument and session choices used to stop at this line — the panel collected
            // them and never sent them, so both sets of buttons were decorative. The server has
            // accepted `symbolWhitelist` all along; `activeSessions` needs `sessionFilter` set or
            // the engine treats an empty-meaning-everything list the same as no filter.
            symbolWhitelist: instruments.length ? instruments : null,
            activeSessions:  sessions.length ? sessions : null,
            sessionFilter:   sessions.length > 0,
          });
        }
        const into = ownAccounts.find((a) => a.id === selectedOwnAccounts[0]);
        setToast(`Copying started — ${masterAccount?.name ?? "your master"} → ${into?.name ?? "that account"}. It is now in Mirror feeds.`);
        // The form empties so the next link is built from scratch, not from the one just made.
        setSelectedOwnAccounts([]);
      } else if (source === "telegram") {
        const onto = ownAccounts.find((a) => a.connected);
        if (!onto) throw new Error("connect an account first");
        await apiRequest("POST", "/api/copy/telegram-follow", {
          brokerAccountId: onto.id, channel: telegramChannel.trim(),
          fixedLot: sizingMode === "Lot Size" ? sizingValue : "0.01",
        });
        setToast(`Mirroring started — parsing ${telegramChannel.trim()} onto ${onto.name}.`);
      } else {
        // Provider source: resume the paused relationships; following itself happens per-provider.
        const paused = (overview?.copies ?? []).filter((c) => c.status === "paused");
        if (paused.length === 0 && (overview?.copies ?? []).length === 0) {
          setToast("Follow a provider in the directory first — then start mirroring."); setBusy(false); return;
        }
        await Promise.all(paused.map((c) => apiRequest("PUT", `/api/copy/followers/${c.followerId}`, { isActive: true })));
        setToast(`Mirroring started — copying trades from ${activeSource?.title ?? "your source"}.`);
      }
      invalidate();
    } catch (err: any) {
      // THE SERVER'S OWN REASON, NOT A STATUS CODE. `apiRequest` throws `400: {"error":"..."}`, so
      // without this the refusal he most needs to read — "that would send the same trade round in
      // a circle" — reaches him as raw JSON behind a number. He asked for a notification that says
      // what happened; a refusal is exactly when that matters.
      setToast(`Could not ${mirroring ? "stop" : "start"} copying: ${serverReason(err)}`);
    } finally { setBusy(false); }
  };

  return {
    source, setSource,
    sessions, setSessions,
    instruments, setInstruments,
    sizingMode, setSizingMode,
    sizingValue, setSizingValue,
    drawdown, setDrawdown,
    agreed, setAgreed,
    telegramChannel, setTelegramChannel,
    mirroring, accounts, ownAccounts,
    // EVERY SAVED COPY LINK, read straight from the server rather than held as form state. This is
    // what lets several masters exist at once: the panel no longer keeps a single "the master".
    links: overview?.selfCopy?.links ?? [],
    selectedOwnAccounts, masterAccountId,
    platformBySource, setPlatformBySource,
    toggleFrom, toggleAccountStatus, toggleOwnAccount, setMasterAccount,
    startBlockers, handleStart, lotFields, busy,
  };
}

export type CopySetup = ReturnType<typeof useCopySetup>;
