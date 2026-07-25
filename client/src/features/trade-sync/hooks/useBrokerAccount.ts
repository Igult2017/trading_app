import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { AccountStatus } from "../types";
import type { SetToast } from "./useToast";
import type { Overview } from "./useOverview";

export interface BrokerAccount {
  platform: string;
  setPlatform: (platform: string) => void;
  status: AccountStatus;
  accountId: string;
  connect: () => void;
  disconnect: () => void;
}

/**
 * One broker-account link, wired to the REAL cTrader OAuth flow:
 * POST /api/broker-accounts (placeholder) → GET /api/broker/ctrader/connect?popup=1 → popup →
 * the callback postMessages `{source:'ctrader-oauth'}` back and the overview is refetched.
 * Status is DERIVED from the server's account list, so a page reload keeps the connection.
 */
export function useBrokerAccount(setToast: SetToast, overview: Overview | undefined, invalidate: () => void): BrokerAccount {
  const [platform, setPlatform] = useState("cTrader");
  const [connecting, setConnecting] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const linked = overview?.ownAccounts.find((a) => a.isCtrader && a.connected);
  const status: AccountStatus = connecting ? "connecting" : linked ? "connected" : "disconnected";

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.source !== "ctrader-oauth") return;
      setConnecting(false);
      if (e.data.status === "error") setToast(`cTrader connection failed: ${e.data.error || "unknown error"}`);
      else setToast(e.data.status === "select" ? "Choose which cTrader account to link on the Accounts page." : "cTrader account connected.");
      invalidate();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [setToast, invalidate]);

  const connect = async () => {
    if (platform !== "cTrader") {
      setToast(`${platform} linking isn't available yet — cTrader accounts connect via OAuth today.`);
      return;
    }
    try {
      setConnecting(true);
      setToast("Redirecting to cTrader ID to authorize access…");
      const created = await (await apiRequest("POST", "/api/broker-accounts", {
        name: `cTrader ${new Date().toISOString().slice(0, 10)}`,
        loginId: `pending_${Date.now()}`,
        platform: "ctrader",
        connectionType: "api",
      })).json();
      const r = await (await apiRequest("GET", `/api/broker/ctrader/connect?accountId=${created.id}&popup=1`)).json();
      popupRef.current = window.open(r.url, "ctrader-oauth", "width=520,height=680");
      if (!popupRef.current) { setConnecting(false); setToast("Popup blocked — allow popups and try again."); }
    } catch (err: any) {
      setConnecting(false);
      setToast(`Could not start the cTrader connection: ${err.message}`);
    }
  };

  const disconnect = () => {
    setToast("Accounts are managed on the Journal → Accounts page (removing one there unlinks it everywhere).");
  };

  return { platform, setPlatform, status, accountId: linked?.loginId ?? "", connect, disconnect };
}
