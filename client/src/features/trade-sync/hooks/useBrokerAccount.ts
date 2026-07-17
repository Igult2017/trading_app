import { useState } from "react";
import type { AccountStatus } from "../types";
import type { SetToast } from "./useToast";

export interface BrokerAccount {
  platform: string;
  setPlatform: (platform: string) => void;
  status: AccountStatus;
  accountId: string;
  connect: () => void;
  disconnect: () => void;
}

/**
 * One broker-account link. Called ONCE PER ACCOUNT, so each caller gets its own isolated state —
 * the account you copy trades FROM and the account you broadcast FROM are two different real-world
 * accounts, and connecting one must never silently "connect" the other.
 *
 * The 1.8s timeout stands in for the cTrader OAuth handshake: a real integration redirects to
 * cTrader ID and comes back with an access token. Nothing here is wired to a backend yet.
 */
export function useBrokerAccount(setToast: SetToast): BrokerAccount {
  const [status, setStatus] = useState<AccountStatus>("disconnected");
  const [accountId, setAccountId] = useState("");
  const [platform, setPlatform] = useState("cTrader");

  const connect = () => {
    setStatus("connecting");
    setToast(
      platform === "cTrader"
        ? "Redirecting to cTrader ID to authorize access..."
        : `Connecting to your ${platform} account...`
    );
    setTimeout(() => {
      const id = String(Math.floor(1000000 + Math.random() * 8999999));
      setAccountId(id);
      setStatus("connected");
      setToast(`${platform} account ${id} connected.`);
    }, 1800);
  };

  const disconnect = () => {
    setStatus("disconnected");
    setAccountId("");
    setToast(`${platform} account disconnected.`);
  };

  return { platform, setPlatform, status, accountId, connect, disconnect };
}
