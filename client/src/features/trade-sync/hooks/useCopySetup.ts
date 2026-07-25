import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { SOURCES } from "../data/dashboard";
import type { AccountStatus, CopyAccount, OwnAccount, SourceId } from "../types";
import type { SetToast } from "./useToast";
import type { Overview } from "./useOverview";

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
  const startBlockers = [
    needsAccountConnect && "Add and connect a trading account above before you can start mirroring.",
    needsMasterAccount && "Declare a master account below before you can start mirroring.",
    source === "self-copy" && !needsMasterAccount && selectedOwnAccounts.length === 0 &&
      "Mark at least one account as a mirror destination below.",
    needsChannel && "Enter the Telegram channel to copy from.",
  ].filter(Boolean) as string[];

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
        for (const target of selectedOwnAccounts) {
          await apiRequest("POST", "/api/copy/self-copy", {
            sourceBrokerAccountId: masterAccountId, targetBrokerAccountId: target,
            ...lotFields(), maxDdPercent: drawdown || null, riskAccepted: true,
          });
        }
        setToast(`Mirroring started — copying ${masterAccount?.name ?? "your master"} to ${selectedOwnAccounts.length} account${selectedOwnAccounts.length === 1 ? "" : "s"}.`);
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
      setToast(`Could not ${mirroring ? "stop" : "start"} mirroring: ${err.message}`);
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
    selectedOwnAccounts, masterAccountId,
    platformBySource, setPlatformBySource,
    toggleFrom, toggleAccountStatus, toggleOwnAccount, setMasterAccount,
    startBlockers, handleStart, lotFields, busy,
  };
}

export type CopySetup = ReturnType<typeof useCopySetup>;
