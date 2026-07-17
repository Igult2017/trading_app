import { useMemo, useState } from "react";
import { INITIAL_ACCOUNTS, SOURCES } from "../data/dashboard";
import { OWN_ACCOUNTS } from "../data/accounts";
import type { AccountStatus, CopyAccount, OwnAccount, SourceId } from "../types";
import type { SetToast } from "./useToast";

/** The engine-setup panel: source choice, filters, risk rules, and the accounts being mirrored. */
export function useCopySetup(setToast: SetToast, accountStatus: AccountStatus) {
  const [source, setSource] = useState<SourceId>("provider");
  const [sessions, setSessions] = useState<string[]>(["London"]);
  const [instruments, setInstruments] = useState<string[]>(["Forex", "Metals"]);
  const [sizingMode, setSizingMode] = useState("Risk %");
  const [sizingValue, setSizingValue] = useState("1.00");
  const [drawdown, setDrawdown] = useState("10");
  const [agreed, setAgreed] = useState(false);
  const [mirroring, setMirroring] = useState(false);
  const [accounts, setAccounts] = useState<CopyAccount[]>(INITIAL_ACCOUNTS);
  const [selectedOwnAccounts, setSelectedOwnAccounts] = useState<string[]>(["ic-markets-live"]);
  const [masterAccountId, setMasterAccountId] = useState("ftmo-challenge-2");
  const [platformBySource, setPlatformBySource] = useState<Record<SourceId, string>>({
    provider: "cTrader",
    "self-copy": "cTrader",
    telegram: "Channel",
  });

  const toggleFrom = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const toggleAccountStatus = (id: number) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: a.status === "live" ? "paused" : "live" } : a))
    );
  };

  const activeSource = useMemo(() => SOURCES.find((s) => s.id === source), [source]);
  const needsAccountConnect = (source === "provider" || source === "self-copy") && accountStatus !== "connected";
  const needsMasterAccount = source === "self-copy" && !masterAccountId;
  const masterAccount = useMemo(() => OWN_ACCOUNTS.find((a) => a.id === masterAccountId), [masterAccountId]);
  const startBlockers = [
    needsAccountConnect && "Add and connect a trading account above before you can start mirroring.",
    needsMasterAccount && "Declare a master account below before you can start mirroring.",
  ].filter(Boolean) as string[];

  const toggleOwnAccount = (account: OwnAccount) => {
    setSelectedOwnAccounts((prev) => {
      const isSelected = prev.includes(account.id);
      setToast(
        isSelected ? `${account.name} removed from the mirror group.` : `${account.name} added to the mirror group.`
      );
      return isSelected ? prev.filter((id) => id !== account.id) : [...prev, account.id];
    });
  };

  // The master account is the single source whose trades get mirrored — it can't also be a mirror
  // destination, so drop it from that list if present.
  const setMasterAccount = (account: OwnAccount) => {
    setMasterAccountId(account.id);
    setSelectedOwnAccounts((prev) => prev.filter((id) => id !== account.id));
    setToast(`${account.name} set as your master account.`);
  };

  const handleStart = () => {
    if (!agreed || startBlockers.length > 0) return;
    setMirroring((m) => !m);
    setToast(
      mirroring
        ? "Mirroring stopped."
        : source === "self-copy" && masterAccount
        ? `Mirroring started — copying trades from ${masterAccount.name} to ${selectedOwnAccounts.length} account${
            selectedOwnAccounts.length === 1 ? "" : "s"
          }.`
        : `Mirroring started — copying trades from ${activeSource?.title ?? "your source"}.`
    );
  };

  return {
    source, setSource,
    sessions, setSessions,
    instruments, setInstruments,
    sizingMode, setSizingMode,
    sizingValue, setSizingValue,
    drawdown, setDrawdown,
    agreed, setAgreed,
    mirroring,
    accounts,
    selectedOwnAccounts,
    masterAccountId,
    platformBySource, setPlatformBySource,
    toggleFrom, toggleAccountStatus, toggleOwnAccount, setMasterAccount,
    startBlockers, handleStart,
  };
}

export type CopySetup = ReturnType<typeof useCopySetup>;
